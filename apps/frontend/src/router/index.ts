import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import ManualPageView from '../views/ManualPageView.vue';
import ProjectCalendarView from '../views/ProjectCalendarView.vue';
import ProjectHomeView from '../views/ProjectHomeView.vue';
import ProjectLabelsView from '../views/ProjectLabelsView.vue';
import ProjectManualsView from '../views/ProjectManualsView.vue';
import ProjectMembersView from '../views/ProjectMembersView.vue';
import ProjectView from '../views/ProjectView.vue';
import SettingsView from '../views/SettingsView.vue';
import TaskDetailView from '../views/TaskDetailView.vue';
import { requireAuthGuard } from './guards';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
    {
      path: '/projects/:projectId',
      name: 'project',
      component: ProjectHomeView,
      meta: { requiresAuth: true },
    },
    {
      path: '/projects/:projectId/tasks',
      name: 'project-tasks',
      component: ProjectView,
      meta: { requiresAuth: true },
    },
    {
      path: '/projects/:projectId/tasks/:taskId',
      name: 'task',
      component: TaskDetailView,
      meta: { requiresAuth: true },
    },
    {
      path: '/projects/:projectId/labels',
      name: 'project-labels',
      component: ProjectLabelsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/projects/:projectId/members',
      name: 'project-members',
      component: ProjectMembersView,
      meta: { requiresAuth: true },
    },
    {
      path: '/projects/:projectId/calendar',
      name: 'project-calendar',
      component: ProjectCalendarView,
      meta: { requiresAuth: true },
    },
    {
      path: '/projects/:projectId/manuals',
      name: 'project-manuals',
      component: ProjectManualsView,
      meta: { requiresAuth: true },
    },
    {
      path: '/projects/:projectId/manuals/:manualId',
      name: 'manual',
      component: ManualPageView,
      meta: { requiresAuth: true },
    },
    { path: '/settings', name: 'settings', component: SettingsView, meta: { requiresAuth: true } },
  ],
});

router.beforeEach(requireAuthGuard);
