import { Account, CoAMapping, CellKey, CellValue, ValidationResult, makeCellKey } from '@/types';
import { CFItem } from '@/types/cf-template';

/** 자산 계정 여부 (자산: 증감=기말-기초, 부채/자본: 증감=-(기말-기초)) */
function isAssetCategory(bsCategory: string | undefined): boolean {
  return bsCategory === 'current-asset' || bsCategory === 'noncurrent-asset';
}

export function validateGrid(
  accounts: Account[],
  cfItems: CFItem[],
  mappings: CoAMapping[],
  gridData: Map<CellKey, CellValue>,
): ValidationResult {
  const columnChecks = new Map<string, number>();
  const rowChecks = new Map<string, number>();
  let passedColumns = 0;
  let totalColumns = 0;
  let passedRows = 0;
  let totalRows = 0;

  const mappingMap = new Map(mappings.map(m => [m.accountId, m]));

  // Column validation: 증감 + SUM(CF항목) = 0 검증
  // 증감: 자산=기말-기초, 부채/자본=-(기말-기초)
  // SUM(CF항목): 사용자가 입력한 CF방향 금액의 합
  for (const account of accounts) {
    const mapping = mappingMap.get(account.id);
    // 현금 계정과 손익 계정은 정산 대상에서 제외
    if (mapping?.cfCategory === 'cash') continue;
    if (mapping?.bsCategory === 'income-statement') continue;

    totalColumns++;
    let sum = 0;
    for (const item of cfItems) {
      const key = makeCellKey(item.id, account.id);
      const cell = gridData.get(key);
      if (cell) sum += cell.amount;
    }

    // 증감 = 자산이면 account.change, 부채/자본이면 -account.change
    const adjustedChange = isAssetCategory(mapping?.bsCategory)
      ? account.change
      : -account.change;
    // 검증: 증감 + SUM = 0 → diff = 증감 + SUM (0이면 통과)
    const diff = adjustedChange + sum;
    columnChecks.set(account.id, diff);
    if (Math.abs(diff) < 0.5) passedColumns++;
  }

  // Row validation: 각 CF항목의 합계 (입력값 그대로, sign 미적용)
  const editableItems = cfItems.filter(i => i.isEditable);
  for (const item of editableItems) {
    let rawSum = 0;
    let hasCells = false;
    for (const account of accounts) {
      const key = makeCellKey(item.id, account.id);
      const cell = gridData.get(key);
      if (cell) {
        rawSum += cell.amount;
        hasCells = true;
      }
    }
    // CF금액 = 입력값 합계 (sign 미적용, 사용자가 CF방향으로 입력)
    rowChecks.set(item.id, rawSum);
    if (hasCells) {
      totalRows++;
      passedRows++;
    }
  }

  // Noncash check: 비현금 거래 각 행의 SUM = 0 (대차 상계)
  const noncashChecks = new Map<string, number>();
  const noncashItems = cfItems.filter(i => i.sectionId === 'noncash' && i.isEditable);
  for (const item of noncashItems) {
    let sum = 0;
    for (const account of accounts) {
      const key = makeCellKey(item.id, account.id);
      const cell = gridData.get(key);
      if (cell) sum += cell.amount;
    }
    noncashChecks.set(item.id, sum);
  }

  // Cash check: CF 합계가 현금 증감과 일치하는지
  const opTotal = getSubtotalAmount('op', cfItems, accounts, gridData);
  const invTotal = getSubtotalAmount('inv', cfItems, accounts, gridData);
  const finTotal = getSubtotalAmount('fin', cfItems, accounts, gridData);
  const fxAmount = getItemAmount('cash-fx', accounts, gridData);

  const cashAccounts = accounts.filter(a => mappingMap.get(a.id)?.cfCategory === 'cash');
  const cashChange = cashAccounts.reduce((sum, a) => sum + a.change, 0);

  // 손익 계정 합계 (당기순이익 참조용)
  const plAccounts = accounts.filter(a => mappingMap.get(a.id)?.bsCategory === 'income-statement');
  const _plTotal = plAccounts.reduce((sum, a) => sum + a.closingBalance, 0);
  const cashCheck = opTotal + invTotal + finTotal + fxAmount - cashChange;

  return {
    columnChecks,
    rowChecks,
    noncashChecks,
    cashCheck,
    passedColumns,
    totalColumns,
    passedRows,
    totalRows,
  };
}

/** 개별 항목의 CF금액 (입력값 합계, sign 미적용) */
function getItemAmount(itemId: string, accounts: Account[], gridData: Map<CellKey, CellValue>): number {
  let sum = 0;
  for (const account of accounts) {
    const key = makeCellKey(itemId, account.id);
    const cell = gridData.get(key);
    if (cell) sum += cell.amount;
  }
  return sum;
}

/** Subtotal CF금액 = 하위 항목들의 CF금액 합계 (sign 미적용, 단순 합산) */
export function getSubtotalAmount(
  subtotalId: string,
  cfItems: CFItem[],
  accounts: Account[],
  gridData: Map<CellKey, CellValue>,
  visited?: Set<string>,
): number {
  const seen = visited ?? new Set<string>();
  if (seen.has(subtotalId)) return 0;
  seen.add(subtotalId);

  const children = cfItems.filter(i => i.parentId === subtotalId);
  let total = 0;
  for (const child of children) {
    if (child.isSubtotal) {
      total += getSubtotalAmount(child.id, cfItems, accounts, gridData, seen);
    } else {
      total += getItemAmount(child.id, accounts, gridData);
    }
  }
  return total;
}
