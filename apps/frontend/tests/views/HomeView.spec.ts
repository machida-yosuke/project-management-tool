import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import HomeView from '../../src/views/HomeView.vue';
import { useProjectsStore } from '../../src/stores/projects';
import { bob, json, makeInvitation, makeProject, stubApi } from '../helpers/api-mock';
import { mountAt } from '../helpers/mount';

describe('HomeView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('lists projects and invitations addressed to the user', async () => {
    stubApi({
      'GET /api/projects': json([makeProject()]),
      'GET /api/invitations': json([makeInvitation()]),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);

    expect(wrapper.get('[data-testid="projects"] a').attributes('href')).toBe('/projects/p1');
    const invitation = wrapper.get('[data-testid="invitation"]');
    expect(invitation.text()).toContain('Invited Project');
    expect(invitation.text()).toContain('スタッフ');
    expect(invitation.text()).toContain('Alice');
  });

  it('creates a project from the form', async () => {
    const created = makeProject({ id: 'p9', name: 'New project' });
    const fetchMock = stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([]),
      'POST /api/projects': () => json(created, 201),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);
    await wrapper.get('input[aria-label="プロジェクト名"]').setValue('  New project ');
    await wrapper.get('[data-testid="create-project"]').trigger('submit');
    await flushPromises();

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(postCall?.[1]?.body as string)).toEqual({
      name: 'New project',
      description: '',
    });
    expect(wrapper.get('[data-testid="projects"]').text()).toContain('New project');
  });

  it('accepts an invitation, adds the project and navigates to it', async () => {
    const joined = makeProject({ id: 'p2', name: 'Invited Project', role: 'staff' });
    const fetchMock = stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([makeInvitation()]),
      'POST /api/invitations/inv1/accept': () => json(joined),
      'GET /api/projects/p2': json(joined),
      'GET /api/projects/p2/tasks': json([]),
      'GET /api/projects/p2/members': json([]),
    });

    const { wrapper, router, pinia } = await mountAt(HomeView, '/', bob);
    await wrapper.get('input[aria-label="暗証番号"]').setValue('4321');
    await wrapper.get('[data-testid="invitation"] form').trigger('submit');
    await flushPromises();

    const acceptCall = fetchMock.mock.calls.find(([url]) => url.endsWith('/accept'));
    expect(JSON.parse(acceptCall?.[1]?.body as string)).toEqual({ passcode: '4321' });
    expect(router.currentRoute.value.fullPath).toBe('/projects/p2');
    expect(useProjectsStore(pinia).projects).toEqual([joined]);
    expect(wrapper.find('[data-testid="invitation"]').exists()).toBe(false);
  });

  it.each([
    ['invalid_passcode', 400, '暗証番号が違います'],
    ['locked', 423, '入力回数が上限に達しました'],
    ['expired', 410, '有効期限が切れています'],
  ])('shows a specific message for %s', async (code, status, message) => {
    stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([makeInvitation()]),
      'POST /api/invitations/inv1/accept': json({ error: code }, status),
    });

    const { wrapper, router } = await mountAt(HomeView, '/', bob);
    await wrapper.get('input[aria-label="暗証番号"]').setValue('0000');
    await wrapper.get('[data-testid="invitation"] form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[data-testid="invitation"] [role="alert"]').text()).toContain(message);
    expect(router.currentRoute.value.fullPath).toBe('/');
  });
});
