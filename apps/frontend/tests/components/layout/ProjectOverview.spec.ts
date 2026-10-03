import {
  type DOMWrapper,
  enableAutoUnmount,
  flushPromises,
  mount,
  type VueWrapper,
} from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPinia, setActivePinia } from 'pinia';
import { PiniaColada, useQueryCache } from '@pinia/colada';
import { createMemoryHistory, createRouter } from 'vue-router';
import {
  plainTextToRichTextDoc,
  type Project,
  type ProjectMember,
  type Task,
} from '@pm-tool/shared';
import ProjectOverview from '../../../src/components/layout/ProjectOverview.vue';
import { PROJECT_DONE_HELP } from '../../../src/lib/help-texts';
import { getGetProjectQueryKey, getListProjectsQueryKey } from '../../../src/api/generated';
import { json, makeMember, makeProject, makeTask, stubApi } from '../../helpers/api-mock';
import { currentDialog } from '../../helpers/dialog';
import { inputValue } from '../../helpers/mount';

const EDIT_PROJECT = 'button[aria-label="プロジェクトを編集"]';

// Reka UI teleports the dialog to <body>, so it is looked up outside the mounted wrapper.
function openAlertDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
  if (!dialog) throw new Error('Alert dialog is not open');
  return dialog;
}

function dialogButton(dialog: HTMLElement, label: string): HTMLElement {
  const button = Array.from(dialog.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Dialog button not found: ${label}`);
  return button;
}

const TOGGLE_ARCHIVED = '[data-testid="toggle-archived"]';
const ARCHIVED_AT = '2026-09-20T00:00:00.000Z';

// The archive controls live in the edit dialog, which Reka UI teleports to <body>.
async function openEditDialog(wrapper: VueWrapper): Promise<DOMWrapper<HTMLElement>> {
  await wrapper.get(EDIT_PROJECT).trigger('click');
  await flushPromises();
  const dialog = currentDialog();
  if (!dialog) throw new Error('Edit dialog is not open');
  return dialog;
}

async function clickArchiveToggle(wrapper: VueWrapper): Promise<DOMWrapper<HTMLElement>> {
  const dialog = await openEditDialog(wrapper);
  await dialog.get(TOGGLE_ARCHIVED).trigger('click');
  await flushPromises();
  return dialog;
}

const RouteStub = { template: '<div />' };

function mountWith(project: Project, extra: { members?: ProjectMember[]; tasks?: Task[] } = {}) {
  const pinia = createPinia();
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/projects/:projectId/tasks', name: 'project-tasks', component: RouteStub },
      { path: '/projects/:projectId/members', name: 'project-members', component: RouteStub },
    ],
  });
  const wrapper = mount(ProjectOverview, {
    props: { project, ...extra },
    global: { plugins: [pinia, PiniaColada, router] },
  });
  setActivePinia(pinia);
  return { wrapper, cache: useQueryCache() };
}

describe('ProjectOverview', () => {
  enableAutoUnmount(afterEach);

  it('renders the project name and description', () => {
    const { wrapper } = mountWith(makeProject({ description: plainTextToRichTextDoc('Summary') }));

    expect(wrapper.get('h1').text()).toBe('Project One');
    expect(wrapper.get('[data-testid="project-description"]').text()).toBe('Summary');
  });

  it('shows a placeholder for an empty description to editors only', () => {
    for (const role of ['admin', 'staff'] as const) {
      const { wrapper } = mountWith(makeProject({ role }));
      expect(wrapper.find('[data-testid="project-description"]').exists()).toBe(false);
      expect(wrapper.get('[data-testid="project-description-empty"]').text()).toBe(
        '説明はありません',
      );
    }

    const { wrapper } = mountWith(makeProject({ role: 'substaff' }));
    expect(wrapper.find('[data-testid="project-description"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="project-description-empty"]').exists()).toBe(false);
  });

  it('labels the edit button with text', () => {
    const { wrapper } = mountWith(makeProject());

    expect(wrapper.get(EDIT_PROJECT).text()).toBe('編集');
  });

  it('shows the member count and avatars linking to the members tab', () => {
    const members = ['a', 'b', 'c'].map((id) =>
      makeMember({ id, email: `${id}@example.com`, name: id.toUpperCase(), avatarUrl: null }),
    );
    const { wrapper } = mountWith(makeProject(), { members });

    const link = wrapper.get('[data-testid="project-members-link"]');
    expect(link.attributes('href')).toBe('/projects/p1/members');
    expect(link.get('[data-testid="project-member-count"]').text()).toBe('メンバー 3 人');
    expect(link.findAll('[data-testid="project-member-avatar"]')).toHaveLength(3);
    expect(link.find('[data-testid="project-member-more"]').exists()).toBe(false);
  });

  it('stacks at most five avatars and shows the rest as a count', () => {
    const members = Array.from({ length: 7 }, (_, i) =>
      makeMember({ id: `u${i}`, email: `u${i}@example.com`, name: `User ${i}`, avatarUrl: null }),
    );
    const { wrapper } = mountWith(makeProject(), { members });

    const link = wrapper.get('[data-testid="project-members-link"]');
    expect(link.findAll('[data-testid="project-member-avatar"]')).toHaveLength(5);
    expect(link.get('[data-testid="project-member-more"]').text()).toBe('+2');
    expect(link.get('[data-testid="project-member-count"]').text()).toBe('メンバー 7 人');
  });

  it('counts open and done tasks excluding archived ones, linking to the tasks tab', () => {
    const tasks = [
      makeTask({ id: 't1', status: 'open' }),
      makeTask({ id: 't2', status: 'open' }),
      makeTask({ id: 't3', status: 'done' }),
      makeTask({ id: 't4', status: 'open', archivedAt: ARCHIVED_AT }),
      makeTask({ id: 't5', status: 'done', archivedAt: ARCHIVED_AT }),
    ];
    const { wrapper } = mountWith(makeProject(), { tasks });

    const open = wrapper.get('[data-testid="project-open-tasks"]');
    const done = wrapper.get('[data-testid="project-done-tasks"]');
    expect(open.text()).toBe('未完了 2');
    expect(done.text()).toBe('完了 1');
    expect(open.attributes('href')).toBe('/projects/p1/tasks');
    expect(done.attributes('href')).toBe('/projects/p1/tasks');
  });

  it('shows only the creation time when members and tasks are not given', () => {
    const { wrapper } = mountWith(makeProject());

    expect(wrapper.get('[data-testid="project-created-at"] time').attributes('datetime')).toBe(
      '2026-09-01T00:00:00.000Z',
    );
    expect(wrapper.find('[data-testid="project-members-link"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="project-open-tasks"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="project-done-tasks"]').exists()).toBe(false);
  });

  it('hides the edit button for substaff', () => {
    const { wrapper } = mountWith(makeProject({ role: 'substaff' }));

    expect(wrapper.find(EDIT_PROJECT).exists()).toBe(false);
  });

  it('opens the edit dialog prefilled with the project name', async () => {
    const { wrapper } = mountWith(makeProject());

    await wrapper.get(EDIT_PROJECT).trigger('click');
    await flushPromises();

    const dialog = currentDialog();
    expect(dialog?.text()).toContain('プロジェクトを編集');
    expect(inputValue(dialog?.get('input[aria-label="プロジェクトの名前"]'))).toBe('Project One');
  });

  it('shows the archive toggle in the edit dialog only to admins', async () => {
    const { wrapper } = mountWith(makeProject());
    expect(wrapper.find(TOGGLE_ARCHIVED).exists()).toBe(false);
    const dialog = await openEditDialog(wrapper);
    expect(dialog.get(TOGGLE_ARCHIVED).text()).toBe('完了にする');
    expect(document.body.textContent).not.toContain(PROJECT_DONE_HELP);
    await dialog.get(TOGGLE_ARCHIVED).trigger('focus');
    await flushPromises();
    expect(document.body.textContent).toContain(PROJECT_DONE_HELP);
    wrapper.unmount();

    const archived = mountWith(makeProject({ archivedAt: ARCHIVED_AT }));
    expect((await openEditDialog(archived.wrapper)).get(TOGGLE_ARCHIVED).text()).toBe(
      '進行中に戻す',
    );
    archived.wrapper.unmount();

    const staff = mountWith(makeProject({ role: 'staff' }));
    expect((await openEditDialog(staff.wrapper)).find(TOGGLE_ARCHIVED).exists()).toBe(false);
  });

  it('asks for confirmation before archiving and archives on confirm', async () => {
    let respond: (res: Response) => void = () => {
      throw new Error('POST was not sent');
    };
    const requests = stubApi({
      'POST /api/projects/p1/archive': () =>
        new Promise<Response>((resolve) => (respond = resolve)),
    });
    const { wrapper, cache } = mountWith(makeProject());
    const invalidateQueries = vi.spyOn(cache, 'invalidateQueries');

    await clickArchiveToggle(wrapper);

    const dialog = openAlertDialog();
    expect(dialog.textContent).toContain('プロジェクトを完了にしますか？');
    expect(dialog.textContent).toContain('あとから進行中に戻せます。');
    expect(requests).not.toHaveBeenCalled();

    const confirm = dialogButton(dialog, '完了にする');
    confirm.click();
    await flushPromises();
    expect(requests.mock.calls.map(([req]) => `${req.method} ${req.path}`)).toEqual([
      'POST /api/projects/p1/archive',
    ]);
    expect(openAlertDialog()).toBe(dialog);
    expect(confirm.hasAttribute('disabled')).toBe(true);

    respond(json(makeProject({ archivedAt: ARCHIVED_AT })));
    await flushPromises();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(currentDialog()).toBeNull();
    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.key)).toEqual([
      getGetProjectQueryKey('p1'),
      getListProjectsQueryKey(),
    ]);
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('does not archive when the confirmation is cancelled', async () => {
    const requests = stubApi({});
    const { wrapper } = mountWith(makeProject());

    await clickArchiveToggle(wrapper);
    dialogButton(openAlertDialog(), 'キャンセル').click();
    await flushPromises();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(currentDialog()).not.toBeNull();
    expect(requests).not.toHaveBeenCalled();
  });

  it('unarchives without confirmation and invalidates the project queries', async () => {
    const requests = stubApi({
      'POST /api/projects/p1/unarchive': json(makeProject()),
    });
    const { wrapper, cache } = mountWith(makeProject({ archivedAt: ARCHIVED_AT }));
    const invalidateQueries = vi.spyOn(cache, 'invalidateQueries');

    await clickArchiveToggle(wrapper);

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(currentDialog()).toBeNull();
    expect(requests.mock.calls.map(([req]) => `${req.method} ${req.path}`)).toEqual([
      'POST /api/projects/p1/unarchive',
    ]);
    expect(invalidateQueries.mock.calls.map(([filters]) => filters?.key)).toEqual([
      getGetProjectQueryKey('p1'),
      getListProjectsQueryKey(),
    ]);
  });

  it('shows an error when archiving fails', async () => {
    stubApi({ 'POST /api/projects/p1/archive': json({ error: 'internal_error' }, 500) });
    const { wrapper } = mountWith(makeProject());

    const dialog = await clickArchiveToggle(wrapper);
    dialogButton(openAlertDialog(), '完了にする').click();
    await flushPromises();

    expect(dialog.get('[role="alert"]').text()).toBe('プロジェクトの状態の変更に失敗しました');
  });

  it('shows the archived badge next to the name for every role', () => {
    for (const role of ['admin', 'staff', 'substaff'] as const) {
      const { wrapper } = mountWith(makeProject({ role, archivedAt: ARCHIVED_AT }));
      expect(wrapper.get('[data-testid="project-archived"]').text()).toBe('完了');
    }
    expect(mountWith(makeProject()).wrapper.find('[data-testid="project-archived"]').exists()).toBe(
      false,
    );
  });
});
