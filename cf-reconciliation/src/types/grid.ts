export type CellKey = `${string}:${string}`;

export interface CellValue {
  amount: number;
  memo?: string;
}

export type GridData = Map<CellKey, CellValue>;

export interface ValidationResult {
  columnChecks: Map<string, number>;
  rowChecks: Map<string, number>;
  noncashChecks: Map<string, number>;
  cashCheck: number;
  passedColumns: number;
  totalColumns: number;
  passedRows: number;
  totalRows: number;
}

export interface GridAction {
  type: 'set' | 'delete' | 'batch';
  cells: { key: CellKey; oldValue: CellValue | null; newValue: CellValue | null }[];
  timestamp: number;
}

/** 조정항목 참조금액 (PL/주석 교차검증) */
export interface ReferenceData {
  amount: number;       // PL/주석 참조금액
  source: string;       // 출처 (예: "유형자산주석", "PL 판관비")
  /** 검증 부호: 'plus' → 검증=참조+CF, 'minus' → 검증=참조-CF */
  verifySign: 'plus' | 'minus';
}

export function makeCellKey(cfItemId: string, accountId: string): CellKey {
  return `${cfItemId}:${accountId}`;
}

export function parseCellKey(key: CellKey): { cfItemId: string; accountId: string } {
  const idx = key.indexOf(':');
  return {
    cfItemId: key.substring(0, idx),
    accountId: key.substring(idx + 1),
  };
}
