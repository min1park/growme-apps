import { create } from 'zustand';
import { ProjectMeta, StepId } from '@/types';
import { v4 as uuidv4 } from 'uuid';

interface ProjectStoreState {
  projects: ProjectMeta[];
  currentProject: ProjectMeta | null;

  loadProjects: () => void;
  createProject: (name: string, company: string, periodStart: string, periodEnd: string) => ProjectMeta;
  setCurrentProject: (project: ProjectMeta | null) => void;
  updateStep: (step: StepId) => void;
  deleteProject: (id: string) => void;
  saveToStorage: () => void;
  loadFromStorage: () => void;
}

export const useProjectStore = create<ProjectStoreState>((set, get) => ({
  projects: [],
  currentProject: null,

  loadProjects: () => {
    try {
      const data = localStorage.getItem('cf-projects');
      if (data) {
        set({ projects: JSON.parse(data) });
      }
    } catch { /* ignore */ }
  },

  createProject: (name, company, periodStart, periodEnd) => {
    const project: ProjectMeta = {
      id: uuidv4(),
      name,
      company,
      periodStart,
      periodEnd,
      templateId: 'kifrs-standard',
      currentStep: 'upload',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const state = get();
    const projects = [...state.projects, project];
    set({ projects, currentProject: project });
    localStorage.setItem('cf-projects', JSON.stringify(projects));
    return project;
  },

  setCurrentProject: (project) => set({ currentProject: project }),

  updateStep: (step) => {
    const state = get();
    if (!state.currentProject) return;
    const updated = { ...state.currentProject, currentStep: step, updatedAt: new Date().toISOString() };
    const projects = state.projects.map(p => p.id === updated.id ? updated : p);
    set({ currentProject: updated, projects });
    localStorage.setItem('cf-projects', JSON.stringify(projects));
  },

  deleteProject: (id) => {
    const state = get();
    const projects = state.projects.filter(p => p.id !== id);
    set({ projects, currentProject: state.currentProject?.id === id ? null : state.currentProject });
    localStorage.setItem('cf-projects', JSON.stringify(projects));
    localStorage.removeItem(`cf-grid-${id}`);
  },

  saveToStorage: () => {
    const state = get();
    if (state.currentProject) {
      const projects = state.projects.map(p =>
        p.id === state.currentProject!.id
          ? { ...state.currentProject!, updatedAt: new Date().toISOString() }
          : p
      );
      set({ projects });
      localStorage.setItem('cf-projects', JSON.stringify(projects));
    }
  },

  loadFromStorage: () => {
    get().loadProjects();
  },
}));
