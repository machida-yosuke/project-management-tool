import { createPinia, setActivePinia, type Pinia } from 'pinia';
import { flushPromises, mount } from '@vue/test-utils';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { Component } from 'vue';
import HomeView from '../../src/views/HomeView.vue';
import ProjectMembersView from '../../src/views/ProjectMembersView.vue';
import ProjectView from '../../src/views/ProjectView.vue';
import { useAuthStore } from '../../src/stores/auth';
import type { UserSummary } from '@pm-tool/shared';

export async function mountAt(component: Component, path: string, currentUser: UserSummary) {
  const pinia: Pinia = createPinia();
  setActivePinia(pinia);
  const authStore = useAuthStore(pinia);
  authStore.user = currentUser;
  authStore.status = 'authenticated';

  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: HomeView },
      { path: '/projects/:projectId', name: 'project', component: ProjectView },
      {
        path: '/projects/:projectId/members',
        name: 'project-members',
        component: ProjectMembersView,
      },
    ],
  });
  await router.push(path);
  await router.isReady();

  const wrapper = mount(component, { global: { plugins: [pinia, router] } });
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
