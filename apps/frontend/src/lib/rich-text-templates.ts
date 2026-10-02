import type { RichTextDoc } from '@pm-tool/shared';

function headingsTemplate(headings: readonly string[]): RichTextDoc {
  return {
    type: 'doc',
    content: headings.flatMap((text) => [
      { type: 'heading', attrs: { level: 3 }, content: [{ type: 'text', text }] },
      { type: 'paragraph' },
    ]),
  };
}

export function projectDescriptionTemplate(): RichTextDoc {
  return headingsTemplate([
    '・テストサイトの URL',
    '・資料・ファイルの置き場所（Google ドライブなど）',
    '・みんなに知っておいてほしいこと',
  ]);
}

export function taskDescriptionTemplate(): RichTextDoc {
  return headingsTemplate([
    '・やること',
    '・今こうなっている・困っていること',
    '・やるとどうよくなるか',
  ]);
}
