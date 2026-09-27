import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMembersStore } from '../../src/stores/members';
import {
  alice,
  bob,
  json,
  makeInvitation,
  makeMember,
  noContent,
  stubApi,
} from '../helpers/api-mock';

describe('useMembersStore', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('fetches members, changes a role and removes a member', async () => {
    const owner = makeMember(alice, { role: 'admin', isOwner: true });
    const member = makeMember(bob);
    const promoted = makeMember(bob, { role: 'admin' });
    const fetchMock = stubApi({
      'GET /api/projects/p1/members': json([owner, member]),
      'PATCH /api/projects/p1/members/u-bob': () => json(promoted),
      'DELETE /api/projects/p1/members/u-bob': noContent(),
    });

    const store = useMembersStore();
    await store.fetchMembers('p1');
    expect(store.members).toEqual([owner, member]);

    await store.updateRole('p1', bob.id, 'admin');
    expect(store.members).toEqual([owner, promoted]);
    const [, patchInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(patchInit.body as string)).toEqual({ role: 'admin' });

    await store.removeMember('p1', bob.id);
    expect(store.members).toEqual([owner]);
  });

  it('creates an invitation, replacing a pending one for the same email, and deletes it', async () => {
    const previous = makeInvitation({ id: 'old', projectId: 'p1' });
    const created = makeInvitation({ id: 'new', projectId: 'p1', role: 'substaff' });
    const fetchMock = stubApi({
      'GET /api/projects/p1/invitations': json([previous]),
      'POST /api/projects/p1/invitations': () => json(created, 201),
      'DELETE /api/projects/p1/invitations/new': noContent(),
    });

    const store = useMembersStore();
    await store.fetchInvitations('p1');
    await store.createInvitation('p1', { email: bob.email, role: 'substaff', passcode: '1234' });

    expect(store.invitations).toEqual([created]);
    const [, postInit] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(JSON.parse(postInit.body as string)).toEqual({
      email: bob.email,
      role: 'substaff',
      passcode: '1234',
    });

    await store.deleteInvitation('p1', 'new');
    expect(store.invitations).toEqual([]);
  });

  it('propagates already_member errors from invitation creation', async () => {
    stubApi({ 'POST /api/projects/p1/invitations': json({ error: 'already_member' }, 409) });

    const store = useMembersStore();

    await expect(
      store.createInvitation('p1', { email: bob.email, role: 'staff', passcode: '1234' }),
    ).rejects.toMatchObject({ status: 409, error: 'already_member' });
    expect(store.invitations).toEqual([]);
  });
});
