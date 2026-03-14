'use client';

import React, { useState, useRef, useEffect } from 'react';
import { formatNumber, parseNumberInput } from '@/lib/format';
import { cn } from '@/lib/utils';

interface GridCellProps {
  value: number;
  isSelected: boolean;
  isEditing: boolean;
  isEditable: boolean;
  isSubtotal: boolean;
  onSelect: () => void;
  onStartEdit: () => void;
  onCommit: (value: number | null) => void;
  onCancel: () => void;
  onNavigate: (dir: 'up' | 'down' | 'left' | 'right') => void;
}

export function GridCell({
  value,
  isSelected,
  isEditing,
  isEditable,
  isSubtotal,
  onSelect,
  onStartEdit,
  onCommit,
  onCancel,
  onNavigate,
}: GridCellProps) {
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  useEffect(() => {
    if (isEditing) {
      setEditValue(value !== 0 ? String(value) : '');
    }
  }, [isEditing, value]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (isEditing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        const parsed = parseNumberInput(editValue);
        onCommit(parsed);
        onNavigate('down');
      } else if (e.key === 'Tab') {
        e.preventDefault();
        const parsed = parseNumberInput(editValue);
        onCommit(parsed);
        onNavigate(e.shiftKey ? 'left' : 'right');
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
    } else if (isSelected) {
      if (e.key === 'Enter' || e.key === 'F2') {
        e.preventDefault();
        if (isEditable) onStartEdit();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (isEditable) onCommit(null);
      } else if (e.key === 'ArrowUp') { e.preventDefault(); onNavigate('up'); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); onNavigate('down'); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); onNavigate('left'); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); onNavigate('right'); }
      else if (e.key === 'Tab') { e.preventDefault(); onNavigate(e.shiftKey ? 'left' : 'right'); }
      else if (/^[-0-9]$/.test(e.key) && isEditable) {
        e.preventDefault();
        setEditValue(e.key);
        onStartEdit();
      }
    }
  };

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        className="w-full h-full px-1 text-right text-xs font-mono bg-white border-2 border-blue-500 outline-none"
        value={editValue}
        onChange={e => setEditValue(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={() => {
          const parsed = parseNumberInput(editValue);
          onCommit(parsed);
        }}
      />
    );
  }

  return (
    <div
      className={cn(
        'w-full h-full px-1 flex items-center justify-end text-xs font-mono cursor-default select-none',
        isSelected && 'ring-2 ring-blue-500 ring-inset bg-blue-50',
        isSubtotal && 'font-bold bg-blue-50/50',
        !isEditable && 'text-muted-foreground',
        value < 0 && 'text-red-600',
      )}
      onClick={onSelect}
      onDoubleClick={() => isEditable && onStartEdit()}
      onKeyDown={handleKeyDown}
      tabIndex={isSelected ? 0 : -1}
    >
      {value !== 0 ? formatNumber(value) : ''}
    </div>
  );
}
