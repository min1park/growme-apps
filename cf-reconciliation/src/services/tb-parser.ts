import * as XLSX from 'xlsx';
import { Account, BSCategory, CFCategory, BS_CATEGORY_LABELS, CF_CATEGORY_LABELS } from '@/types';
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
    // 분류 컬럼 (선택)
    bsCategory?: number;
    cfCategory?: number;
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
  bsCategory?: number;
  cfCategory?: number;
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
    // BS분류
    if (/bs분류|bs구분|재무상태표분류|bs카테고리/.test(s)) {
      result.bsCategory = idx;
    }
    // CF분류
    if (/cf분류|cf구분|현금흐름분류|cf카테고리/.test(s)) {
      result.cfCategory = idx;
    }
  });

  // 차변/대변 컬럼이 있으면 6컬럼 형식
  if (result.debit !== undefined && result.credit !== undefined) {
    result.format = '6col';
  }

  return result;
}

// 한글 라벨 → 내부 키 역매핑
const BS_LABEL_TO_KEY = new Map<string, BSCategory>(
  Object.entries(BS_CATEGORY_LABELS).map(([k, v]) => [v, k as BSCategory])
);
const CF_LABEL_TO_KEY = new Map<string, CFCategory>(
  Object.entries(CF_CATEGORY_LABELS).map(([k, v]) => [v, k as CFCategory])
);

// 구 CF분류 라벨 호환 (기존 파일 지원)
const CF_LEGACY_LABELS: Record<string, CFCategory> = {
  '영업-조정': 'operating',
  '영업-자산': 'operating',
  '영업-부채': 'operating',
  '투자-유형': 'investing',
  '투자-무형': 'investing',
  '투자-금융': 'investing',
  '투자-기타': 'investing',
  '영업-손익': 'pl-adjust',    // 사용자 커스텀 라벨 지원
  // 구 영문 키 호환
  'operating-adjust': 'operating',
  'operating-asset': 'operating',
  'operating-liability': 'operating',
  'investing-ppe': 'investing',
  'investing-intangible': 'investing',
  'investing-financial': 'investing',
  'investing-other': 'investing',
};

function parseBSCategory(val: unknown): BSCategory | undefined {
  const s = String(val ?? '').trim();
  if (!s) return undefined;
  // 한글 라벨로 입력된 경우
  if (BS_LABEL_TO_KEY.has(s)) return BS_LABEL_TO_KEY.get(s);
  // 영문 키로 입력된 경우
  if (Object.keys(BS_CATEGORY_LABELS).includes(s)) return s as BSCategory;
  return undefined;
}

function parseCFCategory(val: unknown): CFCategory | undefined {
  const s = String(val ?? '').trim();
  if (!s) return undefined;
  // 현재 한글 라벨
  if (CF_LABEL_TO_KEY.has(s)) return CF_LABEL_TO_KEY.get(s);
  // 현재 영문 키
  if (Object.keys(CF_CATEGORY_LABELS).includes(s)) return s as CFCategory;
  // 구 라벨/키 호환
  if (s in CF_LEGACY_LABELS) return CF_LEGACY_LABELS[s];
  return undefined;
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
      opening = Number(row[config.columns.opening]) || 0;
      closing = Number(row[config.columns.closing]) || 0;
    } else {
      opening = Number(row[config.columns.opening]) || 0;
      closing = Number(row[config.columns.closing]) || 0;
    }

    // BS/CF 분류 (업로드 파일에 포함된 경우)
    const preBS = config.columns.bsCategory != null
      ? parseBSCategory(row[config.columns.bsCategory])
      : undefined;
    const preCF = config.columns.cfCategory != null
      ? parseCFCategory(row[config.columns.cfCategory])
      : undefined;

    accounts.push({
      id: uuidv4(),
      code,
      name,
      openingBalance: opening,
      closingBalance: closing,
      change: closing - opening,
      columnIndex: accounts.length,
      preBS,
      preCF,
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
