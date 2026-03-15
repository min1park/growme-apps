import { Account, CoAMapping, BSCategory } from '@/types';

/** BS분류 정렬 순서: 유동자산 → 비유동자산 → 유동부채 → 비유동부채 → 자본 → 손익 */
const BS_SORT_ORDER: Record<BSCategory, number> = {
  'current-asset': 0,
  'noncurrent-asset': 1,
  'current-liability': 2,
  'noncurrent-liability': 3,
  'equity': 4,
  'income-statement': 5,
};

/**
 * 계정과목을 BS분류 순서 + 계정코드 오름차순으로 정렬
 * 커스텀 순서(columnOrder)가 있으면 우선 적용
 */
export function sortAccounts(
  accounts: Account[],
  mappingMap: Map<string, CoAMapping>,
  columnOrder?: string[] | null,
): Account[] {
  // 커스텀 순서가 있으면 우선 적용
  if (columnOrder && columnOrder.length > 0) {
    const orderMap = new Map(columnOrder.map((id, idx) => [id, idx]));
    return [...accounts].sort((a, b) => {
      const oa = orderMap.get(a.id);
      const ob = orderMap.get(b.id);
      // 커스텀 순서에 있는 항목 우선, 없는 항목은 뒤로
      if (oa !== undefined && ob !== undefined) return oa - ob;
      if (oa !== undefined) return -1;
      if (ob !== undefined) return 1;
      // 둘 다 없으면 기본 정렬
      return defaultSort(a, b, mappingMap);
    });
  }

  // 기본: BS분류 순 + 계정코드 순
  return [...accounts].sort((a, b) => defaultSort(a, b, mappingMap));
}

function defaultSort(a: Account, b: Account, mappingMap: Map<string, CoAMapping>): number {
  const ma = mappingMap.get(a.id);
  const mb = mappingMap.get(b.id);
  const orderA = ma ? (BS_SORT_ORDER[ma.bsCategory] ?? 99) : 99;
  const orderB = mb ? (BS_SORT_ORDER[mb.bsCategory] ?? 99) : 99;

  if (orderA !== orderB) return orderA - orderB;
  // 같은 BS분류면 계정코드 순
  return a.code.localeCompare(b.code, 'ko', { numeric: true });
}
