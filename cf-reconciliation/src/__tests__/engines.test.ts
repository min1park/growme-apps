/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect } from 'vitest';
import { autoMap } from '@/engines/mapping';
import { validateGrid, getSubtotalAmount } from '@/engines/validation';
import { KIFRS_CF_TEMPLATE, getAllCFItems } from '@/data/cf-template-kifrs';
import { Account, CoAMapping, CellValue, makeCellKey, parseCellKey } from '@/types';
import { formatNumber, parseNumberInput } from '@/lib/format';

// ============================================================
// 1. Mapping Engine Tests
// ============================================================
describe('MappingEngine', () => {
  const testAccounts: Account[] = [
    { id: 'a1', code: '1010', name: '현금', openingBalance: 1000, closingBalance: 500, change: -500, columnIndex: 0 },
    { id: 'a2', code: '1020', name: '보통예금', openingBalance: 5000, closingBalance: 3000, change: -2000, columnIndex: 1 },
    { id: 'a3', code: '1110', name: '매출채권', openingBalance: 10000, closingBalance: 12000, change: 2000, columnIndex: 2 },
    { id: 'a4', code: '1120', name: '대손충당금', openingBalance: -200, closingBalance: -300, change: -100, columnIndex: 3 },
    { id: 'a5', code: '2010', name: '토지', openingBalance: 50000, closingBalance: 50000, change: 0, columnIndex: 4 },
    { id: 'a6', code: '2020', name: '건물', openingBalance: 100000, closingBalance: 120000, change: 20000, columnIndex: 5 },
    { id: 'a7', code: '2021', name: '건물감가상각누계액', openingBalance: -20000, closingBalance: -25000, change: -5000, columnIndex: 6 },
    { id: 'a8', code: '2510', name: '사용권자산', openingBalance: 3000, closingBalance: 4000, change: 1000, columnIndex: 7 },
    { id: 'a9', code: '3010', name: '매입채무', openingBalance: 8000, closingBalance: 10000, change: 2000, columnIndex: 8 },
    { id: 'a10', code: '3510', name: '리스부채', openingBalance: 3000, closingBalance: 3500, change: 500, columnIndex: 9 },
    { id: 'a11', code: '4010', name: '자본금', openingBalance: 100000, closingBalance: 100000, change: 0, columnIndex: 10 },
    { id: 'a12', code: '4050', name: '이익잉여금', openingBalance: 30000, closingBalance: 28000, change: -2000, columnIndex: 11 },
    { id: 'a13', code: '2030', name: '기계장치', openingBalance: 30000, closingBalance: 35000, change: 5000, columnIndex: 12 },
    { id: 'a14', code: '2100', name: '특허권', openingBalance: 5000, closingBalance: 4000, change: -1000, columnIndex: 13 },
    { id: 'a15', code: '3020', name: '미지급금', openingBalance: 2000, closingBalance: 3000, change: 1000, columnIndex: 14 },
    { id: 'a16', code: '3030', name: '단기차입금', openingBalance: 10000, closingBalance: 8000, change: -2000, columnIndex: 15 },
  ];

  it('should map cash accounts correctly', () => {
    const mappings = autoMap(testAccounts);
    const cashMappings = mappings.filter(m => m.cfCategory === 'cash');
    expect(cashMappings.length).toBe(2); // 현금 + 보통예금
    expect(cashMappings.every(m => m.isLocked)).toBe(true);
  });

  it('should map 매출채권 to operating-asset', () => {
    const mappings = autoMap(testAccounts);
    const arMapping = mappings.find(m => m.accountId === 'a3');
    expect(arMapping?.cfCategory).toBe('operating-asset');
    expect(arMapping?.bsCategory).toBe('current-asset');
  });

  it('should map 대손충당금 to operating-adjust', () => {
    const mappings = autoMap(testAccounts);
    const m = mappings.find(m => m.accountId === 'a4');
    expect(m?.cfCategory).toBe('operating-adjust');
  });

  it('should map 토지/건물/기계 to investing-ppe', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.find(m => m.accountId === 'a5')?.cfCategory).toBe('investing-ppe');
    expect(mappings.find(m => m.accountId === 'a6')?.cfCategory).toBe('investing-ppe');
    expect(mappings.find(m => m.accountId === 'a13')?.cfCategory).toBe('investing-ppe');
  });

  it('should map 감가상각누계액 to operating-adjust', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.find(m => m.accountId === 'a7')?.cfCategory).toBe('operating-adjust');
  });

  it('should map 사용권자산 to noncash', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.find(m => m.accountId === 'a8')?.cfCategory).toBe('noncash');
  });

  it('should map 매입채무 to operating-liability', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.find(m => m.accountId === 'a9')?.cfCategory).toBe('operating-liability');
  });

  it('should map 리스부채 to financing', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.find(m => m.accountId === 'a10')?.cfCategory).toBe('financing');
  });

  it('should map 자본금/이익잉여금 to equity (locked)', () => {
    const mappings = autoMap(testAccounts);
    const capMapping = mappings.find(m => m.accountId === 'a11');
    expect(capMapping?.cfCategory).toBe('equity');
    expect(capMapping?.isLocked).toBe(true);
    const reMapping = mappings.find(m => m.accountId === 'a12');
    expect(reMapping?.cfCategory).toBe('equity');
    expect(reMapping?.isLocked).toBe(true);
  });

  it('should map 특허권 to investing-intangible', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.find(m => m.accountId === 'a14')?.cfCategory).toBe('investing-intangible');
  });

  it('should map 단기차입금 to financing', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.find(m => m.accountId === 'a16')?.cfCategory).toBe('financing');
  });

  it('should map all accounts and mark auto-match status (H-2)', () => {
    const mappings = autoMap(testAccounts);
    expect(mappings.length).toBe(testAccounts.length);
    // 모든 테스트 계정은 매칭 규칙에 해당하므로 isAutoMatched = true
    expect(mappings.every(m => m.isAutoMatched)).toBe(true);
  });

  it('should mark unmatched accounts with isAutoMatched=false (H-2)', () => {
    const unknownAccounts: Account[] = [
      { id: 'u1', code: '9999', name: '알수없는계정', openingBalance: 0, closingBalance: 100, change: 100, columnIndex: 0 },
    ];
    const mappings = autoMap(unknownAccounts);
    expect(mappings[0].isAutoMatched).toBe(false);
  });
});

// ============================================================
// 2. CF Template Tests
// ============================================================
describe('CFTemplate', () => {
  it('should have all required sections', () => {
    expect(KIFRS_CF_TEMPLATE.sections.length).toBe(5);
    const types = KIFRS_CF_TEMPLATE.sections.map(s => s.type);
    expect(types).toContain('operating');
    expect(types).toContain('investing');
    expect(types).toContain('financing');
    expect(types).toContain('cash-summary');
    expect(types).toContain('noncash');
  });

  it('should have operating section with adjustment items', () => {
    const op = KIFRS_CF_TEMPLATE.sections.find(s => s.type === 'operating')!;
    const items = op.items;
    expect(items.find(i => i.id === 'op-adj-depr')).toBeDefined(); // 감가상각비
    expect(items.find(i => i.id === 'op-adj-intang-amort')).toBeDefined(); // 무형자산상각비
    expect(items.find(i => i.id === 'op-adj-bad-debt')).toBeDefined(); // 대손상각비
    expect(items.find(i => i.id === 'op-adj-rou-depr')).toBeDefined(); // 사용권자산감가상각비
  });

  it('should have working capital items', () => {
    const op = KIFRS_CF_TEMPLATE.sections.find(s => s.type === 'operating')!;
    expect(op.items.find(i => i.id === 'op-wc-ar')).toBeDefined(); // 매출채권
    expect(op.items.find(i => i.id === 'op-wc-inventory')).toBeDefined(); // 재고자산
    expect(op.items.find(i => i.id === 'op-wc-ap')).toBeDefined(); // 매입채무
  });

  it('should have correct sign conventions (C-1 fix)', () => {
    const items = getAllCFItems(KIFRS_CF_TEMPLATE);
    // Sign convention: asset-sourced = -1, liability-sourced = 1
    // 감가상각비: contra-asset 원천 → sign = -1
    expect(items.find(i => i.id === 'op-adj-depr')?.sign).toBe(-1);
    // 이자수익: 미수이자(자산) 원천 → sign = -1
    expect(items.find(i => i.id === 'op-adj-interest-inc')?.sign).toBe(-1);
    // 매출채권: 자산 원천 → sign = -1
    expect(items.find(i => i.id === 'op-wc-ar')?.sign).toBe(-1);
    // 매입채무: 부채 원천 → sign = 1
    expect(items.find(i => i.id === 'op-wc-ap')?.sign).toBe(1);
    // 유형자산 취득: 자산 원천 → sign = -1
    expect(items.find(i => i.id === 'inv-ppe-acquire')?.sign).toBe(-1);
    // 리스부채 상환: 부채 원천 → sign = 1
    expect(items.find(i => i.id === 'fin-lease-repay')?.sign).toBe(1);
    // 단기차입금 증가: 부채 원천 → sign = 1
    expect(items.find(i => i.id === 'fin-borrow-inc')?.sign).toBe(1);
    // 단기차입금 상환: 부채 원천 → sign = 1
    expect(items.find(i => i.id === 'fin-borrow-dec')?.sign).toBe(1);
  });

  it('should have subtotal items', () => {
    const items = getAllCFItems(KIFRS_CF_TEMPLATE);
    const subtotals = items.filter(i => i.isSubtotal);
    expect(subtotals.length).toBeGreaterThan(0);
    expect(subtotals.find(i => i.id === 'op')).toBeDefined(); // I. 영업활동
    expect(subtotals.find(i => i.id === 'inv')).toBeDefined(); // II. 투자활동
    expect(subtotals.find(i => i.id === 'fin')).toBeDefined(); // III. 재무활동
  });

  it('getAllCFItems should return flat array', () => {
    const items = getAllCFItems(KIFRS_CF_TEMPLATE);
    expect(items.length).toBeGreaterThan(40);
    // Check parentId references are valid
    for (const item of items) {
      if (item.parentId) {
        const parent = items.find(i => i.id === item.parentId);
        expect(parent).toBeDefined();
      }
    }
  });
});

// ============================================================
// 3. Validation Engine Tests
// ============================================================
describe('ValidationEngine', () => {
  const accounts: Account[] = [
    { id: 'cash1', code: '1010', name: '현금', openingBalance: 10000, closingBalance: 7000, change: -3000, columnIndex: 0 },
    { id: 'ar1', code: '1110', name: '매출채권', openingBalance: 5000, closingBalance: 7000, change: 2000, columnIndex: 1 },
    { id: 'bldg1', code: '2020', name: '건물', openingBalance: 50000, closingBalance: 55000, change: 5000, columnIndex: 2 },
    { id: 'depr1', code: '2021', name: '건물감누', openingBalance: -10000, closingBalance: -12000, change: -2000, columnIndex: 3 },
    { id: 'ap1', code: '3010', name: '매입채무', openingBalance: 3000, closingBalance: 4000, change: 1000, columnIndex: 4 },
  ];

  const mappings: CoAMapping[] = [
    { accountId: 'cash1', bsCategory: 'current-asset', cfCategory: 'cash', isLocked: true },
    { accountId: 'ar1', bsCategory: 'current-asset', cfCategory: 'operating-asset', isLocked: false },
    { accountId: 'bldg1', bsCategory: 'noncurrent-asset', cfCategory: 'investing-ppe', isLocked: false },
    { accountId: 'depr1', bsCategory: 'noncurrent-asset', cfCategory: 'operating-adjust', isLocked: false },
    { accountId: 'ap1', bsCategory: 'current-liability', cfCategory: 'operating-liability', isLocked: false },
  ];

  const cfItems = getAllCFItems(KIFRS_CF_TEMPLATE);

  it('should detect unbalanced columns', () => {
    const gridData = new Map<string, CellValue>();
    // 매출채권 change = 2000, but we only allocate 1500
    gridData.set(makeCellKey('op-wc-ar', 'ar1'), { amount: 1500 });

    const result = validateGrid(accounts, cfItems, mappings, gridData as any);
    expect(result.columnChecks.get('ar1')).toBe(-500); // 1500 - 2000 = -500
  });

  it('should show balanced column when fully allocated', () => {
    const gridData = new Map<string, CellValue>();
    // 매출채권 change = 2000, allocate exactly 2000
    gridData.set(makeCellKey('op-wc-ar', 'ar1'), { amount: 2000 });

    const result = validateGrid(accounts, cfItems, mappings, gridData as any);
    expect(result.columnChecks.get('ar1')).toBe(0);
    expect(result.passedColumns).toBeGreaterThan(0);
  });

  it('should exclude cash accounts from column checks', () => {
    const gridData = new Map<string, CellValue>();
    const result = validateGrid(accounts, cfItems, mappings, gridData as any);
    expect(result.columnChecks.has('cash1')).toBe(false);
  });

  it('should calculate signed subtotals correctly (C-1)', () => {
    const gridData = new Map<string, CellValue>();
    // 매출채권 BS증감 = 2000 (자산 증가) → op-wc-ar에 배분
    gridData.set(makeCellKey('op-wc-ar', 'ar1'), { amount: 2000 });
    // 매입채무 BS증감 = 1000 (부채 증가) → op-wc-ap에 배분
    gridData.set(makeCellKey('op-wc-ap', 'ap1'), { amount: 1000 });

    // op-wc subtotal (signed):
    // AR: 2000 × sign(-1) = -2000 (자산증가 → CF마이너스)
    // AP: 1000 × sign(1) = 1000 (부채증가 → CF플러스)
    // Total: -2000 + 1000 = -1000
    const wcTotal = getSubtotalAmount('op-wc', cfItems, accounts, gridData as any);
    expect(wcTotal).toBe(-1000);
  });

  it('should calculate nested signed subtotals (C-1)', () => {
    const gridData = new Map<string, CellValue>();
    // 당기순이익: 이익잉여금 등에서 배분, sign=1
    gridData.set(makeCellKey('op-ni', 'ar1'), { amount: 500 });
    // 감가상각비: 감가상각누계에서 배분 (-2000), sign=-1 → CF = -(-2000)×(-1) = ... wait
    // 감가상각누계 BS증감 = -2000 → 셀 값 = -2000 → CF = -2000 × (-1) = 2000
    gridData.set(makeCellKey('op-adj-depr', 'depr1'), { amount: -2000 });
    // 매출채권 BS증감 = 2000 → CF = 2000 × (-1) = -2000
    gridData.set(makeCellKey('op-wc-ar', 'ar1'), { amount: 2000 });

    // op-generated = op-ni + op-adjust + op-wc
    // op-ni: 500 × 1 = 500
    // op-adjust (depr): -2000 × (-1) = 2000
    // op-wc (ar): 2000 × (-1) = -2000
    // Total: 500 + 2000 + (-2000) = 500
    const generated = getSubtotalAmount('op-generated', cfItems, accounts, gridData as any);
    expect(generated).toBe(500);
  });

  it('should only count rows with data in row validation (H-1)', () => {
    const gridData = new Map<string, CellValue>();
    // 일부 행에만 데이터 입력
    gridData.set(makeCellKey('op-wc-ar', 'ar1'), { amount: 2000 });

    const result = validateGrid(accounts, cfItems, mappings, gridData as any);
    // 데이터가 있는 행만 카운트
    expect(result.totalRows).toBe(1);
    expect(result.passedRows).toBe(1);
  });

  it('should show row checks with signed amounts (C-1)', () => {
    const gridData = new Map<string, CellValue>();
    gridData.set(makeCellKey('op-wc-ar', 'ar1'), { amount: 2000 });

    const result = validateGrid(accounts, cfItems, mappings, gridData as any);
    // rowCheck stores signed amount: 2000 × (-1) = -2000
    expect(result.rowChecks.get('op-wc-ar')).toBe(-2000);
  });
});

// ============================================================
// 4. Format Utility Tests
// ============================================================
describe('Format Utilities', () => {
  it('should format positive numbers with commas', () => {
    expect(formatNumber(1234567)).toBe('1,234,567');
  });

  it('should format negative numbers with parentheses', () => {
    expect(formatNumber(-1234567)).toBe('(1,234,567)');
  });

  it('should format zero as dash', () => {
    expect(formatNumber(0)).toBe('-');
  });

  it('should format null/undefined as dash', () => {
    expect(formatNumber(null)).toBe('-');
    expect(formatNumber(undefined)).toBe('-');
  });

  it('should parse number input', () => {
    expect(parseNumberInput('1234567')).toBe(1234567);
    expect(parseNumberInput('1,234,567')).toBe(1234567);
    expect(parseNumberInput('(1234567)')).toBe(-1234567);
    expect(parseNumberInput('-1234567')).toBe(-1234567);
    expect(parseNumberInput('')).toBe(null);
    expect(parseNumberInput('-')).toBe(null);
  });
});

// ============================================================
// 5. Grid Store Tests
// ============================================================
describe('GridStore', () => {
  it('makeCellKey should create correct key format', () => {
    const key = makeCellKey('op-adj-depr', 'account-123');
    expect(key).toBe('op-adj-depr:account-123');
  });

  it('parseCellKey should parse correctly', () => {
    const { cfItemId, accountId } = parseCellKey('op-adj-depr:account-123' as any);
    expect(cfItemId).toBe('op-adj-depr');
    expect(accountId).toBe('account-123');
  });
});
