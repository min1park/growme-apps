import ExcelJS from 'exceljs';
import { Account, CoAMapping, CellKey, CellValue, ValidationResult, ReferenceData, makeCellKey } from '@/types';
import { CFItem } from '@/types/cf-template';
import { getSubtotalAmount } from '@/engines/validation';
import { sortAccounts } from '@/lib/account-sort';

/** 1-based column index → Excel column letter (1=A, 2=B, ..., 27=AA) */
function colLetter(col: number): string {
  let letter = '';
  let c = col;
  while (c > 0) {
    const mod = (c - 1) % 26;
    letter = String.fromCharCode(65 + mod) + letter;
    c = Math.floor((c - 1) / 26);
  }
  return letter;
}

/**
 * 시산표 입력 템플릿 생성
 * 예시 데이터가 포함된 Excel 템플릿을 다운로드할 수 있도록 생성
 */
export async function generateTBTemplate(): Promise<Blob> {
  const { BS_CATEGORY_LABELS, CF_CATEGORY_LABELS } = await import('@/types/project');
  const workbook = new ExcelJS.Workbook();

  const bsLabels = Object.values(BS_CATEGORY_LABELS);   // ['유동자산', '비유동자산', ...]
  const cfLabels = Object.values(CF_CATEGORY_LABELS);   // ['현금', '영업-조정', ...]

  // 시산표 템플릿 시트
  const ws = workbook.addWorksheet('시산표');

  // 헤더 행 (6열: 계정코드, 계정명, 당기초, 당기말, BS분류, CF분류)
  const headerRow = ws.addRow(['계정코드', '계정명', '당기초', '당기말', 'BS분류', 'CF분류']);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center' };

  // 예시 데이터 (K-IFRS 기준 일반적인 계정과목 + BS/CF 분류)
  const sampleData: (string | number)[][] = [
    // 유동자산
    ['1010', '현금및현금성자산', 50000000, 65000000, '유동자산', '현금'],
    ['1110', '단기금융상품', 100000000, 80000000, '유동자산', '투자'],
    ['1210', '매출채권', 200000000, 230000000, '유동자산', '영업'],
    ['1220', '대손충당금', -10000000, -12000000, '유동자산', '영업'],
    ['1310', '재고자산', 150000000, 140000000, '유동자산', '영업'],
    ['1410', '선급금', 20000000, 25000000, '유동자산', '영업'],
    ['1420', '선급비용', 5000000, 6000000, '유동자산', '영업'],

    // 비유동자산
    ['2110', '장기금융상품', 50000000, 60000000, '비유동자산', '투자'],
    ['2210', '토지', 500000000, 500000000, '비유동자산', '투자'],
    ['2220', '건물', 300000000, 350000000, '비유동자산', '투자'],
    ['2221', '건물감가상각누계액', -30000000, -40000000, '비유동자산', '영업'],
    ['2230', '기계장치', 200000000, 220000000, '비유동자산', '투자'],
    ['2231', '기계장치감가상각누계액', -40000000, -55000000, '비유동자산', '영업'],
    ['2240', '차량운반구', 50000000, 60000000, '비유동자산', '투자'],
    ['2241', '차량운반구감가상각누계액', -20000000, -28000000, '비유동자산', '영업'],
    ['2310', '소프트웨어', 30000000, 35000000, '비유동자산', '투자'],
    ['2311', '소프트웨어상각누계액', -10000000, -15000000, '비유동자산', '영업'],
    ['2410', '사용권자산', 100000000, 120000000, '비유동자산', '비현금'],
    ['2411', '사용권자산감가상각누계액', -20000000, -40000000, '비유동자산', '영업'],

    // 유동부채
    ['3110', '매입채무', 80000000, 95000000, '유동부채', '영업'],
    ['3120', '미지급금', 30000000, 35000000, '유동부채', '영업'],
    ['3130', '미지급비용', 15000000, 18000000, '유동부채', '영업'],
    ['3140', '선수금', 10000000, 12000000, '유동부채', '영업'],
    ['3150', '예수금', 5000000, 6000000, '유동부채', '영업'],
    ['3210', '단기차입금', 100000000, 80000000, '유동부채', '재무'],
    ['3220', '유동성장기부채', 50000000, 50000000, '유동부채', '재무'],
    ['3230', '유동리스부채', 25000000, 30000000, '유동부채', '재무'],

    // 비유동부채
    ['4110', '장기차입금', 200000000, 180000000, '비유동부채', '재무'],
    ['4120', '사채', 100000000, 100000000, '비유동부채', '재무'],
    ['4210', '비유동리스부채', 60000000, 70000000, '비유동부채', '재무'],
    ['4310', '퇴직급여충당부채', 80000000, 95000000, '비유동부채', '영업'],
    ['4320', '이연법인세부채', 20000000, 25000000, '비유동부채', '영업'],

    // 자본
    ['5110', '자본금', 500000000, 500000000, '자본', '자본'],
    ['5120', '자본잉여금', 100000000, 100000000, '자본', '자본'],
    ['5210', '이익잉여금', 360000000, 421000000, '자본', '자본'],
    ['5220', '기타포괄손익누계액', 5000000, 8000000, '자본', '자본'],

    // 손익 (선택 - 당기순이익 참조용)
    ['6010', '매출', 0, -500000000, '손익', '손익-해당없음'],
    ['6110', '매출원가', 0, 300000000, '손익', '손익-해당없음'],
    ['6210', '급여', 0, 80000000, '손익', '손익-해당없음'],
    ['6220', '감가상각비', 0, 33000000, '손익', '손익-조정'],
    ['6230', '대손상각비', 0, 2000000, '손익', '손익-조정'],
    ['6310', '이자비용', 0, 12000000, '손익', '손익-조정'],
    ['6320', '이자수익', 0, -3000000, '손익', '손익-조정'],
    ['6410', '법인세비용', 0, 15000000, '손익', '손익-조정'],
  ];

  // 데이터 행 추가
  for (const row of sampleData) {
    const dataRow = ws.addRow(row);
    dataRow.getCell(3).alignment = { horizontal: 'right' };
    dataRow.getCell(4).alignment = { horizontal: 'right' };
  }

  // 컬럼 너비 설정
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 14;

  // 숫자 형식 설정
  ws.getColumn(3).numFmt = '#,##0;(#,##0);"-"';
  ws.getColumn(4).numFmt = '#,##0;(#,##0);"-"';

  // BS/CF 분류 컬럼 배경색
  for (let i = 2; i <= ws.rowCount; i++) {
    ws.getCell(i, 5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    ws.getCell(i, 6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
  }

  // 데이터 유효성 검사 (드롭다운) — 200행까지 확장
  const dataRowEnd = 200;
  for (let r = 2; r <= dataRowEnd; r++) {
    ws.getCell(r, 5).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${bsLabels.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'BS분류 오류',
      error: `다음 중 하나를 선택하세요: ${bsLabels.join(', ')}`,
    };
    ws.getCell(r, 6).dataValidation = {
      type: 'list',
      allowBlank: true,
      formulae: [`"${cfLabels.join(',')}"`],
      showErrorMessage: true,
      errorTitle: 'CF분류 오류',
      error: `다음 중 하나를 선택하세요: ${cfLabels.join(', ')}`,
    };
  }

  // 테두리 설정
  const lastRow = ws.rowCount;
  for (let i = 1; i <= lastRow; i++) {
    for (let j = 1; j <= 6; j++) {
      ws.getCell(i, j).border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    }
  }

  // 안내 시트 추가
  const guideSheet = workbook.addWorksheet('작성안내');

  const guideContent = [
    ['CF정산표 시산표 입력 템플릿 안내'],
    [''],
    ['■ 필수 컬럼'],
    ['  1. 계정코드: 회사의 계정과목 코드 (숫자 또는 텍스트)'],
    ['  2. 계정명: 계정과목 이름'],
    ['  3. 당기초: 회계기간 시작일 기준 잔액'],
    ['  4. 당기말: 회계기간 종료일 기준 잔액'],
    [''],
    ['■ 선택 컬럼 (사전분류)'],
    ['  5. BS분류: 재무상태표 분류 (드롭다운에서 선택)'],
    [`     - ${bsLabels.join(', ')}`],
    ['  6. CF분류: 현금흐름표 분류 (드롭다운에서 선택)'],
    [`     - ${cfLabels.join(', ')}`],
    ['  ※ BS분류와 CF분류를 미리 입력하면 매핑 단계에서 자동 적용됩니다'],
    ['  ※ 비워두면 시스템이 계정명을 기반으로 자동 매핑합니다'],
    [''],
    ['■ 작성 요령'],
    ['  - 시산표 시트에 있는 예시 데이터를 삭제하고 실제 데이터를 입력하세요'],
    ['  - 모든 재무상태표 계정을 포함해야 정확한 CF정산표를 작성할 수 있습니다'],
    ['  - 차변 잔액 계정(자산)은 양수, 대변 잔액 계정(부채/자본)은 음수로 입력'],
    ['    또는 모두 양수로 입력해도 됩니다 (시스템에서 자동 처리)'],
    ['  - 대손충당금, 감가상각누계액 등 차감계정은 음수로 입력하세요'],
    [''],
    ['■ BS분류 → CF분류 가이드'],
    [''],
    ['  ★ BS 계정 분류 핵심: 투자인가? 재무인가? 나머지는 영업!'],
    ['  유동자산:'],
    ['    - 현금및현금성자산 → 현금'],
    ['    - 매출채권, 재고자산, 선급금, 대손충당금 등 → 영업'],
    ['    - 단기금융상품, 단기대여금 → 투자'],
    ['  비유동자산:'],
    ['    - 토지, 건물, 기계장치, 소프트웨어 등 → 투자'],
    ['    - 장기금융상품, 보증금 등 → 투자'],
    ['    - 감가상각누계액, 상각누계액, 퇴직급여충당 등 → 영업'],
    ['    - 사용권자산 → 비현금'],
    ['  유동/비유동부채:'],
    ['    - 매입채무, 미지급금, 선수금 등 → 영업'],
    ['    - 단기차입금, 장기차입금, 리스부채 등 → 재무'],
    ['  자본:'],
    ['    - 자본금, 이익잉여금 등 → 자본'],
    [''],
    ['  ★ 손익 계정 분류 핵심: 비현금 항목인가? → 조정 필요!'],
    ['  손익-조정 (비현금/비영업):'],
    ['    - 감가상각비, 대손상각비, 퇴직급여 등 비현금 비용'],
    ['    - 유형자산처분손익, 외화환산손익 등 비영업 항목'],
    ['    - 이자비용/수익, 법인세비용 등'],
    ['  손익-해당없음 (당기순이익에 이미 포함):'],
    ['    - 매출, 매출원가, 급여, 임차료 등 현금수반 영업항목'],
    ['    - 이 항목들은 당기순이익을 통해 자동 반영됩니다'],
    [''],
    ['  ※ 손익 계정은 정산표 그리드에는 표시되지 않습니다'],
    ['    손익 합계 = 당기순이익 → 이익잉여금 변동에 반영'],
    [''],
    ['■ 주의사항'],
    ['  - 빈 행은 자동으로 무시됩니다'],
    ['  - 계정코드와 계정명 중 최소 하나는 반드시 있어야 합니다'],
  ];

  for (const row of guideContent) {
    const r = guideSheet.addRow(row);
    if (row[0]?.startsWith('■')) {
      r.font = { bold: true, size: 11 };
    } else if (row[0]?.startsWith('CF정산표')) {
      r.font = { bold: true, size: 14 };
    }
  }

  guideSheet.getColumn(1).width = 80;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

export async function exportToExcel(
  projectName: string,
  accounts: Account[],
  cfItems: CFItem[],
  gridData: Map<CellKey, CellValue>,
  validation: ValidationResult,
  mappings: CoAMapping[],
  referenceData?: Map<string, ReferenceData>,
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const sheetName = `CF정산표_${projectName}`;
  const ws = workbook.addWorksheet(sheetName);

  const mappingMap = new Map(mappings.map(m => [m.accountId, m]));

  // 자산 계정 여부 판별 (자산: 증감=기말-기초, 부채/자본: 증감=-(기말-기초))
  const isAssetAccount = (accountId: string): boolean => {
    const bs = mappingMap.get(accountId)?.bsCategory;
    return bs === 'current-asset' || bs === 'noncurrent-asset';
  };

  // 현금 계정과 손익 계정 제외 (정산 대상이 아님 — 손익은 당기순이익→이익잉여금 경로로 반영)
  // BS분류 순서 + 계정코드 오름차순 정렬
  const gridAccounts = sortAccounts(
    accounts.filter(a => {
      const m = mappingMap.get(a.id);
      return m?.cfCategory !== 'cash' && m?.bsCategory !== 'income-statement';
    }),
    mappingMap,
  );

  // 레이아웃 상수 (A=검증, B=참조금액, C=출처, D=CF항목, E=CF금액, F+계정과목)
  const ACCT_COL_START = 6; // F열부터 계정과목 (1-based)
  const CF_ROW_START = 6;   // 6행부터 CF항목
  const SUM_ROW = CF_ROW_START + cfItems.length; // CF항목 다음 행 = 합계

  // ── Row 1: 헤더 ──
  const r1 = ws.addRow(['검증', '참조금액', '출처', 'CF항목', 'CF금액', ...gridAccounts.map(a => a.name)]);
  r1.font = { bold: true };
  r1.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF4472C4' } };
  r1.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  r1.alignment = { horizontal: 'center' };

  // ── Row 2: 검증 (증감 + SUM(CF항목) = 0이면 배분 완료) ──
  const r2 = ws.addRow(['', '', '', '검증', '']);
  for (let i = 0; i < gridAccounts.length; i++) {
    const c = colLetter(ACCT_COL_START + i);
    r2.getCell(ACCT_COL_START + i).value = { formula: `${c}5+${c}${SUM_ROW}` } as ExcelJS.CellFormulaValue;
  }

  // ── Row 3: 전기말 (기초잔액) ──
  ws.addRow(['', '', '', '전기말', '', ...gridAccounts.map(a => a.openingBalance)]);

  // ── Row 4: 당기말 (기말잔액) ──
  ws.addRow(['', '', '', '당기말', '', ...gridAccounts.map(a => a.closingBalance)]);

  // ── Row 5: 증감 (자산: 기말-기초, 부채/자본: -(기말-기초)) ──
  const r5 = ws.addRow(['', '', '', '증감', '']);
  for (let i = 0; i < gridAccounts.length; i++) {
    const c = colLetter(ACCT_COL_START + i);
    const formula = isAssetAccount(gridAccounts[i].id)
      ? `${c}4-${c}3`       // 자산: 기말-기초
      : `-(${c}4-${c}3)`;   // 부채/자본: -(기말-기초)
    r5.getCell(ACCT_COL_START + i).value = { formula } as ExcelJS.CellFormulaValue;
  }
  r5.font = { bold: true };

  // ── Pre-compute: CF항목 → Excel 행번호 매핑 ──
  const itemRowMap = new Map<string, number>();
  for (let idx = 0; idx < cfItems.length; idx++) {
    itemRowMap.set(cfItems[idx].id, CF_ROW_START + idx);
  }

  // ── Rows 6+: CF항목 ──
  for (let idx = 0; idx < cfItems.length; idx++) {
    const item = cfItems[idx];
    const rowNum = CF_ROW_START + idx;
    const indent = '  '.repeat(item.level);

    // 참조 데이터
    const ref = referenceData?.get(item.id);

    // 기본 행 데이터 (A=검증, B=참조금액, C=출처, D=CF항목, E=CF금액 placeholder)
    const rowData: (string | number)[] = ['', ref?.amount ?? '', ref?.source ?? '', `${indent}${item.label}`, 0];

    // F열~: 계정과목별 셀 값 (사용자가 CF방향으로 입력한 값 그대로)
    for (let i = 0; i < gridAccounts.length; i++) {
      const account = gridAccounts[i];
      const key = makeCellKey(item.id, account.id);
      const cell = gridData.get(key);
      if (cell && cell.amount !== 0) {
        rowData.push(cell.amount);
      } else {
        rowData.push('');
      }
    }

    const row = ws.addRow(rowData);

    // CF금액 수식 (E열 = 5)
    if (item.isEditable && gridAccounts.length > 0) {
      const firstCol = colLetter(ACCT_COL_START);
      const lastCol = colLetter(ACCT_COL_START + gridAccounts.length - 1);
      row.getCell(5).value = { formula: `SUM(${firstCol}${rowNum}:${lastCol}${rowNum})` } as ExcelJS.CellFormulaValue;
    } else if (item.isSubtotal) {
      const children = cfItems.filter(i => i.parentId === item.id);
      if (children.length > 0) {
        const childRefs = children.map(c => `E${itemRowMap.get(c.id)}`).join(',');
        row.getCell(5).value = { formula: `SUM(${childRefs})` } as ExcelJS.CellFormulaValue;
      }
    }

    // A열: 검증 수식
    if (item.isEditable && ref) {
      // 참조금액 교차검증: 참조 ± CF = 0
      if (ref.verifySign === 'plus') {
        row.getCell(1).value = { formula: `B${rowNum}+E${rowNum}` } as ExcelJS.CellFormulaValue;
      } else {
        row.getCell(1).value = { formula: `B${rowNum}-E${rowNum}` } as ExcelJS.CellFormulaValue;
      }
    }
    if (item.isEditable && item.sectionId === 'noncash') {
      // 비현금 거래: 행 SUM = 0 검증
      const firstCol = colLetter(ACCT_COL_START);
      const lastCol = colLetter(ACCT_COL_START + gridAccounts.length - 1);
      row.getCell(1).value = { formula: `SUM(${firstCol}${rowNum}:${lastCol}${rowNum})` } as ExcelJS.CellFormulaValue;
    }

    // 서식
    if (item.isSubtotal) {
      row.font = { bold: true };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    }
    if (item.level === 0) {
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE2EFDA' } };
      row.font = { bold: true };
    }
  }

  // ── SUM 행: 각 계정과목별 CF항목 합계 ──
  const sumRow = ws.addRow(['', '', '', '합계', '']);
  for (let i = 0; i < gridAccounts.length; i++) {
    const c = colLetter(ACCT_COL_START + i);
    sumRow.getCell(ACCT_COL_START + i).value = {
      formula: `SUM(${c}${CF_ROW_START}:${c}${SUM_ROW - 1})`
    } as ExcelJS.CellFormulaValue;
  }
  sumRow.font = { bold: true };
  sumRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF2CC' } };

  // ── 검증 행 조건부 서식 (Row 2) ──
  for (let i = 0; i < gridAccounts.length; i++) {
    const cell = r2.getCell(ACCT_COL_START + i);
    cell.numFmt = '#,##0;(#,##0);"-"';
  }

  // ── 열 서식 ──
  ws.getColumn(1).width = 12;  // A: 검증
  ws.getColumn(1).numFmt = '#,##0;(#,##0);"-"';
  ws.getColumn(2).width = 15;  // B: 참조금액
  ws.getColumn(2).numFmt = '#,##0;(#,##0);"-"';
  ws.getColumn(3).width = 15;  // C: 출처
  ws.getColumn(4).width = 35;  // D: CF항목
  ws.getColumn(5).width = 18;  // E: CF금액
  ws.getColumn(5).numFmt = '#,##0;(#,##0);"-"';

  for (let i = 0; i < gridAccounts.length; i++) {
    const col = ws.getColumn(ACCT_COL_START + i);
    col.width = 15;
    col.numFmt = '#,##0;(#,##0);"-"';
  }

  // ── 테두리 ──
  const totalRows = ws.rowCount;
  const totalCols = ACCT_COL_START + gridAccounts.length - 1;
  for (let r = 1; r <= totalRows; r++) {
    for (let c = 1; c <= totalCols; c++) {
      ws.getCell(r, c).border = {
        top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
        right: { style: 'thin', color: { argb: 'FFD0D0D0' } },
      };
    }
  }

  // ── 행 고정 (헤더 5행, 열 5개 고정) ──
  ws.views = [{ state: 'frozen', xSplit: 5, ySplit: 5 }];

  // ══════════════════════════════════════════════════
  // Sheet 2: 현금흐름표 (Sheet 1 참조)
  // ══════════════════════════════════════════════════
  const cfSheet = workbook.addWorksheet('현금흐름표');
  const titleRow = cfSheet.addRow([`현금흐름표 - ${projectName}`]);
  titleRow.font = { bold: true, size: 14 };
  cfSheet.addRow([]);

  for (const item of cfItems) {
    if (item.sectionId === 'noncash') continue;
    const indent = '  '.repeat(item.level);
    const itemRow = itemRowMap.get(item.id);

    const row = cfSheet.addRow([`${indent}${item.label}`, 0]);
    // Sheet 1의 CF금액(E열) 참조
    row.getCell(2).value = {
      formula: `'${sheetName}'!E${itemRow}`
    } as ExcelJS.CellFormulaValue;

    if (item.isSubtotal || item.level === 0) {
      row.font = { bold: true };
    }
  }

  cfSheet.getColumn(2).numFmt = '#,##0;(#,##0);"-"';
  cfSheet.getColumn(1).width = 40;
  cfSheet.getColumn(2).width = 20;

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}
