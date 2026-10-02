import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { PiniaColada } from '@pinia/colada';
import { createMemoryHistory, createRouter } from 'vue-router';
import ProjectHeader from '../../../src/components/layout/ProjectHeader.vue';
import { makeProject } from '../../helpers/api-mock';

const Stub = { template: '<div />' };

async function mountAt(path: string) {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects/:projectId', name: 'project', component: Stub },
      { path: '/projects/:projectId/tasks', name: 'project-tasks', component: Stub },
      { path: '/projects/:projectId/tasks/:taskId', name: 'task', component: Stub },
      { path: '/projects/:projectId/calendar', name: 'project-calendar', component: Stub },
      { path: '/projects/:projectId/labels', name: 'project-labels', component: Stub },
      { path: '/projects/:projectId/members', name: 'project-members', component: Stub },
    ],
  });
  await router.push(path);
  await router.isReady();
  return mount(ProjectHeader, {
    props: { project: makeProject() },
    global: { plugins: [createPinia(), PiniaColada, router] },
  });
}

describe('ProjectHeader', () => {
  it('renders a tab for each project page', async () => {
    const wrapper = await mountAt('/projects/p1');

    expect(wrapper.findAll('nav a').map((a) => [a.text(), a.attributes('href')] as const)).toEqual([
      ['ホーム', '/projects/p1'],
      ['タスク', '/projects/p1/tasks'],
      ['カレンダー', '/projects/p1/calendar'],
      ['ラベル', '/projects/p1/labels'],
      ['メンバー', '/projects/p1/members'],
    ]);
  });

  it.each([
    ['/projects/p1', 'ホーム'],
    ['/projects/p1/tasks', 'タスク'],
    ['/projects/p1/tasks/t1', 'タスク'],
    ['/projects/p1/calendar', 'カレンダー'],
    ['/projects/p1/labels', 'ラベル'],
    ['/projects/p1/members', 'メンバー'],
  ])('marks only the tab for %s as current', async (path, label) => {
    const wrapper = await mountAt(path);

    expect(wrapper.findAll('nav a[aria-current="page"]').map((a) => a.text())).toEqual([label]);
    expect(wrapper.get('nav a[aria-current="page"]').classes()).toContain('bg-background');
  });

  it.each([
    '/projects/p1',
    '/projects/p1/tasks',
    '/projects/p1/tasks/t1',
    '/projects/p1/calendar',
    '/projects/p1/labels',
    '/projects/p1/members',
  ])('renders only the tabs on %s', async (path) => {
    const wrapper = await mountAt(path);

    expect(wrapper.find('h1').exists()).toBe(false);
    expect(wrapper.find('button[aria-label="プロジェクトを編集"]').exists()).toBe(false);
    expect(wrapper.findAll('nav a')).toHaveLength(5);
  });
});
