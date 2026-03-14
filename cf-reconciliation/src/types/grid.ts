export type CellKey = `${string}:${string}`;

export interface CellValue {
  amount: number;
  memo?: string;
}

export type GridData = Map<CellKey, CellValue>;

export interface ValidationResult {
  columnChecks: Map<string, number>;
  rowChecks: Map<string, number>;
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
