import { flushPromises, mount } from '@vue/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { emptyRichTextDoc, plainTextToRichTextDoc, type RichTextDoc } from '@pm-tool/shared';
import RichTextEditor from '../../src/components/rich-text/RichTextEditor.vue';
import RichTextForm from '../../src/components/rich-text/RichTextForm.vue';
import { AttachmentTooLargeError } from '../../src/lib/image';
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

async function mountEditor(initial: RichTextDoc = emptyRichTextDoc()) {
  const doc = ref(initial);
  const Host = defineComponent(
    () => () =>
      h(RichTextEditor, {
        label: '本文',
        placeholder: '書く',
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

function pasteFiles(target: Element, files: File[]) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { files, getData: () => '' } });
  target.dispatchEvent(event);
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
});
