import { flushPromises, type DOMWrapper } from '@vue/test-utils';

type Trigger = Pick<DOMWrapper<Element>, 'trigger' | 'attributes'>;

function listboxOf(trigger: Trigger): HTMLElement {
  const listboxId = trigger.attributes('aria-controls');
  if (!listboxId) throw new Error('Select is not open');
  const listbox = document.getElementById(listboxId);
  if (!listbox) throw new Error(`Listbox not found: ${listboxId}`);
  return listbox;
}

// Reka UI teleports the listbox to <body>, so its options live outside the mounted wrapper.
async function openOptions(trigger: Trigger): Promise<HTMLElement[]> {
  await trigger.trigger('keydown', { key: 'Enter' });
  await flushPromises();
  return Array.from(listboxOf(trigger).querySelectorAll<HTMLElement>('[role="option"]'));
}

async function close(trigger: Trigger) {
  listboxOf(trigger).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await flushPromises();
}

export async function selectOptionLabels(trigger: Trigger): Promise<string[]> {
  const labels = (await openOptions(trigger)).map((option) => option.textContent?.trim() ?? '');
  await close(trigger);
  return labels;
}

export async function chooseOption(trigger: Trigger, label: string) {
  const options = await openOptions(trigger);
  const option = options.find((o) => o.textContent?.trim() === label);
  if (!option) throw new Error(`Option not found: ${label}`);
  option.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await flushPromises();
}
