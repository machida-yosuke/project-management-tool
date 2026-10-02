import { enableAutoUnmount, flushPromises } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plainTextToRichTextDoc, type Project, type ProjectInvitation } from '@pm-tool/shared';
import { projectDescriptionTemplate } from '../../src/lib/rich-text-templates';
import HomeView from '../../src/views/HomeView.vue';
import { bob, json, makeInvitation, makeProject, stubApi } from '../helpers/api-mock';
import { currentDialog, openDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';
import { editorFor, replaceContent, typeInto } from '../helpers/rich-text';

async function clickOutside() {
  document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise((resolve) => setTimeout(resolve, 0));
  await flushPromises();
}

describe('HomeView', () => {
  enableAutoUnmount(afterEach);

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

  it('shows the description excerpt and role on each project card', async () => {
    stubApi({
      'GET /api/projects': json([
        makeProject({ description: plainTextToRichTextDoc('first line\nsecond line') }),
        makeProject({ id: 'p2', name: 'Bare', role: 'staff' }),
      ]),
      'GET /api/invitations': json([]),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);

    const cards = wrapper.findAll('[data-testid="projects"] a');
    expect(cards.map((card) => card.attributes('href'))).toEqual(['/projects/p1', '/projects/p2']);
    expect(cards[0]?.text()).toContain('first line');
    expect(cards[1]?.text()).toContain('説明はありません');
    expect(cards[1]?.text()).toContain('スタッフ');
  });

  it('shows an empty state when the user has no projects', async () => {
    stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([]),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);

    expect(wrapper.find('[data-testid="projects"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('参加しているプロジェクトはありません');
    expect(wrapper.find('[data-testid="invitations"]').exists()).toBe(false);
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
    expect(wrapper.find('[data-testid="create-project"]').exists()).toBe(false);
    const dialog = await openDialog(wrapper, 'プロジェクトを作成');
    expect(dialog.get('h2').text()).toBe('プロジェクトを作成');
    await dialog.get('input[aria-label="プロジェクト名"]').setValue('  New project ');
    await dialog.get('[data-testid="create-project"]').trigger('submit');
    await flushPromises();

    const post = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'POST');
    expect(post?.body).toEqual({ name: 'New project', description: projectDescriptionTemplate() });
    expect(currentDialog()).toBeNull();
    expect(wrapper.get('[data-testid="projects"]').text()).toContain('New project');
    const reopened = await openDialog(wrapper, 'プロジェクトを作成');
    expect(inputValue(reopened.get('input[aria-label="プロジェクト名"]'))).toBe('');
  });

  it('sends the rich text description and clears the form and draft', async () => {
    const requests = stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([]),
      'POST /api/projects': json(makeProject({ id: 'p9' }), 201),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);
    const form = (await openDialog(wrapper, 'プロジェクトを作成')).get(
      '[data-testid="create-project"]',
    );
    expect(form.find('button[aria-label="画像を挿入"]').exists()).toBe(false);
    await form.get('input[aria-label="プロジェクト名"]').setValue('New project');
    await replaceContent(form, 'プロジェクトの説明', 'line 1');
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
    expect(currentDialog()).toBeNull();
    expect(localStorage.getItem('draft:project:new')).toBeNull();
    const reopened = await openDialog(wrapper, 'プロジェクトを作成');
    expect(inputValue(reopened.get('input[aria-label="プロジェクト名"]'))).toBe('');
    expect(editorFor(reopened, 'プロジェクトの説明').getJSON()).toEqual(
      projectDescriptionTemplate(),
    );
  });

  it.each([
    ['validation_error', 400, 'プロジェクト名は1〜200文字で入力してください'],
    ['internal_error', 500, 'プロジェクトの作成に失敗しました'],
  ])('shows an error in the dialog when creation fails with %s', async (code, status, message) => {
    stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([]),
      'POST /api/projects': json({ error: code }, status),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob);
    const form = (await openDialog(wrapper, 'プロジェクトを作成')).get(
      '[data-testid="create-project"]',
    );
    await form.get('input[aria-label="プロジェクト名"]').setValue('New project');
    await replaceContent(form, 'プロジェクトの説明', 'keep me');
    await form.trigger('submit');
    await flushPromises();

    expect(currentDialog()).not.toBeNull();
    expect(form.get('[role="alert"]').text()).toBe(message);
    expect(inputValue(form.get('input[aria-label="プロジェクト名"]'))).toBe('New project');
    expect(editorFor(form, 'プロジェクトの説明').getText()).toBe('keep me');
  });

  it('closes on an outside click only while not submitting', async () => {
    let respond: (res: Response) => void = () => {
      throw new Error('POST was not sent');
    };
    stubApi({
      'GET /api/projects': json([]),
      'GET /api/invitations': json([]),
      'POST /api/projects': () => new Promise<Response>((resolve) => (respond = resolve)),
    });

    const { wrapper } = await mountAt(HomeView, '/', bob, { attachTo: document.body });
    const dialog = await openDialog(wrapper, 'プロジェクトを作成');
    await dialog.get('input[aria-label="プロジェクト名"]').setValue('New project');
    await dialog.get('[data-testid="create-project"]').trigger('submit');
    await flushPromises();
    await clickOutside();
    expect(currentDialog()).not.toBeNull();

    respond(json({ error: 'internal_error' }, 500));
    await flushPromises();
    await clickOutside();
    expect(currentDialog()).toBeNull();
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
