import type { StorybookConfig } from '@storybook/vue3-vite';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// pnpm monorepos hoist nothing, so addons/frameworks must be resolved to absolute paths.
function getAbsolutePath(value: string) {
  return dirname(fileURLToPath(import.meta.resolve(`${value}/package.json`)));
}

const config: StorybookConfig = {
  stories: ['../src/**/*.mdx', '../src/**/*.stories.@(js|jsx|mjs|ts|tsx)'],
  addons: [getAbsolutePath('@storybook/addon-docs')],
  framework: getAbsolutePath('@storybook/vue3-vite'),
};

export default config;
