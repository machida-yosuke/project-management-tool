import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskLabel } from '@pm-tool/shared';
import ProjectLabelsView from '../../src/views/ProjectLabelsView.vue';
import { alice, bob, json, makeLabel, makeProject, noContent, stubApi } from '../helpers/api-mock';
import { currentDialog, openDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';

const PATH = '/projects/p1/labels';
const LABELS = 'GET /api/projects/p1/labels';

const initialLabels = () => [
  makeLabel({ id: 'l1', name: 'バグ報告', color: '#e5484d' }),
  makeLabel({ id: 'l2', name: '更新依頼', color: '#3e63dd' }),
];

function labelRows(wrapper: VueWrapper) {
  return wrapper.findAll('[data-testid="label"]').map((row) => ({
    name: row.get('td').text(),
    color: row.get('[data-testid="label-color"]').text(),
  }));
}

function labelRow(wrapper: VueWrapper, index: number) {
  const row = wrapper.findAll('[data-testid="label"]')[index];
  if (!row) throw new Error(`Label row not found: ${index}`);
  return row;
}

function rowButton(wrapper: VueWrapper, index: number, text: string) {
  const button = labelRow(wrapper, index)
    .findAll('button')
    .find((b) => b.text() === text);
  if (!button) throw new Error(`Row button not found: ${text}`);
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

function requestLines(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls.map(([req]) => `${req.method} ${req.path}`);
}

describe('ProjectLabelsView', () => {
  enableAutoUnmount(afterEach);

  it('lists labels under the labels tab with their color codes', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'staff' })),
      [LABELS]: json(initialLabels()),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, bob);

    expect(wrapper.get('nav a[aria-current="page"]').text()).toBe('ラベル');
    expect(labelRows(wrapper)).toEqual([
      { name: 'バグ報告', color: '#e5484d' },
      { name: '更新依頼', color: '#3e63dd' },
    ]);
    expect(
      labelRow(wrapper, 0)
        .findAll('button')
        .map((b) => b.text()),
    ).toEqual(['編集', '削除']);
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('ラベルを作成');
  });

  it('shows an empty state when there are no labels', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      [LABELS]: json([]),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, alice);

    expect(wrapper.text()).toContain('ラベルはありません');
    expect(wrapper.find('[data-testid="label"]').exists()).toBe(false);
  });

  it('creates a label and refetches the list', async () => {
    let labels: TaskLabel[] = initialLabels();
    const created = makeLabel({ id: 'l3', name: '要確認', color: '#8e4ec6' });
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      [LABELS]: () => json(labels),
      'POST /api/projects/p1/labels': () => {
        labels = [...labels, created];
        return json(created, 201);
      },
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, alice);
    const dialog = await openDialog(wrapper, 'ラベルを作成');
    expect(dialog.get('h2').text()).toBe('ラベルを作成');
    expect(inputValue(dialog.get('input[aria-label="カラーコード"]'))).toBe('#8b8d98');
    await dialog.get('input[aria-label="ラベルの名前"]').setValue('要確認');
    await dialog.get('button[aria-label="#8e4ec6"]').trigger('click');
    await dialog.get('[data-testid="label-form"]').trigger('submit');
    await flushPromises();

    const post = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'POST');
    expect(post?.body).toEqual({ name: '要確認', color: '#8e4ec6' });
    expect(currentDialog()).toBeNull();
    expect(labelRows(wrapper)).toContainEqual({ name: '要確認', color: '#8e4ec6' });
  });

  it('shows a duplicate name error inside the dialog', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      [LABELS]: json(initialLabels()),
      'POST /api/projects/p1/labels': json({ error: 'label_name_taken' }, 409),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, alice);
    const dialog = await openDialog(wrapper, 'ラベルを作成');
    await dialog.get('input[aria-label="ラベルの名前"]').setValue('バグ報告');
    await dialog.get('[data-testid="label-form"]').trigger('submit');
    await flushPromises();

    expect(currentDialog()).not.toBeNull();
    expect(dialog.get('[role="alert"]').text()).toBe('同じ名前のラベルがあります');
    expect(inputValue(dialog.get('input[aria-label="ラベルの名前"]'))).toBe('バグ報告');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
  });

  it('edits a label and refetches the list', async () => {
    let labels: TaskLabel[] = initialLabels();
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      [LABELS]: () => json(labels),
      'PATCH /api/projects/p1/labels/l2': (body) => {
        const updated = makeLabel({ ...labels[1], ...(body as Partial<TaskLabel>) });
        labels = labels.map((label) => (label.id === 'l2' ? updated : label));
        return json(updated);
      },
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, alice);
    await rowButton(wrapper, 1, '編集').trigger('click');
    await flushPromises();
    const dialog = currentDialog();
    if (!dialog) throw new Error('Edit dialog did not open');
    expect(dialog.get('h2').text()).toBe('ラベルを編集');
    expect(inputValue(dialog.get('input[aria-label="ラベルの名前"]'))).toBe('更新依頼');
    expect(inputValue(dialog.get('input[aria-label="カラーコード"]'))).toBe('#3e63dd');

    await dialog.get('input[aria-label="ラベルの名前"]').setValue('改善依頼');
    await dialog.get('input[aria-label="カラーコード"]').setValue('#FF00AA');
    await dialog.get('[data-testid="label-form"]').trigger('submit');
    await flushPromises();

    const patch = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'PATCH');
    expect(patch?.body).toEqual({ name: '改善依頼', color: '#ff00aa' });
    expect(currentDialog()).toBeNull();
    expect(labelRows(wrapper)[1]).toEqual({ name: '改善依頼', color: '#ff00aa' });
    expect(requestLines(requests).filter((line) => line === LABELS)).toHaveLength(2);
  });

  it('opens the create dialog empty after editing a label', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      [LABELS]: json(initialLabels()),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, alice);
    await rowButton(wrapper, 0, '編集').trigger('click');
    await flushPromises();
    const edit = currentDialog();
    if (!edit) throw new Error('Edit dialog did not open');
    edit.element.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await flushPromises();
    expect(currentDialog()).toBeNull();

    const dialog = await openDialog(wrapper, 'ラベルを作成');
    expect(dialog.get('h2').text()).toBe('ラベルを作成');
    expect(inputValue(dialog.get('input[aria-label="ラベルの名前"]'))).toBe('');
  });

  it('deletes a label after confirmation and refetches the list', async () => {
    let labels: TaskLabel[] = initialLabels();
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'staff' })),
      [LABELS]: () => json(labels),
      'DELETE /api/projects/p1/labels/l1': () => {
        labels = labels.filter((label) => label.id !== 'l1');
        return noContent();
      },
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, bob);
    await rowButton(wrapper, 0, '削除').trigger('click');
    await flushPromises();
    const dialog = openAlertDialog();
    expect(dialog.textContent).toContain('バグ報告');
    expect(dialog.textContent).toContain('このラベルが付いているタスクはラベルなしになります');
    expect(requests.mock.calls.some(([req]) => req.method === 'DELETE')).toBe(false);

    dialogButton(dialog, '削除').click();
    await flushPromises();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(requestLines(requests)).toContain('DELETE /api/projects/p1/labels/l1');
    expect(labelRows(wrapper)).toEqual([{ name: '更新依頼', color: '#3e63dd' }]);
  });

  it('keeps the label when deletion is cancelled', async () => {
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      [LABELS]: json(initialLabels()),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, alice);
    await rowButton(wrapper, 0, '削除').trigger('click');
    await flushPromises();
    dialogButton(openAlertDialog(), 'キャンセル').click();
    await flushPromises();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(wrapper.findAll('[data-testid="label"]')).toHaveLength(2);
    expect(requests.mock.calls.some(([req]) => req.method === 'DELETE')).toBe(false);
  });

  it('shows an action error when deletion fails', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      [LABELS]: json(initialLabels()),
      'DELETE /api/projects/p1/labels/l1': json({ error: 'internal_error' }, 500),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, alice);
    await rowButton(wrapper, 0, '削除').trigger('click');
    await flushPromises();
    dialogButton(openAlertDialog(), '削除').click();
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('操作に失敗しました');
    expect(wrapper.findAll('[data-testid="label"]')).toHaveLength(2);
  });

  it('hides every label action for substaff', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'substaff' })),
      [LABELS]: json(initialLabels()),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, bob);

    expect(wrapper.findAll('[data-testid="label"]')).toHaveLength(2);
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('shows not found for a project the user cannot see', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      [LABELS]: json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectLabelsView, PATH, bob);

    expect(wrapper.get('[data-testid="project-not-found"]').text()).toContain(
      'プロジェクトが見つかりません',
    );
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="label"]').exists()).toBe(false);
  });
});
