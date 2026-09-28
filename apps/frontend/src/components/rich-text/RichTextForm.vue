<script setup lang="ts">
import { computed, ref } from 'vue';
import { emptyRichTextDoc, isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import { errorMessage } from '../../lib/api';
import { useDraft } from '../../lib/drafts';
import { prepareErrorMessage, prepareRichTextDoc } from '../../lib/rich-text-upload';
import RichTextEditor from './RichTextEditor.vue';

const props = withDefaults(
  defineProps<{
    projectId: string;
    draftKey: string;
    initialDoc: RichTextDoc;
    label: string;
    submitLabel: string;
    submit: (doc: RichTextDoc) => Promise<unknown>;
    placeholder?: string;
    cancelable?: boolean;
    errorMessages?: Partial<Record<string, string>>;
  }>(),
  { placeholder: undefined, cancelable: false, errorMessages: () => ({}) },
);

const emit = defineEmits<{ submitted: []; cancel: [] }>();

// The draft key is fixed per instance; callers re-key the component when the target changes.
const { doc, quotaExceeded, discard } = useDraft(props.draftKey, () => props.initialDoc);
const error = ref('');
const submitting = ref(false);
const empty = computed(() => isRichTextDocEmpty(doc.value));

async function onSubmit() {
  if (empty.value || submitting.value) return;
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
      error.value = errorMessage(e, props.errorMessages, '保存に失敗しました');
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
  <form class="rich-text-form" @submit.prevent="onSubmit">
    <RichTextEditor v-model:doc="doc" :label="label" :placeholder="placeholder" />
    <p v-if="quotaExceeded" class="error" role="alert">
      下書きを保存できません。画像を減らしてください
    </p>
    <p v-if="error" class="error" role="alert">{{ error }}</p>
    <div class="actions">
      <button type="submit" :disabled="empty || submitting">{{ submitLabel }}</button>
      <button v-if="cancelable" type="button" :disabled="submitting" @click="onCancel">取消</button>
    </div>
  </form>
</template>

<style scoped>
.rich-text-form {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.actions {
  display: flex;
  gap: 8px;
}

.error {
  margin: 0;
  color: #c00;
}
</style>
