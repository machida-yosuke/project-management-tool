<script setup lang="ts">
import { computed, ref, watch, type Component } from 'vue';
import { EditorContent, useEditor, type Editor } from '@tiptap/vue-3';
import { Fragment, Slice, type Node as ProseMirrorNode } from '@tiptap/pm/model';
import type { EditorView } from '@tiptap/pm/view';
import {
  Bold,
  ChevronDown,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Image as ImageIcon,
  Italic,
  Link as LinkIcon,
  List,
  ListOrdered,
  Pilcrow,
  SquareCode,
  Strikethrough,
  TextQuote,
} from '@lucide/vue';
import type { RichTextDoc } from '@pm-tool/shared';
import { eventFile } from '../../lib/form';
import { ATTACHMENT_HELP } from '../../lib/help-texts';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';
import { Input } from '../ui/input';
import { Separator } from '../ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

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
  'h-7 min-w-7 border border-transparent px-1.5 aria-pressed:border-input aria-pressed:bg-accent aria-pressed:text-accent-foreground';

type Chain = ReturnType<Editor['chain']>;

interface BlockStyle {
  label: string;
  icon: Component;
  level?: 1 | 2 | 3;
  apply: (chain: Chain) => Chain;
}

const PARAGRAPH_STYLE: BlockStyle = {
  label: '本文',
  icon: Pilcrow,
  apply: (c) => c.setParagraph(),
};

const BLOCK_STYLES: BlockStyle[] = [
  PARAGRAPH_STYLE,
  { label: '見出し 1', icon: Heading1, level: 1, apply: (c) => c.setHeading({ level: 1 }) },
  { label: '見出し 2', icon: Heading2, level: 2, apply: (c) => c.setHeading({ level: 2 }) },
  { label: '見出し 3', icon: Heading3, level: 3, apply: (c) => c.setHeading({ level: 3 }) },
];

interface Tool {
  label: string;
  shortcut: string;
  icon: Component;
  mark: string;
  apply: (chain: Chain) => Chain;
}

// Shortcuts mirror the StarterKit defaults so the tooltip matches what the editor actually does.
const TOOL_GROUPS: Tool[][] = [
  [
    { label: '太字', shortcut: '⌘B', icon: Bold, mark: 'bold', apply: (c) => c.toggleBold() },
    { label: '斜体', shortcut: '⌘I', icon: Italic, mark: 'italic', apply: (c) => c.toggleItalic() },
    {
      label: '打消し線',
      shortcut: '⌘⇧S',
      icon: Strikethrough,
      mark: 'strike',
      apply: (c) => c.toggleStrike(),
    },
    { label: 'コード', shortcut: '⌘E', icon: Code, mark: 'code', apply: (c) => c.toggleCode() },
  ],
  [
    {
      label: '箇条書き',
      shortcut: '⌘⇧8',
      icon: List,
      mark: 'bulletList',
      apply: (c) => c.toggleBulletList(),
    },
    {
      label: '番号付きリスト',
      shortcut: '⌘⇧7',
      icon: ListOrdered,
      mark: 'orderedList',
      apply: (c) => c.toggleOrderedList(),
    },
    {
      label: '引用',
      shortcut: '⌘⇧B',
      icon: TextQuote,
      mark: 'blockquote',
      apply: (c) => c.toggleBlockquote(),
    },
    {
      label: 'コードブロック',
      shortcut: '⌘⌥C',
      icon: SquareCode,
      mark: 'codeBlock',
      apply: (c) => c.toggleCodeBlock(),
    },
  ],
];

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
    handleKeyDown: (_view, event) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== 'k') return false;
      event.preventDefault();
      toggleLink();
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

function run(command: (chain: Chain) => Chain) {
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
function returnFocusToEditor(event: Event) {
  event.preventDefault();
  editor.value?.commands.focus();
}

function isActive(name: string) {
  return editor.value?.isActive(name) ? 'true' : 'false';
}

const currentBlockStyle = computed(() => {
  const instance = editor.value;
  const heading = instance
    ? BLOCK_STYLES.find(
        (style) => style.level && instance.isActive('heading', { level: style.level }),
      )
    : undefined;
  return heading ?? PARAGRAPH_STYLE;
});
</script>

<template>
  <div class="rounded-md border border-input">
    <TooltipProvider v-if="editor" :delay-duration="300">
      <div
        class="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/50 p-1"
        role="toolbar"
        :aria-label="`${label} の書式`"
      >
        <!-- No Tooltip here: a TooltipTrigger between the menu root and its trigger steals the popper anchor, leaving the menu positioned off-screen. -->
        <DropdownMenu>
          <DropdownMenuTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              :class="TOOL_CLASS"
              type="button"
              aria-label="段落スタイル"
              title="段落スタイル"
            >
              <component :is="currentBlockStyle.icon" class="size-4" />
              <span class="hidden sm:inline">{{ currentBlockStyle.label }}</span>
              <ChevronDown class="size-4 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" @close-auto-focus="returnFocusToEditor">
            <DropdownMenuItem
              v-for="style in BLOCK_STYLES"
              :key="style.label"
              @select="run(style.apply)"
            >
              <component :is="style.icon" class="size-4" />
              {{ style.label }}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <template v-for="group in TOOL_GROUPS" :key="group[0]?.label">
          <Separator orientation="vertical" class="mx-1 data-[orientation=vertical]:h-5" />
          <Tooltip v-for="tool in group" :key="tool.label">
            <TooltipTrigger as-child>
              <Button
                variant="ghost"
                size="sm"
                :class="TOOL_CLASS"
                type="button"
                :aria-label="tool.label"
                :aria-pressed="isActive(tool.mark)"
                @click="run(tool.apply)"
              >
                <component :is="tool.icon" class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {{ tool.label }}
              <kbd class="ml-1 text-primary-foreground/70">{{ tool.shortcut }}</kbd>
            </TooltipContent>
          </Tooltip>
        </template>
        <Separator orientation="vertical" class="mx-1 data-[orientation=vertical]:h-5" />
        <Tooltip>
          <TooltipTrigger as-child>
            <Button
              variant="ghost"
              size="sm"
              :class="TOOL_CLASS"
              type="button"
              aria-label="リンク"
              :aria-pressed="isActive('link')"
              @click="toggleLink"
            >
              <LinkIcon class="size-4" />
            </Button>
          </TooltipTrigger>
          <TooltipContent
            >リンク <kbd class="ml-1 text-primary-foreground/70">⌘K</kbd></TooltipContent
          >
        </Tooltip>
        <template v-if="allowImages">
          <Tooltip>
            <TooltipTrigger as-child>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                :class="TOOL_CLASS"
                aria-label="画像を挿入"
                @click="fileInput?.click()"
              >
                <ImageIcon class="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>画像を挿入</TooltipContent>
          </Tooltip>
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
    </TooltipProvider>
    <!-- Inside a dialog the editor is capped so long content scrolls here instead of pushing the dialog off-screen. -->
    <div
      class="relative flex min-h-[9em] resize-y flex-col overflow-auto wrap-anywhere in-data-[slot=dialog-content]:max-h-[50svh]"
    >
      <p
        v-if="placeholder && editor?.isEmpty"
        class="placeholder pointer-events-none absolute inset-0 p-2 text-muted-foreground"
        aria-hidden="true"
      >
        {{ placeholder }}
      </p>
      <EditorContent class="flex flex-1 flex-col" :editor="editor" />
    </div>
    <p v-if="allowImages" class="mx-2 my-1 text-xs font-medium text-destructive">
      {{ ATTACHMENT_HELP }}
    </p>
    <p v-if="toolError" class="mx-2 my-1 text-destructive" role="alert">{{ toolError }}</p>
    <Dialog v-model:open="linkDialogOpen">
      <DialogContent class="sm:max-w-md" @close-auto-focus="returnFocusToEditor">
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
