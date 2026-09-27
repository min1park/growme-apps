/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { autoMap } from '@/engines/mapping';
import { autoAllocate } from '@/engines/allocation';
import { exportToExcel } from '@/services/excel-exporter';
import { validateGrid } from '@/engines/validation';
import { KIFRS_CF_TEMPLATE, getAllCFItems } from '@/data/cf-template-kifrs';
import { Account } from '@/types';
import ExcelJS from 'exceljs';

/**
 * 앱의 실제 exporter가 "행=CF항목 × 열=BS계정 매트릭스 + 현금 별도열"을
 * 자동배분 결과로부터 올바르게 생성하는지 검증.
 */
function mk(code: string, name: string, o: number, c: number, i: number): Account {
  return { id: code, code, name, openingBalance: o, closingBalance: c, change: c - o, columnIndex: i };
}
const ACCOUNTS: Account[] = [
  mk('BS0101', '현금', 0, 488000, 0),
  mk('BS0103', '제예금', 1149956349, 15150595103, 1),
  mk('BS0301', '외상매출금', 300657468, 468667109, 2),
  mk('BS0401', '제품', 1966709306, 2079475828, 3),
  mk('BS2012', '감가상각누계액-비품', -372755462, -384096928, 4),
  mk('BS4301', '외상매입금', -314361825, -453150524, 5),
  mk('BS4403', '금융리스부채', -293629691, -130561860, 6),
  mk('BS5104', '전환사채', 0, -16890625215, 7),
  mk('PL7213', '감가상각비', 0, 199152057, 8),
];

describe('앱 exporter 매트릭스 (자동배분 결과)', () => {
  const cfItems = getAllCFItems(KIFRS_CF_TEMPLATE);
  const itemIds = new Set(cfItems.map(i => i.id));
  const mappings = autoMap(ACCOUNTS);

  it('자동배분 → exporter → 현금 별도열 + 매트릭스 헤더 생성', async () => {
    const { gridData } = autoAllocate(ACCOUNTS, mappings, itemIds);
    const validation = validateGrid(ACCOUNTS, cfItems, mappings, gridData);
    const blob = await exportToExcel('뉴라텍테스트', ACCOUNTS, cfItems, gridData, validation, mappings);
    expect(blob).toBeTruthy();

    // 생성된 엑셀을 다시 열어 구조 검증 (jsdom Blob → ArrayBuffer 폴리필)
    const buf: ArrayBuffer = typeof (blob as any).arrayBuffer === 'function'
      ? await (blob as any).arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as ArrayBuffer);
          fr.onerror = reject;
          fr.readAsArrayBuffer(blob);
        });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('CF정산표_뉴라텍테스트')!;
    expect(ws).toBeTruthy();

    // Row1 헤더: 현금 계정이 '(현금)' 접미사로 맨 끝에 있어야 함
    const header = ws.getRow(1).values as any[];
    const headerStr = header.join('|');
    expect(headerStr).toContain('현금(현금)');
    expect(headerStr).toContain('제예금(현금)');
    // 비현금 계정은 접미사 없이
    expect(headerStr).toContain('외상매출금');
    expect(headerStr).toContain('전환사채');

    // Row4 = 전기말, Row5 = 당기말, Row6 = 증감 라벨 확인
    expect(String(ws.getRow(3).getCell(4).value)).toBe('전기말');
    expect(String(ws.getRow(4).getCell(4).value)).toBe('당기말');
    expect(String(ws.getRow(5).getCell(4).value)).toBe('증감');

    // CF항목 행에 당기순이익/조정/자산부채변동이 존재
    let hasNI = false, hasAdjust = false, hasWC = false;
    ws.eachRow(row => {
      const label = String(row.getCell(4).value ?? '');
      if (label.includes('당기순이익')) hasNI = true;
      if (label.includes('조정')) hasAdjust = true;
      if (label.includes('자산부채') || label.includes('자산·부채') || label.includes('자산ㆍ부채')) hasWC = true;
    });
    expect(hasNI).toBe(true);
    expect(hasAdjust).toBe(true);
    expect(hasWC).toBe(true);
  });

  it('잔액 무결성 검증 열(자산/부채/자본/차이)이 존재하고 차이=수식', async () => {
    const { gridData } = autoAllocate(ACCOUNTS, mappings, itemIds);
    const validation = validateGrid(ACCOUNTS, cfItems, mappings, gridData);
    const blob = await exportToExcel('검증테스트', ACCOUNTS, cfItems, gridData, validation, mappings);
    const buf: ArrayBuffer = typeof (blob as any).arrayBuffer === 'function'
      ? await (blob as any).arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as ArrayBuffer);
          fr.onerror = reject;
          fr.readAsArrayBuffer(blob);
        });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('CF정산표_검증테스트')!;

    // Row1 헤더에 자산/부채/자본/차이 4개 검증 열이 있어야 함
    const header = (ws.getRow(1).values as any[]).map(v => String(v ?? ''));
    ['자산', '부채', '자본', '차이'].forEach(h => {
      expect(header).toContain(h);
    });

    // '차이' 열의 전기말(3행)·당기말(4행) 셀은 '자산-부채-자본' 수식이어야 함
    const diffColIdx = header.findIndex(h => h === '차이');
    expect(diffColIdx).toBeGreaterThan(0);
    for (const row of [3, 4]) {
      const cell = ws.getRow(row).getCell(diffColIdx);
      const f = (cell.value as any)?.formula ?? '';
      expect(f).toMatch(/-.*-/); // A - B - C 형태
    }
  });

  it('조정항목 대사 열(손익계산서 및 주석 / 차이)이 참조금액과 함께 출력된다', async () => {
    const { gridData } = autoAllocate(ACCOUNTS, mappings, itemIds);
    const validation = validateGrid(ACCOUNTS, cfItems, mappings, gridData);
    // 감가상각비 조정항목에 손익/주석 참조금액 부여
    const refData = new Map<string, any>([
      ['op-adj-depr', { amount: 199152057, source: '유형자산주석', verifySign: 'minus' }],
    ]);
    const blob = await exportToExcel('대사테스트', ACCOUNTS, cfItems, gridData, validation, mappings, refData);
    const buf: ArrayBuffer = typeof (blob as any).arrayBuffer === 'function'
      ? await (blob as any).arrayBuffer()
      : await new Promise<ArrayBuffer>((resolve, reject) => {
          const fr = new FileReader();
          fr.onload = () => resolve(fr.result as ArrayBuffer);
          fr.onerror = reject;
          fr.readAsArrayBuffer(blob);
        });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    const ws = wb.getWorksheet('CF정산표_대사테스트')!;

    // 헤더에 '손익계산서 및 주석' + '차이' 대사 열이 있어야 함
    const header = (ws.getRow(1).values as any[]).map(v => String(v ?? ''));
    const reconColIdx = header.findIndex(h => h === '손익계산서 및 주석');
    expect(reconColIdx).toBeGreaterThan(0);

    // 감가상각비 행에서 참조금액 199,152,057 + 차이 수식 확인
    let found = false;
    ws.eachRow(row => {
      if (String(row.getCell(4).value ?? '').includes('감가상각비')) {
        const refVal = row.getCell(reconColIdx).value;
        if (refVal === 199152057) {
          found = true;
          const diffF = (row.getCell(reconColIdx + 1).value as any)?.formula ?? '';
          expect(diffF).toContain('-'); // CF금액 - 참조
        }
      }
    });
    expect(found).toBe(true);
  });
});
