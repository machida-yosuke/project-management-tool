import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useInvitationsStore } from '../../src/stores/invitations';
import { json, makeInvitation, makeProject, stubApi } from '../helpers/api-mock';

describe('useInvitationsStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches invitations addressed to the current user', async () => {
    const invitations = [makeInvitation()];
    stubApi({ 'GET /api/invitations': json(invitations) });

    const store = useInvitationsStore();
    await store.fetchMine();

    expect(store.invitations).toEqual(invitations);
  });

  it('accepts an invitation with a passcode and removes it from the list', async () => {
    const project = makeProject({ id: 'p2', role: 'staff' });
    const fetchMock = stubApi({ 'POST /api/invitations/inv1/accept': () => json(project) });

    const store = useInvitationsStore();
    store.invitations = [makeInvitation()];
    const result = await store.accept('inv1', 'secret');

    expect(result).toEqual(project);
    expect(store.invitations).toEqual([]);
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(JSON.parse(init.body as string)).toEqual({ passcode: 'secret' });
  });

  it('keeps the invitation when the passcode is wrong', async () => {
    stubApi({ 'POST /api/invitations/inv1/accept': json({ error: 'invalid_passcode' }, 400) });

    const store = useInvitationsStore();
    store.invitations = [makeInvitation()];

    await expect(store.accept('inv1', 'nope')).rejects.toMatchObject({
      error: 'invalid_passcode',
    });
    expect(store.invitations).toHaveLength(1);
  });
});
