'use client';

import React, { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectMeta } from '@/types';
import { NewProjectModal } from './NewProjectModal';
import { PlusIcon, UploadIcon, Trash2Icon, FolderOpenIcon } from 'lucide-react';

interface ProjectHomeProps {
  projects: ProjectMeta[];
  onCreateProject: (name: string, company: string, periodStart: string, periodEnd: string) => void;
  onSelectProject: (project: ProjectMeta) => void;
  onDeleteProject: (id: string) => void;
  onImportJSON: (data: unknown) => void;
}

export function ProjectHome({ projects, onCreateProject, onSelectProject, onDeleteProject, onImportJSON }: ProjectHomeProps) {
  const [showModal, setShowModal] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target?.result as string);
        onImportJSON(data);
      } catch {
        alert('JSON 파일을 읽을 수 없습니다.');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-56px)] p-8">
      <div className="w-full max-w-2xl">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">CF정산표 작성기</h1>
          <p className="text-sm text-muted-foreground">K-IFRS 현금흐름표 정산표를 작성합니다.</p>
        </div>

        <div className="flex gap-3 mb-8">
          <Button onClick={() => setShowModal(true)} className="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 shadow-md shadow-blue-200 h-9 px-4">
            <PlusIcon className="h-4 w-4 mr-1.5" />
            새 프로젝트
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} className="border-blue-200 hover:bg-blue-50 hover:border-blue-300 h-9 px-4">
            <UploadIcon className="h-4 w-4 mr-1.5" />
            JSON 불러오기
          </Button>
          <input ref={fileRef} type="file" accept=".json" onChange={handleImport} className="hidden" />
        </div>

        {projects.length > 0 && (
          <div className="space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">최근 프로젝트</h2>
            {projects.map(p => (
              <Card key={p.id} className="cursor-pointer hover:shadow-md hover:border-blue-200 transition-all duration-200 bg-white">
                <CardHeader className="p-4 pb-1.5">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-sm font-semibold text-blue-700" onClick={() => onSelectProject(p)}>{p.name}</CardTitle>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                      className="opacity-40 hover:opacity-100 hover:text-red-500"
                    >
                      <Trash2Icon className="h-3 w-3" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="p-4 pt-0" onClick={() => onSelectProject(p)}>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span className="bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full font-medium">{p.company || '회사 미지정'}</span>
                    <span>{p.periodStart} ~ {p.periodEnd}</span>
                    <span className="bg-muted px-2 py-0.5 rounded-full">{p.currentStep}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {projects.length === 0 && (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground rounded-2xl border-2 border-dashed border-blue-200 bg-blue-50/30">
            <FolderOpenIcon className="h-14 w-14 mb-4 text-blue-300" />
            <p className="text-sm font-medium text-blue-400">프로젝트가 없습니다. 새 프로젝트를 생성해주세요.</p>
          </div>
        )}
      </div>

      <NewProjectModal open={showModal} onOpenChange={setShowModal} onCreate={onCreateProject} />
    </div>
  );
}
