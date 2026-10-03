<script setup lang="ts">
import { ref } from 'vue';
import { errorMessage } from '../lib/api';
import { Button } from './ui/button';
import { Input } from './ui/input';

// Fallthrough attrs (e.g. data-testid) go to the form so tests can target the edit state only.
defineOptions({ inheritAttrs: false });

const props = withDefaults(
  defineProps<{
    title: string;
    editable: boolean;
    save: (title: string) => Promise<unknown>;
    errorMessages?: Partial<Record<string, string>>;
  }>(),
  { errorMessages: () => ({}) },
);

const editing = ref(false);
const draft = ref('');
const error = ref('');
const submitting = ref(false);

function startEditing() {
  draft.value = props.title;
  error.value = '';
  editing.value = true;
}

function cancel() {
  editing.value = false;
  error.value = '';
}

// preventDefault marks the Escape as handled so an enclosing panel does not also close.
function onKeydown(event: KeyboardEvent) {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  cancel();
}

async function submit() {
  const title = draft.value.trim();
  if (title === '' || submitting.value) return;
  submitting.value = true;
  error.value = '';
  try {
    await props.save(title);
    editing.value = false;
  } catch (e) {
    error.value = errorMessage(e, props.errorMessages, '保存に失敗しました');
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <form
    v-if="editing"
    class="flex flex-wrap items-center gap-2"
    v-bind="$attrs"
    @submit.prevent="submit"
  >
    <Input
      v-model="draft"
      type="text"
      required
      maxlength="200"
      aria-label="タイトル"
      class="min-w-0 flex-1"
      @keydown="onKeydown"
    />
    <Button type="submit" :disabled="submitting">保存</Button>
    <Button type="button" variant="outline" :disabled="submitting" @click="cancel">
      キャンセル
    </Button>
    <p v-if="error" class="basis-full text-destructive" role="alert">{{ error }}</p>
  </form>
  <div v-else class="flex items-start justify-between gap-3">
    <h2 class="min-w-0 text-2xl font-semibold sm:text-3xl tracking-tight wrap-anywhere">
      {{ title }}
    </h2>
    <Button
      v-if="editable"
      type="button"
      variant="outline"
      size="sm"
      class="mt-1 flex-none"
      @click="startEditing"
    >
      タイトルを編集
    </Button>
  </div>
</template>
