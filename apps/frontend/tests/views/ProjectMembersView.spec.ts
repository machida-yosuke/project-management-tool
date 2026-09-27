import { flushPromises } from '@vue/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { UserSummary } from '@pm-tool/shared';
import ProjectMembersView from '../../src/views/ProjectMembersView.vue';
import {
  alice,
  bob,
  json,
  makeInvitation,
  makeMember,
  makeProject,
  noContent,
  stubApi,
} from '../helpers/api-mock';
import { inputValue, mountAt } from '../helpers/mount';

const carol: UserSummary = { id: 'u-carol', email: 'carol@example.com', name: 'Carol' };

const members = [
  makeMember(alice, { role: 'admin', isOwner: true }),
  makeMember(carol, { role: 'admin' }),
  makeMember(bob, { role: 'staff' }),
];

const pending = makeInvitation({ id: 'inv1', projectId: 'p1', email: 'dave@example.com' });

describe('ProjectMembersView', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows admin controls except for the owner and the current user', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(members),
      'GET /api/projects/p1/invitations': json([pending]),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', carol);

    const [ownerRow, selfRow, bobRow] = wrapper.findAll('[data-testid="member"]');
    expect(ownerRow?.text()).toContain('alice@example.com');
    expect(ownerRow?.find('select').exists()).toBe(false);
    expect(ownerRow?.find('button').exists()).toBe(false);
    expect(selfRow?.find('select').exists()).toBe(true);
    expect(selfRow?.find('button').exists()).toBe(false);
    expect(bobRow?.find('select').exists()).toBe(true);
    expect(bobRow?.find('button').text()).toBe('削除');

    expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(true);
    expect(wrapper.get('[data-testid="pending-invitation"]').text()).toContain('dave@example.com');
  });

  it('hides management UI and does not request invitations for non-admins', async () => {
    const fetchMock = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'substaff' })),
      'GET /api/projects/p1/members': json(members),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', bob);

    expect(wrapper.findAll('[data-testid="member"]')).toHaveLength(3);
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(false);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/invitations'))).toBe(false);
  });

  it('invites a user and clears the passcode without echoing it', async () => {
    const created = makeInvitation({ id: 'inv2', projectId: 'p1', email: 'erin@example.com' });
    const fetchMock = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(members),
      'GET /api/projects/p1/invitations': json([]),
      'POST /api/projects/p1/invitations': () => json(created, 201),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await wrapper.get('input[aria-label="メールアドレス"]').setValue('erin@example.com');
    await wrapper.get('select[aria-label="招待するロール"]').setValue('substaff');
    await wrapper.get('input[aria-label="暗証番号"]').setValue('s3cret');
    await wrapper.get('[data-testid="invite-form"]').trigger('submit');
    await flushPromises();

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    expect(JSON.parse(postCall?.[1]?.body as string)).toEqual({
      email: 'erin@example.com',
      role: 'substaff',
      passcode: 's3cret',
    });
    expect(wrapper.get('[data-testid="pending-invitation"]').text()).toContain('erin@example.com');
    expect(inputValue(wrapper.get('input[aria-label="暗証番号"]'))).toBe('');
    expect(wrapper.text()).not.toContain('s3cret');
  });

  it('shows a message when the invitee is already a member', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(members),
      'GET /api/projects/p1/invitations': json([]),
      'POST /api/projects/p1/invitations': json({ error: 'already_member' }, 409),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await wrapper.get('input[aria-label="メールアドレス"]').setValue('bob@example.com');
    await wrapper.get('input[aria-label="暗証番号"]').setValue('1234');
    await wrapper.get('[data-testid="invite-form"]').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('すでにメンバーです');
  });

  it('changes a role, removes a member and cancels an invitation', async () => {
    const fetchMock = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(members),
      'GET /api/projects/p1/invitations': json([pending]),
      'PATCH /api/projects/p1/members/u-bob': (body) =>
        json(makeMember(bob, body as { role: 'substaff' })),
      'DELETE /api/projects/p1/members/u-bob': noContent(),
      'DELETE /api/projects/p1/invitations/inv1': noContent(),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    const bobRow = () => wrapper.findAll('[data-testid="member"]')[2];

    await bobRow()?.get('select').setValue('substaff');
    await flushPromises();
    expect(inputValue(bobRow()?.get('select'))).toBe('substaff');

    await bobRow()?.get('button').trigger('click');
    await flushPromises();
    expect(wrapper.findAll('[data-testid="member"]')).toHaveLength(2);

    await wrapper.get('[data-testid="pending-invitation"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="pending-invitation"]').exists()).toBe(false);

    const patchCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(patchCall?.[1]?.body as string)).toEqual({ role: 'substaff' });
  });
});
