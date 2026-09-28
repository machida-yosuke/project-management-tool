import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { PiniaColada } from '@pinia/colada';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Component } from 'vue';
import HomeView from '../../src/views/HomeView.vue';
import LoginView from '../../src/views/LoginView.vue';
import ProjectCalendarView from '../../src/views/ProjectCalendarView.vue';
import ProjectHomeView from '../../src/views/ProjectHomeView.vue';
import ProjectMembersView from '../../src/views/ProjectMembersView.vue';
import ProjectView from '../../src/views/ProjectView.vue';
import SettingsView from '../../src/views/SettingsView.vue';
import TaskDetailView from '../../src/views/TaskDetailView.vue';
import { useAuthStore } from '../../src/stores/auth';
import type { UserSummary } from '@pm-tool/shared';

export async function mountAt(
  component: Component,
  path: string,
  currentUser: UserSummary,
  options: { attachTo?: Element } = {},
) {
  const pinia: Pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  authStore.user = currentUser;
  authStore.status = 'authenticated';

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/login', name: 'login', component: LoginView },
      { path: '/settings', name: 'settings', component: SettingsView },
      { path: '/projects/:projectId', name: 'project', component: ProjectHomeView },
      { path: '/projects/:projectId/tasks', name: 'project-tasks', component: ProjectView },
      { path: '/projects/:projectId/tasks/:taskId', name: 'task', component: TaskDetailView },
      {
        path: '/projects/:projectId/members',
        name: 'project-members',
        component: ProjectMembersView,
      },
      {
        path: '/projects/:projectId/calendar',
        name: 'project-calendar',
        component: ProjectCalendarView,
      },
    ],
  });
  await router.push(path);
  await router.isReady();

  const wrapper = mount(component, {
    global: { plugins: [pinia, PiniaColada, router] },
    attachTo: options.attachTo,
  });
  await flushPromises();
  return { wrapper, router, pinia };
}

export function inputValue(wrapper: { element: unknown } | undefined): string {
  const element: unknown = wrapper?.element;
  if (typeof element === 'object' && element !== null && 'value' in element) {
    return String(element.value);
  }
  throw new Error('Element has no value');
}
