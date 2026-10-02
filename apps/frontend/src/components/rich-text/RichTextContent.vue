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
  <div class="rich-text wrap-anywhere" v-html="html" />
</template>
