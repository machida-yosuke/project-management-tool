import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { TaskComment } from '@pm-tool/shared';
import { useTasksStore } from '../../src/stores/tasks';
import { alice, bob, json, makeTask, noContent, stubApi } from '../helpers/api-mock';

function makeComment(overrides: Partial<TaskComment> = {}): TaskComment {
  return {
    id: 'c1',
    taskId: 't1',
    author: alice,
    body: 'hello',
    createdAt: '2026-09-02T00:00:00.000Z',
    ...overrides,
  };
}

describe('useTasksStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches tasks and resets selection when the project changes', async () => {
    const tasks = [makeTask({ projectId: 'p2' })];
    stubApi({ 'GET /api/projects/p2/tasks': json(tasks) });

    const store = useTasksStore();
    store.projectId = 'p1';
    store.selectedTaskId = 'old';
    store.comments = [makeComment()];
    await store.fetchTasks('p2');

    expect(store.tasks).toEqual(tasks);
    expect(store.selectedTaskId).toBeNull();
    expect(store.comments).toEqual([]);
  });

  it('creates, updates and deletes tasks', async () => {
    const created = makeTask();
    const updated = makeTask({ status: 'done', assignee: bob });
    const fetchMock = stubApi({
      'POST /api/projects/p1/tasks': () => json(created, 201),
      'PATCH /api/projects/p1/tasks/t1': () => json(updated),
      'DELETE /api/projects/p1/tasks/t1': noContent(),
    });

    const store = useTasksStore();
    await store.createTask('p1', { title: 'Write spec' });
    expect(store.tasks).toEqual([created]);

    await store.updateTask('p1', 't1', { status: 'done', assigneeId: bob.id });
    expect(store.tasks).toEqual([updated]);
    const [, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(patchInit.body as string)).toEqual({ status: 'done', assigneeId: bob.id });

    store.selectedTaskId = 't1';
    await store.deleteTask('p1', 't1');
    expect(store.tasks).toEqual([]);
    expect(store.selectedTaskId).toBeNull();
  });

  it('loads comments for the selected task and appends posted comments', async () => {
    const existing = makeComment();
    const posted = makeComment({ id: 'c2', body: 'reply', author: bob });
    stubApi({
      'GET /api/projects/p1/tasks/t1/comments': json([existing]),
      'POST /api/projects/p1/tasks/t1/comments': () => json(posted, 201),
    });

    const store = useTasksStore();
    store.tasks = [makeTask()];
    await store.selectTask('p1', 't1');

    expect(store.selectedTask?.id).toBe('t1');
    expect(store.comments).toEqual([existing]);

    await store.postComment('p1', 't1', 'reply');
    expect(store.comments).toEqual([existing, posted]);
  });

  it('ignores a stale comment response after another task was selected', async () => {
    let resolveFirst!: (res: Response) => void;
    const first = new Promise<Response>((resolve) => {
      resolveFirst = resolve;
    });
    const secondComments = [makeComment({ id: 'c-t2', taskId: 't2' })];
    stubApi({
      'GET /api/projects/p1/tasks/t1/comments': () => first,
      'GET /api/projects/p1/tasks/t2/comments': json(secondComments),
    });

    const store = useTasksStore();
    const pendingFirst = store.selectTask('p1', 't1');
    await store.selectTask('p1', 't2');
    resolveFirst(json([makeComment()]));
    await pendingFirst;

    expect(store.selectedTaskId).toBe('t2');
    expect(store.comments).toEqual(secondComments);
  });
});
