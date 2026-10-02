import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Input } from '.';

const meta = {
  component: Input,
  render: (args) => ({
    components: { Input },
    setup: () => ({ args, value: ref(args.modelValue ?? '') }),
    template: '<Input v-bind="args" v-model="value" class="w-64" />',
  }),
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithPlaceholder: Story = {
  render: () => ({
    components: { Input },
    template: '<Input placeholder="プロジェクト名" class="w-64" />',
  }),
};

export const Invalid: Story = {
  render: () => ({
    components: { Input },
    template: '<Input model-value="不正な値" aria-invalid="true" class="w-64" />',
  }),
};

export const Disabled: Story = {
  render: () => ({
    components: { Input },
    template: '<Input model-value="編集できません" disabled class="w-64" />',
  }),
};
