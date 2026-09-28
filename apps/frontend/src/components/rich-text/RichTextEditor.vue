<script setup lang="ts">
import { ref, watch } from 'vue';
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import type { RichTextDoc } from '@pm-tool/shared';
import { eventFile } from '../../lib/form';
import {
  AttachmentTooLargeError,
  ImageDecodeError,
  blobToDataUrl,
  resizeAttachment,
} from '../../lib/image';
import {
  createRichTextExtensions,
  isHttpUrl,
  jsonToRichTextDoc,
} from '../../lib/rich-text-extensions';

const props = withDefaults(
  defineProps<{ label: string; placeholder?: string; allowImages?: boolean }>(),
  { placeholder: undefined, allowImages: true },
);
const doc = defineModel<RichTextDoc>('doc', { required: true });

const fileInput = ref<HTMLInputElement | null>(null);
const toolError = ref('');
let lastEmitted: RichTextDoc | null = null;

function imageFiles(list: FileList | null | undefined): File[] {
  return Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
}

function withoutImages(fragment: Fragment): Fragment {
  const nodes: ProseMirrorNode[] = [];
  fragment.forEach((node) => {
    if (node.type.name === 'image') return;
    nodes.push(node.isLeaf ? node : node.copy(withoutImages(node.content)));
  });
  return Fragment.fromArray(nodes);
}

const editor = useEditor({
  content: doc.value,
  extensions: createRichTextExtensions(),
  editorProps: {
    attributes: {
      'aria-label': props.label,
      'aria-multiline': 'true',
      role: 'textbox',
      class: 'rich-text-input',
    },
    transformPasted: (slice) =>
      props.allowImages
        ? slice
        : new Slice(withoutImages(slice.content), slice.openStart, slice.openEnd),
    handlePaste: (_view, event) => {
      const files = imageFiles(event.clipboardData?.files);
      if (files.length === 0 || !props.allowImages) return false;
      event.preventDefault();
      void insertImages(files);
      return true;
    },
    handleDrop: (view, event, _slice, moved) => {
      const files = moved ? [] : imageFiles(event.dataTransfer?.files);
      if (files.length === 0) return false;
      event.preventDefault();
      // Swallow the drop so the browser does not navigate to the dropped file.
      if (!props.allowImages) return true;
      void insertImages(files, dropPosition(view, event));
      return true;
    },
  },
  onUpdate: ({ editor: instance }) => {
    const next = jsonToRichTextDoc(instance.getJSON());
    lastEmitted = next;
    doc.value = next;
  },
});

watch(doc, (value) => {
  if (value === lastEmitted || !editor.value) return;
  editor.value.commands.setContent(value, { emitUpdate: false });
});

function dropPosition(view: EditorView, event: DragEvent): number | undefined {
  return view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
}

async function insertImages(files: File[], position?: number) {
  toolError.value = '';
  for (const file of files) {
    let src: string;
    try {
      src = await blobToDataUrl(await resizeAttachment(file));
    } catch (e) {
      if (e instanceof AttachmentTooLargeError) toolError.value = '画像が大きすぎます';
      else if (e instanceof ImageDecodeError) toolError.value = '画像を読み込めませんでした';
      else throw e;
      continue;
    }
    const instance = editor.value;
    if (!instance) return;
    const image = { type: 'image', attrs: { src } };
    if (position === undefined) {
      instance.chain().focus().insertContent(image).run();
    } else {
      instance.chain().focus().insertContentAt(position, image).run();
      position += 1;
    }
  }
}

function onFileChange(event: Event) {
  const file = eventFile(event);
  if (fileInput.value) fileInput.value.value = '';
  if (file) void insertImages([file]);
}

function run(command: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) {
  if (!editor.value) return;
  command(editor.value.chain().focus()).run();
}

function toggleLink() {
  const instance = editor.value;
  if (!instance) return;
  if (instance.isActive('link')) {
    instance.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  const input = window.prompt('リンク先の URL');
  if (input === null) return;
  const href = input.trim();
  if (!isHttpUrl(href)) {
    toolError.value = 'リンクは http:// か https:// で始まる URL にしてください';
    return;
  }
  toolError.value = '';
  if (instance.state.selection.empty) {
    instance
      .chain()
      .focus()
      .insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
      .run();
  } else {
    instance.chain().focus().extendMarkRange('link').setLink({ href }).run();
  }
}

function isActive(name: string, attrs?: Record<string, unknown>) {
  return editor.value?.isActive(name, attrs) ? 'true' : 'false';
}
</script>

<template>
  <div class="rich-text-editor">
    <div v-if="editor" class="toolbar" role="toolbar" :aria-label="`${label} の書式`">
      <button
        type="button"
        aria-label="太字"
        :aria-pressed="isActive('bold')"
        @click="run((c) => c.toggleBold())"
      >
        <b>B</b>
      </button>
      <button
        type="button"
        aria-label="斜体"
        :aria-pressed="isActive('italic')"
        @click="run((c) => c.toggleItalic())"
      >
        <i>I</i>
      </button>
      <button
        type="button"
        aria-label="打消し線"
        :aria-pressed="isActive('strike')"
        @click="run((c) => c.toggleStrike())"
      >
        <s>S</s>
      </button>
      <button
        type="button"
        aria-label="コード"
        :aria-pressed="isActive('code')"
        @click="run((c) => c.toggleCode())"
      >
        &lt;/&gt;
      </button>
      <button
        v-for="level in [1, 2, 3] as const"
        :key="level"
        type="button"
        :aria-label="`見出し ${level}`"
        :aria-pressed="isActive('heading', { level })"
        @click="run((c) => c.toggleHeading({ level }))"
      >
        H{{ level }}
      </button>
      <button
        type="button"
        aria-label="箇条書き"
        :aria-pressed="isActive('bulletList')"
        @click="run((c) => c.toggleBulletList())"
      >
        •
      </button>
      <button
        type="button"
        aria-label="番号付きリスト"
        :aria-pressed="isActive('orderedList')"
        @click="run((c) => c.toggleOrderedList())"
      >
        1.
      </button>
      <button
        type="button"
        aria-label="引用"
        :aria-pressed="isActive('blockquote')"
        @click="run((c) => c.toggleBlockquote())"
      >
        引用
      </button>
      <button
        type="button"
        aria-label="コードブロック"
        :aria-pressed="isActive('codeBlock')"
        @click="run((c) => c.toggleCodeBlock())"
      >
        { }
      </button>
      <button
        type="button"
        aria-label="リンク"
        :aria-pressed="isActive('link')"
        @click="toggleLink"
      >
        リンク
      </button>
      <template v-if="allowImages">
        <button type="button" aria-label="画像を挿入" @click="fileInput?.click()">画像</button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="file-input"
          aria-label="挿入する画像"
          @change="onFileChange"
        />
      </template>
    </div>
    <div class="surface">
      <p v-if="placeholder && editor?.isEmpty" class="placeholder" aria-hidden="true">
        {{ placeholder }}
      </p>
      <EditorContent :editor="editor" />
    </div>
    <p v-if="toolError" class="error" role="alert">{{ toolError }}</p>
  </div>
</template>

<style scoped>
.rich-text-editor {
  border: 1px solid #ccc;
  border-radius: 4px;
}

.toolbar {
  display: flex;
  flex-wrap: wrap;
  gap: 2px;
  padding: 4px;
  border-bottom: 1px solid #ddd;
  background: #f7f7f7;
}

.toolbar button {
  min-width: 28px;
  padding: 2px 6px;
  border: 1px solid transparent;
  background: none;
  cursor: pointer;
  font: inherit;
}

.toolbar button[aria-pressed='true'] {
  border-color: #999;
  background: #e4e4e4;
}

.file-input {
  display: none;
}

.surface {
  position: relative;
  display: flex;
  flex-direction: column;
  min-height: 9em;
  overflow: auto;
  resize: vertical;
}

.placeholder {
  position: absolute;
  inset: 0;
  margin: 0;
  padding: 8px;
  color: #999;
  pointer-events: none;
}

/* EditorContent wraps the ProseMirror element in its own div, so both layers must stretch. */
.surface :deep(> div) {
  display: flex;
  flex: 1;
  flex-direction: column;
}

.surface :deep(.rich-text-input) {
  flex: 1;
  padding: 8px;
  outline: none;
}

.surface :deep(.rich-text-input p) {
  margin: 0 0 0.25em;
}

.surface :deep(.rich-text-input > :first-child) {
  margin-top: 0;
}

.surface :deep(.rich-text-input > :last-child) {
  margin-bottom: 0;
}

.surface :deep(img) {
  max-width: 100%;
  height: auto;
}

.surface :deep(img.ProseMirror-selectednode) {
  outline: 2px solid #1d4ed8;
}

.error {
  margin: 4px 8px;
  color: #c00;
}
</style>
