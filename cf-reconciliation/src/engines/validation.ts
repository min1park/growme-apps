import { Account, CoAMapping, CellKey, CellValue, ValidationResult, makeCellKey } from '@/types';
import { CFItem } from '@/types/cf-template';

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

  // Column validation: 각 계정의 BS증감이 CF항목들에 완전히 배분되었는지 확인 (raw amounts, no sign)
  for (const account of accounts) {
    const mapping = mappingMap.get(account.id);
    if (mapping?.cfCategory === 'cash') continue;

    totalColumns++;
    let sum = 0;
    for (const item of cfItems) {
      const key = makeCellKey(item.id, account.id);
      const cell = gridData.get(key);
      if (cell) sum += cell.amount;
    }

    const diff = sum - account.change;
    columnChecks.set(account.id, diff);
    if (Math.abs(diff) < 0.5) passedColumns++;
  }

  // Row validation: 각 CF항목의 signed 합계를 계산 (H-1 fix: 값이 입력된 행만 카운트)
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
    // CF금액 = rawSum * sign (sign convention 적용)
    const signedAmount = rawSum * item.sign;
    rowChecks.set(item.id, signedAmount);
    if (hasCells) {
      totalRows++;
      // 행 검증: 값이 입력된 행은 배분 완료로 판단
      passedRows++;
    }
  }

  // Cash check: CF 합계가 현금 증감과 일치하는지 (signed amounts 사용)
  const opTotal = getSubtotalAmount('op', cfItems, accounts, gridData);
  const invTotal = getSubtotalAmount('inv', cfItems, accounts, gridData);
  const finTotal = getSubtotalAmount('fin', cfItems, accounts, gridData);
  const fxAmount = getSignedItemAmount('cash-fx', cfItems, accounts, gridData);

  const cashAccounts = accounts.filter(a => mappingMap.get(a.id)?.cfCategory === 'cash');
  const cashChange = cashAccounts.reduce((sum, a) => sum + a.change, 0);
  const cashCheck = opTotal + invTotal + finTotal + fxAmount - cashChange;

  return {
    columnChecks,
    rowChecks,
    cashCheck,
    passedColumns,
    totalColumns,
    passedRows,
    totalRows,
  };
}

/** Raw amount (no sign) - 열검증용 */
function getRawItemAmount(itemId: string, accounts: Account[], gridData: Map<CellKey, CellValue>): number {
  let sum = 0;
  for (const account of accounts) {
    const key = makeCellKey(itemId, account.id);
    const cell = gridData.get(key);
    if (cell) sum += cell.amount;
  }
  return sum;
}

/** Signed amount - CF금액 표시용 (C-1 fix: sign 적용) */
function getSignedItemAmount(itemId: string, cfItems: CFItem[], accounts: Account[], gridData: Map<CellKey, CellValue>): number {
  const item = cfItems.find(i => i.id === itemId);
  const sign = item?.sign ?? 1;
  return getRawItemAmount(itemId, accounts, gridData) * sign;
}

/** Subtotal (signed) - CF 소계 계산 (C-1 fix: sign 적용, M-5 fix: 순환 방지) */
export function getSubtotalAmount(
  subtotalId: string,
  cfItems: CFItem[],
  accounts: Account[],
  gridData: Map<CellKey, CellValue>,
  visited?: Set<string>,
): number {
  const seen = visited ?? new Set<string>();
  if (seen.has(subtotalId)) return 0; // 순환 참조 방지
  seen.add(subtotalId);

  const children = cfItems.filter(i => i.parentId === subtotalId);
  let total = 0;
  for (const child of children) {
    if (child.isSubtotal) {
      total += getSubtotalAmount(child.id, cfItems, accounts, gridData, seen);
    } else {
      // C-1 fix: 개별 항목에 sign 적용
      const rawAmount = getRawItemAmount(child.id, accounts, gridData);
      total += rawAmount * child.sign;
    }
  }
  return total;
}

/** Raw subtotal (no sign) - 열검증/배분 확인용 */
export function getRawSubtotalAmount(
  subtotalId: string,
  cfItems: CFItem[],
  accounts: Account[],
  gridData: Map<CellKey, CellValue>,
): number {
  const children = cfItems.filter(i => i.parentId === subtotalId);
  let total = 0;
  for (const child of children) {
    if (child.isSubtotal) {
      total += getRawSubtotalAmount(child.id, cfItems, accounts, gridData);
    } else {
      total += getRawItemAmount(child.id, accounts, gridData);
    }
  }
  return total;
}
