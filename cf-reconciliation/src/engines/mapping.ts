import { Account, CoAMapping, BSCategory, CFCategory } from '@/types';

interface MappingRule {
  pattern: RegExp;
  bs: BSCategory;
  cf: CFCategory;
  locked?: boolean;
}

const MAPPING_RULES: MappingRule[] = [
  // 현금성 자산
  { pattern: /^(현금|보통예금|당좌예금|MMF|CMA|외화예금)/, bs: 'current-asset', cf: 'cash', locked: true },
  // 유동자산
  { pattern: /^(매출채권|받을어음)/, bs: 'current-asset', cf: 'operating-asset' },
  { pattern: /^(미수금|미수수익|선급금|선급비용|부가세대급금)/, bs: 'current-asset', cf: 'operating-asset' },
  { pattern: /(대손충당금)/, bs: 'current-asset', cf: 'operating-adjust' },
  { pattern: /^(제품|상품|재공품|원재료|저장품|재고|부재료|외주품)/, bs: 'current-asset', cf: 'operating-asset' },
  { pattern: /^(단기대여금)/, bs: 'current-asset', cf: 'investing-financial' },
  { pattern: /^(유동성.*증권|단기금융|정기예금.*유동)/, bs: 'current-asset', cf: 'investing-financial' },
  // 비유동자산 - 감가상각/상각누계 먼저 체크 (건물감가상각누계액 등이 "건물" 앞에 매칭되도록)
  { pattern: /(감가상각누계)/, bs: 'noncurrent-asset', cf: 'operating-adjust' },
  { pattern: /(상각누계|무형자산상각)/, bs: 'noncurrent-asset', cf: 'operating-adjust' },
  { pattern: /^(토지|건물|구축물|기계|비품|차량|공구|건설중|금형|시설|연구용)/, bs: 'noncurrent-asset', cf: 'investing-ppe' },
  { pattern: /^(특허|실용신안|소프트웨어|개발비|영업권|기타무형|산업재산)/, bs: 'noncurrent-asset', cf: 'investing-intangible' },
  { pattern: /^(사용권자산)/, bs: 'noncurrent-asset', cf: 'noncash' },
  { pattern: /^(투자부동산)/, bs: 'noncurrent-asset', cf: 'investing-other' },
  { pattern: /^(정기예금|장기금융|보증금|장기대여금|매도가능|지분법)/, bs: 'noncurrent-asset', cf: 'investing-financial' },
  { pattern: /^(이연법인세자산)/, bs: 'noncurrent-asset', cf: 'operating-adjust' },
  // 유동부채
  { pattern: /^(매입채무|지급어음)/, bs: 'current-liability', cf: 'operating-liability' },
  { pattern: /^(미지급금|미지급비용|예수금|선수금|가수금|부가세예수|단기유급휴가)/, bs: 'current-liability', cf: 'operating-liability' },
  { pattern: /^(미지급법인세|법인세부채)/, bs: 'current-liability', cf: 'operating-liability' },
  { pattern: /^(단기차입금|유동성장기)/, bs: 'current-liability', cf: 'financing' },
  { pattern: /^(리스부채|단기리스)/, bs: 'current-liability', cf: 'financing' },
  { pattern: /(충당부채|하자보수)/, bs: 'current-liability', cf: 'operating-liability' },
  // 비유동부채
  { pattern: /^(장기차입금|사채)/, bs: 'noncurrent-liability', cf: 'financing' },
  { pattern: /^(장기리스|장기복구|장기미지급)/, bs: 'noncurrent-liability', cf: 'financing' },
  { pattern: /^(퇴직급여|확정급여|사외적립)/, bs: 'noncurrent-liability', cf: 'operating-adjust' },
  { pattern: /^(임대보증금)/, bs: 'noncurrent-liability', cf: 'financing' },
  // 자본
  { pattern: /^(자본금|주식발행|자기주식|이익잉여금|기타자본|기타포괄|주식매수|보험수리)/, bs: 'equity', cf: 'equity', locked: true },
];

export function autoMap(accounts: Account[]): CoAMapping[] {
  return accounts.map(account => {
    const rule = MAPPING_RULES.find(r => r.pattern.test(account.name));
    return {
      accountId: account.id,
      bsCategory: rule?.bs ?? 'current-asset',
      cfCategory: rule?.cf ?? 'operating-asset',
      isLocked: rule?.locked ?? false,
      isAutoMatched: !!rule, // H-2 fix: 자동매핑 여부 표시 (미매핑 계정 식별용)
    };
  });
}
