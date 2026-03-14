import { CFTemplate, CFItem } from '@/types/cf-template';

/**
 * Sign Convention (C-1 fix):
 * sign은 BS증감 → CF금액 변환 팩터.
 * 사용자가 그리드에 BS증감 값을 입력하면, CF금액 = rawSum × sign.
 *
 * 규칙:
 * - 자산 계정 원천 (DR정상): sign = -1 (자산 증가 → CF 마이너스)
 * - 대차자산 계정 원천 (감가상각누계 등): sign = -1 (음의 BS증감 × -1 = 양의 CF)
 * - 부채 계정 원천 (CR정상): sign = 1 (부채 증가 → CF 플러스)
 * - 자본 계정 원천: sign = 1 (자기주식 등 차변성 자본은 -1)
 *
 * 검증: 모든 계정이 올바르게 배분되면,
 * CF합계(signed) = 현금증감 (by 복식부기 항등식)
 */

const operatingItems: CFItem[] = [
  { id: 'op', parentId: null, sectionId: 'operating', label: 'I. 영업활동으로 인한 현금흐름', level: 0, isSubtotal: true, isEditable: false, order: 0, sign: 1 },
  { id: 'op-generated', parentId: 'op', sectionId: 'operating', label: '1. 영업에서 창출된 현금흐름', level: 1, isSubtotal: true, isEditable: false, order: 1, sign: 1 },
  { id: 'op-ni', parentId: 'op-generated', sectionId: 'operating', label: '(1) 당기순이익(손실)', level: 2, isSubtotal: false, isEditable: true, order: 2, sign: 1 },
  { id: 'op-adjust', parentId: 'op-generated', sectionId: 'operating', label: '(2) 조정', level: 2, isSubtotal: true, isEditable: false, order: 3, sign: 1 },
  // 조정항목: 감가상각누계 등 contra-asset 원천 → sign = -1
  { id: 'op-adj-depr', parentId: 'op-adjust', sectionId: 'operating', label: '감가상각비', level: 3, isSubtotal: false, isEditable: true, order: 4, sign: -1, defaultCfCategories: ['operating-adjust'] },
  { id: 'op-adj-intang-amort', parentId: 'op-adjust', sectionId: 'operating', label: '무형자산상각비', level: 3, isSubtotal: false, isEditable: true, order: 5, sign: -1, defaultCfCategories: ['operating-adjust'] },
  { id: 'op-adj-invest-depr', parentId: 'op-adjust', sectionId: 'operating', label: '투자부동산감가상각비', level: 3, isSubtotal: false, isEditable: true, order: 6, sign: -1, defaultCfCategories: ['operating-adjust'] },
  { id: 'op-adj-bad-debt', parentId: 'op-adjust', sectionId: 'operating', label: '대손상각비(환입)', level: 3, isSubtotal: false, isEditable: true, order: 7, sign: -1, defaultCfCategories: ['operating-adjust'] },
  { id: 'op-adj-rou-depr', parentId: 'op-adjust', sectionId: 'operating', label: '사용권자산감가상각비', level: 3, isSubtotal: false, isEditable: true, order: 8, sign: -1, defaultCfCategories: ['operating-adjust'] },
  // 이자비용: 미지급이자(부채) 원천 → sign = 1
  { id: 'op-adj-interest-exp', parentId: 'op-adjust', sectionId: 'operating', label: '이자비용', level: 3, isSubtotal: false, isEditable: true, order: 9, sign: 1 },
  // 이자수익: 미수이자(자산) 원천 → sign = -1
  { id: 'op-adj-interest-inc', parentId: 'op-adjust', sectionId: 'operating', label: '이자수익', level: 3, isSubtotal: false, isEditable: true, order: 10, sign: -1 },
  { id: 'op-adj-fx-loss', parentId: 'op-adjust', sectionId: 'operating', label: '외화환산손실', level: 3, isSubtotal: false, isEditable: true, order: 11, sign: 1 },
  { id: 'op-adj-fx-gain', parentId: 'op-adjust', sectionId: 'operating', label: '외화환산이익', level: 3, isSubtotal: false, isEditable: true, order: 12, sign: -1 },
  // 유형자산처분손실: 자산 원천 → sign = -1
  { id: 'op-adj-ppe-loss', parentId: 'op-adjust', sectionId: 'operating', label: '유형자산처분손실', level: 3, isSubtotal: false, isEditable: true, order: 13, sign: -1 },
  { id: 'op-adj-ppe-gain', parentId: 'op-adjust', sectionId: 'operating', label: '유형자산처분이익', level: 3, isSubtotal: false, isEditable: true, order: 14, sign: -1 },
  // 퇴직급여/충당부채: 부채 원천 → sign = 1
  { id: 'op-adj-retire', parentId: 'op-adjust', sectionId: 'operating', label: '퇴직급여', level: 3, isSubtotal: false, isEditable: true, order: 15, sign: 1 },
  { id: 'op-adj-provision', parentId: 'op-adjust', sectionId: 'operating', label: '충당부채전입(환입)', level: 3, isSubtotal: false, isEditable: true, order: 16, sign: 1 },
  // 지분법손실: 자산(투자주식) 원천 → sign = -1
  { id: 'op-adj-equity-loss', parentId: 'op-adjust', sectionId: 'operating', label: '지분법손실(이익)', level: 3, isSubtotal: false, isEditable: true, order: 17, sign: -1 },
  // 주식보상비용: 자본 원천 → sign = 1
  { id: 'op-adj-stock-comp', parentId: 'op-adjust', sectionId: 'operating', label: '주식보상비용', level: 3, isSubtotal: false, isEditable: true, order: 18, sign: 1 },
  { id: 'op-wc', parentId: 'op-generated', sectionId: 'operating', label: '(3) 영업활동으로 인한 자산부채의 변동', level: 2, isSubtotal: true, isEditable: false, order: 30, sign: 1 },
  // 운전자본-자산: sign = -1 (자산 증가 → CF 마이너스)
  { id: 'op-wc-ar', parentId: 'op-wc', sectionId: 'operating', label: '매출채권의 감소(증가)', level: 3, isSubtotal: false, isEditable: true, order: 31, sign: -1, defaultCfCategories: ['operating-asset'] },
  { id: 'op-wc-other-recv', parentId: 'op-wc', sectionId: 'operating', label: '미수금의 감소(증가)', level: 3, isSubtotal: false, isEditable: true, order: 32, sign: -1, defaultCfCategories: ['operating-asset'] },
  { id: 'op-wc-prepaid', parentId: 'op-wc', sectionId: 'operating', label: '선급비용의 감소(증가)', level: 3, isSubtotal: false, isEditable: true, order: 33, sign: -1, defaultCfCategories: ['operating-asset'] },
  { id: 'op-wc-advance', parentId: 'op-wc', sectionId: 'operating', label: '선급금의 감소(증가)', level: 3, isSubtotal: false, isEditable: true, order: 34, sign: -1, defaultCfCategories: ['operating-asset'] },
  { id: 'op-wc-inventory', parentId: 'op-wc', sectionId: 'operating', label: '재고자산의 감소(증가)', level: 3, isSubtotal: false, isEditable: true, order: 35, sign: -1, defaultCfCategories: ['operating-asset'] },
  // 운전자본-부채: sign = 1 (부채 증가 → CF 플러스)
  { id: 'op-wc-ap', parentId: 'op-wc', sectionId: 'operating', label: '매입채무의 증가(감소)', level: 3, isSubtotal: false, isEditable: true, order: 36, sign: 1, defaultCfCategories: ['operating-liability'] },
  { id: 'op-wc-other-pay', parentId: 'op-wc', sectionId: 'operating', label: '미지급금의 증가(감소)', level: 3, isSubtotal: false, isEditable: true, order: 37, sign: 1, defaultCfCategories: ['operating-liability'] },
  { id: 'op-wc-accrued', parentId: 'op-wc', sectionId: 'operating', label: '미지급비용의 증가(감소)', level: 3, isSubtotal: false, isEditable: true, order: 38, sign: 1, defaultCfCategories: ['operating-liability'] },
  { id: 'op-wc-deposit-recv', parentId: 'op-wc', sectionId: 'operating', label: '예수금의 증가(감소)', level: 3, isSubtotal: false, isEditable: true, order: 39, sign: 1, defaultCfCategories: ['operating-liability'] },
  { id: 'op-wc-advance-recv', parentId: 'op-wc', sectionId: 'operating', label: '선수금의 증가(감소)', level: 3, isSubtotal: false, isEditable: true, order: 40, sign: 1, defaultCfCategories: ['operating-liability'] },
  // 퇴직금지급: 부채(퇴직급여충당) 감소 원천 → sign = 1
  { id: 'op-wc-retire-pay', parentId: 'op-wc', sectionId: 'operating', label: '퇴직금의 지급', level: 3, isSubtotal: false, isEditable: true, order: 41, sign: 1 },
  // 이자수취: 미수이자(자산) 감소 원천 → sign = -1
  { id: 'op-interest-recv', parentId: 'op', sectionId: 'operating', label: '2. 이자수취', level: 1, isSubtotal: false, isEditable: true, order: 50, sign: -1 },
  // 이자지급: 미지급이자(부채) 감소 원천 → sign = 1
  { id: 'op-interest-paid', parentId: 'op', sectionId: 'operating', label: '3. 이자지급', level: 1, isSubtotal: false, isEditable: true, order: 51, sign: 1 },
  // 배당금수취: 미수배당(자산) 감소 원천 → sign = -1
  { id: 'op-dividend-recv', parentId: 'op', sectionId: 'operating', label: '4. 배당금수취', level: 1, isSubtotal: false, isEditable: true, order: 52, sign: -1 },
  // 법인세납부: 미지급법인세(부채) 감소 원천 → sign = 1
  { id: 'op-tax-paid', parentId: 'op', sectionId: 'operating', label: '5. 법인세납부', level: 1, isSubtotal: false, isEditable: true, order: 53, sign: 1 },
];

const investingItems: CFItem[] = [
  { id: 'inv', parentId: null, sectionId: 'investing', label: 'II. 투자활동으로 인한 현금흐름', level: 0, isSubtotal: true, isEditable: false, order: 0, sign: 1 },
  // 투자활동: 모든 항목이 자산 원천 → sign = -1
  { id: 'inv-deposit-dec', parentId: 'inv', sectionId: 'investing', label: '정기예금의 감소', level: 1, isSubtotal: false, isEditable: true, order: 1, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-deposit-inc', parentId: 'inv', sectionId: 'investing', label: '정기예금의 증가', level: 1, isSubtotal: false, isEditable: true, order: 2, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-financial-dec', parentId: 'inv', sectionId: 'investing', label: '단기금융상품의 감소', level: 1, isSubtotal: false, isEditable: true, order: 3, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-financial-inc', parentId: 'inv', sectionId: 'investing', label: '단기금융상품의 증가', level: 1, isSubtotal: false, isEditable: true, order: 4, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-loan-dec', parentId: 'inv', sectionId: 'investing', label: '대여금의 감소', level: 1, isSubtotal: false, isEditable: true, order: 5, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-loan-inc', parentId: 'inv', sectionId: 'investing', label: '대여금의 증가', level: 1, isSubtotal: false, isEditable: true, order: 6, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-guarantee-dec', parentId: 'inv', sectionId: 'investing', label: '보증금의 감소', level: 1, isSubtotal: false, isEditable: true, order: 7, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-guarantee-inc', parentId: 'inv', sectionId: 'investing', label: '보증금의 증가', level: 1, isSubtotal: false, isEditable: true, order: 8, sign: -1, defaultCfCategories: ['investing-financial'] },
  { id: 'inv-ppe-dispose', parentId: 'inv', sectionId: 'investing', label: '유형자산의 처분', level: 1, isSubtotal: false, isEditable: true, order: 9, sign: -1, defaultCfCategories: ['investing-ppe'] },
  { id: 'inv-ppe-acquire', parentId: 'inv', sectionId: 'investing', label: '유형자산의 취득', level: 1, isSubtotal: false, isEditable: true, order: 10, sign: -1, defaultCfCategories: ['investing-ppe'] },
  { id: 'inv-intang-dispose', parentId: 'inv', sectionId: 'investing', label: '무형자산의 처분', level: 1, isSubtotal: false, isEditable: true, order: 11, sign: -1, defaultCfCategories: ['investing-intangible'] },
  { id: 'inv-intang-acquire', parentId: 'inv', sectionId: 'investing', label: '무형자산의 취득', level: 1, isSubtotal: false, isEditable: true, order: 12, sign: -1, defaultCfCategories: ['investing-intangible'] },
  { id: 'inv-invest-prop', parentId: 'inv', sectionId: 'investing', label: '투자부동산의 취득', level: 1, isSubtotal: false, isEditable: true, order: 13, sign: -1, defaultCfCategories: ['investing-other'] },
  { id: 'inv-subsidiary', parentId: 'inv', sectionId: 'investing', label: '종속기업투자의 취득', level: 1, isSubtotal: false, isEditable: true, order: 14, sign: -1, defaultCfCategories: ['investing-other'] },
];

const financingItems: CFItem[] = [
  { id: 'fin', parentId: null, sectionId: 'financing', label: 'III. 재무활동으로 인한 현금흐름', level: 0, isSubtotal: true, isEditable: false, order: 0, sign: 1 },
  // 재무활동-부채 원천: sign = 1
  { id: 'fin-borrow-inc', parentId: 'fin', sectionId: 'financing', label: '단기차입금의 증가', level: 1, isSubtotal: false, isEditable: true, order: 1, sign: 1, defaultCfCategories: ['financing'] },
  { id: 'fin-borrow-dec', parentId: 'fin', sectionId: 'financing', label: '단기차입금의 상환', level: 1, isSubtotal: false, isEditable: true, order: 2, sign: 1, defaultCfCategories: ['financing'] },
  { id: 'fin-long-borrow-inc', parentId: 'fin', sectionId: 'financing', label: '장기차입금의 차입', level: 1, isSubtotal: false, isEditable: true, order: 3, sign: 1, defaultCfCategories: ['financing'] },
  { id: 'fin-long-borrow-dec', parentId: 'fin', sectionId: 'financing', label: '장기차입금의 상환', level: 1, isSubtotal: false, isEditable: true, order: 4, sign: 1, defaultCfCategories: ['financing'] },
  { id: 'fin-lease-repay', parentId: 'fin', sectionId: 'financing', label: '리스부채의 상환', level: 1, isSubtotal: false, isEditable: true, order: 5, sign: 1, defaultCfCategories: ['financing'] },
  // 자기주식: contra-equity (차변성) → sign = -1
  { id: 'fin-treasury', parentId: 'fin', sectionId: 'financing', label: '자기주식의 취득', level: 1, isSubtotal: false, isEditable: true, order: 6, sign: -1 },
  // 배당금지급: 자본(이익잉여금) 원천 → sign = 1
  { id: 'fin-dividend-paid', parentId: 'fin', sectionId: 'financing', label: '배당금의 지급', level: 1, isSubtotal: false, isEditable: true, order: 7, sign: 1 },
  // 임대보증금: 부채 원천 → sign = 1
  { id: 'fin-deposit-inc', parentId: 'fin', sectionId: 'financing', label: '임대보증금의 증가', level: 1, isSubtotal: false, isEditable: true, order: 8, sign: 1, defaultCfCategories: ['financing'] },
  { id: 'fin-deposit-dec', parentId: 'fin', sectionId: 'financing', label: '임대보증금의 감소', level: 1, isSubtotal: false, isEditable: true, order: 9, sign: 1, defaultCfCategories: ['financing'] },
];

const cashSummaryItems: CFItem[] = [
  { id: 'cash-net', parentId: null, sectionId: 'cash-summary', label: 'IV. 현금및현금성자산의 순증감', level: 0, isSubtotal: true, isEditable: false, order: 0, sign: 1 },
  { id: 'cash-opening', parentId: null, sectionId: 'cash-summary', label: 'V. 기초의 현금및현금성자산', level: 0, isSubtotal: false, isEditable: true, order: 1, sign: 1 },
  { id: 'cash-fx', parentId: null, sectionId: 'cash-summary', label: '환율변동효과', level: 0, isSubtotal: false, isEditable: true, order: 2, sign: 1 },
  { id: 'cash-closing', parentId: null, sectionId: 'cash-summary', label: 'VI. 기말의 현금및현금성자산', level: 0, isSubtotal: true, isEditable: false, order: 3, sign: 1 },
];

const nonCashItems: CFItem[] = [
  { id: 'nc', parentId: null, sectionId: 'noncash', label: '비현금 거래', level: 0, isSubtotal: false, isEditable: false, order: 0, sign: 1 },
  { id: 'nc-rou-new', parentId: 'nc', sectionId: 'noncash', label: '사용권자산/리스부채 신규', level: 1, isSubtotal: false, isEditable: true, order: 1, sign: 1 },
  { id: 'nc-current-transfer', parentId: 'nc', sectionId: 'noncash', label: '유동성대체', level: 1, isSubtotal: false, isEditable: true, order: 2, sign: 1 },
  { id: 'nc-account-transfer', parentId: 'nc', sectionId: 'noncash', label: '계정대체', level: 1, isSubtotal: false, isEditable: true, order: 3, sign: 1 },
  { id: 'nc-construction', parentId: 'nc', sectionId: 'noncash', label: '건설중인자산 대체', level: 1, isSubtotal: false, isEditable: true, order: 4, sign: 1 },
  { id: 'nc-allowance', parentId: 'nc', sectionId: 'noncash', label: '대손충당금 대체', level: 1, isSubtotal: false, isEditable: true, order: 5, sign: 1 },
  { id: 'nc-invest-transfer', parentId: 'nc', sectionId: 'noncash', label: '투자부동산 대체', level: 1, isSubtotal: false, isEditable: true, order: 6, sign: 1 },
];

export const KIFRS_CF_TEMPLATE: CFTemplate = {
  id: 'kifrs-standard',
  name: 'K-IFRS 표준',
  sections: [
    { id: 'operating', type: 'operating', title: 'I. 영업활동으로 인한 현금흐름', items: operatingItems },
    { id: 'investing', type: 'investing', title: 'II. 투자활동으로 인한 현금흐름', items: investingItems },
    { id: 'financing', type: 'financing', title: 'III. 재무활동으로 인한 현금흐름', items: financingItems },
    { id: 'cash-summary', type: 'cash-summary', title: '현금 요약', items: cashSummaryItems },
    { id: 'noncash', type: 'noncash', title: '비현금 거래', items: nonCashItems },
  ],
};

export function getAllCFItems(template: CFTemplate): CFItem[] {
  return template.sections.flatMap(s => s.items);
}
