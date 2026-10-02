import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { Label } from '../label';
import { Checkbox } from '.';

const meta = {
  component: Checkbox,
  args: { disabled: false },
  render: (args) => ({
    components: { Checkbox, Label },
    setup: () => ({ args, checked: ref<boolean | 'indeterminate'>(false) }),
    template: `
      <div class="flex items-center gap-2">
        <Checkbox id="checkbox-story" v-bind="args" v-model="checked" />
        <Label for="checkbox-story">完了</Label>
      </div>
    `,
  }),
} satisfies Meta<typeof Checkbox>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const Checked: Story = {
  render: (args) => ({
    components: { Checkbox, Label },
    setup: () => ({ args, checked: ref<boolean | 'indeterminate'>(true) }),
    template: `
      <div class="flex items-center gap-2">
        <Checkbox id="checkbox-story-checked" v-bind="args" v-model="checked" />
        <Label for="checkbox-story-checked">完了</Label>
      </div>
    `,
  }),
};

export const Disabled: Story = {
  args: { disabled: true },
};
