'use client';

import React, { useMemo, useCallback, useRef, useEffect } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { useGridStore } from '@/stores/useGridStore';
import { makeCellKey } from '@/types';
import { formatNumber } from '@/lib/format';
import { cn } from '@/lib/utils';
import { GridCell } from './GridCell';
import { Button } from '@/components/ui/button';
import { DownloadIcon } from 'lucide-react';
import { exportToExcel } from '@/services/excel-exporter';
import { CFItem } from '@/types/cf-template';
import { getSubtotalAmount } from '@/engines/validation';

const ROW_HEIGHT = 28;
const LEFT_PANEL_WIDTH = 300;
const E_COL_WIDTH = 100;
const CELL_WIDTH = 110;
const HEADER_HEIGHT = 80;

export function CFGrid() {
  const {
    accounts, cfItems, mappings, gridData, validation,
    selectedCell, editingCell, showNonCash, collapsedSections,
    selectCell, startEditing, stopEditing, setCellValue,
    setShowNonCash, toggleSection, undo, redo,
  } = useGridStore();

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
    return rawSum * item.sign; // C-1 fix: sign 적용하여 CF금액 표시
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
    const blob = await exportToExcel('CF정산표', accounts, cfItems, gridData, validation);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'CF정산표.xlsx';
    a.click();
    URL.revokeObjectURL(url);
  }, [accounts, cfItems, gridData, validation]);

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

      {/* Grid */}
      <div className="flex-1 overflow-hidden relative">
        {/* Column headers (frozen top) */}
        <div className="absolute top-0 left-0 right-0 z-20" style={{ height: HEADER_HEIGHT }}>
          {/* Top-left corner */}
          <div
            className="absolute top-0 left-0 bg-muted/50 border-b border-r z-30 flex items-end"
            style={{ width: LEFT_PANEL_WIDTH + E_COL_WIDTH, height: HEADER_HEIGHT }}
          >
            <div className="flex" style={{ height: ROW_HEIGHT }}>
              <div className="flex items-center px-2 text-xs font-medium" style={{ width: LEFT_PANEL_WIDTH }}>
                CF 항목
              </div>
              <div className="flex items-center justify-end px-2 text-xs font-medium border-l" style={{ width: E_COL_WIDTH }}>
                CF금액
              </div>
            </div>
          </div>

          {/* Account headers (scrollable) */}
          <div
            className="absolute top-0 border-b bg-muted/50 overflow-hidden"
            style={{ left: LEFT_PANEL_WIDTH + E_COL_WIDTH, right: 0, height: HEADER_HEIGHT }}
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
                return (
                  <div
                    key={account.id}
                    className="absolute top-0 border-r flex flex-col justify-end"
                    style={{ left: idx * CELL_WIDTH, width: CELL_WIDTH, height: HEADER_HEIGHT }}
                  >
                    <div className="px-1 text-[10px] text-muted-foreground truncate">{account.code}</div>
                    <div className="px-1 text-[10px] font-medium truncate" title={account.name}>{account.name}</div>
                    <div className="px-1 text-[10px] text-right font-mono">{formatNumber(account.change)}</div>
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
              width: LEFT_PANEL_WIDTH + E_COL_WIDTH + colVirtualizer.getTotalSize(),
              height: rowVirtualizer.getTotalSize(),
              position: 'relative',
            }}
          >
            {rowVirtualizer.getVirtualItems().map(virtualRow => {
              const item = visibleItems[virtualRow.index];
              const eAmount = getItemAmount(item);

              return (
                <div
                  key={item.id}
                  className="absolute left-0 flex"
                  style={{
                    top: virtualRow.start,
                    height: ROW_HEIGHT,
                    width: LEFT_PANEL_WIDTH + E_COL_WIDTH + colVirtualizer.getTotalSize(),
                  }}
                >
                  {/* Frozen left: CF item label */}
                  <div
                    className={cn(
                      'shrink-0 flex items-center border-r border-b bg-white z-10 sticky left-0',
                      item.isSubtotal && 'font-bold bg-blue-50/80',
                      item.level === 0 && 'bg-blue-100/50',
                    )}
                    style={{ width: LEFT_PANEL_WIDTH }}
                  >
                    <div
                      className="px-2 text-xs truncate cursor-default w-full"
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
                      {item.label}
                    </div>
                  </div>

                  {/* E column (CF amount) */}
                  <div
                    className={cn(
                      'shrink-0 flex items-center justify-end px-1 border-r border-b text-xs font-mono bg-white z-10 sticky',
                      item.isSubtotal && 'font-bold bg-blue-50/80',
                      eAmount < 0 && 'text-red-600',
                    )}
                    style={{ width: E_COL_WIDTH, left: LEFT_PANEL_WIDTH }}
                  >
                    {eAmount !== 0 ? formatNumber(eAmount) : ''}
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
                          left: LEFT_PANEL_WIDTH + E_COL_WIDTH + virtualCol.start,
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
