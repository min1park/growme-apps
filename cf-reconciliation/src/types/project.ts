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
  | 'equity';

export type CFCategory =
  | 'cash'
  | 'operating-adjust'
  | 'operating-asset'
  | 'operating-liability'
  | 'investing-ppe'
  | 'investing-intangible'
  | 'investing-financial'
  | 'investing-other'
  | 'financing'
  | 'equity'
  | 'noncash';

export const BS_CATEGORY_LABELS: Record<BSCategory, string> = {
  'current-asset': '유동자산',
  'noncurrent-asset': '비유동자산',
  'current-liability': '유동부채',
  'noncurrent-liability': '비유동부채',
  'equity': '자본',
};

export const CF_CATEGORY_LABELS: Record<CFCategory, string> = {
  'cash': '현금',
  'operating-adjust': '영업-조정',
  'operating-asset': '영업-자산',
  'operating-liability': '영업-부채',
  'investing-ppe': '투자-유형',
  'investing-intangible': '투자-무형',
  'investing-financial': '투자-금융',
  'investing-other': '투자-기타',
  'financing': '재무',
  'equity': '자본',
  'noncash': '비현금',
};
