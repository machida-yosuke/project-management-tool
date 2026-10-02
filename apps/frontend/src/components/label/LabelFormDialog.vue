<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import {
  DEFAULT_LABEL_COLOR,
  LABEL_COLOR_PRESETS,
  LABEL_NAME_MAX_LENGTH,
  isLabelColor,
  normalizeLabelColor,
} from '@pm-tool/shared';
import { getListLabelsQueryKey, useCreateLabel, useUpdateLabel } from '../../api/generated';
import type { TaskLabel } from '../../api/generated/models';
import { errorMessage } from '../../lib/api';
import { listTasksKeyPrefix, useInvalidate } from '../../lib/query';
import { cn } from '../../lib/utils';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '../ui/dialog';
import { Input } from '../ui/input';
import { Label } from '../ui/label';
import TaskLabelPill from '../task/TaskLabelPill.vue';

const props = defineProps<{ projectId: string; label?: TaskLabel | null }>();
const open = defineModel<boolean>('open', { required: true });
const emit = defineEmits<{ saved: [label: TaskLabel] }>();

const LABEL_ERRORS = {
  label_name_taken: '同じ名前のラベルがあります',
  validation_error: `名前は1〜${LABEL_NAME_MAX_LENGTH}文字で入力してください`,
};

const invalidate = useInvalidate();
const name = ref('');
const color = ref(DEFAULT_LABEL_COLOR);
// Keeps the last valid color so the picker and preview stay put while the hex is being typed.
const appliedColor = ref(DEFAULT_LABEL_COLOR);
const error = ref('');
const saving = ref(false);

watch(open, (isOpen) => {
  if (!isOpen) return;
  name.value = props.label?.name ?? '';
  color.value = props.label?.color ?? DEFAULT_LABEL_COLOR;
  error.value = '';
});

watch(color, (value) => {
  if (isLabelColor(value)) appliedColor.value = normalizeLabelColor(value);
});

const colorValid = computed(() => isLabelColor(color.value));
const selectedPreset = computed(() => (colorValid.value ? normalizeLabelColor(color.value) : null));
const preview = computed(() => ({
  name: name.value.trim() || 'ラベル',
  color: appliedColor.value,
}));

const createLabelMutation = useCreateLabel({
  mutation: { onSuccess: (_, vars) => invalidate(getListLabelsQueryKey(vars.projectId)) },
});
// Tasks embed their label, so a rename or recolor must refetch them too.
const updateLabelMutation = useUpdateLabel({
  mutation: {
    onSuccess: (_, vars) =>
      invalidate(getListLabelsQueryKey(vars.projectId), listTasksKeyPrefix(vars.projectId)),
  },
});

function onPickColor(event: Event) {
  if (!(event.target instanceof HTMLInputElement)) return;
  color.value = event.target.value;
}

async function save() {
  if (saving.value || !colorValid.value) return;
  saving.value = true;
  error.value = '';
  const request = { name: name.value.trim(), color: normalizeLabelColor(color.value) };
  try {
    const saved = props.label
      ? await updateLabelMutation.mutateAsync({
          projectId: props.projectId,
          labelId: props.label.id,
          updateLabelRequest: request,
        })
      : await createLabelMutation.mutateAsync({
          projectId: props.projectId,
          createLabelRequest: request,
        });
    open.value = false;
    emit('saved', saved);
  } catch (e) {
    error.value = errorMessage(e, LABEL_ERRORS, '操作に失敗しました');
  } finally {
    saving.value = false;
  }
}

function onInteractOutside(event: Event) {
  if (saving.value) event.preventDefault();
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent @interact-outside="onInteractOutside">
      <DialogHeader>
        <DialogTitle>{{ label ? 'ラベルを編集' : 'ラベルを作成' }}</DialogTitle>
      </DialogHeader>
      <form class="grid gap-4" data-testid="label-form" @submit.prevent="save">
        <div class="grid gap-2">
          <Label for="label-name">名前</Label>
          <Input
            id="label-name"
            v-model="name"
            type="text"
            required
            :maxlength="LABEL_NAME_MAX_LENGTH"
            aria-label="ラベルの名前"
          />
        </div>
        <div class="grid gap-2">
          <Label for="label-color">色</Label>
          <div class="flex flex-wrap gap-2">
            <button
              v-for="preset in LABEL_COLOR_PRESETS"
              :key="preset"
              type="button"
              :class="
                cn(
                  'size-6 rounded-full outline-none focus-visible:ring-3 focus-visible:ring-ring/50',
                  selectedPreset === preset &&
                    'ring-2 ring-ring ring-offset-2 ring-offset-background',
                )
              "
              :style="{ backgroundColor: preset }"
              :aria-label="preset"
              :aria-pressed="selectedPreset === preset"
              @click="color = preset"
            />
          </div>
          <div class="flex items-center gap-2">
            <input
              type="color"
              class="h-9 w-12 flex-none cursor-pointer rounded-md border border-input bg-transparent p-1"
              :value="appliedColor"
              aria-label="カラーピッカー"
              @input="onPickColor"
            />
            <Input
              id="label-color"
              v-model="color"
              type="text"
              class="font-mono"
              :maxlength="7"
              placeholder="#e5484d"
              aria-label="カラーコード"
              :aria-invalid="!colorValid || undefined"
              :aria-describedby="colorValid ? undefined : 'label-color-error'"
            />
          </div>
          <p v-if="!colorValid" id="label-color-error" class="text-sm text-destructive">
            #rrggbb の形式で入力してください
          </p>
        </div>
        <div class="grid gap-2">
          <span class="text-sm font-medium">プレビュー</span>
          <div data-testid="label-preview">
            <TaskLabelPill :label="preview" />
          </div>
        </div>
        <p v-if="error" class="text-sm text-destructive" role="alert">{{ error }}</p>
        <DialogFooter>
          <Button type="submit" :disabled="saving || !colorValid">{{
            label ? '保存' : '作成'
          }}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
