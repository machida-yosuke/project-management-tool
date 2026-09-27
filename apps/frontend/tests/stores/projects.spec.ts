import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useProjectsStore } from '../../src/stores/projects';
import { json, makeProject, stubApi } from '../helpers/api-mock';

describe('useProjectsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches the project list', async () => {
    const projects = [makeProject(), makeProject({ id: 'p2', name: 'Two' })];
    stubApi({ 'GET /api/projects': json(projects) });

    const store = useProjectsStore();
    await store.fetchProjects();

    expect(store.projects).toEqual(projects);
  });

  it('creates a project and appends it to the list', async () => {
    const created = makeProject({ id: 'p9', name: 'New' });
    const fetchMock = stubApi({ 'POST /api/projects': () => json(created, 201) });

    const store = useProjectsStore();
    const result = await store.createProject({ name: 'New', description: '' });

    expect(result).toEqual(created);
    expect(store.projects).toEqual([created]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ name: 'New', description: '' });
  });

  it('fetches the current project and updates the matching list entry', async () => {
    const stale = makeProject({ name: 'Old' });
    const fresh = makeProject({ name: 'Fresh' });
    stubApi({ 'GET /api/projects/p1': json(fresh) });

    const store = useProjectsStore();
    store.projects = [stale];
    await store.fetchProject('p1');

    expect(store.current).toEqual(fresh);
    expect(store.projects).toEqual([fresh]);
  });

  it('clears current when switching to another project fails', async () => {
    stubApi({ 'GET /api/projects/p2': json({ error: 'not_found' }, 404) });

    const store = useProjectsStore();
    store.current = makeProject();

    await expect(store.fetchProject('p2')).rejects.toMatchObject({ status: 404 });
    expect(store.current).toBeNull();
  });
});
