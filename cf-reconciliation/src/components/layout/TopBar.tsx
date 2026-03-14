'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Stepper } from './Stepper';
import { StepId } from '@/types';
import { HomeIcon, SaveIcon } from 'lucide-react';

interface TopBarProps {
  projectName?: string;
  currentStep: StepId;
  onStepClick: (step: StepId) => void;
  onSave: () => void;
  onHome: () => void;
  hasProject: boolean;
}

export function TopBar({ projectName, currentStep, onStepClick, onSave, onHome, hasProject }: TopBarProps) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        onSave();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onSave]);

  return (
    <header className="flex h-14 items-center justify-between border-b border-blue-100 bg-white px-5 shrink-0 shadow-sm">
      <div className="flex items-center gap-3">
        <button onClick={onHome} className="text-base font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent hover:from-blue-700 hover:to-indigo-700 transition-all">
          CF정산표
        </button>
        {projectName && (
          <>
            <span className="text-blue-300">/</span>
            <span className="text-sm font-medium text-foreground/80">{projectName}</span>
          </>
        )}
      </div>
      {hasProject && (
        <Stepper currentStep={currentStep} onStepClick={onStepClick} />
      )}
      <div className="flex items-center gap-2">
        {hasProject && (
          <Button variant="outline" size="sm" onClick={onSave} className="border-blue-200 hover:bg-blue-50 hover:border-blue-300">
            <SaveIcon className="h-3.5 w-3.5 mr-1" />
            저장
          </Button>
        )}
        <Button variant="ghost" size="icon-sm" onClick={onHome} className="hover:bg-blue-50">
          <HomeIcon className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
