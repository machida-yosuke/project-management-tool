import type { TaskColor } from '@pm-tool/shared';

export const TASK_COLOR_HEX: Record<TaskColor, string> = {
  red: '#e5484d',
  orange: '#f76b15',
  yellow: '#d4a017',
  green: '#30a46c',
  teal: '#12a594',
  blue: '#3e63dd',
  purple: '#8e4ec6',
  gray: '#8b8d98',
};

export const TASK_COLOR_LABELS: Record<TaskColor, string> = {
  red: '赤',
  orange: '橙',
  yellow: '黄',
  green: '緑',
  teal: '青緑',
  blue: '青',
  purple: '紫',
  gray: '灰',
};
