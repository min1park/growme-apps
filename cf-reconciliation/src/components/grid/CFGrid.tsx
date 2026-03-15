'use client';

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGridStore } from '@/stores/useGridStore';
import { makeCellKey, ReferenceData } from '@/types';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GridCell } from './GridCell';
import { Button } from '@/components/ui/button';
import { DownloadIcon, PlusIcon, XIcon } from 'lucide-react';
import { exportToExcel } from '@/services/excel-exporter';
import { CFItem } from '@/types/cf-template';
import { getSubtotalAmount } from '@/engines/validation';

import { useState } from 'react';

const ROW_HEIGHT = 28;
const VERIFY_COL_WIDTH = 65;  // A: 검증 (차이)
const REF_AMT_COL_WIDTH = 80; // B: 참조금액 (PL/주석)
const REF_SRC_COL_WIDTH = 80; // C: 출처
const LABEL_COL_WIDTH = 300;  // D: CF항목 라벨
const E_COL_WIDTH = 100;      // E: CF금액
const LEFT_PANEL_WIDTH = VERIFY_COL_WIDTH + REF_AMT_COL_WIDTH + REF_SRC_COL_WIDTH + LABEL_COL_WIDTH + E_COL_WIDTH;
const CELL_WIDTH = 110;
const HEADER_HEIGHT = 80;

/** 참조금액 셀 - 클릭하여 참조금액/출처/부호 편집 */
function RefAmountCell({
  item,
  isAdjustItem,
  refData,
  onUpdate,
}: {
  item: CFItem;
  isAdjustItem: boolean;
  refData: ReferenceData | null;
  onUpdate: (data: ReferenceData | null) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [amt, setAmt] = useState('');
  const [src, setSrc] = useState('');
  const [sign, setSign] = useState<'plus' | 'minus'>('minus');

  const startEdit = () => {
    if (!isAdjustItem) return;
    setAmt(refData?.amount?.toString() ?? '');
    setSrc(refData?.source ?? '');
    setSign(refData?.verifySign ?? 'minus');
    setEditing(true);
  };

  const commit = () => {
    const numAmt = parseFloat(amt);
    if (!isNaN(numAmt) && numAmt !== 0) {
      onUpdate({ amount: numAmt, source: src, verifySign: sign });
    } else {
      onUpdate(null);
    }
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="shrink-0 border-r border-b bg-yellow-50 z-20 sticky flex flex-col"
        style={{
          width: REF_AMT_COL_WIDTH + REF_SRC_COL_WIDTH,
          left: VERIFY_COL_WIDTH,
          position: 'sticky',
        }}
      >
        <div className="absolute top-full left-0 bg-white border shadow-lg rounded p-2 z-50 flex flex-col gap-1.5"
          style={{ width: 240 }}
        >
          <div className="flex items-center gap-1">
            <label className="text-[10px] w-12 shrink-0">참조금액</label>
            <input
              type="text"
              className="border rounded px-1 py-0.5 text-[11px] font-mono flex-1 w-0"
              value={amt}
              onChange={e => setAmt(e.target.value)}
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] w-12 shrink-0">출처</label>
            <input
              type="text"
              className="border rounded px-1 py-0.5 text-[11px] flex-1 w-0"
              placeholder="PL, 주석 등"
              value={src}
              onChange={e => setSrc(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
            />
          </div>
          <div className="flex items-center gap-1">
            <label className="text-[10px] w-12 shrink-0">검증식</label>
            <select
              className="border rounded px-1 py-0.5 text-[10px] flex-1"
              value={sign}
              onChange={e => setSign(e.target.value as 'plus' | 'minus')}
            >
              <option value="minus">참조 - CF = 0 (비용항목)</option>
              <option value="plus">참조 + CF = 0 (수익항목)</option>
            </select>
          </div>
          <div className="flex gap-1 justify-end">
            <button className="text-[10px] px-2 py-0.5 rounded bg-blue-500 text-white hover:bg-blue-600" onClick={commit}>확인</button>
            <button className="text-[10px] px-2 py-0.5 rounded bg-gray-200 hover:bg-gray-300" onClick={() => setEditing(false)}>취소</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'shrink-0 flex items-center justify-end px-1 border-r border-b text-[10px] font-mono bg-white z-10 sticky',
        item.isSubtotal && 'bg-blue-50/80',
        item.level === 0 && 'bg-blue-100/50',
        isAdjustItem && 'cursor-pointer hover:bg-yellow-50',
      )}
      style={{ width: REF_AMT_COL_WIDTH, left: VERIFY_COL_WIDTH }}
      onClick={startEdit}
      title={isAdjustItem ? '클릭하여 참조금액 입력 (PL/주석 교차검증)' : undefined}
    >
      {refData ? formatNumber(refData.amount) : ''}
    </div>
  );
}

export function CFGrid() {
  const {
    accounts, cfItems, mappings, gridData, referenceData, validation,
    selectedCell, editingCell, showNonCash, collapsedSections,
    selectCell, startEditing, stopEditing, setCellValue,
    setShowNonCash, toggleSection, undo, redo,
    addItemToSection, removeItemFromSection, setReferenceData,
  } = useGridStore();

  const [addingTo, setAddingTo] = useState<string | null>(null); // parentId for add input
  const [newItemLabel, setNewItemLabel] = useState('');

  const containerRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Filter items based on showNonCash and collapsed sections
  const visibleItems = useMemo(() => {
    let items = cfItems;
    if (!showNonCash) {
      items = items.filter(i => i.sectionId !== 'noncash');
    }
    // Filter collapsed children
    const collapsed = collapsedSections;
    if (collapsed.size === 0) return items;
    return items.filter(item => {
      let parent = item.parentId;
      while (parent) {
        if (collapsed.has(parent)) return false;
        const parentItem = cfItems.find(i => i.id === parent);
        parent = parentItem?.parentId ?? null;
      }
      return true;
    });
  }, [cfItems, showNonCash, collapsedSections]);

  // Filter accounts (exclude cash for grid body, but show in header)
  const mappingMap = useMemo(() => new Map(mappings.map(m => [m.accountId, m])), [mappings]);
  const gridAccounts = useMemo(() =>
    accounts.filter(a => mappingMap.get(a.id)?.cfCategory !== 'cash'),
    [accounts, mappingMap]
  );

  // Virtual scrollers
  const rowVirtualizer = useVirtualizer({
    count: visibleItems.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 10,
  });

  const colVirtualizer = useVirtualizer({
    horizontal: true,
    count: gridAccounts.length,
    getScrollElement: () => bodyRef.current,
    estimateSize: () => CELL_WIDTH,
    overscan: 5,
  });

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undo, redo]);

  const getItemAmount = useCallback((item: CFItem): number => {
    if (item.isSubtotal) {
      return getSubtotalAmount(item.id, cfItems, accounts, gridData);
    }
    let rawSum = 0;
    for (const account of accounts) {
      const key = makeCellKey(item.id, account.id);
      const cell = gridData.get(key);
      if (cell) rawSum += cell.amount;
    }
    return rawSum; // CF금액 = 입력값 합계 (sign 미적용, 예시 Excel과 동일)
  }, [cfItems, accounts, gridData]);

  const handleCellNavigate = useCallback((currentItemId: string, currentAccountId: string, dir: 'up' | 'down' | 'left' | 'right') => {
    const rowIdx = visibleItems.findIndex(i => i.id === currentItemId);
    const colIdx = gridAccounts.findIndex(a => a.id === currentAccountId);
    let newRow = rowIdx;
    let newCol = colIdx;

    if (dir === 'up') newRow = Math.max(0, rowIdx - 1);
    else if (dir === 'down') newRow = Math.min(visibleItems.length - 1, rowIdx + 1);
    else if (dir === 'left') newCol = Math.max(0, colIdx - 1);
    else if (dir === 'right') newCol = Math.min(gridAccounts.length - 1, colIdx + 1);

    if (newRow >= 0 && newRow < visibleItems.length && newCol >= 0 && newCol < gridAccounts.length) {
      const key = makeCellKey(visibleItems[newRow].id, gridAccounts[newCol].id);
      selectCell(key);
    }
  }, [visibleItems, gridAccounts, selectCell]);

  const handleExport = useCallback(async () => {
    const blob = await exportToExcel('CF정산표', accounts, cfItems, gridData, validation, mappings, referenceData);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CF정산표.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, [accounts, cfItems, gridData, validation, mappings, referenceData]);

  return (
    <div ref={containerRef} className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-muted/30 shrink-0">
        <label className="flex items-center gap-1.5 text-xs">
          <input
            type="checkbox"
            checked={showNonCash}
            onChange={e => setShowNonCash(e.target.checked)}
            className="rounded"
          />
          비현금 거래 표시
        </label>
        <div className="flex-1" />
        <Button variant="outline" size="xs" onClick={handleExport}>
          <DownloadIcon className="h-3 w-3 mr-1" />
          Excel
        </Button>
      </div>

      {/* 항목 추가 입력 */}
      {addingTo && (
        <div className="flex items-center gap-2 px-3 py-1.5 border-b bg-blue-50/50 shrink-0">
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            [{cfItems.find(i => i.id === addingTo)?.label}] 항목 추가:
          </span>
          <input
            type="text"
            className="border rounded px-2 py-0.5 text-xs w-60"
            placeholder="항목명 입력"
            value={newItemLabel}
            onChange={e => setNewItemLabel(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && newItemLabel.trim()) {
                addItemToSection(addingTo, newItemLabel.trim());
                setNewItemLabel('');
                setAddingTo(null);
              } else if (e.key === 'Escape') {
                setNewItemLabel('');
                setAddingTo(null);
              }
            }}
            autoFocus
          />
          <Button
            variant="outline"
            size="xs"
            onClick={() => {
              if (newItemLabel.trim()) {
                addItemToSection(addingTo, newItemLabel.trim());
                setNewItemLabel('');
                setAddingTo(null);
              }
            }}
          >
            추가
          </Button>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => { setNewItemLabel(''); setAddingTo(null); }}
          >
            취소
          </Button>
        </div>
      )}

      {/* Grid */}
      <div className="flex-1 overflow-hidden relative">
        {/* Column headers (frozen top) */}
        <div className="absolute top-0 left-0 right-0 z-20" style={{ height: HEADER_HEIGHT }}>
          {/* Top-left corner */}
          <div
            className="absolute top-0 left-0 bg-muted/50 border-b border-r z-30 flex items-end"
            style={{ width: LEFT_PANEL_WIDTH, height: HEADER_HEIGHT }}
          >
            <div className="flex" style={{ height: ROW_HEIGHT }}>
              <div className="flex items-center justify-center px-1 text-[10px] font-medium border-r" style={{ width: VERIFY_COL_WIDTH }}>
                검증
              </div>
              <div className="flex items-center justify-center px-1 text-[10px] font-medium border-r" style={{ width: REF_AMT_COL_WIDTH }}>
                참조금액
              </div>
              <div className="flex items-center justify-center px-1 text-[10px] font-medium border-r" style={{ width: REF_SRC_COL_WIDTH }}>
                출처
              </div>
              <div className="flex items-center px-2 text-xs font-medium border-r" style={{ width: LABEL_COL_WIDTH }}>
                CF 항목
              </div>
              <div className="flex items-center justify-end px-2 text-xs font-medium" style={{ width: E_COL_WIDTH }}>
                CF금액
              </div>
            </div>
          </div>

          {/* Account headers (scrollable) */}
          <div
            className="absolute top-0 border-b bg-muted/50 overflow-hidden"
            style={{ left: LEFT_PANEL_WIDTH, right: 0, height: HEADER_HEIGHT }}
          >
            <div
              className="relative"
              style={{
                width: colVirtualizer.getTotalSize(),
                height: HEADER_HEIGHT,
                transform: `translateX(-${bodyRef.current?.scrollLeft ?? 0}px)`,
              }}
            >
              {gridAccounts.map((account, idx) => {
                const colDiff = validation.columnChecks.get(account.id) ?? 0;
                const isOk = Math.abs(colDiff) < 0.5;
                // 증감 부호 표시: 자산=기말-기초, 부채/자본=-(기말-기초)
                const mapping = mappingMap.get(account.id);
                const isAsset = mapping?.bsCategory === 'current-asset' || mapping?.bsCategory === 'noncurrent-asset';
                const adjustedChange = isAsset ? account.change : -account.change;
                return (
                  <div
                    key={account.id}
                    className="absolute top-0 border-r flex flex-col justify-end"
                    style={{ left: idx * CELL_WIDTH, width: CELL_WIDTH, height: HEADER_HEIGHT }}
                  >
                    <div className="px-1 text-[10px] text-muted-foreground truncate">{account.code}</div>
                    <div className="px-1 text-[10px] font-medium truncate" title={account.name}>{account.name}</div>
                    <div className="px-1 text-[10px] text-right font-mono" title={`증감: ${isAsset ? '기말-기초' : '-(기말-기초)'}`}>
                      {formatNumber(adjustedChange)}
                    </div>
                    <div className={cn(
                      'px-1 text-[10px] text-right font-mono',
                      isOk ? 'text-green-600 bg-green-50' : 'text-red-600 bg-red-50'
                    )}>
                      {isOk ? 'OK' : formatNumber(colDiff)}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Scrollable body */}
        <div
          ref={bodyRef}
          className="absolute overflow-auto"
          style={{
            top: HEADER_HEIGHT,
            left: 0,
            right: 0,
            bottom: 0,
          }}
          onScroll={() => {
            // Force re-render for header sync
            containerRef.current?.dispatchEvent(new Event('scroll'));
          }}
        >
          <div
            style={{
              width: LEFT_PANEL_WIDTH + colVirtualizer.getTotalSize(),
              height: rowVirtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const item = visibleItems[virtualRow.index];
              const eAmount = getItemAmount(item);
              const ref = referenceData.get(item.id);
              const isAdjustItem = item.isEditable && !item.isSubtotal;

              // 검증 = 참조금액 ± CF금액 (0이면 OK)
              const verifyDiff = ref
                ? (ref.verifySign === 'plus' ? ref.amount + eAmount : ref.amount - eAmount)
                : null;
              const verifyOk = verifyDiff !== null && Math.abs(verifyDiff) < 0.5;

              return (
                <div
                  key={item.id}
                  className="absolute left-0 flex"
                  style={{
                    top: virtualRow.start,
                    height: ROW_HEIGHT,
                    width: LEFT_PANEL_WIDTH + colVirtualizer.getTotalSize(),
                  }}
                >
                  {/* A: 검증 (차이) */}
                  <div
                    className={cn(
                      'shrink-0 flex items-center justify-end px-1 border-r border-b text-[10px] font-mono bg-white z-10 sticky left-0',
                      item.isSubtotal && 'bg-blue-50/80',
                      item.level === 0 && 'bg-blue-100/50',
                      verifyDiff !== null && (verifyOk ? 'text-green-600' : 'text-red-600 bg-red-50'),
                    )}
                    style={{ width: VERIFY_COL_WIDTH }}
                  >
                    {verifyDiff !== null && (verifyOk ? 'OK' : formatNumber(verifyDiff))}
                  </div>

                  {/* B: 참조금액 (클릭하여 편집) */}
                  <RefAmountCell
                    item={item}
                    isAdjustItem={isAdjustItem}
                    refData={ref ?? null}
                    onUpdate={(data) => setReferenceData(item.id, data)}
                  />

                  {/* C: 출처 */}
                  <div
                    className={cn(
                      'shrink-0 flex items-center px-1 border-r border-b text-[10px] bg-white z-10 sticky truncate',
                      item.isSubtotal && 'bg-blue-50/80',
                      item.level === 0 && 'bg-blue-100/50',
                    )}
                    style={{ width: REF_SRC_COL_WIDTH, left: VERIFY_COL_WIDTH + REF_AMT_COL_WIDTH }}
                    title={ref?.source}
                  >
                    {ref?.source ?? ''}
                  </div>

                  {/* D: CF항목 라벨 */}
                  <div
                    className={cn(
                      'shrink-0 flex items-center border-r border-b bg-white z-10 sticky',
                      item.isSubtotal && 'font-bold bg-blue-50/80',
                      item.level === 0 && 'bg-blue-100/50',
                    )}
                    style={{ width: LABEL_COL_WIDTH, left: VERIFY_COL_WIDTH + REF_AMT_COL_WIDTH + REF_SRC_COL_WIDTH }}
                  >
                    <div
                      className="px-2 text-xs truncate cursor-default w-full flex items-center"
                      style={{ paddingLeft: `${item.level * 16 + 8}px` }}
                      title={item.label}
                    >
                      {item.isSubtotal && (
                        <button
                          className="mr-1 text-muted-foreground hover:text-foreground"
                          onClick={() => toggleSection(item.id)}
                        >
                          {collapsedSections.has(item.id) ? '+' : '-'}
                        </button>
                      )}
                      <span className="truncate flex-1">{item.label}</span>
                      {item.isSubtotal && ['op-adjust', 'op-wc', 'inv-in', 'inv-out', 'fin-in', 'fin-out', 'nc'].includes(item.id) && (
                        <button
                          className="ml-1 p-0.5 rounded hover:bg-blue-100 text-blue-600 shrink-0"
                          title="항목 추가"
                          onClick={(e) => { e.stopPropagation(); setAddingTo(item.id); setNewItemLabel(''); }}
                        >
                          <PlusIcon className="h-3 w-3" />
                        </button>
                      )}
                      {item.isEditable && (
                        <button
                          className="ml-1 p-0.5 rounded hover:bg-red-100 text-red-500 shrink-0"
                          title="항목 삭제"
                          onClick={(e) => { e.stopPropagation(); removeItemFromSection(item.id); }}
                        >
                          <XIcon className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* E: CF금액 */}
                  <div
                    className={cn(
                      'shrink-0 flex items-center justify-end px-1 border-r border-b text-xs font-mono bg-white z-10 sticky',
                      item.isSubtotal && 'font-bold bg-blue-50/80',
                      eAmount < 0 && 'text-red-600',
                      item.sectionId === 'noncash' && item.isEditable && (() => {
                        const ncDiff = validation.noncashChecks.get(item.id) ?? 0;
                        return Math.abs(ncDiff) >= 0.5 ? 'text-red-600 bg-red-50' : eAmount !== 0 ? 'text-green-600' : '';
                      })(),
                    )}
                    style={{ width: E_COL_WIDTH, left: VERIFY_COL_WIDTH + REF_AMT_COL_WIDTH + REF_SRC_COL_WIDTH + LABEL_COL_WIDTH }}
                    title={item.sectionId === 'noncash' && item.isEditable ? `비현금 검증: 합계=${formatNumber(eAmount)} (0이어야 함)` : undefined}
                  >
                    {item.sectionId === 'noncash' && item.isEditable
                      ? (eAmount !== 0 ? formatNumber(eAmount) : (validation.noncashChecks.has(item.id) ? 'OK' : ''))
                      : (eAmount !== 0 ? formatNumber(eAmount) : '')}
                  </div>

                  {/* Grid cells */}
                  {colVirtualizer.getVirtualItems().map(virtualCol => {
                    const account = gridAccounts[virtualCol.index];
                    const key = makeCellKey(item.id, account.id);
                    const cell = gridData.get(key);
                    const cellValue = cell?.amount ?? 0;

                    return (
                      <div
                        key={key}
                        className="absolute border-r border-b"
                        style={{
                          left: LEFT_PANEL_WIDTH + virtualCol.start,
                          width: CELL_WIDTH,
                          height: ROW_HEIGHT,
                        }}
                      >
                        <GridCell
                          value={cellValue}
                          isSelected={selectedCell === key}
                          isEditing={editingCell === key}
                          isEditable={item.isEditable}
                          isSubtotal={item.isSubtotal}
                          onSelect={() => selectCell(key)}
                          onStartEdit={() => startEditing(key)}
                          onCommit={(val) => {
                            setCellValue(item.id, account.id, val);
                            stopEditing();
                          }}
                          onCancel={stopEditing}
                          onNavigate={(dir) => handleCellNavigate(item.id, account.id, dir)}
                        />
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
