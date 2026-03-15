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
    // 6컬럼 형식 (전기이월/차변/대변/총합계)
    debit?: number;
    credit?: number;
  };
  // 파일 형식: '4col' (기초/기말) 또는 '6col' (전기이월/차변/대변/총합계)
  format: '4col' | '6col';
}

export interface TBValidation {
  openingSum: number;
  closingSum: number;
  debitSum: number;
  creditSum: number;
  isBalanced: boolean;
  accountCount: number;
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

export interface DetectedColumns {
  code?: number;
  name?: number;
  opening?: number;
  closing?: number;
  debit?: number;
  credit?: number;
  format: '4col' | '6col';
}

export function detectColumns(headerRow: unknown[]): DetectedColumns {
  const result: DetectedColumns = { format: '4col' };

  headerRow.forEach((cell, idx) => {
    const s = String(cell ?? '').trim().toLowerCase();

    // 계정코드
    if (/코드|계정번호|계정코드|과목코드/.test(s)) {
      result.code = idx;
    }
    // 계정명
    if (/계정명|과목명|계정과목|과목$/.test(s) && !/코드/.test(s)) {
      result.name = idx;
    }
    // 전기이월/기초 (6컬럼 형식에서는 전기이월)
    if (/전기이월|전기말|기초|당기초|기초잔액|이월/.test(s)) {
      result.opening = idx;
    }
    // 차변 (6컬럼 형식)
    if (/^차변$|차변합계|차변발생/.test(s)) {
      result.debit = idx;
    }
    // 대변 (6컬럼 형식)
    if (/^대변$|대변합계|대변발생/.test(s)) {
      result.credit = idx;
    }
    // 총합계/기말 (6컬럼 형식에서는 총합계, 4컬럼에서는 기말)
    if (/총합계|합계$|기말|당기말|기말잔액/.test(s)) {
      result.closing = idx;
    }
  });

  // 차변/대변 컬럼이 있으면 6컬럼 형식
  if (result.debit !== undefined && result.credit !== undefined) {
    result.format = '6col';
  }

  return result;
}

export function parseTB(data: unknown[][], config: TBParseConfig): Account[] {
  const accounts: Account[] = [];

  for (let i = config.startRow; i < data.length; i++) {
    const row = data[i];
    if (!row) continue;

    const code = String(row[config.columns.code] ?? '').trim();
    const name = String(row[config.columns.name] ?? '').trim();

    // 빈 행이나 합계 행 스킵
    if (!code && !name) continue;
    if (/^(총합계|합계|소계)$/.test(name)) continue;

    let opening = 0;
    let closing = 0;

    if (config.format === '6col') {
      // 6컬럼 형식: 전기이월 + 차변 + 대변 = 총합계
      // 전기이월 = 기초, 총합계 = 기말
      opening = Number(row[config.columns.opening]) || 0;
      closing = Number(row[config.columns.closing]) || 0;
    } else {
      // 4컬럼 형식: 기초/기말
      opening = Number(row[config.columns.opening]) || 0;
      closing = Number(row[config.columns.closing]) || 0;
    }

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

/**
 * 시산표 검증
 * - 기초 합계 ≈ 0 (차변 = 대변)
 * - 기말 합계 ≈ 0 (차변 = 대변)
 */
export function validateTB(accounts: Account[]): TBValidation {
  let openingSum = 0;
  let closingSum = 0;

  for (const account of accounts) {
    openingSum += account.openingBalance;
    closingSum += account.closingBalance;
  }

  // 반올림 오차 허용 (0.5 이내면 균형으로 판단)
  const isBalanced = Math.abs(openingSum) < 0.5 && Math.abs(closingSum) < 0.5;

  return {
    openingSum,
    closingSum,
    debitSum: 0, // 필요시 계산
    creditSum: 0,
    isBalanced,
    accountCount: accounts.length,
  };
}
