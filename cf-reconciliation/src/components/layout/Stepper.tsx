'use client';

import React from 'react';
import { StepId } from '@/types';
import { cn } from '@/lib/utils';
import { CheckIcon } from 'lucide-react';

const STEPS: { id: StepId; label: string; num: string }[] = [
  { id: 'upload', label: '업로드', num: '1' },
  { id: 'mapping', label: '매핑', num: '2' },
  { id: 'grid', label: '정산표', num: '3' },
  { id: 'summary', label: '완료', num: '4' },
];

const STEP_ORDER: StepId[] = ['upload', 'mapping', 'grid', 'summary'];

interface StepperProps {
  currentStep: StepId;
  onStepClick: (step: StepId) => void;
}

export function Stepper({ currentStep, onStepClick }: StepperProps) {
  const currentIdx = STEP_ORDER.indexOf(currentStep);

  return (
    <div className="flex items-center gap-1">
      {STEPS.map((step, idx) => {
        const isCompleted = idx < currentIdx;
        const isCurrent = step.id === currentStep;
        const isClickable = idx <= currentIdx;

        return (
          <React.Fragment key={step.id}>
            {idx > 0 && (
              <div
                className={cn(
                  'h-0.5 w-8 rounded-full transition-colors',
                  isCompleted ? 'bg-gradient-to-r from-emerald-400 to-emerald-500' : isCurrent ? 'bg-blue-200' : 'bg-border'
                )}
              />
            )}
            <button
              onClick={() => isClickable && onStepClick(step.id)}
              disabled={!isClickable}
              className={cn(
                'flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200',
                isCurrent && 'bg-blue-100 text-blue-700 shadow-sm shadow-blue-100',
                isCompleted && 'bg-emerald-50 text-emerald-700 cursor-pointer hover:bg-emerald-100',
                !isCurrent && !isCompleted && 'text-muted-foreground',
                isClickable && !isCurrent && !isCompleted && 'hover:bg-muted cursor-pointer',
                !isClickable && 'cursor-not-allowed opacity-40'
              )}
            >
              <span
                className={cn(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold transition-all',
                  isCurrent && 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-sm',
                  isCompleted && 'bg-gradient-to-br from-emerald-400 to-emerald-600 text-white shadow-sm',
                  !isCurrent && !isCompleted && 'bg-muted text-muted-foreground'
                )}
              >
                {isCompleted ? <CheckIcon className="h-3 w-3" /> : step.num}
              </span>
              {step.label}
            </button>
          </React.Fragment>
        );
      })}
    </div>
  );
}
