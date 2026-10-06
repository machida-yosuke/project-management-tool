import type { Meta, StoryObj } from '@storybook/vue3-vite';
import { ref } from 'vue';
import { emptyRichTextDoc } from '@pm-tool/shared';
import RichTextEditor from './RichTextEditor.vue';

const meta = {
  component: RichTextEditor,
  args: { label: '本文', placeholder: '本文を入力', doc: emptyRichTextDoc() },
  render: (args) => ({
    components: { RichTextEditor },
    setup: () => ({ args, doc: ref(args.doc) }),
    template: '<RichTextEditor v-bind="args" v-model:doc="doc" />',
  }),
} satisfies Meta<typeof RichTextEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {};

export const WithoutImages: Story = {
  args: { allowImages: false },
};
