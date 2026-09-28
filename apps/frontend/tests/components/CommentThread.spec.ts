import { PiniaColada } from '@pinia/colada';
import { flushPromises, mount } from '@vue/test-utils';
import { createPinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { plainTextToRichTextDoc, type TaskComment } from '@pm-tool/shared';
import CommentThread from '../../src/components/CommentThread.vue';
import { alice, bob, json, stubApi } from '../helpers/api-mock';
import { editorFor, replaceContent, typeInto } from '../helpers/rich-text';

function makeComment(overrides: Partial<TaskComment> = {}): TaskComment {
  return {
    id: 'c1',
    taskId: 't1',
    author: bob,
    body: plainTextToRichTextDoc('Looks good'),
    createdAt: '2026-09-02T00:00:00.000Z',
    editedAt: null,
    ...overrides,
  };
}

async function mountThread(
  comments: TaskComment[],
  props: Partial<{ editable: boolean; currentUserId: string | null }> = {},
) {
  const wrapper = mount(CommentThread, {
    props: {
      projectId: 'p1',
      taskId: 't1',
      comments,
      commentsError: '',
      editable: true,
      currentUserId: alice.id,
      ...props,
    },
    global: { plugins: [createPinia(), PiniaColada] },
    attachTo: document.body,
  });
  await flushPromises();
  return wrapper;
}

function buttons(scope: { findAll: (s: string) => { text: () => string }[] }) {
  return scope.findAll('button').map((b) => b.text());
}

describe('CommentThread', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('renders each comment body as rich text', async () => {
    const wrapper = await mountThread([
      makeComment({
        body: {
          type: 'doc',
          content: [
            {
              type: 'paragraph',
              content: [
                { type: 'text', text: 'Bold', marks: [{ type: 'bold' }] },
                { type: 'text', text: ' see ' },
                {
                  type: 'text',
                  text: 'docs',
                  marks: [{ type: 'link', attrs: { href: 'https://example.com' } }],
                },
                {
                  type: 'image',
                  attrs: {
                    src: '/api/projects/p1/attachments/00000000-0000-0000-0000-000000000000',
                  },
                },
              ],
            },
          ],
        },
      }),
    ]);

    const body = wrapper.get('[data-testid="comment"] .comment-body');
    expect(body.get('strong').text()).toBe('Bold');
    const link = body.get('a');
    expect(link.attributes()).toMatchObject({
      href: 'https://example.com',
      target: '_blank',
      rel: 'noopener noreferrer',
    });
    expect(body.get('img').attributes('src')).toBe(
      'https://localhost:8787/api/projects/p1/attachments/00000000-0000-0000-0000-000000000000',
    );
  });

  it('shows nothing but the form when there are no comments', async () => {
    const wrapper = await mountThread([]);

    expect(wrapper.findAll('[data-testid="comment"]')).toHaveLength(0);
    expect(wrapper.text()).not.toContain('コメントはありません');
    expect(wrapper.get('h2').text()).toBe('コメントする');
    expect(wrapper.get('[data-testid="create-comment"] button[type="submit"]').text()).toBe(
      'コメント',
    );
  });

  it('renders extra form actions only alongside the new comment form', () => {
    const slots = { 'form-actions': '<button type="button">完了にする</button>' };
    const editable = mount(CommentThread, {
      props: {
        projectId: 'p1',
        taskId: 't1',
        comments: [],
        commentsError: '',
        editable: true,
        currentUserId: alice.id,
      },
      slots,
      global: { plugins: [createPinia(), PiniaColada] },
    });
    expect(buttons(editable)).toContain('完了にする');
    const footer = editable.get('[data-testid="create-comment"] button[type="submit"]').element
      .parentElement!;
    expect(footer.classList).toContain('justify-end');
    expect([...footer.children].map((el) => el.textContent?.trim())).toEqual([
      '完了にする',
      'コメント',
    ]);

    const readOnly = mount(CommentThread, {
      props: {
        projectId: 'p1',
        taskId: 't1',
        comments: [],
        commentsError: '',
        editable: false,
        currentUserId: alice.id,
      },
      slots,
      global: { plugins: [createPinia(), PiniaColada] },
    });
    expect(buttons(readOnly)).not.toContain('完了にする');
  });

  it('marks edited comments', async () => {
    const wrapper = await mountThread([
      makeComment(),
      makeComment({ id: 'c2', editedAt: '2026-09-03T00:00:00.000Z' }),
    ]);

    const [first, second] = wrapper.findAll('[data-testid="comment"]');
    expect(first?.find('[data-testid="comment-edited"]').exists()).toBe(false);
    expect(second?.get('[data-testid="comment-edited"]').text()).toBe('編集済み');
  });

  it('offers editing only on the current user’s comments when editable', async () => {
    const comments = [makeComment(), makeComment({ id: 'c2', author: alice })];

    const own = await mountThread(comments);
    const [bobs, alices] = own.findAll('[data-testid="comment"]');
    expect(bobs && buttons(bobs)).not.toContain('編集');
    expect(alices && buttons(alices)).toContain('編集');

    const readOnly = await mountThread(comments, { editable: false });
    expect(buttons(readOnly)).not.toContain('編集');
    expect(readOnly.find('[data-testid="create-comment"]').exists()).toBe(false);
  });

  it('edits a comment, sends a PATCH and clears the draft', async () => {
    const requests = stubApi({
      'PATCH /api/projects/p1/tasks/t1/comments/c2': (body) =>
        json(makeComment({ id: 'c2', author: alice, ...(body as Pick<TaskComment, 'body'>) })),
    });
    const wrapper = await mountThread([makeComment({ id: 'c2', author: alice })]);

    const comment = wrapper.get('[data-testid="comment"]');
    const edit = comment.findAll('button').find((b) => b.text() === '編集');
    await edit?.trigger('click');
    expect(editorFor(comment, 'コメントを編集').getText()).toBe('Looks good');

    await replaceContent(comment, 'コメントを編集', 'Updated');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(localStorage.getItem('draft:t1:comment:c2')).toContain('Updated');

    await comment.get('form').trigger('submit');
    await flushPromises();

    const patch = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'PATCH');
    expect(patch?.body).toEqual({ body: plainTextToRichTextDoc('Updated') });
    expect(localStorage.getItem('draft:t1:comment:c2')).toBeNull();
    expect(comment.find('form').exists()).toBe(false);
  });

  it('discards the edit draft on cancel', async () => {
    const wrapper = await mountThread([makeComment({ author: alice })]);
    const comment = wrapper.get('[data-testid="comment"]');
    await comment
      .findAll('button')
      .find((b) => b.text() === '編集')
      ?.trigger('click');
    await typeInto(comment, 'コメントを編集', ' more');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(localStorage.getItem('draft:t1:comment:c1')).not.toBeNull();

    await comment
      .findAll('button')
      .find((b) => b.text() === '取消')
      ?.trigger('click');

    expect(localStorage.getItem('draft:t1:comment:c1')).toBeNull();
    expect(comment.find('form').exists()).toBe(false);
  });

  it('posts a new comment, sends a POST and clears the draft', async () => {
    const requests = stubApi({
      'POST /api/projects/p1/tasks/t1/comments': json(makeComment({ id: 'c2' }), 201),
    });
    const wrapper = await mountThread([]);
    const form = wrapper.get('[data-testid="create-comment"]');
    expect(form.get('button[type="submit"]').attributes('disabled')).toBeDefined();

    await typeInto(form, 'コメント', 'Thanks');
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect(localStorage.getItem('draft:t1:comment:new')).toContain('Thanks');

    await form.trigger('submit');
    await flushPromises();

    const post = requests.mock.calls.map(([req]) => req).find((req) => req.method === 'POST');
    expect(post?.body).toEqual({ body: plainTextToRichTextDoc('Thanks') });
    expect(localStorage.getItem('draft:t1:comment:new')).toBeNull();
    expect(editorFor(form, 'コメント').isEmpty).toBe(true);
  });

  it('restores a saved draft into the new comment editor', async () => {
    localStorage.setItem(
      'draft:t1:comment:new',
      JSON.stringify(plainTextToRichTextDoc('Half written')),
    );

    const wrapper = await mountThread([]);

    expect(editorFor(wrapper.get('[data-testid="create-comment"]'), 'コメント').getText()).toBe(
      'Half written',
    );
  });

  it('keeps the draft and shows the error when posting fails', async () => {
    stubApi({
      'POST /api/projects/p1/tasks/t1/comments': json({ error: 'validation_error' }, 400),
    });
    const wrapper = await mountThread([]);
    const form = wrapper.get('[data-testid="create-comment"]');

    await typeInto(form, 'コメント', 'Thanks');
    await form.trigger('submit');
    await flushPromises();

    expect(form.get('[role="alert"]').text()).toBe('コメントが空か、大きすぎます');
    expect(editorFor(form, 'コメント').getText()).toBe('Thanks');
  });
});
