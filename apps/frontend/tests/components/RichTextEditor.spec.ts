import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { Slice } from '@tiptap/pm/model';
import type { Editor } from '@tiptap/vue-3';
import { emptyRichTextDoc, plainTextToRichTextDoc, type RichTextDoc } from '@pm-tool/shared';
import RichTextEditor from '../../src/components/rich-text/RichTextEditor.vue';
import RichTextForm from '../../src/components/rich-text/RichTextForm.vue';
import { AttachmentTooLargeError } from '../../src/lib/image';
import { json, stubApi } from '../helpers/api-mock';
import { editorFor, typeInto } from '../helpers/rich-text';

const resized = new Blob([new Uint8Array([1, 2, 3])], { type: 'image/webp' });
const resizeAttachment = vi.fn<(file: Blob) => Promise<Blob>>(() => Promise.resolve(resized));

vi.mock('../../src/lib/image', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/lib/image')>();
  return { ...actual, resizeAttachment: (file: Blob) => resizeAttachment(file) };
});

function images(doc: RichTextDoc): unknown[] {
  return doc.content.flatMap((block) =>
    (block.content ?? []).filter((node) => node.type === 'image').map((node) => node.attrs?.src),
  );
}

async function mountEditor(initial: RichTextDoc = emptyRichTextDoc(), allowImages = true) {
  const doc = ref(initial);
  const Host = defineComponent(
    () => () =>
      h(RichTextEditor, {
        label: '本文',
        placeholder: '書く',
        allowImages,
        doc: doc.value,
        'onUpdate:doc': (value: RichTextDoc) => {
          doc.value = value;
        },
      }),
  );
  const wrapper = mount(Host, { attachTo: document.body });
  await flushPromises();
  return { wrapper, doc };
}

function pasteFiles(target: Element, files: File[], html = '') {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', {
    value: { files, getData: (type: string) => (type === 'text/html' ? html : '') },
  });
  target.dispatchEvent(event);
}

// ProseMirror bails out of drops before handleDrop when happy-dom cannot map coordinates, so call the prop directly.
function dropFiles(editor: Editor, files: File[]) {
  const event = new Event('drop', { bubbles: true, cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { files, getData: () => '' } });
  const handled = editor.view.someProp('handleDrop', (handler) =>
    handler(editor.view, event, Slice.empty, false),
  );
  return { event, handled };
}

describe('RichTextEditor', () => {
  beforeEach(() => {
    localStorage.clear();
    resizeAttachment.mockClear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('emits the edited doc and shows the placeholder only while empty', async () => {
    const { wrapper, doc } = await mountEditor();
    expect(wrapper.get('.placeholder').text()).toBe('書く');

    await typeInto(wrapper, '本文', 'Hello');

    expect(doc.value).toEqual(plainTextToRichTextDoc('Hello'));
    expect(wrapper.find('.placeholder').exists()).toBe(false);
  });

  it('applies external doc changes to the editor', async () => {
    const { wrapper, doc } = await mountEditor(plainTextToRichTextDoc('first'));

    doc.value = plainTextToRichTextDoc('second');
    await flushPromises();

    expect(editorFor(wrapper, '本文').getText()).toBe('second');
  });

  it('inserts a picked image as a resized data URL', async () => {
    const { wrapper, doc } = await mountEditor();
    const file = new File(['raw'], 'photo.jpg', { type: 'image/jpeg' });
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, 'files', {
      value: { item: () => file, length: 1 },
      configurable: true,
    });

    await input.trigger('change');
    await flushPromises();

    expect(resizeAttachment).toHaveBeenCalledWith(file);
    // FileReader resolves on a later task than flushPromises covers.
    await vi.waitFor(() => expect(images(doc.value)).toEqual(['data:image/webp;base64,AQID']));
  });

  it('inserts pasted image files and ignores other files', async () => {
    const { wrapper, doc } = await mountEditor();
    const image = new File(['raw'], 'shot.png', { type: 'image/png' });
    const text = new File(['x'], 'notes.txt', { type: 'text/plain' });

    pasteFiles(wrapper.get('[role="textbox"]').element, [text, image]);
    await flushPromises();

    expect(resizeAttachment).toHaveBeenCalledTimes(1);
    expect(resizeAttachment).toHaveBeenCalledWith(image);
    // FileReader resolves on a later task than flushPromises covers.
    await vi.waitFor(() => expect(images(doc.value)).toEqual(['data:image/webp;base64,AQID']));
  });

  it('shows an error when an image stays too large', async () => {
    resizeAttachment.mockRejectedValueOnce(new AttachmentTooLargeError());
    const { wrapper, doc } = await mountEditor();

    pasteFiles(wrapper.get('[role="textbox"]').element, [
      new File(['raw'], 'huge.png', { type: 'image/png' }),
    ]);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('画像が大きすぎます');
    expect(images(doc.value)).toEqual([]);
  });

  it('hides the image controls when images are not allowed', async () => {
    const { wrapper } = await mountEditor(emptyRichTextDoc(), false);

    expect(wrapper.find('button[aria-label="リンク"]').exists()).toBe(true);
    expect(wrapper.find('button[aria-label="画像を挿入"]').exists()).toBe(false);
    expect(wrapper.find('input[type="file"]').exists()).toBe(false);
  });

  it('ignores pasted and dropped image files when images are not allowed', async () => {
    const { wrapper, doc } = await mountEditor(emptyRichTextDoc(), false);
    const textbox = wrapper.get('[role="textbox"]').element;
    const image = new File(['raw'], 'shot.png', { type: 'image/png' });

    pasteFiles(textbox, [image]);
    const drop = dropFiles(editorFor(wrapper, '本文'), [image]);
    await flushPromises();

    expect(drop.handled).toBe(true);
    expect(drop.event.defaultPrevented).toBe(true);
    expect(resizeAttachment).not.toHaveBeenCalled();
    expect(images(doc.value)).toEqual([]);
  });

  it('drops images from pasted HTML when images are not allowed', async () => {
    const { wrapper, doc } = await mountEditor(emptyRichTextDoc(), false);

    pasteFiles(
      wrapper.get('[role="textbox"]').element,
      [],
      '<p>see<img src="data:image/png;base64,iVBORw0KGgo="></p>',
    );
    await flushPromises();

    expect(doc.value).toEqual(plainTextToRichTextDoc('see'));
  });

  it('keeps images from pasted HTML when images are allowed', async () => {
    const { wrapper, doc } = await mountEditor();

    pasteFiles(
      wrapper.get('[role="textbox"]').element,
      [],
      '<p>see<img src="data:image/png;base64,iVBORw0KGgo="></p>',
    );
    await flushPromises();

    expect(images(doc.value)).toEqual(['data:image/png;base64,iVBORw0KGgo=']);
  });

  it('renders stored attachment images from the API origin', async () => {
    const src = '/api/projects/p1/attachments/11111111-1111-1111-1111-111111111111';
    const { wrapper } = await mountEditor({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'image', attrs: { src } }] }],
    });

    expect(wrapper.get('[role="textbox"] img:not(.ProseMirror-separator)').attributes('src')).toBe(
      `https://localhost:8787${src}`,
    );
  });
});

describe('RichTextForm', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    document.body.innerHTML = '';
  });

  it('keeps the cursor while typing through the draft model', async () => {
    const wrapper = mount(RichTextForm, {
      props: {
        projectId: 'p1',
        draftKey: 'draft:t1:comment:new',
        initialDoc: emptyRichTextDoc(),
        label: 'コメント',
        submitLabel: '投稿',
        submit: () => Promise.resolve(),
      },
      attachTo: document.body,
    });
    await flushPromises();

    await typeInto(wrapper, 'コメント', 'Hello');
    editorFor(wrapper, 'コメント').commands.setTextSelection(1);
    await typeInto(wrapper, 'コメント', 'X');
    await typeInto(wrapper, 'コメント', 'Y');

    expect(editorFor(wrapper, 'コメント').getText()).toBe('XYHello');
  });

  it('warns when the draft no longer fits in storage', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw Object.assign(new Error('full'), { name: 'QuotaExceededError' });
      },
      removeItem: () => undefined,
    });
    const wrapper = mount(RichTextForm, {
      props: {
        projectId: 'p1',
        draftKey: 'draft:t1:comment:new',
        initialDoc: emptyRichTextDoc(),
        label: 'コメント',
        submitLabel: '投稿',
        submit: () => Promise.resolve(),
      },
      attachTo: document.body,
    });
    await vi.runAllTimersAsync();

    await typeInto(wrapper, 'コメント', 'big');
    await vi.advanceTimersByTimeAsync(300);
    vi.useRealTimers();

    expect(wrapper.get('[role="alert"]').text()).toBe(
      '下書きを保存できません。画像を減らしてください',
    );
  });

  it('validates without uploading when there is no project yet', async () => {
    const requests = stubApi({ 'POST /api/projects/p1/attachments': json({}, 201) });
    const submit = vi.fn<(doc: RichTextDoc) => Promise<void>>(() => Promise.resolve());
    const wrapper = mount(RichTextForm, {
      props: {
        projectId: null,
        draftKey: 'draft:project:new',
        initialDoc: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [{ type: 'image', attrs: { src: 'data:image/png;base64,iVBORw0KGgo=' } }],
            },
          ],
        },
        label: 'プロジェクトの説明',
        submitLabel: '作成',
        submit,
      },
      attachTo: document.body,
    });
    await flushPromises();

    expect(wrapper.find('button[aria-label="画像を挿入"]').exists()).toBe(false);
    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(requests).not.toHaveBeenCalled();
    expect(submit).not.toHaveBeenCalled();
    expect(wrapper.get('[role="alert"]').text()).toBe('使用できない画像が含まれています');
  });

  it('uses the given fallback when submitting fails', async () => {
    const wrapper = mount(RichTextForm, {
      props: {
        projectId: null,
        draftKey: 'draft:project:new',
        initialDoc: plainTextToRichTextDoc('body'),
        label: 'プロジェクトの説明',
        submitLabel: '作成',
        submitErrorFallback: 'プロジェクトの作成に失敗しました',
        submit: () => Promise.reject(new Error('boom')),
      },
      attachTo: document.body,
    });
    await flushPromises();

    await wrapper.get('form').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('プロジェクトの作成に失敗しました');
  });
});
