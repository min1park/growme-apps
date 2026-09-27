import { Account, CoAMapping, BSCategory } from '@/types';
import { CFItem } from '@/types/cf-template';
import { CellKey, CellValue, makeCellKey } from '@/types/grid';

/** 검증엔진과 동일: 자산=change, 부채/자본=-change */
function adjustedChange(bs: BSCategory | undefined, change: number): number {
  return bs === 'current-asset' || bs === 'noncurrent-asset' ? change : -change;
}

/**
 * 자동배분 (Auto-Allocate)
 * ------------------------------------------------------------------
 * 각 BS계정의 증감(change)을 가장 그럴듯한 CF라인에 자동 배정하여
 * gridData 초기값(프리필)을 만든다. 사용자는 백지가 아니라
 * "이미 채워진 초안"에서 검토·수정만 하면 된다.
 *
 * 배분 규칙 요약:
 *  - 그리드에 입력하는 값은 "BS증감 원값"(sign 미적용). 검증엔진이
 *    자산=change, 부채/자본=-change 로 부호를 처리하므로,
 *    여기서는 계정의 change 를 적절한 CF라인 셀에 그대로 넣는다.
 *  - 투자/재무는 유입/유출 라인이 분리되어 있으므로 change 부호로 자동 라우팅.
 *  - 손익(pl-adjust) 계정은 조정 라인으로, closingBalance(발생액)를 넣는다.
 *  - 현금/자본(locked)/pl-none 은 배분 대상에서 제외.
 */

export interface AllocationResult {
  gridData: Map<CellKey, CellValue>;
  /** 배분되지 못한 계정 (수동 확인 필요) */
  unallocated: { accountId: string; name: string; change: number; reason: string }[];
}

/** 계정명 키워드 → CF라인 id 라우팅 (증가/감소 분리 포함) */
interface RouteRule {
  test: (name: string) => boolean;
  /** change>=0(증가) 일 때 라인, change<0(감소) 일 때 라인. 하나만 있으면 공통. */
  incItem?: string;
  decItem?: string;
  item?: string;
}

const OPERATING_ROUTES: RouteRule[] = [
  { test: n => /^(매출채권|받을어음|외상매출금)/.test(n), item: 'op-wc-ar' },
  { test: n => /^(미수금|미수수익)/.test(n), item: 'op-wc-other-recv' },
  { test: n => /^(선급비용)/.test(n), item: 'op-wc-prepaid' },
  { test: n => /^(선급금|부가세대급금|정부보조금|국고보조금|보증금|임차보증)/.test(n), item: 'op-wc-prepaid' },
  { test: n => /^(제품|상품|재공품|원재료|저장품|재고|부재료|외주품)/.test(n), item: 'op-wc-inventory' },
  { test: n => /(평가충당금|재고자산평가)/.test(n), item: 'op-adj-inventory-val' },
  { test: n => /^(매입채무|지급어음|외상매입금)/.test(n), item: 'op-wc-ap' },
  { test: n => /^(미지급금)/.test(n), item: 'op-wc-other-pay' },
  { test: n => /^(미지급비용)/.test(n), item: 'op-wc-accrued' },
  { test: n => /^(예수금|부가세예수)/.test(n), item: 'op-wc-deposit-recv' },
  { test: n => /^(선수금)/.test(n), item: 'op-wc-advance-recv' },
  { test: n => /(퇴직급여충당|확정급여)/.test(n), item: 'op-wc-retire-pay' },
  { test: n => /(감가상각누계)/.test(n), item: 'op-adj-depr' },
  { test: n => /(상각누계)/.test(n), item: 'op-adj-intang-amort' },
];

const INVESTING_ROUTES: RouteRule[] = [
  { test: n => /(정기예금)/.test(n), incItem: 'inv-deposit-inc', decItem: 'inv-deposit-dec' },
  { test: n => /(단기금융|금융상품)/.test(n), incItem: 'inv-financial-inc', decItem: 'inv-financial-dec' },
  { test: n => /(대여금)/.test(n), incItem: 'inv-loan-inc', decItem: 'inv-loan-dec' },
  { test: n => /(보증금)/.test(n), incItem: 'inv-guarantee-inc', decItem: 'inv-guarantee-dec' },
  { test: n => /^(토지|건물|구축물|기계|비품|차량|공구|건설중|금형|시설|연구용|시험연구)/.test(n), incItem: 'inv-ppe-acquire', decItem: 'inv-ppe-dispose' },
  { test: n => /^(특허|실용신안|소프트웨어|개발비|영업권|기타무형|산업재산|상표)/.test(n), incItem: 'inv-intang-acquire', decItem: 'inv-intang-dispose' },
  { test: n => /^(투자부동산)/.test(n), incItem: 'inv-invest-prop', decItem: 'inv-invest-prop' },
  { test: n => /(종속기업|관계기업|지분법)/.test(n), incItem: 'inv-subsidiary', decItem: 'inv-subsidiary' },
];

const FINANCING_ROUTES: RouteRule[] = [
  { test: n => /^(단기차입금|유동성장기)/.test(n), incItem: 'fin-borrow-inc', decItem: 'fin-borrow-dec' },
  { test: n => /^(장기차입금|사채|전환사채)/.test(n), incItem: 'fin-long-borrow-inc', decItem: 'fin-long-borrow-dec' },
  { test: n => /(리스부채)/.test(n), incItem: 'fin-lease-repay', decItem: 'fin-lease-repay' },
  { test: n => /(임대보증금)/.test(n), incItem: 'fin-deposit-inc', decItem: 'fin-deposit-dec' },
];

/** 손익 조정 계정(pl-adjust) → 조정 라인 라우팅 */
const PL_ADJUST_ROUTES: RouteRule[] = [
  { test: n => /(사용권자산상각)/.test(n), item: 'op-adj-rou-depr' },
  { test: n => /(무형자산상각|무형고정자산상각)/.test(n), item: 'op-adj-intang-amort' },
  { test: n => /(감가상각비)/.test(n), item: 'op-adj-depr' },
  { test: n => /(대손상각|대손충당금)/.test(n), item: 'op-adj-bad-debt' },
  { test: n => /(퇴직급여)/.test(n), item: 'op-adj-retire' },
  { test: n => /(주식보상)/.test(n), item: 'op-adj-stock-comp' },
  { test: n => /(재고자산평가)/.test(n), item: 'op-adj-inventory-val' },
  { test: n => /(외화환산손실)/.test(n), item: 'op-adj-fx-loss' },
  { test: n => /(외화환산이익)/.test(n), item: 'op-adj-fx-gain' },
  { test: n => /(유형자산처분손실)/.test(n), item: 'op-adj-ppe-loss' },
  { test: n => /(유형자산처분이익)/.test(n), item: 'op-adj-ppe-gain' },
  { test: n => /(지분법손실|지분법평가손실|지분법)/.test(n), item: 'op-adj-equity-loss' },
  { test: n => /(이자비용)/.test(n), item: 'op-adj-interest-exp' },
  { test: n => /(이자수익)/.test(n), item: 'op-adj-interest-inc' },
];

function routeToItem(rules: RouteRule[], name: string, change: number): string | null {
  const r = rules.find(x => x.test(name));
  if (!r) return null;
  if (r.item) return r.item;
  return change >= 0 ? (r.incItem ?? null) : (r.decItem ?? null);
}

/**
 * 자동배분 실행.
 * @param existingCFItemIds 현재 템플릿에 존재하는 CFItem id 집합 (라우팅 대상 검증용)
 */
export function autoAllocate(
  accounts: Account[],
  mappings: CoAMapping[],
  existingCFItemIds: Set<string>,
): AllocationResult {
  const mapById = new Map(mappings.map(m => [m.accountId, m]));
  const gridData = new Map<CellKey, CellValue>();
  const unallocated: AllocationResult['unallocated'] = [];

  const put = (cfItemId: string, accountId: string, amount: number) => {
    if (amount === 0) return;
    if (!existingCFItemIds.has(cfItemId)) return; // 라인이 없으면 스킵(경고는 아래에서)
    const key = makeCellKey(cfItemId, accountId);
    const prev = gridData.get(key);
    gridData.set(key, { amount: (prev?.amount ?? 0) + amount });
  };

  for (const acc of accounts) {
    const m = mapById.get(acc.id);
    if (!m) continue;
    const cf = m.cfCategory;

    // 배분 제외: 현금, 자본, pl-none
    if (cf === 'cash' || cf === 'equity' || cf === 'pl-none') continue;

    // 손익 조정: closingBalance(발생액)를 조정 라인에 배정
    if (cf === 'pl-adjust') {
      const item = routeToItem(PL_ADJUST_ROUTES, acc.name, acc.closingBalance);
      if (item) put(item, acc.id, acc.closingBalance);
      else unallocated.push({ accountId: acc.id, name: acc.name, change: acc.closingBalance, reason: '조정라인 매칭 실패' });
      continue;
    }

    // 비현금(사용권자산 등)
    if (cf === 'noncash') {
      if (existingCFItemIds.has('nc-rou-new')) put('nc-rou-new', acc.id, acc.change);
      continue;
    }

    // BS 계정: 셀에는 "CF방향 값" = -adjustedChange 를 넣는다.
    //   검증엔진이 diff = adjustedChange + Σ(셀) = 0 을 요구하므로,
    //   Σ(셀) = -adjustedChange 가 되도록 배정하면 열검증이 자동 통과.
    //   라우팅(증가/감소 라인 선택)은 원 change 부호 기준.
    const cfValue = -adjustedChange(m.bsCategory, acc.change);
    let item: string | null = null;
    if (cf === 'operating') item = routeToItem(OPERATING_ROUTES, acc.name, acc.change);
    else if (cf === 'investing') item = routeToItem(INVESTING_ROUTES, acc.name, acc.change);
    else if (cf === 'financing') item = routeToItem(FINANCING_ROUTES, acc.name, acc.change);

    if (item) {
      put(item, acc.id, cfValue);
    } else if (acc.change !== 0) {
      unallocated.push({ accountId: acc.id, name: acc.name, change: acc.change, reason: `${cf} 라인 매칭 실패` });
    }
  }

  return { gridData, unallocated };
}
