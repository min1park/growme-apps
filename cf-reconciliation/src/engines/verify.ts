import { CFItem } from '@/types/cf-template';

/**
 * 검증대사 (Verify vs 회사 CF)
 * ------------------------------------------------------------------
 * 회사가 이미 작성한 CF(또는 DART 공시 CF)를 CF라인별 참조금액으로 받아,
 * 앱이 산출한 CF와 라인별로 비교한다. 차이나는 라인만 집중 검토하면 되므로
 * "정답을 몰라도 정확히" 검증할 수 있다.
 */

export interface CompanyCFLine {
  label: string;   // 회사 CF 항목명 (예: "Ⅰ. 영업활동으로 인한 현금흐름")
  amount: number;  // 금액
}

export interface VerifyRow {
  cfItemId: string;
  label: string;
  appAmount: number;       // 앱 산출
  companyAmount: number | null; // 회사 CF (매칭된 경우)
  diff: number | null;     // 앱 - 회사
  status: 'tie' | 'diff' | 'unmatched';
}

/** 라벨 정규화: 로마숫자/번호/공백/괄호 제거해 유사도 비교용 키 생성 */
function normalize(label: string): string {
  return label
    .replace(/[ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩ]/g, '')
    .replace(/[IVX]+\./g, '')
    .replace(/[0-9]+\./g, '')
    .replace(/[().\s가나다라마바사아·]/g, '')
    .replace(/의증가|의감소|의증감|증가감소|감소증가/g, '')
    .toLowerCase()
    .trim();
}

/** 회사 CF 라인을 앱 CF라인(label)에 라벨 유사도로 매칭 */
export function matchCompanyCF(
  companyLines: CompanyCFLine[],
  cfItems: CFItem[],
  appAmounts: Map<string, number>, // cfItemId → 앱 산출 금액
  tolerance = 1,
): VerifyRow[] {
  const usedCompany = new Set<number>();
  const rows: VerifyRow[] = [];

  for (const item of cfItems) {
    if (!item.isEditable && !item.isSubtotal) continue;
    const appAmount = appAmounts.get(item.id) ?? 0;
    const key = normalize(item.label);

    // 정확 매칭 우선, 그다음 부분 포함
    let matchIdx = companyLines.findIndex((c, i) => !usedCompany.has(i) && normalize(c.label) === key);
    if (matchIdx < 0) {
      matchIdx = companyLines.findIndex((c, i) => {
        if (usedCompany.has(i)) return false;
        const ck = normalize(c.label);
        return ck.length > 1 && (ck.includes(key) || key.includes(ck));
      });
    }

    if (matchIdx >= 0) {
      usedCompany.add(matchIdx);
      const companyAmount = companyLines[matchIdx].amount;
      const diff = appAmount - companyAmount;
      rows.push({
        cfItemId: item.id,
        label: item.label,
        appAmount,
        companyAmount,
        diff,
        status: Math.abs(diff) <= tolerance ? 'tie' : 'diff',
      });
    } else {
      rows.push({
        cfItemId: item.id,
        label: item.label,
        appAmount,
        companyAmount: null,
        diff: null,
        status: 'unmatched',
      });
    }
  }
  return rows;
}

/** 회사 CF 파싱: [항목명, 금액] 2열 배열 → CompanyCFLine[] */
export function parseCompanyCF(rows: unknown[][]): CompanyCFLine[] {
  const out: CompanyCFLine[] = [];
  for (const row of rows) {
    if (!Array.isArray(row) || row.length < 2) continue;
    const label = String(row[0] ?? '').trim();
    const raw = row[1];
    if (!label) continue;
    const amount = typeof raw === 'number'
      ? raw
      : parseFloat(String(raw ?? '').replace(/[,\s원]/g, ''));
    if (!isFinite(amount)) continue;
    out.push({ label, amount });
  }
  return out;
}

/** 대사 요약 통계 */
export function verifySummary(rows: VerifyRow[]) {
  const matched = rows.filter(r => r.status !== 'unmatched');
  const tied = rows.filter(r => r.status === 'tie');
  const diffs = rows.filter(r => r.status === 'diff');
  return {
    total: matched.length,
    tied: tied.length,
    diffs: diffs.length,
    unmatched: rows.filter(r => r.status === 'unmatched').length,
    allTie: matched.length > 0 && diffs.length === 0,
    diffRows: diffs,
  };
}
