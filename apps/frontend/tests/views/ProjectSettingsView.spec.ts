import { flushPromises } from '@vue/test-utils';
import { beforeEach, describe, expect, it } from 'vitest';
import { useQueryCache } from '@pinia/colada';
import { emptyRichTextDoc, plainTextToRichTextDoc, type Project } from '@pm-tool/shared';
import { getGetProjectQueryKey } from '../../src/api/generated';
import ProjectSettingsView from '../../src/views/ProjectSettingsView.vue';
import { alice, bob, json, makeProject, stubApi } from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';
import { editorFor, replaceContent } from '../helpers/rich-text';

const project = makeProject({
  name: 'Project One',
  description: plainTextToRichTextDoc('Old summary'),
});

function patchBodies(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls
    .map(([req]) => req)
    .filter((req) => req.method === 'PATCH')
    .map((req) => req.body);
}

function patchable() {
  let current: Project = project;
  const requests = stubApi({
    'GET /api/projects/p1': () => json(current),
    'GET /api/projects': () => json([current]),
    'PATCH /api/projects/p1': (body) => {
      current = { ...current, ...(body as Partial<Project>) };
      return json(current);
    },
  });
  return requests;
}

describe('ProjectSettingsView', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it.each(['admin', 'staff'] as const)('prefills the forms for %s', async (role) => {
    stubApi({ 'GET /api/projects/p1': json({ ...project, role }) });

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', bob);

    const form = wrapper.get('[data-testid="project-form"]');
    expect(inputValue(form.get('input[aria-label="名前"]'))).toBe('Project One');
    const description = wrapper.get('[data-testid="description-form"]');
    expect(editorFor(description, '概要').getText()).toBe('Old summary');
  });

  it('saves only the name and refetches the project', async () => {
    const requests = patchable();

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', alice);
    const form = wrapper.get('[data-testid="project-form"]');
    await form.get('input[aria-label="名前"]').setValue('  Renamed  ');
    await form.trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([{ name: 'Renamed' }]);
    expect(form.get('[role="status"]').text()).toBe('保存しました');
    expect(
      requests.mock.calls.filter(([req]) => req.method === 'GET' && req.path === '/api/projects/p1'),
    ).toHaveLength(2);
    expect(wrapper.get('h2').text()).toBe('Renamed の設定');
  });

  it('saves only the description as a rich text document', async () => {
    const requests = patchable();

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', alice);
    const section = wrapper.get('[data-testid="description-form"]');
    await replaceContent(section, '概要', 'New summary');
    await section.get('form').trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([
      { description: plainTextToRichTextDoc('New summary') },
    ]);
    const after = wrapper.get('[data-testid="description-form"]');
    expect(after.get('[role="status"]').text()).toBe('保存しました');
    expect(editorFor(after, '概要').getText()).toBe('New summary');
    expect(localStorage.getItem('draft:project:p1:description')).toBeNull();
  });

  it('allows clearing the description', async () => {
    const requests = patchable();

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', alice);
    const section = wrapper.get('[data-testid="description-form"]');
    editorFor(section, '概要').commands.clearContent(true);
    await flushPromises();
    const submit = section.get('button[type="submit"]');
    expect(submit.attributes('disabled')).toBeUndefined();
    await section.get('form').trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([{ description: emptyRichTextDoc() }]);
    expect(editorFor(wrapper.get('[data-testid="description-form"]'), '概要').getText()).toBe('');
  });

  it('shows the error message when saving the name fails', async () => {
    stubApi({
      'GET /api/projects/p1': json(project),
      'PATCH /api/projects/p1': json({ error: 'validation_error' }, 400),
    });

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', alice);
    await wrapper.get('[data-testid="project-form"]').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('名前は1〜200文字で入力してください');
  });

  it('keeps unsaved name edits when the project is refetched', async () => {
    let current: Project = project;
    stubApi({ 'GET /api/projects/p1': () => json(current) });

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', alice);
    const input = wrapper.get('input[aria-label="名前"]');
    await input.setValue('Draft');
    current = { ...project, name: 'Changed elsewhere' };
    await useQueryCache().invalidateQueries({ key: getGetProjectQueryKey('p1') });
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Changed elsewhere の設定');

    expect(inputValue(input)).toBe('Draft');
  });

  it('shows the project read-only for substaff', async () => {
    stubApi({ 'GET /api/projects/p1': json({ ...project, role: 'substaff' }) });

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', bob);

    expect(wrapper.find('[data-testid="project-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="description-form"]').exists()).toBe(false);
    const readonly = wrapper.get('[data-testid="project-readonly"]');
    expect(readonly.text()).toContain('編集権限がありません');
    expect(readonly.get('[data-testid="description"] p').text()).toBe('Old summary');
  });

  it('shows not found without leaking the project', async () => {
    stubApi({ 'GET /api/projects/p1': json({ error: 'not_found' }, 404) });

    const { wrapper } = await mountAt(ProjectSettingsView, '/projects/p1/settings', bob);

    expect(wrapper.get('[role="alert"]').text()).toBe('プロジェクトが見つかりません');
    expect(wrapper.find('[data-testid="project-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="description-form"]').exists()).toBe(false);
  });
});
