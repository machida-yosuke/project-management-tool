import { enableAutoUnmount, flushPromises, type DOMWrapper } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plainTextToRichTextDoc, type ProjectRole } from '@pm-tool/shared';
import type { ManualPage } from '../../src/api/generated/models';
import ManualPageView from '../../src/views/ManualPageView.vue';
import {
  alice,
  bob,
  json,
  makeManualPage,
  makeProject,
  noContent,
  stubApi,
} from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';
import { editorFor, replaceContent } from '../helpers/rich-text';

const PATH = '/projects/p1/manuals/m1';
const MANUAL = makeManualPage({ body: plainTextToRichTextDoc('Read the handbook') });

function baseRoutes(role: ProjectRole, manual: () => ManualPage = () => MANUAL) {
  return {
    'GET /api/projects/p1': json(makeProject({ role })),
    'GET /api/projects/p1/manuals/m1': () => json(manual()),
  };
}

function findButton(scope: Pick<DOMWrapper<Element>, 'findAll'>, text: string) {
  const button = scope.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

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

function title(wrapper: Pick<DOMWrapper<Element>, 'get'>) {
  return wrapper.get('[data-testid="manual-header"] h2').text();
}

function patchBodies(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls
    .map(([req]) => req)
    .filter((req) => req.method === 'PATCH')
    .map((req) => req.body);
}

describe('ManualPageView', () => {
  enableAutoUnmount(afterEach);

  beforeEach(() => {
    localStorage.clear();
  });

  it('shows the title and body under the manuals tab', async () => {
    stubApi(baseRoutes('substaff'));

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);

    expect(wrapper.get('nav a[aria-current="page"]').text()).toBe('マニュアル');
    expect(wrapper.get('[data-testid="back-to-manuals"]').attributes('href')).toBe(
      '/projects/p1/manuals',
    );
    expect(title(wrapper)).toBe('Onboarding');
    expect(wrapper.get('[data-testid="manual-meta"]').text()).toContain('Alice');
    expect(wrapper.get('[data-testid="manual-body"]').text()).toBe('Read the handbook');
    expect(wrapper.get('[data-testid="manual-created-by"]').text()).toBe('Alice');
    expect(wrapper.find('[data-testid="manual-edited"]').exists()).toBe(false);
    const buttons = wrapper.findAll('button').map((b) => b.text());
    expect(buttons).not.toContain('タイトルを編集');
    expect(buttons).not.toContain('編集');
    expect(buttons).not.toContain('削除');
  });

  it('shows a placeholder for an empty body', async () => {
    stubApi(baseRoutes('staff', () => makeManualPage()));

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);

    expect(wrapper.find('[data-testid="manual-body"]').exists()).toBe(false);
    expect(wrapper.text()).toContain('本文はありません');
  });

  it('marks the body as edited when the page was updated', async () => {
    stubApi(baseRoutes('staff', () => ({ ...MANUAL, updatedAt: '2026-09-02T00:00:00.000Z' })));

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);

    const edited = wrapper.get('[data-testid="manual-edited"]');
    expect(edited.text()).toBe('編集済み');
    expect(edited.attributes('title')).toBe(
      new Date('2026-09-02T00:00:00.000Z').toLocaleString('ja-JP'),
    );
    expect(wrapper.get('[data-testid="manual-updated-at"]').text()).toBe(
      new Date('2026-09-02T00:00:00.000Z').toLocaleString('ja-JP'),
    );
  });

  it('edits only the title', async () => {
    let current = MANUAL;
    const requests = stubApi({
      ...baseRoutes('staff', () => current),
      'PATCH /api/projects/p1/manuals/m1': (body) => {
        current = { ...current, ...(body as Partial<ManualPage>) };
        return json(current);
      },
    });

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);
    await findButton(wrapper, 'タイトルを編集').trigger('click');
    const form = wrapper.get('[data-testid="manual-title-form"]');
    expect(inputValue(form.get('input[aria-label="タイトル"]'))).toBe('Onboarding');

    await form.get('input[aria-label="タイトル"]').setValue(' Onboarding guide ');
    await form.trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([{ title: 'Onboarding guide' }]);
    expect(wrapper.find('[data-testid="manual-title-form"]').exists()).toBe(false);
    expect(title(wrapper)).toBe('Onboarding guide');
    expect(wrapper.get('[data-testid="manual-body"]').text()).toBe('Read the handbook');
  });

  it('shows a title error and stays in edit mode', async () => {
    stubApi({
      ...baseRoutes('staff'),
      'PATCH /api/projects/p1/manuals/m1': json({ error: 'validation_error' }, 400),
    });

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);
    await findButton(wrapper, 'タイトルを編集').trigger('click');
    await wrapper.get('[data-testid="manual-title-form"]').trigger('submit');
    await flushPromises();

    const form = wrapper.get('[data-testid="manual-title-form"]');
    expect(form.get('[role="alert"]').text()).toBe('タイトルは1〜200文字で入力してください');
  });

  it('edits only the body', async () => {
    let current = MANUAL;
    const requests = stubApi({
      ...baseRoutes('staff', () => current),
      'PATCH /api/projects/p1/manuals/m1': (body) => {
        current = { ...current, ...(body as Partial<ManualPage>) };
        return json(current);
      },
    });

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);
    await findButton(wrapper, '編集').trigger('click');
    const form = wrapper.get('[data-testid="edit-manual"]');
    expect(editorFor(form, '本文').getJSON()).toEqual(MANUAL.body);

    await replaceContent(form, '本文', 'Read it twice');
    await form.trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([{ body: plainTextToRichTextDoc('Read it twice') }]);
    expect(wrapper.find('[data-testid="edit-manual"]').exists()).toBe(false);
    expect(title(wrapper)).toBe('Onboarding');
    expect(wrapper.get('[data-testid="manual-body"]').text()).toBe('Read it twice');
    expect(localStorage.getItem('draft:manual:m1:body')).toBeNull();
  });

  it('discards the body edit on cancel without saving', async () => {
    const requests = stubApi(baseRoutes('admin'));

    const { wrapper } = await mountAt(ManualPageView, PATH, alice);
    await findButton(wrapper, '編集').trigger('click');
    const form = wrapper.get('[data-testid="edit-manual"]');
    await replaceContent(form, '本文', 'Changed');
    await findButton(form, 'キャンセル').trigger('click');
    await flushPromises();

    expect(wrapper.find('[data-testid="edit-manual"]').exists()).toBe(false);
    expect(wrapper.get('[data-testid="manual-body"]').text()).toBe('Read the handbook');
    expect(patchBodies(requests)).toEqual([]);
  });

  it('shows a body save error and stays in edit mode', async () => {
    stubApi({
      ...baseRoutes('staff'),
      'PATCH /api/projects/p1/manuals/m1': json({ error: 'internal' }, 500),
    });

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);
    await findButton(wrapper, '編集').trigger('click');
    await wrapper.get('[data-testid="edit-manual"]').trigger('submit');
    await flushPromises();

    const form = wrapper.get('[data-testid="edit-manual"]');
    expect(form.get('[role="alert"]').text()).toBe('保存に失敗しました');
  });

  it('deletes the page after confirmation and returns to the list', async () => {
    const requests = stubApi({
      ...baseRoutes('staff'),
      'DELETE /api/projects/p1/manuals/m1': noContent(),
    });

    const { wrapper, router } = await mountAt(ManualPageView, PATH, bob);
    await findButton(wrapper, '削除').trigger('click');
    await flushPromises();
    const dialog = openAlertDialog();
    expect(dialog.textContent).toContain('Onboarding');
    expect(requests.mock.calls.some(([req]) => req.method === 'DELETE')).toBe(false);

    dialogButton(dialog, '削除').click();
    await flushPromises();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(requests.mock.calls.map(([req]) => `${req.method} ${req.path}`)).toContain(
      'DELETE /api/projects/p1/manuals/m1',
    );
    expect(router.currentRoute.value.name).toBe('project-manuals');
    expect(router.currentRoute.value.params).toEqual({ projectId: 'p1' });
  });

  it('keeps the page when deletion is cancelled', async () => {
    const requests = stubApi(baseRoutes('admin'));

    const { wrapper, router } = await mountAt(ManualPageView, PATH, alice);
    await findButton(wrapper, '削除').trigger('click');
    await flushPromises();
    dialogButton(openAlertDialog(), 'キャンセル').click();
    await flushPromises();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(requests.mock.calls.some(([req]) => req.method === 'DELETE')).toBe(false);
    expect(router.currentRoute.value.name).toBe('manual');
  });

  it('shows not found for a missing page', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'staff' })),
      'GET /api/projects/p1/manuals/m1': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);

    expect(wrapper.text()).toContain('マニュアルが見つかりません');
    expect(wrapper.find('[data-testid="manual-page"]').exists()).toBe(false);
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('shows project not found for non-members', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/manuals/m1': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ManualPageView, PATH, bob);

    expect(wrapper.find('[data-testid="project-not-found"]').exists()).toBe(true);
    expect(wrapper.text()).not.toContain('マニュアルが見つかりません');
  });
});
