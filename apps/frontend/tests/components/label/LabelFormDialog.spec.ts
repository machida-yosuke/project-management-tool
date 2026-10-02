import { PiniaColada } from '@pinia/colada';
import { DOMWrapper, flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, describe, expect, it } from 'vitest';
import type { TaskLabel } from '@pm-tool/shared';
import LabelFormDialog from '../../../src/components/label/LabelFormDialog.vue';
import { json, makeLabel, stubApi } from '../../helpers/api-mock';
import { currentDialog } from '../../helpers/dialog';
import { inputValue } from '../../helpers/mount';

async function openForm(label: TaskLabel | null = null) {
  const wrapper = mount(LabelFormDialog, {
    props: {
      projectId: 'p1',
      label,
      open: false,
      'onUpdate:open': (value: boolean) => wrapper.setProps({ open: value }),
    },
    global: { plugins: [createPinia(), PiniaColada] },
    attachTo: document.body,
  });
  await wrapper.setProps({ open: true });
  await flushPromises();
  const dialog = currentDialog();
  if (!dialog) throw new Error('Label dialog did not open');
  return dialog;
}

const hexInput = (dialog: DOMWrapper<HTMLElement>) =>
  dialog.get('input[aria-label="カラーコード"]');
const picker = (dialog: DOMWrapper<HTMLElement>) =>
  dialog.get('input[aria-label="カラーピッカー"]');
const submitButton = (dialog: DOMWrapper<HTMLElement>) => dialog.get('button[type="submit"]');

function pressedSwatches(dialog: DOMWrapper<HTMLElement>) {
  return dialog
    .findAll('button[aria-pressed="true"]')
    .map((button) => button.attributes('aria-label'));
}

function previewDotColor(dialog: DOMWrapper<HTMLElement>) {
  return dialog.get('[data-testid="label-preview"] [aria-hidden="true"]').attributes('style');
}

function postBody(requests: ReturnType<typeof stubApi>) {
  return requests.mock.calls.map(([req]) => req).find((req) => req.method === 'POST')?.body;
}

describe('LabelFormDialog', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('starts a new label with the default color and a placeholder preview', async () => {
    const dialog = await openForm();

    expect(inputValue(hexInput(dialog))).toBe('#8b8d98');
    expect(inputValue(picker(dialog))).toBe('#8b8d98');
    expect(pressedSwatches(dialog)).toEqual(['#8b8d98']);
    expect(dialog.get('[data-testid="label-preview"]').text()).toBe('ラベル');
  });

  it('starts from the color of the label being edited', async () => {
    const dialog = await openForm(makeLabel({ name: 'カスタム', color: '#ff00aa' }));

    expect(inputValue(hexInput(dialog))).toBe('#ff00aa');
    expect(pressedSwatches(dialog)).toEqual([]);
    expect(dialog.get('[data-testid="label-preview"]').text()).toBe('カスタム');
  });

  it('fills the hex input when a preset swatch is chosen', async () => {
    const dialog = await openForm();

    await dialog.get('button[aria-label="#8e4ec6"]').trigger('click');

    expect(inputValue(hexInput(dialog))).toBe('#8e4ec6');
    expect(inputValue(picker(dialog))).toBe('#8e4ec6');
    expect(pressedSwatches(dialog)).toEqual(['#8e4ec6']);
    expect(previewDotColor(dialog)).toContain('background-color: #8e4ec6');
  });

  it('updates the swatch selection and preview from the hex input', async () => {
    const dialog = await openForm();
    await dialog.get('input[aria-label="ラベルの名前"]').setValue('要確認');

    await hexInput(dialog).setValue('#E5484D');

    expect(pressedSwatches(dialog)).toEqual(['#e5484d']);
    expect(previewDotColor(dialog)).toContain('background-color: #e5484d');
    expect(dialog.get('[data-testid="label-preview"]').text()).toBe('要確認');
  });

  it('applies the color chosen in the native picker', async () => {
    const dialog = await openForm();

    await picker(dialog).setValue('#ff00aa');

    expect(inputValue(hexInput(dialog))).toBe('#ff00aa');
    expect(pressedSwatches(dialog)).toEqual([]);
    expect(previewDotColor(dialog)).toContain('background-color: #ff00aa');
  });

  it('blocks submission while the hex is malformed', async () => {
    const requests = stubApi({});
    const dialog = await openForm();
    await dialog.get('input[aria-label="ラベルの名前"]').setValue('要確認');

    await hexInput(dialog).setValue('#12');

    expect(submitButton(dialog).attributes('disabled')).toBeDefined();
    expect(dialog.text()).toContain('#rrggbb の形式で入力してください');
    expect(pressedSwatches(dialog)).toEqual([]);
    expect(previewDotColor(dialog)).toContain('background-color: #8b8d98');
    await dialog.get('[data-testid="label-form"]').trigger('submit');
    await flushPromises();
    expect(postBody(requests)).toBeUndefined();

    await hexInput(dialog).setValue('#123456');
    expect(submitButton(dialog).attributes('disabled')).toBeUndefined();
    expect(dialog.text()).not.toContain('#rrggbb の形式で入力してください');
  });

  it('sends an uppercase hex in lowercase', async () => {
    const requests = stubApi({
      'POST /api/projects/p1/labels': json(makeLabel({ name: '要確認', color: '#ff00aa' }), 201),
      'GET /api/projects/p1/labels': json([]),
    });
    const dialog = await openForm();
    await dialog.get('input[aria-label="ラベルの名前"]').setValue('要確認');
    await hexInput(dialog).setValue('#FF00AA');

    await dialog.get('[data-testid="label-form"]').trigger('submit');
    await flushPromises();

    expect(postBody(requests)).toEqual({ name: '要確認', color: '#ff00aa' });
  });
});
