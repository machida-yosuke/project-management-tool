<script setup lang="ts">
import { computed } from 'vue';
import { generateHTML } from '@tiptap/vue-3';
import type { RichTextDoc } from '@pm-tool/shared';
import { createRichTextExtensions } from '../../lib/rich-text-extensions';

const props = defineProps<{ doc: RichTextDoc }>();

const extensions = createRichTextExtensions();

// Safe for v-html: the schema only serializes whitelisted nodes/marks, and Link blanks non-http(s) hrefs.
const html = computed(() => generateHTML(props.doc, extensions));
</script>

<template>
  <!-- eslint-disable-next-line vue/no-v-html -->
  <div class="rich-text-content" v-html="html" />
</template>

<style scoped>
.rich-text-content {
  overflow-wrap: anywhere;
}

.rich-text-content :deep(> :first-child) {
  margin-top: 0;
}

.rich-text-content :deep(> :last-child) {
  margin-bottom: 0;
}

.rich-text-content :deep(img) {
  max-width: 100%;
  height: auto;
}

.rich-text-content :deep(pre) {
  padding: 8px;
  overflow-x: auto;
  background: #f4f4f4;
}

.rich-text-content :deep(blockquote) {
  margin-left: 0;
  padding-left: 12px;
  border-left: 3px solid #ddd;
  color: #555;
}
</style>
