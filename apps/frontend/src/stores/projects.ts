import { defineStore } from 'pinia';
import type { Project } from '@pm-tool/shared';
import { apiFetch } from '../lib/api';

export interface CreateProjectInput {
  name: string;
  description?: string;
}

interface ProjectsState {
  projects: Project[];
  current: Project | null;
}

export const useProjectsStore = defineStore('projects', {
  state: (): ProjectsState => ({
    projects: [],
    current: null,
  }),
  actions: {
    async fetchProjects() {
      this.projects = await apiFetch<Project[]>('/api/projects');
    },
    async createProject(input: CreateProjectInput) {
      const project = await apiFetch<Project>('/api/projects', { method: 'POST', body: input });
      this.upsertProject(project);
      return project;
    },
    async fetchProject(projectId: string) {
      if (this.current?.id !== projectId) {
        this.current = null;
      }
      const project = await apiFetch<Project>(`/api/projects/${encodeURIComponent(projectId)}`);
      this.current = project;
      this.upsertProject(project);
      return project;
    },
    upsertProject(project: Project) {
      const index = this.projects.findIndex((p) => p.id === project.id);
      if (index === -1) {
        this.projects.push(project);
      } else {
        this.projects.splice(index, 1, project);
      }
    },
  },
});
