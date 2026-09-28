import { setup, type Preview } from '@storybook/vue3-vite';
import { createPinia } from 'pinia';
import { createMemoryHistory, createRouter } from 'vue-router';
import type { UserSummary } from '@pm-tool/shared';
import { useAuthStore } from '../src/stores/auth';
import '../src/style.css';

const RouteStub = { template: '<div />' };

// The app router pulls in every view and auth guards, so stories get a stub with the same route names.
const router = createRouter({
  history: createMemoryHistory(),
  routes: [
    { path: '/', name: 'home', component: RouteStub },
    { path: '/login', name: 'login', component: RouteStub },
    { path: '/settings', name: 'settings', component: RouteStub },
    { path: '/projects/:projectId', name: 'project', component: RouteStub },
    { path: '/projects/:projectId/tasks', name: 'project-tasks', component: RouteStub },
    { path: '/projects/:projectId/calendar', name: 'project-calendar', component: RouteStub },
    { path: '/projects/:projectId/members', name: 'project-members', component: RouteStub },
  ],
});
const pinia = createPinia();

setup((app) => {
  app.use(pinia);
  app.use(router);
});

const preview: Preview = {
  parameters: {
    controls: {
      matchers: {
        color: /(background|color)$/i,
        date: /Date$/i,
      },
    },
  },
  decorators: [
    // Stories opt in with `parameters: { route: '/projects/p1', authUser: {...} }`.
    (story, { parameters }) => {
      const route = typeof parameters.route === 'string' ? parameters.route : '/';
      void router.push(route);
      const authStore = useAuthStore(pinia);
      const user = parameters.authUser as UserSummary | undefined;
      authStore.user = user ?? null;
      authStore.status = user ? 'authenticated' : 'unauthenticated';
      return story();
    },
  ],
};

export default preview;
