import { describe, expect, it } from 'vitest';
import { isRichTextDocEmpty, type RichTextDoc } from '@pm-tool/shared';
import {
  projectDescriptionTemplate,
  taskDescriptionTemplate,
} from '../../src/lib/rich-text-templates';

describe.each([
  [
    'projectDescriptionTemplate',
    projectDescriptionTemplate,
    [
      '・テストサイトの URL',
      '・資料・ファイルの置き場所（Google ドライブなど）',
      '・みんなに知っておいてほしいこと',
    ],
  ],
  [
    'taskDescriptionTemplate',
    taskDescriptionTemplate,
    ['・やること', '・今こうなっている・困っていること', '・やるとどうよくなるか'],
  ],
])('%s', (_name, template: () => RichTextDoc, headings: string[]) => {
  it('lists the headings in order', () => {
    const doc = template();
    const texts = doc.content
      .filter((node) => node.type === 'heading')
      .map((node) => node.content?.[0]?.text);
    expect(texts).toEqual(headings);
  });

  it('pairs each level 3 heading with an empty paragraph', () => {
    expect(template()).toEqual({
      type: 'doc',
      content: headings.flatMap((text) => [
        { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] },
        { type: 'paragraph' },
      ]),
    });
  });

  it('returns a fresh object on every call', () => {
    const first = template();
    const second = template();
    expect(second).not.toBe(first);
    expect(second.content).not.toBe(first.content);
    expect(second.content[0]).not.toBe(first.content[0]);
  });

  it('is not considered empty', () => {
    expect(isRichTextDocEmpty(template())).toBe(false);
  });
});
