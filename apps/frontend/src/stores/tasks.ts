import { defineStore } from 'pinia';
import type { Task, TaskComment, TaskStatus } from '@pm-tool/shared';
import { apiFetch } from '../lib/api';

export interface CreateTaskInput {
  title: string;
  description?: string;
  assigneeId?: string;
}

export interface UpdateTaskInput {
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string | null;
}

interface TasksState {
  projectId: string | null;
  tasks: Task[];
  selectedTaskId: string | null;
  comments: TaskComment[];
}

function tasksPath(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}/tasks`;
}

function taskPath(projectId: string, taskId: string) {
  return `${tasksPath(projectId)}/${encodeURIComponent(taskId)}`;
}

export const useTasksStore = defineStore('tasks', {
  state: (): TasksState => ({
    projectId: null,
    tasks: [],
    selectedTaskId: null,
    comments: [],
  }),
  getters: {
    selectedTask: (state): Task | null =>
      state.tasks.find((t) => t.id === state.selectedTaskId) ?? null,
  },
  actions: {
    async fetchTasks(projectId: string) {
      if (this.projectId !== projectId) {
        this.projectId = projectId;
        this.tasks = [];
        this.selectedTaskId = null;
        this.comments = [];
      }
      const tasks = await apiFetch<Task[]>(tasksPath(projectId));
      if (this.projectId === projectId) {
        this.tasks = tasks;
      }
    },
    async createTask(projectId: string, input: CreateTaskInput) {
      const task = await apiFetch<Task>(tasksPath(projectId), { method: 'POST', body: input });
      this.tasks.push(task);
      return task;
    },
    async updateTask(projectId: string, taskId: string, input: UpdateTaskInput) {
      const task = await apiFetch<Task>(taskPath(projectId, taskId), {
        method: 'PATCH',
        body: input,
      });
      const index = this.tasks.findIndex((t) => t.id === task.id);
      if (index !== -1) {
        this.tasks.splice(index, 1, task);
      }
      return task;
    },
    async deleteTask(projectId: string, taskId: string) {
      await apiFetch<void>(taskPath(projectId, taskId), { method: 'DELETE' });
      this.tasks = this.tasks.filter((t) => t.id !== taskId);
      if (this.selectedTaskId === taskId) {
        this.selectedTaskId = null;
        this.comments = [];
      }
    },
    async selectTask(projectId: string, taskId: string) {
      this.selectedTaskId = taskId;
      this.comments = [];
      const comments = await apiFetch<TaskComment[]>(`${taskPath(projectId, taskId)}/comments`);
      // A slower response for a previously selected task must not overwrite the current thread.
      if (this.selectedTaskId === taskId) {
        this.comments = comments;
      }
    },
    async postComment(projectId: string, taskId: string, body: string) {
      const comment = await apiFetch<TaskComment>(`${taskPath(projectId, taskId)}/comments`, {
        method: 'POST',
        body: { body },
      });
      if (this.selectedTaskId === taskId) {
        this.comments.push(comment);
      }
      return comment;
    },
  },
});
