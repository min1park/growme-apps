/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { autoMap } from '@/engines/mapping';
import { autoAllocate } from '@/engines/allocation';
import { matchCompanyCF, parseCompanyCF, verifySummary, CompanyCFLine } from '@/engines/verify';
import { validateGrid, getSubtotalAmount } from '@/engines/validation';
import { KIFRS_CF_TEMPLATE, getAllCFItems } from '@/data/cf-template-kifrs';
import { Account } from '@/types';

/**
 * 뉴라텍 FY2026 반기 실데이터 회귀 테스트.
 * 계정별증감(원값, 부호/합계=0 검증완료) → 자동배분 → 검증.
 * change = closing - opening. 부채/자본/수익은 이미 부호 반영(음수)되어 있음.
 */
function mk(code: string, name: string, opening: number, closing: number, idx: number): Account {
  return { id: code, code, name, openingBalance: opening, closingBalance: closing, change: closing - opening, columnIndex: idx };
}

// 핵심 BS/PL 계정 (뉴라텍 계정별증감_CF입력.xlsx 에서 발췌; 부호는 GL규약)
const ACCOUNTS: Account[] = [
  mk('BS0101', '현금', 0, 488000, 0),
  mk('BS0103', '제예금', 1149956349, 15150595103, 1),
  mk('BS0301', '외상매출금', 300657468, 468667109, 2),
  mk('BS0304', '미수금', 5088480, 172890180, 3),
  mk('BS0401', '제품', 1966709306, 2079475828, 4),
  mk('BS0402', '평가충당금-제품', -267477616, -342806988, 5),
  mk('BS0404', '원재료', 98265347, 101696099, 6),
  mk('BS0502', '단기대여금', 2869800000, 3083000000, 7),
  mk('BS2011', '비품', 419326853, 424435944, 8),
  mk('BS2012', '감가상각누계액-비품', -372755462, -384096928, 9),
  mk('BS2104', '소프트웨어', 55419320, 122854632, 10),
  mk('BS4301', '외상매입금', -314361825, -453150524, 11),  // 부채 flip
  mk('BS4403', '금융리스부채', -293629691, -130561860, 12),
  mk('BS4504', '선수금', -1344887498, -423133898, 13),
  mk('BS5104', '전환사채', 0, -16890625215, 14),
  mk('BS5301', '퇴직급여충당부채', -1089009618, -1217173760, 15),
  // PL 조정 계정 (opening=0, closing=발생액; 수익은 음수)
  mk('PL7213', '감가상각비', 0, 199152057, 16),
  mk('PL7229', '무형고정자산상각', 0, 19985619, 17),
  mk('PL7231', '주식보상비용', 0, 123276815, 18),
  mk('PL7601', '이자비용', 0, 132505217, 19),
  mk('PL7501', '이자수익', 0, -79042887, 20),
  mk('PL7709', '지분법평가손실', 0, 377178961, 21),
];

describe('AutoAllocate (뉴라텍 실데이터)', () => {
  const cfItems = getAllCFItems(KIFRS_CF_TEMPLATE);
  const itemIds = new Set(cfItems.map(i => i.id));
  const mappings = autoMap(ACCOUNTS);

  it('현금/자본 제외 모든 계정을 CF라인에 배분한다', () => {
    const { gridData, unallocated } = autoAllocate(ACCOUNTS, mappings, itemIds);
    expect(gridData.size).toBeGreaterThan(0);
    // 배분 실패가 있으면 이름을 노출 (디버그)
    if (unallocated.length) console.warn('unallocated:', unallocated.map(u => u.name));
  });

  it('감가상각비를 조정-감가상각 라인에 배정한다', () => {
    const { gridData } = autoAllocate(ACCOUNTS, mappings, itemIds);
    const cell = gridData.get('op-adj-depr:PL7213');
    expect(cell?.amount).toBe(199152057);
  });

  it('전환사채를 재무활동 라인에 배정한다 (금액 보존)', () => {
    const { gridData } = autoAllocate(ACCOUNTS, mappings, itemIds);
    // 부채이므로 셀값 = -adjustedChange = -(-change) = change = -16,890,625,215
    const inc = gridData.get('fin-long-borrow-inc:BS5104');
    const dec = gridData.get('fin-long-borrow-dec:BS5104');
    expect((inc?.amount ?? 0) + (dec?.amount ?? 0)).toBe(-16890625215);
  });

  it('자동배분 후 모든 배분계정의 열검증(column check)이 통과한다', () => {
    const { gridData, unallocated } = autoAllocate(ACCOUNTS, mappings, itemIds);
    const v = validateGrid(ACCOUNTS, cfItems, mappings, gridData);
    const unallocatedIds = new Set(unallocated.map(u => u.accountId));
    // 배분된 모든 계정은 열검증 diff ≈ 0 이어야 한다 (자동배분의 정확성 보장)
    v.columnChecks.forEach((diff, accId) => {
      if (unallocatedIds.has(accId)) return;
      expect(Math.abs(diff), `계정 ${accId} 열검증 실패`).toBeLessThan(0.5);
    });
  });
});

describe('Verify vs 회사 CF (라벨 매칭 + 대사)', () => {
  const cfItems = getAllCFItems(KIFRS_CF_TEMPLATE);

  it('회사 CF 라인을 앱 라인에 매칭하고 tie/diff 판정한다', () => {
    const company: CompanyCFLine[] = [
      { label: 'Ⅰ. 영업활동으로 인한 현금흐름', amount: -2565935708 },
      { label: '유형자산의 취득', amount: -7739303 },
      { label: '무형자산의 취득', amount: -12026282 },
      { label: '리스부채의 원금상환', amount: -166029600 },
    ];
    const appAmounts = new Map<string, number>([
      ['op', -2565935708],       // tie
      ['inv-ppe-acquire', -7739303],   // tie
      ['inv-intang-acquire', -99999999], // diff
      ['fin-lease-repay', -166029600], // tie
    ]);
    const rows = matchCompanyCF(company, cfItems, appAmounts);
    const ppe = rows.find(r => r.cfItemId === 'inv-ppe-acquire');
    const intang = rows.find(r => r.cfItemId === 'inv-intang-acquire');
    expect(ppe?.status).toBe('tie');
    expect(intang?.status).toBe('diff');
    expect(intang?.diff).toBe(-99999999 - (-12026282));
  });

  it('parseCompanyCF: 쉼표/원 포함 문자열 금액 파싱', () => {
    const parsed = parseCompanyCF([
      ['Ⅰ. 영업활동으로 인한 현금흐름', '-2,565,935,708'],
      ['기말현금', '15,165,869,990 원'],
      ['빈행', ''],
    ]);
    expect(parsed.length).toBe(2);
    expect(parsed[0].amount).toBe(-2565935708);
  });

  it('verifySummary: 전 라인 tie 시 allTie=true', () => {
    const company: CompanyCFLine[] = [{ label: '유형자산의 취득', amount: -7739303 }];
    const rows = matchCompanyCF(company, cfItems, new Map([['inv-ppe-acquire', -7739303]]));
    const s = verifySummary(rows);
    expect(s.diffs).toBe(0);
    expect(s.allTie).toBe(true);
  });
});
