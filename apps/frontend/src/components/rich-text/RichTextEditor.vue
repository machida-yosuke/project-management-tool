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
import { Button } from '../ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Input } from '../ui/input';

const props = withDefaults(
  defineProps<{ label: string; placeholder?: string; allowImages?: boolean }>(),
  { placeholder: undefined, allowImages: true },
);
const doc = defineModel<RichTextDoc>('doc', { required: true });

const fileInput = ref<HTMLInputElement | null>(null);
const toolError = ref('');
const linkDialogOpen = ref(false);
const linkInput = ref('');
const linkError = ref('');
let lastEmitted: RichTextDoc | null = null;

const TOOL_CLASS =
  'h-7 min-w-7 border border-transparent px-1.5 font-normal aria-pressed:border-input aria-pressed:bg-accent aria-pressed:text-accent-foreground';

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
      class: 'rich-text-input rich-text flex-1 p-2 outline-none',
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
  linkInput.value = '';
  linkError.value = '';
  linkDialogOpen.value = true;
}

function insertLink() {
  const instance = editor.value;
  if (!instance) return;
  const href = linkInput.value.trim();
  if (!isHttpUrl(href)) {
    linkError.value = 'リンクは http:// か https:// で始まる URL にしてください';
    return;
  }
  linkDialogOpen.value = false;
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

// Reka returns focus to the toolbar button on close; send it back to the editor instead.
function onLinkDialogCloseAutoFocus(event: Event) {
  event.preventDefault();
  editor.value?.commands.focus();
}

function isActive(name: string, attrs?: Record<string, unknown>) {
  return editor.value?.isActive(name, attrs) ? 'true' : 'false';
}
</script>

<template>
  <div class="rounded-md border border-input">
    <div
      v-if="editor"
      class="flex flex-wrap gap-0.5 border-b border-border bg-muted/50 p-1"
      role="toolbar"
      :aria-label="`${label} の書式`"
    >
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="太字"
        :aria-pressed="isActive('bold')"
        @click="run((c) => c.toggleBold())"
      >
        <b>B</b>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="斜体"
        :aria-pressed="isActive('italic')"
        @click="run((c) => c.toggleItalic())"
      >
        <i>I</i>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="打消し線"
        :aria-pressed="isActive('strike')"
        @click="run((c) => c.toggleStrike())"
      >
        <s>S</s>
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="コード"
        :aria-pressed="isActive('code')"
        @click="run((c) => c.toggleCode())"
      >
        &lt;/&gt;
      </Button>
      <Button
        v-for="level in [1, 2, 3] as const"
        :key="level"
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        :aria-label="`見出し ${level}`"
        :aria-pressed="isActive('heading', { level })"
        @click="run((c) => c.toggleHeading({ level }))"
      >
        H{{ level }}
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="箇条書き"
        :aria-pressed="isActive('bulletList')"
        @click="run((c) => c.toggleBulletList())"
      >
        •
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="番号付きリスト"
        :aria-pressed="isActive('orderedList')"
        @click="run((c) => c.toggleOrderedList())"
      >
        1.
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="引用"
        :aria-pressed="isActive('blockquote')"
        @click="run((c) => c.toggleBlockquote())"
      >
        引用
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="コードブロック"
        :aria-pressed="isActive('codeBlock')"
        @click="run((c) => c.toggleCodeBlock())"
      >
        { }
      </Button>
      <Button
        variant="ghost"
        size="sm"
        :class="TOOL_CLASS"
        type="button"
        aria-label="リンク"
        :aria-pressed="isActive('link')"
        @click="toggleLink"
      >
        リンク
      </Button>
      <template v-if="allowImages">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          :class="TOOL_CLASS"
          aria-label="画像を挿入"
          @click="fileInput?.click()"
        >
          画像
        </Button>
        <input
          ref="fileInput"
          type="file"
          accept="image/*"
          class="hidden"
          aria-label="挿入する画像"
          @change="onFileChange"
        />
      </template>
    </div>
    <div class="relative flex min-h-[9em] resize-y flex-col overflow-auto">
      <p
        v-if="placeholder && editor?.isEmpty"
        class="placeholder pointer-events-none absolute inset-0 p-2 text-muted-foreground"
        aria-hidden="true"
      >
        {{ placeholder }}
      </p>
      <EditorContent class="flex flex-1 flex-col" :editor="editor" />
    </div>
    <p v-if="toolError" class="mx-2 my-1 text-destructive" role="alert">{{ toolError }}</p>
    <Dialog v-model:open="linkDialogOpen">
      <DialogContent class="sm:max-w-md" @close-auto-focus="onLinkDialogCloseAutoFocus">
        <DialogHeader>
          <DialogTitle>リンクを挿入</DialogTitle>
          <DialogDescription>リンク先の URL を入力してください</DialogDescription>
        </DialogHeader>
        <form class="space-y-4" data-testid="link-form" @submit.prevent="insertLink">
          <Input
            v-model="linkInput"
            type="text"
            inputmode="url"
            placeholder="https://"
            aria-label="リンク先の URL"
            :aria-invalid="linkError ? 'true' : undefined"
          />
          <p v-if="linkError" class="text-sm text-destructive" role="alert">{{ linkError }}</p>
          <DialogFooter>
            <Button type="button" variant="outline" @click="linkDialogOpen = false">
              キャンセル
            </Button>
            <Button type="submit">挿入</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
