<script setup lang="ts">
import { computed, ref } from 'vue';
import { emptyRichTextDoc, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { errorMessage } from '../../lib/api';
import { useDraft } from '../../lib/drafts';
import { prepareErrorMessage, prepareRichTextDoc } from '../../lib/rich-text-upload';
import { Button } from '../ui/button';
import RichTextEditor from './RichTextEditor.vue';

const props = withDefaults(
  defineProps<{
    projectId: string | null;
    draftKey: string;
    initialDoc: RichTextDoc;
    label: string;
    submitLabel: string;
    submit: (doc: RichTextDoc) => Promise<unknown>;
    placeholder?: string;
    cancelable?: boolean;
    allowEmpty?: boolean;
    errorMessages?: Partial<Record<string, string>>;
    submitErrorFallback?: string;
  }>(),
  {
    placeholder: undefined,
    cancelable: false,
    allowEmpty: false,
    errorMessages: () => ({}),
    submitErrorFallback: '保存に失敗しました',
  },
);

const emit = defineEmits<{ submitted: []; cancel: [] }>();

// The draft key is fixed per instance; callers re-key the component when the target changes.
const { doc, quotaExceeded, discard } = useDraft(props.draftKey, () => props.initialDoc);
const error = ref('');
const submitting = ref(false);
const blocked = computed(() => !props.allowEmpty && isRichTextDocEmpty(doc.value));

async function onSubmit() {
  if (blocked.value || submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    const prepared = await prepareRichTextDoc(props.projectId, doc.value);
    if (prepared.draft !== doc.value) doc.value = prepared.draft;
    if (!prepared.ok) {
      error.value = prepareErrorMessage(prepared.error);
      return;
    }
    try {
      await props.submit(prepared.doc);
    } catch (e) {
      error.value = errorMessage(e, props.errorMessages, props.submitErrorFallback);
      return;
    }
    discard();
    if (!props.cancelable) doc.value = emptyRichTextDoc();
    emit('submitted');
  } finally {
    submitting.value = false;
  }
}

function onCancel() {
  discard();
  emit('cancel');
}
</script>

<template>
  <form class="flex flex-col gap-2" @submit.prevent="onSubmit">
    <slot />
    <RichTextEditor
      v-model:doc="doc"
      :label="label"
      :placeholder="placeholder"
      :allow-images="projectId !== null"
    />
    <p v-if="quotaExceeded" class="text-destructive" role="alert">
      下書きを保存できません。画像を減らしてください
    </p>
    <p v-if="error" class="text-destructive" role="alert">{{ error }}</p>
    <!-- With extra actions the footer is right-aligned and they lead, as in GitHub's comment box. -->
    <div class="flex gap-2" :class="{ 'justify-end': $slots.actions }">
      <slot name="actions" />
      <Button type="submit" size="sm" :disabled="blocked || submitting">{{ submitLabel }}</Button>
      <Button
        v-if="cancelable"
        type="button"
        variant="outline"
        size="sm"
        :disabled="submitting"
        @click="onCancel"
      >
        キャンセル
      </Button>
    </div>
  </form>
</template>
