import { flushPromises, type DOMWrapper } from '@vue/test-utils';
import type { Editor } from '@tiptap/vue-3';

type Scope = Pick<DOMWrapper<Element>, 'get'>;

// happy-dom does not turn keystrokes into ProseMirror transactions, so drive the real editor through its commands.
export function editorFor(scope: Scope, label: string): Editor {
  const element: unknown = scope.get(`[role="textbox"][aria-label="${label}"]`).element;
  if (typeof element === 'object' && element !== null && 'editor' in element) {
    return element.editor as Editor;
  }
  throw new Error(`No Tiptap editor labelled ${label}`);
}

export async function typeInto(scope: Scope, label: string, text: string) {
  editorFor(scope, label).commands.insertContent(text);
  await flushPromises();
}

export async function replaceContent(scope: Scope, label: string, text: string) {
  const editor = editorFor(scope, label);
  editor.commands.selectAll();
  editor.commands.insertContent(text);
  await flushPromises();
}
