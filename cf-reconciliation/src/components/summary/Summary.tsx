'use client';

import React, { useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useGridStore } from '@/stores/useGridStore';
import { useProjectStore } from '@/stores/useProjectStore';
import { exportToExcel } from '@/services/excel-exporter';
import { formatNumber } from '@/lib/format';
import { makeCellKey } from '@/types';
import { getSubtotalAmount } from '@/engines/validation';
import { DownloadIcon, FileJsonIcon, CheckCircleIcon, XCircleIcon } from 'lucide-react';

export function Summary() {
  const { accounts, cfItems, gridData, validation, toJSON } = useGridStore();
  const { currentProject } = useProjectStore();

  const handleExcelExport = useCallback(async () => {
    const blob = await exportToExcel(
      currentProject?.name ?? 'CF정산표',
      accounts,
      cfItems,
      gridData,
      validation,
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject?.name ?? 'CF정산표'}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  }, [accounts, cfItems, gridData, validation, currentProject]);

  const handleJSONExport = useCallback(() => {
    const data = toJSON();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${currentProject?.name ?? 'CF정산표'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [toJSON, currentProject]);

  const colOk = validation.passedColumns === validation.totalColumns && validation.totalColumns > 0;
  const cashOk = Math.abs(validation.cashCheck) < 0.5;

  // Build CF statement preview (C-1 fix: sign 적용)
  const cfPreview = cfItems.filter(i => i.sectionId !== 'noncash').map(item => {
    let amount = 0;
    if (item.isSubtotal) {
      amount = getSubtotalAmount(item.id, cfItems, accounts, gridData);
    } else {
      let rawSum = 0;
      for (const account of accounts) {
        const key = makeCellKey(item.id, account.id);
        const cell = gridData.get(key);
        if (cell) rawSum += cell.amount;
      }
      amount = rawSum * item.sign;
    }
    return { ...item, amount };
  });

  return (
    <div className="flex h-full overflow-hidden">
      {/* Left: Validation & Export */}
      <div className="w-80 border-r p-4 overflow-auto shrink-0 space-y-4">
        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm">검증 결과</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs">열 검증</span>
              <Badge variant={colOk ? 'default' : 'destructive'}>
                {validation.passedColumns}/{validation.totalColumns}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs">현금 검증</span>
              {cashOk ? (
                <Badge variant="default"><CheckCircleIcon className="h-3 w-3 mr-1" />OK</Badge>
              ) : (
                <Badge variant="destructive"><XCircleIcon className="h-3 w-3 mr-1" />{formatNumber(validation.cashCheck)}</Badge>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="p-3 pb-2">
            <CardTitle className="text-sm">내보내기</CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-0 space-y-2">
            <Button className="w-full" onClick={handleExcelExport}>
              <DownloadIcon className="h-3.5 w-3.5 mr-1" />
              Excel 다운로드
            </Button>
            <Button variant="outline" className="w-full" onClick={handleJSONExport}>
              <FileJsonIcon className="h-3.5 w-3.5 mr-1" />
              JSON 저장
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Right: CF Statement Preview */}
      <div className="flex-1 p-4 overflow-auto">
        <h2 className="text-sm font-bold mb-3">현금흐름표 미리보기</h2>
        <div className="border rounded-lg overflow-auto">
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0">
              <tr>
                <th className="px-3 py-2 text-left font-medium">항목</th>
                <th className="px-3 py-2 text-right font-medium w-32">금액</th>
              </tr>
            </thead>
            <tbody>
              {cfPreview.map(item => (
                <tr
                  key={item.id}
                  className={`border-t ${item.isSubtotal || item.level === 0 ? 'font-bold bg-blue-50/50' : ''}`}
                >
                  <td className="px-3 py-1.5" style={{ paddingLeft: `${item.level * 16 + 12}px` }}>
                    {item.label}
                  </td>
                  <td className={`px-3 py-1.5 text-right font-mono ${item.amount < 0 ? 'text-red-600' : ''}`}>
                    {item.amount !== 0 ? formatNumber(item.amount) : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
