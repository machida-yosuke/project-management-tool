import { PiniaColada } from '@pinia/colada';
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import TaskTitle from '../../src/components/TaskTitle.vue';
import { json, makeTask, stubApi } from '../helpers/api-mock';
import { inputValue } from '../helpers/mount';

async function mountTitle(editable = true) {
  const wrapper = mount(TaskTitle, {
    props: { task: makeTask(), editable },
    global: { plugins: [createPinia(), PiniaColada] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

function findButton(wrapper: VueWrapper, text: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Button not found: ${text}`);
  return button;
}

async function startEditing(wrapper: VueWrapper) {
  await findButton(wrapper, 'タイトルを編集').trigger('click');
  await flushPromises();
}

function patchBodies(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls
    .map(([req]) => req)
    .filter((req) => req.method === 'PATCH')
    .map((req) => req.body);
}

describe('TaskTitle', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('shows the title with an edit button when editable', async () => {
    const wrapper = await mountTitle();

    expect(wrapper.get('h2').text()).toBe('Write spec');
    expect(wrapper.findAll('button').map((b) => b.text())).toEqual(['タイトルを編集']);
  });

  it('hides the edit button when not editable', async () => {
    const wrapper = await mountTitle(false);

    expect(wrapper.get('h2').text()).toBe('Write spec');
    expect(wrapper.find('button').exists()).toBe(false);
  });

  it('saves a trimmed title with a PATCH of only the title', async () => {
    const requests = stubApi({
      'PATCH /api/projects/p1/tasks/t1': json(makeTask({ title: 'Renamed' })),
    });
    const wrapper = await mountTitle();
    await startEditing(wrapper);
    expect(inputValue(wrapper.get('input[aria-label="タイトル"]'))).toBe('Write spec');

    await wrapper.get('input[aria-label="タイトル"]').setValue('  Renamed  ');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([{ title: 'Renamed' }]);
    expect(wrapper.find('form').exists()).toBe(false);
  });

  it.each(['', '   '])('does not send a blank title %j', async (value) => {
    const requests = stubApi({});
    const wrapper = await mountTitle();
    await startEditing(wrapper);

    await wrapper.get('input[aria-label="タイトル"]').setValue(value);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(patchBodies(requests)).toEqual([]);
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('shows an error when the title is rejected', async () => {
    stubApi({
      'PATCH /api/projects/p1/tasks/t1': json({ error: 'validation_error' }, 400),
    });
    const wrapper = await mountTitle();
    await startEditing(wrapper);

    await wrapper.get('input[aria-label="タイトル"]').setValue('Too long');
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('タイトルは 200 文字以内にしてください');
    expect(wrapper.find('form').exists()).toBe(true);
  });

  it('restores the title on cancel', async () => {
    const requests = stubApi({});
    const wrapper = await mountTitle();
    await startEditing(wrapper);
    await wrapper.get('input[aria-label="タイトル"]').setValue('Discarded');

    await findButton(wrapper, '取消').trigger('click');
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Write spec');
    await startEditing(wrapper);
    expect(inputValue(wrapper.get('input[aria-label="タイトル"]'))).toBe('Write spec');
    expect(patchBodies(requests)).toEqual([]);
  });

  it('cancels with Escape', async () => {
    const requests = stubApi({});
    const wrapper = await mountTitle();
    await startEditing(wrapper);
    await wrapper.get('input[aria-label="タイトル"]').setValue('Discarded');

    await wrapper.get('input[aria-label="タイトル"]').trigger('keydown', { key: 'Escape' });
    await flushPromises();

    expect(wrapper.get('h2').text()).toBe('Write spec');
    expect(patchBodies(requests)).toEqual([]);
  });
});
