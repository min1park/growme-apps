'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ValidationResult } from '@/types';
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react';

interface BottomBarProps {
  validation: ValidationResult;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
  nextLabel: string;
  prevLabel: string;
}

export function BottomBar({ validation, canPrev, canNext, onPrev, onNext, nextLabel, prevLabel }: BottomBarProps) {
  const colOk = validation.passedColumns === validation.totalColumns && validation.totalColumns > 0;
  const cashOk = Math.abs(validation.cashCheck) < 0.5;

  return (
    <footer className="flex h-11 items-center justify-between border-t border-blue-100 bg-white px-5 shrink-0">
      <div className="flex items-center gap-2 text-xs">
        {validation.totalColumns > 0 && (
          <>
            <Badge variant={colOk ? 'default' : 'destructive'} className={`text-[10px] px-2 py-0.5 ${colOk ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}`}>
              열 {validation.passedColumns}/{validation.totalColumns}
            </Badge>
            <Badge variant={cashOk ? 'default' : 'destructive'} className={`text-[10px] px-2 py-0.5 ${cashOk ? 'bg-emerald-100 text-emerald-700 border-emerald-200' : ''}`}>
              현금 {cashOk ? 'OK' : `${validation.cashCheck.toLocaleString()}`}
            </Badge>
          </>
        )}
      </div>
      <div className="flex items-center gap-2">
        {canPrev && (
          <Button variant="outline" size="sm" onClick={onPrev} className="border-blue-200 hover:bg-blue-50">
            <ChevronLeftIcon className="h-3.5 w-3.5 mr-1" />
            {prevLabel}
          </Button>
        )}
        {canNext && (
          <Button size="sm" onClick={onNext} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-sm">
            {nextLabel}
            <ChevronRightIcon className="h-3.5 w-3.5 ml-1" />
          </Button>
        )}
      </div>
    </footer>
  );
}
