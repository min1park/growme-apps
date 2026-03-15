export interface ProjectMeta {
  id: string;
  name: string;
  company: string;
  periodStart: string;
  periodEnd: string;
  templateId: string;
  currentStep: StepId;
  createdAt: string;
  updatedAt: string;
}

export type StepId = 'upload' | 'mapping' | 'grid' | 'summary';

export interface Account {
  id: string;
  code: string;
  name: string;
  openingBalance: number;
  closingBalance: number;
  change: number;
  columnIndex: number;
  // 업로드 시 사전 분류 (템플릿에서 입력)
  preBS?: BSCategory;
  preCF?: CFCategory;
}

export interface CoAMapping {
  accountId: string;
  bsCategory: BSCategory;
  cfCategory: CFCategory;
  isLocked: boolean;
  isAutoMatched?: boolean; // H-2: 자동매핑 성공 여부 (false/undefined = 미매핑, 수동 확인 필요)
}

export type BSCategory =
  | 'current-asset'
  | 'noncurrent-asset'
  | 'current-liability'
  | 'noncurrent-liability'
  | 'equity'
  | 'income-statement';

export type CFCategory =
  | 'cash'
  | 'operating'
  | 'investing'
  | 'financing'
  | 'equity'
  | 'pl-adjust'
  | 'pl-none'
  | 'noncash';

export const BS_CATEGORY_LABELS: Record<BSCategory, string> = {
  'current-asset': '유동자산',
  'noncurrent-asset': '비유동자산',
  'current-liability': '유동부채',
  'noncurrent-liability': '비유동부채',
  'equity': '자본',
  'income-statement': '손익',
};

export const CF_CATEGORY_LABELS: Record<CFCategory, string> = {
  'cash': '현금',
  'operating': '영업',
  'investing': '투자',
  'financing': '재무',
  'equity': '자본',
  'pl-adjust': '손익-조정',
  'pl-none': '손익-해당없음',
  'noncash': '비현금',
};

/** 구 CF분류 → 신 CF분류 마이그레이션 맵 (기존 데이터 호환) */
export const CF_CATEGORY_MIGRATION: Record<string, CFCategory> = {
  'operating-adjust': 'operating',
  'operating-asset': 'operating',
  'operating-liability': 'operating',
  'investing-ppe': 'investing',
  'investing-intangible': 'investing',
  'investing-financial': 'investing',
  'investing-other': 'investing',
};
