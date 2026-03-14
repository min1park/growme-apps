export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value === 0) return '-';
  if (value < 0) return `(${Math.abs(value).toLocaleString('ko-KR')})`;
  return value.toLocaleString('ko-KR');
}

export function formatNumberWon(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  if (value === 0) return '-';
  if (value < 0) return `(${Math.abs(value).toLocaleString('ko-KR')})`;
  return value.toLocaleString('ko-KR');
}

export function formatNumberThousand(value: number | null | undefined): string {
  if (value === null || value === undefined) return '-';
  const v = Math.round((value ?? 0) / 1000);
  if (v === 0) return '-';
  if (v < 0) return `(${Math.abs(v).toLocaleString('ko-KR')})`;
  return v.toLocaleString('ko-KR');
}

export function parseNumberInput(input: string): number | null {
  if (!input || input.trim() === '' || input.trim() === '-') return null;
  const cleaned = input.replace(/[,\s()]/g, '');
  const num = Number(cleaned);
  if (isNaN(num)) return null;
  if (input.includes('(') || input.startsWith('-')) return -Math.abs(num);
  return num;
}
