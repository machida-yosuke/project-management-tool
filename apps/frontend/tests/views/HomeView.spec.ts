import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  emptyRichTextDoc,
  plainTextToRichTextDoc,
  type Project,
  type ProjectInvitation,
} from '@pm-tool/shared';
import HomeView from '../../src/views/HomeView.vue';
import { bob, json, makeInvitation, makeProject, stubApi } from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';
import { editorFor, typeInto } from '../helpers/rich-text';

describe('HomeView', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('shows an alert when loading fails', async () => {
    stubApi({
      'GET /api/projects': json({ error: 'internal_error' }, 500),
      'GET /api/invitations': json([]),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);

    expect(wrapper.get('[role="alert"]').text()).toBe('読み込みに失敗しました');
  });

  it('creates a project from the form', async () => {
    const created = makeProject({ id: 'p9', name: 'New project' });
    let projects: Project[] = [];
    const requests = stubApi({
      'GET /api/projects': () => json(projects),
      'GET /api/invitations': json([]),
      'POST /api/projects': () => {
        projects = [created];
        return json(created, 201);
      },
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);
    await wrapper.get('input[aria-label="プロジェクト名"]').setValue('  New project ');
    await wrapper.get('[data-testid="create-project"]').trigger('submit');
    await flushPromises();

    const post = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'POST');
    expect(post?.body).toEqual({ name: 'New project', description: emptyRichTextDoc() });
    expect(wrapper.get('[data-testid="projects"]').text()).toContain('New project');
    expect(inputValue(wrapper.get('input[aria-label="プロジェクト名"]'))).toBe('');
  });

  it('sends the rich text description and clears the form and draft', async () => {
    const requests = stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([]),
      'POST /api/projects': json(makeProject({ id: 'p9' }), 201),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);
    const form = wrapper.get('[data-testid="create-project"]');
    expect(form.find('button[aria-label="画像を挿入"]').exists()).toBe(false);
    await form.get('input[aria-label="プロジェクト名"]').setValue('New project');
    await typeInto(form, 'プロジェクトの説明', 'line 1');
    editorFor(form, 'プロジェクトの説明').commands.splitBlock();
    await typeInto(form, 'プロジェクトの説明', 'line 2');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(localStorage.getItem('draft:project:new')).not.toBeNull();

    await form.trigger('submit');
    await flushPromises();

    const posts = requests.mock.calls
      .map(([req]) => req)
      .filter((req) => req.method === 'POST' && req.path.startsWith('/api/projects'));
    expect(posts.map((req) => req.path)).toEqual(['/api/projects']);
    expect(posts[0]?.body).toEqual({
      name: 'New project',
      description: plainTextToRichTextDoc('line 1\nline 2'),
    });
    expect(inputValue(form.get('input[aria-label="プロジェクト名"]'))).toBe('');
    expect(editorFor(form, 'プロジェクトの説明').isEmpty).toBe(true);
    expect(localStorage.getItem('draft:project:new')).toBeNull();
  });

  it.each([
    ['validation_error', 400, 'プロジェクト名は1〜200文字で入力してください'],
    ['internal_error', 500, 'プロジェクトの作成に失敗しました'],
  ])('shows an error in the form when creation fails with %s', async (code, status, message) => {
    stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([]),
      'POST /api/projects': json({ error: code }, status),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);
    const form = wrapper.get('[data-testid="create-project"]');
    await form.get('input[aria-label="プロジェクト名"]').setValue('New project');
    await typeInto(form, 'プロジェクトの説明', 'keep me');
    await form.trigger('submit');
    await flushPromises();

    expect(form.get('[role="alert"]').text()).toBe(message);
    expect(inputValue(form.get('input[aria-label="プロジェクト名"]'))).toBe('New project');
    expect(editorFor(form, 'プロジェクトの説明').getText()).toBe('keep me');
  });

  it('accepts an invitation, adds the project and navigates to it', async () => {
    const joined = makeProject({ id: 'p2', name: 'Invited Project', role: 'staff' });
    let projects: Project[] = [];
    let invitations: ProjectInvitation[] = [makeInvitation()];
    const requests = stubApi({
      'GET /api/projects': () => json(projects),
      'GET /api/invitations': () => json(invitations),
      'POST /api/invitations/inv1/accept': () => {
        projects = [joined];
        invitations = [];
        return json(joined);
      },
    });

    const { wrapper, router } = await mountAt(HomeView, '/', bob);
    await wrapper.get('input[aria-label="暗証番号"]').setValue('4321');
    await wrapper.get('[data-testid="invitation"] form').trigger('submit');
    await flushPromises();

    const accept = requests.mock.calls
      .map(([req]) => req)
      .find((req) => req.path === '/api/invitations/inv1/accept');
    expect(accept?.body).toEqual({ passcode: '4321' });
    expect(router.currentRoute.value.fullPath).toBe('/projects/p2');
    expect(wrapper.get('[data-testid="projects"]').text()).toContain('Invited Project');
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
