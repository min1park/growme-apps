import ExcelJS from 'exceljs';
import { Account, CellKey, CellValue, ValidationResult, makeCellKey } from '@/types';
import { CFItem } from '@/types/cf-template';
import { getSubtotalAmount } from '@/engines/validation';

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
