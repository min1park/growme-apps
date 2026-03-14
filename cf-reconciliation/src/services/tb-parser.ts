import * as XLSX from 'xlsx';
import { Account } from '@/types';
import { v4 as uuidv4 } from 'uuid';

export interface TBParseConfig {
  sheetName: string;
  startRow: number;
  columns: {
    code: number;
    name: number;
    opening: number;
    closing: number;
  };
}

export function getSheetNames(file: File): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(workbook.SheetNames);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function parseFile(file: File): Promise<XLSX.WorkBook> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        resolve(workbook);
      } catch (err) {
        reject(err);
      }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

export function getSheetData(workbook: XLSX.WorkBook, sheetName: string): unknown[][] {
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) return [];
  return XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
}

export function detectColumns(headerRow: unknown[]): Partial<TBParseConfig['columns']> {
  const result: Partial<TBParseConfig['columns']> = {};
  headerRow.forEach((cell, idx) => {
    const s = String(cell ?? '').trim();
    if (/코드|계정번호|계정코드/.test(s)) result.code = idx;
    if (/계정명|과목명|계정과목/.test(s)) result.name = idx;
    if (/당기초|기초|전기말|기초잔액|차변잔액/.test(s)) result.opening = idx;
    if (/당기말|기말|당기말잔액|대변잔액/.test(s)) result.closing = idx;
  });
  return result;
}

export function parseTB(data: unknown[][], config: TBParseConfig): Account[] {
  const accounts: Account[] = [];
  for (let i = config.startRow; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;
    const code = String(row[config.columns.code] ?? '').trim();
    const name = String(row[config.columns.name] ?? '').trim();
    if (!code && !name) continue;

    const opening = Number(row[config.columns.opening]) || 0;
    const closing = Number(row[config.columns.closing]) || 0;

    accounts.push({
      id: uuidv4(),
      code,
      name,
      openingBalance: opening,
      closingBalance: closing,
      change: closing - opening,
      columnIndex: accounts.length,
    });
  }
  return accounts;
}
