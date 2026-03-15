import ExcelJS from 'exceljs';
import { Account, CellKey, CellValue, ValidationResult, makeCellKey } from '@/types';
import { CFItem } from '@/types/cf-template';
import { getSubtotalAmount } from '@/engines/validation';

/**
 * 시산표 입력 템플릿 생성
 * 예시 데이터가 포함된 Excel 템플릿을 다운로드할 수 있도록 생성
 */
export async function generateTBTemplate(): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();

  // 시산표 템플릿 시트
  const ws = workbook.addWorksheet('시산표');

  // 헤더 행
  const headerRow = ws.addRow(['계정코드', '계정명', '당기초', '당기말']);
  headerRow.font = { bold: true };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF4472C4' },
  };
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.alignment = { horizontal: 'center' };

  // 예시 데이터 (K-IFRS 기준 일반적인 계정과목)
  const sampleData = [
    // 유동자산
    ['1010', '현금및현금성자산', 50000000, 65000000],
    ['1110', '단기금융상품', 100000000, 80000000],
    ['1210', '매출채권', 200000000, 230000000],
    ['1220', '대손충당금', -10000000, -12000000],
    ['1310', '재고자산', 150000000, 140000000],
    ['1410', '선급금', 20000000, 25000000],
    ['1420', '선급비용', 5000000, 6000000],

    // 비유동자산
    ['2110', '장기금융상품', 50000000, 60000000],
    ['2210', '토지', 500000000, 500000000],
    ['2220', '건물', 300000000, 350000000],
    ['2221', '건물감가상각누계액', -30000000, -40000000],
    ['2230', '기계장치', 200000000, 220000000],
    ['2231', '기계장치감가상각누계액', -40000000, -55000000],
    ['2240', '차량운반구', 50000000, 60000000],
    ['2241', '차량운반구감가상각누계액', -20000000, -28000000],
    ['2310', '소프트웨어', 30000000, 35000000],
    ['2311', '소프트웨어상각누계액', -10000000, -15000000],
    ['2410', '사용권자산', 100000000, 120000000],
    ['2411', '사용권자산감가상각누계액', -20000000, -40000000],

    // 유동부채
    ['3110', '매입채무', 80000000, 95000000],
    ['3120', '미지급금', 30000000, 35000000],
    ['3130', '미지급비용', 15000000, 18000000],
    ['3140', '선수금', 10000000, 12000000],
    ['3150', '예수금', 5000000, 6000000],
    ['3210', '단기차입금', 100000000, 80000000],
    ['3220', '유동성장기부채', 50000000, 50000000],
    ['3230', '유동리스부채', 25000000, 30000000],

    // 비유동부채
    ['4110', '장기차입금', 200000000, 180000000],
    ['4120', '사채', 100000000, 100000000],
    ['4210', '비유동리스부채', 60000000, 70000000],
    ['4310', '퇴직급여충당부채', 80000000, 95000000],
    ['4320', '이연법인세부채', 20000000, 25000000],

    // 자본
    ['5110', '자본금', 500000000, 500000000],
    ['5120', '자본잉여금', 100000000, 100000000],
    ['5210', '이익잉여금', 360000000, 421000000],
    ['5220', '기타포괄손익누계액', 5000000, 8000000],
  ];

  // 데이터 행 추가
  for (const row of sampleData) {
    const dataRow = ws.addRow(row);
    // 숫자 컬럼 우측 정렬
    dataRow.getCell(3).alignment = { horizontal: 'right' };
    dataRow.getCell(4).alignment = { horizontal: 'right' };
  }

  // 컬럼 너비 설정
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 30;
  ws.getColumn(3).width = 18;
  ws.getColumn(4).width = 18;

  // 숫자 형식 설정
  ws.getColumn(3).numFmt = '#,##0;(#,##0);"-"';
  ws.getColumn(4).numFmt = '#,##0;(#,##0);"-"';

  // 테두리 설정
  const lastRow = ws.rowCount;
  for (let i = 1; i <= lastRow; i++) {
    for (let j = 1; j <= 4; j++) {
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
    ['■ 작성 요령'],
    ['  - 시산표 시트에 있는 예시 데이터를 삭제하고 실제 데이터를 입력하세요'],
    ['  - 모든 재무상태표 계정을 포함해야 정확한 CF정산표를 작성할 수 있습니다'],
    ['  - 차변 잔액 계정(자산)은 양수, 대변 잔액 계정(부채/자본)은 음수로 입력'],
    ['    또는 모두 양수로 입력해도 됩니다 (시스템에서 자동 처리)'],
    ['  - 대손충당금, 감가상각누계액 등 차감계정은 음수로 입력하세요'],
    [''],
    ['■ 컬럼명 인식'],
    ['  시스템은 다음과 같은 컬럼명을 자동으로 인식합니다:'],
    ['  - 계정코드: 코드, 계정번호, 계정코드'],
    ['  - 계정명: 계정명, 과목명, 계정과목'],
    ['  - 당기초: 당기초, 기초, 기초잔액, 전기말'],
    ['  - 당기말: 당기말, 기말, 기말잔액'],
    [''],
    ['■ 자동 매핑'],
    ['  업로드 후 시스템이 계정명을 분석하여 자동으로 CF 항목에 매핑합니다:'],
    ['  - 현금, 예금 → 현금및현금성자산'],
    ['  - 매출채권, 재고자산 → 영업활동'],
    ['  - 유형자산(토지, 건물 등) → 투자활동'],
    ['  - 차입금, 사채 → 재무활동'],
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
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();

  const ws = workbook.addWorksheet(`CF정산표_${projectName}`);

  const headerRow = ['검증', 'CF항목', 'CF금액', ...accounts.map(a => a.name)];
  ws.addRow(headerRow);

  ws.addRow(['', '당기초', '', ...accounts.map(a => a.openingBalance)]);
  ws.addRow(['', '당기말', '', ...accounts.map(a => a.closingBalance)]);
  ws.addRow(['', '증감', '', ...accounts.map(a => a.change)]);

  const valRow = ['', '열검증', '', ...accounts.map(a => validation.columnChecks.get(a.id) ?? 0)];
  ws.addRow(valRow);

  for (const item of cfItems) {
    const indent = '  '.repeat(item.level);
    let cfAmount = 0;
    if (item.isSubtotal) {
      cfAmount = getSubtotalAmount(item.id, cfItems, accounts, gridData);
    } else {
      let rawSum = 0;
      for (const account of accounts) {
        const key = makeCellKey(item.id, account.id);
        const cell = gridData.get(key);
        if (cell) rawSum += cell.amount;
      }
      cfAmount = rawSum * item.sign; // C-1 fix: sign convention 적용
    }

    const rowData: (string | number)[] = [
      '',
      `${indent}${item.label}`,
      cfAmount,
    ];

    for (const account of accounts) {
      const key = makeCellKey(item.id, account.id);
      const cell = gridData.get(key);
      rowData.push(cell?.amount ?? '');
    }

    const row = ws.addRow(rowData);

    if (item.isSubtotal) {
      row.font = { bold: true };
      row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFF6FF' } };
    }
  }

  ws.columns.forEach((col, idx) => {
    if (idx >= 2) {
      col.numFmt = '#,##0;(#,##0);"-"';
      col.width = 15;
    } else {
      col.width = idx === 1 ? 35 : 10;
    }
  });

  const cfSheet = workbook.addWorksheet('현금흐름표');
  cfSheet.addRow([`현금흐름표 - ${projectName}`]);
  cfSheet.addRow([]);

  for (const item of cfItems) {
    if (item.sectionId === 'noncash') continue;
    const indent = '  '.repeat(item.level);
    let cfAmount = 0;
    if (item.isSubtotal) {
      cfAmount = getSubtotalAmount(item.id, cfItems, accounts, gridData);
    } else {
      let rawSum = 0;
      for (const account of accounts) {
        const key = makeCellKey(item.id, account.id);
        const cell = gridData.get(key);
        if (cell) rawSum += cell.amount;
      }
      cfAmount = rawSum * item.sign; // C-1 fix: sign convention 적용
    }

    const row = cfSheet.addRow([`${indent}${item.label}`, cfAmount]);
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
