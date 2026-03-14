'use client';

import React, { useEffect, useCallback } from 'react';
import { useProjectStore } from '@/stores/useProjectStore';
import { useGridStore } from '@/stores/useGridStore';
import { TopBar } from '@/components/layout/TopBar';
import { BottomBar } from '@/components/layout/BottomBar';
import { ProjectHome } from '@/components/project/ProjectHome';
import { TBUpload } from '@/components/upload/TBUpload';
import { CoAMappingView } from '@/components/mapping/CoAMapping';
import { CFGrid } from '@/components/grid/CFGrid';
import { Summary } from '@/components/summary/Summary';
import { StepId, Account } from '@/types';
import { autoMap } from '@/engines/mapping';
import { toast } from 'sonner';

const STEP_ORDER: StepId[] = ['upload', 'mapping', 'grid', 'summary'];
const STEP_LABELS: Record<StepId, string> = {
  upload: '업로드',
  mapping: '매핑',
  grid: '정산표',
  summary: '완료',
};

export function AppContainer() {
  const projectStore = useProjectStore();
  const gridStore = useGridStore();

  useEffect(() => {
    projectStore.loadProjects();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const currentStep = projectStore.currentProject?.currentStep ?? 'upload';
  const hasProject = !!projectStore.currentProject;

  const handleSave = useCallback(() => {
    if (!projectStore.currentProject) return;
    const data = gridStore.toJSON();
    localStorage.setItem(`cf-grid-${projectStore.currentProject.id}`, JSON.stringify(data));
    projectStore.saveToStorage();
    toast.success('저장되었습니다.');
  }, [projectStore, gridStore]);

  const handleHome = useCallback(() => {
    projectStore.setCurrentProject(null);
  }, [projectStore]);

  const handleStepClick = useCallback((step: StepId) => {
    projectStore.updateStep(step);
  }, [projectStore]);

  const handleCreateProject = useCallback((name: string, company: string, periodStart: string, periodEnd: string) => {
    projectStore.createProject(name, company, periodStart, periodEnd);
    gridStore.initCFItems();
  }, [projectStore, gridStore]);

  const handleSelectProject = useCallback((project: typeof projectStore.currentProject) => {
    if (!project) return;
    projectStore.setCurrentProject(project);
    // Load grid data
    try {
      const saved = localStorage.getItem(`cf-grid-${project.id}`);
      if (saved) {
        gridStore.fromJSON(JSON.parse(saved));
      } else {
        gridStore.initCFItems();
      }
    } catch {
      gridStore.initCFItems();
    }
  }, [projectStore, gridStore]);

  const handleImportJSON = useCallback((data: unknown) => {
    const d = data as Record<string, unknown>;
    const project = projectStore.createProject(
      (d.projectName as string) ?? 'Imported',
      (d.company as string) ?? '',
      (d.periodStart as string) ?? '',
      (d.periodEnd as string) ?? '',
    );
    gridStore.fromJSON(data);
    localStorage.setItem(`cf-grid-${project.id}`, JSON.stringify(data));
    toast.success('JSON 불러오기 완료');
  }, [projectStore, gridStore]);

  const handleUploadComplete = useCallback((accounts: Account[]) => {
    gridStore.setAccounts(accounts);
    const mappings = autoMap(accounts);
    gridStore.setMappings(mappings);
    projectStore.updateStep('mapping');
  }, [gridStore, projectStore]);

  const handleMappingComplete = useCallback(() => {
    gridStore.revalidate();
    projectStore.updateStep('grid');
  }, [gridStore, projectStore]);

  const currentIdx = STEP_ORDER.indexOf(currentStep);
  const canPrev = currentIdx > 0;
  const canNext = currentIdx < STEP_ORDER.length - 1;

  const handlePrev = () => {
    if (canPrev) projectStore.updateStep(STEP_ORDER[currentIdx - 1]);
  };
  const handleNext = () => {
    if (canNext) projectStore.updateStep(STEP_ORDER[currentIdx + 1]);
  };

  if (!hasProject) {
    return (
      <div className="flex flex-col h-screen bg-background">
        <TopBar
          projectName={undefined}
          currentStep="upload"
          onStepClick={handleStepClick}
          onSave={handleSave}
          onHome={handleHome}
          hasProject={false}
        />
        <ProjectHome
          projects={projectStore.projects}
          onCreateProject={handleCreateProject}
          onSelectProject={handleSelectProject}
          onDeleteProject={(id) => projectStore.deleteProject(id)}
          onImportJSON={handleImportJSON}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-background">
      <TopBar
        projectName={projectStore.currentProject?.name}
        currentStep={currentStep}
        onStepClick={handleStepClick}
        onSave={handleSave}
        onHome={handleHome}
        hasProject={true}
      />

      <main className="flex-1 overflow-hidden">
        {currentStep === 'upload' && (
          <TBUpload onComplete={handleUploadComplete} />
        )}
        {currentStep === 'mapping' && (
          <CoAMappingView
            accounts={gridStore.accounts}
            mappings={gridStore.mappings}
            onMappingsChange={(m) => gridStore.setMappings(m)}
            onComplete={handleMappingComplete}
          />
        )}
        {currentStep === 'grid' && <CFGrid />}
        {currentStep === 'summary' && <Summary />}
      </main>

      <BottomBar
        validation={gridStore.validation}
        canPrev={canPrev}
        canNext={canNext}
        onPrev={handlePrev}
        onNext={handleNext}
        prevLabel={canPrev ? STEP_LABELS[STEP_ORDER[currentIdx - 1]] : ''}
        nextLabel={canNext ? STEP_LABELS[STEP_ORDER[currentIdx + 1]] : ''}
      />
    </div>
  );
}
