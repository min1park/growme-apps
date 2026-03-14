'use client';

import React, { useState, useCallback, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Account } from '@/types';
import { parseFile, getSheetData, detectColumns, parseTB, TBParseConfig } from '@/services/tb-parser';
import { formatNumber } from '@/lib/format';
import { UploadIcon, FileSpreadsheetIcon } from 'lucide-react';

interface TBUploadProps {
  onComplete: (accounts: Account[]) => void;
}

export function TBUpload({ onComplete }: TBUploadProps) {
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [fileName, setFileName] = useState('');
  const [sheetNames, setSheetNames] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState('');
  const [data, setData] = useState<unknown[][]>([]);
  const [config, setConfig] = useState<TBParseConfig>({
    sheetName: '',
    startRow: 1,
    columns: { code: 0, name: 1, opening: 2, closing: 3 },
  });
  const [preview, setPreview] = useState<Account[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleFile = useCallback(async (file: File) => {
    setFileName(file.name);
    const wb = await parseFile(file);
    setWorkbook(wb);
    setSheetNames(wb.SheetNames);
    if (wb.SheetNames.length > 0) {
      const first = wb.SheetNames[0];
      setSelectedSheet(first);
      loadSheet(wb, first);
    }
  }, []);

  const loadSheet = (wb: XLSX.WorkBook, name: string) => {
    const d = getSheetData(wb, name);
    setData(d);
    if (d.length > 0) {
      const detected = detectColumns(d[0] as unknown[]);
      const newCols = {
        code: detected.code ?? 0,
        name: detected.name ?? 1,
        opening: detected.opening ?? 2,
        closing: detected.closing ?? 3,
      };
      const newConfig: TBParseConfig = { sheetName: name, startRow: 1, columns: newCols };
      setConfig(newConfig);
      const accounts = parseTB(d, newConfig);
      setPreview(accounts);
    }
  };

  const handleSheetChange = (name: string) => {
    setSelectedSheet(name);
    if (workbook) loadSheet(workbook, name);
  };

  const handleConfigChange = (key: keyof TBParseConfig['columns'], value: number) => {
    const newConfig = { ...config, columns: { ...config.columns, [key]: value } };
    setConfig(newConfig);
    if (data.length > 0) {
      setPreview(parseTB(data, newConfig));
    }
  };

  const handleStartRowChange = (value: number) => {
    const newConfig = { ...config, startRow: value };
    setConfig(newConfig);
    if (data.length > 0) {
      setPreview(parseTB(data, newConfig));
    }
  };

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  }, [handleFile]);

  const totalOpening = preview.reduce((s, a) => s + a.openingBalance, 0);
  const totalClosing = preview.reduce((s, a) => s + a.closingBalance, 0);

  const colOptions = data.length > 0
    ? (data[0] as unknown[]).map((cell, idx) => ({
        value: idx,
        label: `${idx}: ${String(cell ?? '').substring(0, 20)}`,
      }))
    : [];

  return (
    <div className="flex flex-col h-full p-4 overflow-auto">
      {!workbook ? (
        <div
          className="flex flex-col items-center justify-center border-2 border-dashed border-blue-200 rounded-2xl p-16 cursor-pointer hover:bg-blue-50/50 hover:border-blue-300 transition-all duration-200 bg-white"
          onDrop={handleDrop}
          onDragOver={e => e.preventDefault()}
          onClick={() => fileRef.current?.click()}
        >
          <div className="h-16 w-16 rounded-2xl bg-gradient-to-br from-blue-100 to-indigo-100 flex items-center justify-center mb-5">
            <UploadIcon className="h-8 w-8 text-blue-500" />
          </div>
          <p className="text-sm font-semibold mb-1 text-foreground">Excel/CSV 파일을 드래그하거나 클릭하세요</p>
          <p className="text-xs text-muted-foreground">.xlsx, .xls, .csv 지원</p>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" onChange={e => { if (e.target.files?.[0]) handleFile(e.target.files[0]); }} className="hidden" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center gap-2 text-sm">
            <FileSpreadsheetIcon className="h-4 w-4 text-green-600" />
            <span className="font-medium">{fileName}</span>
            <Button variant="ghost" size="xs" onClick={() => { setWorkbook(null); setPreview([]); }}>변경</Button>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
            <div>
              <label className="text-xs text-muted-foreground block mb-1">시트</label>
              <select
                className="w-full rounded-lg border px-2 py-1.5 text-sm bg-background"
                value={selectedSheet}
                onChange={e => handleSheetChange(e.target.value)}
              >
                {sheetNames.map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">시작행</label>
              <Input type="number" min={0} value={config.startRow} onChange={e => handleStartRowChange(Number(e.target.value))} />
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">코드열</label>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm bg-background" value={config.columns.code} onChange={e => handleConfigChange('code', Number(e.target.value))}>
                {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">계정명열</label>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm bg-background" value={config.columns.name} onChange={e => handleConfigChange('name', Number(e.target.value))}>
                {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">기초열</label>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm bg-background" value={config.columns.opening} onChange={e => handleConfigChange('opening', Number(e.target.value))}>
                {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground block mb-1">기말열</label>
              <select className="w-full rounded-lg border px-2 py-1.5 text-sm bg-background" value={config.columns.closing} onChange={e => handleConfigChange('closing', Number(e.target.value))}>
                {colOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>계정 수: <strong className="text-foreground">{preview.length}</strong></span>
            <span>기초합계: <strong className="text-foreground">{formatNumber(totalOpening)}</strong></span>
            <span>기말합계: <strong className="text-foreground">{formatNumber(totalClosing)}</strong></span>
            <span>BS 대차: <strong className={Math.abs(totalClosing) < 0.5 ? 'text-green-600' : 'text-red-600'}>{formatNumber(totalClosing)}</strong></span>
          </div>

          {preview.length > 0 && (
            <div className="border border-blue-100 rounded-xl overflow-auto max-h-[400px] shadow-sm">
              <table className="w-full text-xs">
                <thead className="bg-blue-50/80 sticky top-0">
                  <tr>
                    <th className="px-2 py-1.5 text-left font-medium">#</th>
                    <th className="px-2 py-1.5 text-left font-medium">코드</th>
                    <th className="px-2 py-1.5 text-left font-medium">계정명</th>
                    <th className="px-2 py-1.5 text-right font-medium">기초</th>
                    <th className="px-2 py-1.5 text-right font-medium">기말</th>
                    <th className="px-2 py-1.5 text-right font-medium">증감</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.slice(0, 30).map((a, idx) => (
                    <tr key={a.id} className="border-t hover:bg-muted/20">
                      <td className="px-2 py-1 text-muted-foreground">{idx + 1}</td>
                      <td className="px-2 py-1 font-mono">{a.code}</td>
                      <td className="px-2 py-1">{a.name}</td>
                      <td className="px-2 py-1 text-right font-mono">{formatNumber(a.openingBalance)}</td>
                      <td className="px-2 py-1 text-right font-mono">{formatNumber(a.closingBalance)}</td>
                      <td className={`px-2 py-1 text-right font-mono ${a.change < 0 ? 'text-red-600' : ''}`}>
                        {formatNumber(a.change)}
                      </td>
                    </tr>
                  ))}
                  {preview.length > 30 && (
                    <tr><td colSpan={6} className="text-center py-2 text-muted-foreground">... 외 {preview.length - 30}개</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}

          <div className="flex justify-end">
            <Button onClick={() => onComplete(preview)} disabled={preview.length === 0} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm">
              다음: 매핑 ({preview.length}개 계정)
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
