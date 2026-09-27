import { Account, CoAMapping, BSCategory, CFCategory } from '@/types';

interface MappingRule {
  pattern: RegExp;
  bs: BSCategory;
  cf: CFCategory;
  locked?: boolean;
}

const MAPPING_RULES: MappingRule[] = [
  // ══════════════════════════════════════════════════════════════
  // 손익(P&L)·조정 계정을 BS계정보다 "먼저" 판정한다.
  //   이유: 실무 계정명이 '무형고정자산상각','유형자산처분손실' 등
  //   BS 키워드(무형/유형)를 포함해 오분류되므로, 손익 규칙을 앞세워
  //   정확도를 높인다. (2026-07 뉴라텍 실측 개선)
  // ══════════════════════════════════════════════════════════════
  // ── 손익 - 조정 필요 ──
  { pattern: /(감가상각비|무형자산상각|무형고정자산상각|사용권자산상각)/, bs: 'income-statement', cf: 'pl-adjust' },
  { pattern: /(대손상각비|대손충당금전입|대손충당금환입)/, bs: 'income-statement', cf: 'pl-adjust' },
  { pattern: /(퇴직급여$|^퇴직급여|주식보상비용|재고자산평가|평가손실|평가이익)/, bs: 'income-statement', cf: 'pl-adjust' },
  { pattern: /(외화환산손실|외화환산이익)/, bs: 'income-statement', cf: 'pl-adjust' },
  { pattern: /(유형자산처분|무형자산처분|투자자산처분|자산처분손실|자산처분이익)/, bs: 'income-statement', cf: 'pl-adjust' },
  { pattern: /(지분법손실|지분법이익|지분법평가손실|지분법평가이익)/, bs: 'income-statement', cf: 'pl-adjust' },
  { pattern: /(이자비용|이자수익)/, bs: 'income-statement', cf: 'pl-adjust' },
  // ── 손익 - 조정 불필요 (당기순이익에 이미 포함) ──
  { pattern: /(^매출($|액|원가|이익|총이익)|제품매출|상품매출|용역매출|기타매출|^급여|임원급여|직원급여|지급임차료|복리후생|여비교통|통신비|전력비|수도광열|세금과공과|보험료)/, bs: 'income-statement', cf: 'pl-none' },
  { pattern: /(접대비|광고선전|운반비|수선비|소모품|사무용품|도서인쇄|회의비|건물관리|경상연구개발|지급수수료|잡손실|잡이익|법인세비용|외환차익|외환차손)/, bs: 'income-statement', cf: 'pl-none' },
  // 제조원가/재고흐름 구성계정 (기초/기말재고, 당기제조원가) → 손익, 조정불필요
  { pattern: /(제품재고액|제품제조원가|상품재고액|상품매입액|타계정)/, bs: 'income-statement', cf: 'pl-none' },

  // ── 현금성 자산 (locked) ──  ('제예금' 등 변형 포함
  { pattern: /(^현금|보통예금|당좌예금|제예금|MMF|CMA|외화예금|현금성자산)/, bs: 'current-asset', cf: 'cash', locked: true },

  // ── 대차자산(contra): 감가상각누계·평가충당금 → 영업(조정) ──
  { pattern: /(감가상각누계|상각누계)/, bs: 'noncurrent-asset', cf: 'operating' },
  { pattern: /(평가충당금)/, bs: 'current-asset', cf: 'operating' },

  // ── 유동자산 → 영업 ──
  { pattern: /(^매출채권|외상매출금|받을어음)/, bs: 'current-asset', cf: 'operating' },
  { pattern: /(^미수금|미수수익|^선급금|선급비용|부가세대급금)/, bs: 'current-asset', cf: 'operating' },
  { pattern: /(대손충당금)/, bs: 'current-asset', cf: 'operating' },
  { pattern: /(^제품|^상품|재공품|^원재료|저장품|^재고|부재료|외주품)/, bs: 'current-asset', cf: 'operating' },

  // ── 유동자산 → 투자 ──
  { pattern: /(^단기대여금)/, bs: 'current-asset', cf: 'investing' },
  { pattern: /(유동성.*증권|^단기금융|정기예금.*유동)/, bs: 'current-asset', cf: 'investing' },

  // ── 비유동자산 → 비현금 (사용권자산) : 투자보다 먼저 ──
  { pattern: /(^사용권자산|사용권\s?자산)/, bs: 'noncurrent-asset', cf: 'noncash' },

  // ── 비유동자산 → 투자 ──
  { pattern: /(^토지|^건물|구축물|기계|비품|차량|공구|건설중|금형|시설장치|연구용|시험연구)/, bs: 'noncurrent-asset', cf: 'investing' },
  { pattern: /(^특허|특허선급|실용신안|소프트웨어|개발비|영업권|기타무형|산업재산|상표)/, bs: 'noncurrent-asset', cf: 'investing' },
  { pattern: /(^투자부동산)/, bs: 'noncurrent-asset', cf: 'investing' },
  { pattern: /(정기예금|장기금융|^보증금|임차보증|장기대여금|매도가능|종속기업|관계기업|지분법이익잉여|지분법자본|투자유가)/, bs: 'noncurrent-asset', cf: 'investing' },

  // ── 비유동자산 → 영업 ──
  { pattern: /(^이연법인세자산)/, bs: 'noncurrent-asset', cf: 'operating' },
  { pattern: /(정부보조금|국고보조금)/, bs: 'current-asset', cf: 'operating' },

  // ── 유동부채 → 재무 (리스·차입은 영업규칙보다 먼저) ──
  { pattern: /(리스부채|금융리스부채|단기리스|유동리스)/, bs: 'current-liability', cf: 'financing' },
  { pattern: /(^단기차입금|유동성장기)/, bs: 'current-liability', cf: 'financing' },

  // ── 유동부채 → 영업 ──
  { pattern: /(^매입채무|외상매입금|지급어음)/, bs: 'current-liability', cf: 'operating' },
  { pattern: /(^미지급금|미지급비용|예수금|^선수금|가수금|부가세예수|단기유급휴가)/, bs: 'current-liability', cf: 'operating' },
  { pattern: /(미지급법인세|법인세부채)/, bs: 'current-liability', cf: 'operating' },
  { pattern: /(충당부채|하자보수|복구충당)/, bs: 'current-liability', cf: 'operating' },

  // ── 비유동부채 → 재무 ──
  { pattern: /(^장기차입금|^사채|전환사채)/, bs: 'noncurrent-liability', cf: 'financing' },
  { pattern: /(장기리스|비유동리스|장기복구|장기미지급)/, bs: 'noncurrent-liability', cf: 'financing' },
  { pattern: /(^임대보증금)/, bs: 'noncurrent-liability', cf: 'financing' },

  // ── 비유동부채 → 영업 ──
  { pattern: /(퇴직급여충당|확정급여|사외적립)/, bs: 'noncurrent-liability', cf: 'operating' },
  { pattern: /(^이연법인세부채)/, bs: 'noncurrent-liability', cf: 'operating' },

  // ── 자본 (locked) ──
  { pattern: /(^자본금|보통주자본|우선주자본|주식발행|자기주식|이익잉여금|이월결손|미처리결손|처분전|기타자본|기타포괄|주식매수|주식매입선택|주식선택권|보험수리|전기오류)/, bs: 'equity', cf: 'equity', locked: true },
];

export function autoMap(accounts: Account[]): CoAMapping[] {
  return accounts.map(account => {
    // 업로드 시 사전 분류가 있으면 우선 사용
    if (account.preBS && account.preCF) {
      const rule = MAPPING_RULES.find(r => r.pattern.test(account.name));
      return {
        accountId: account.id,
        bsCategory: account.preBS,
        cfCategory: account.preCF,
        isLocked: rule?.locked ?? false,
        isAutoMatched: true,
      };
    }

    const rule = MAPPING_RULES.find(r => r.pattern.test(account.name));
    return {
      accountId: account.id,
      bsCategory: account.preBS ?? rule?.bs ?? 'current-asset',
      cfCategory: account.preCF ?? rule?.cf ?? 'operating',
      isLocked: rule?.locked ?? false,
      isAutoMatched: !!(account.preBS || account.preCF || rule),
    };
  });
}
