'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

interface NewProjectModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (name: string, company: string, periodStart: string, periodEnd: string) => void;
}

export function NewProjectModal({ open, onOpenChange, onCreate }: NewProjectModalProps) {
  const [name, setName] = useState('');
  const [company, setCompany] = useState('');
  const [periodStart, setPeriodStart] = useState('2025-01-01');
  const [periodEnd, setPeriodEnd] = useState('2025-12-31');

  const handleCreate = () => {
    if (!name.trim()) return;
    onCreate(name.trim(), company.trim(), periodStart, periodEnd);
    setName('');
    setCompany('');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>새 프로젝트</DialogTitle>
        </DialogHeader>
        <div className="grid gap-3 py-2">
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">프로젝트명</label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="예: 2025년 CF정산표" />
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">회사명</label>
            <Input value={company} onChange={e => setCompany(e.target.value)} placeholder="예: 주식회사 그로우미" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">기초일</label>
              <Input type="date" value={periodStart} onChange={e => setPeriodStart(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1 block">기말일</label>
              <Input type="date" value={periodEnd} onChange={e => setPeriodEnd(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="text-xs font-medium text-muted-foreground mb-1 block">템플릿</label>
            <div className="rounded-lg border px-3 py-2 text-sm bg-muted/50">K-IFRS 표준</div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-blue-200">취소</Button>
          <Button onClick={handleCreate} disabled={!name.trim()} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700">생성</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
