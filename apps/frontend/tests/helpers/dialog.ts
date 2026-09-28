import { DOMWrapper, flushPromises, type VueWrapper } from '@vue/test-utils';

// Reka UI teleports dialogs to <body>, so their content lives outside the mounted wrapper.
export function currentDialog(): DOMWrapper<HTMLElement> | null {
  const dialogs = document.body.querySelectorAll<HTMLElement>('[role="dialog"]');
  const last = dialogs[dialogs.length - 1];
  return last ? new DOMWrapper(last) : null;
}

export async function openDialog(wrapper: VueWrapper, buttonLabel: string) {
  const button = wrapper.findAll('button').find((b) => b.text() === buttonLabel);
  if (!button) throw new Error(`Button not found: ${buttonLabel}`);
  await button.trigger('click');
  await flushPromises();
  const dialog = currentDialog();
  if (!dialog) throw new Error(`Dialog did not open: ${buttonLabel}`);
  return dialog;
}
