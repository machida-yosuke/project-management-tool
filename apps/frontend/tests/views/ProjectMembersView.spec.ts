import { flushPromises } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import type { ProjectInvitation, ProjectMember, ProjectRole, UserSummary } from '@pm-tool/shared';
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

const carol: UserSummary = {
  id: 'u-carol',
  email: 'carol@example.com',
  name: 'Carol',
  avatarUrl: null,
};

const initialMembers = () => [
  makeMember(alice, { role: 'admin', isOwner: true }),
  makeMember(carol, { role: 'admin' }),
  makeMember(bob, { role: 'staff' }),
];

const pending = makeInvitation({ id: 'inv1', projectId: 'p1', email: 'dave@example.com' });

function hasRole(body: unknown): body is { role: ProjectRole } {
  return typeof body === 'object' && body !== null && 'role' in body;
}

describe('ProjectMembersView', () => {
  it('shows admin controls except for the owner and the current user', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(initialMembers()),
      'GET /api/projects/p1/invitations': json([pending]),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', carol);
    await flushPromises();

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
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'substaff' })),
      'GET /api/projects/p1/members': json(initialMembers()),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', bob);
    await flushPromises();

    expect(wrapper.findAll('[data-testid="member"]')).toHaveLength(3);
    expect(wrapper.find('select').exists()).toBe(false);
    expect(wrapper.find('button').exists()).toBe(false);
    expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(false);
    expect(requests.mock.calls.some(([req]) => req.path.endsWith('/invitations'))).toBe(false);
  });

  it('shows not found for a project the user cannot see', async () => {
    stubApi({
      'GET /api/projects/p1': json({ error: 'not_found' }, 404),
      'GET /api/projects/p1/members': json({ error: 'not_found' }, 404),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', bob);
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('プロジェクトが見つかりません');
    expect(wrapper.find('[data-testid="member"]').exists()).toBe(false);
  });

  it('invites a user and clears the passcode without echoing it', async () => {
    let invitations: ProjectInvitation[] = [];
    const created = makeInvitation({ id: 'inv2', projectId: 'p1', email: 'erin@example.com' });
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(initialMembers()),
      'GET /api/projects/p1/invitations': () => json(invitations),
      'POST /api/projects/p1/invitations': () => {
        invitations = [created];
        return json(created, 201);
      },
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await flushPromises();
    await wrapper.get('input[aria-label="メールアドレス"]').setValue('erin@example.com');
    await wrapper.get('select[aria-label="招待するロール"]').setValue('substaff');
    await wrapper.get('input[aria-label="暗証番号"]').setValue('s3cret');
    await wrapper.get('[data-testid="invite-form"]').trigger('submit');
    await flushPromises();

    const postCall = requests.mock.calls.find(([req]) => req.method === 'POST');
    expect(postCall?.[0].body).toEqual({
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
      'GET /api/projects/p1/members': json(initialMembers()),
      'GET /api/projects/p1/invitations': json([]),
      'POST /api/projects/p1/invitations': json({ error: 'already_member' }, 409),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await flushPromises();
    await wrapper.get('input[aria-label="メールアドレス"]').setValue('bob@example.com');
    await wrapper.get('input[aria-label="暗証番号"]').setValue('1234');
    await wrapper.get('[data-testid="invite-form"]').trigger('submit');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toContain('すでにメンバーです');
  });

  it('changes a role, removes a member and cancels an invitation', async () => {
    let members: ProjectMember[] = initialMembers();
    let invitations: ProjectInvitation[] = [pending];
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': () => json(members),
      'GET /api/projects/p1/invitations': () => json(invitations),
      'PATCH /api/projects/p1/members/u-bob': (body) => {
        if (!hasRole(body)) throw new Error('Missing role');
        const updated = makeMember(bob, { role: body.role });
        members = members.map((m) => (m.userId === bob.id ? updated : m));
        return json(updated);
      },
      'DELETE /api/projects/p1/members/u-bob': () => {
        members = members.filter((m) => m.userId !== bob.id);
        return noContent();
      },
      'DELETE /api/projects/p1/invitations/inv1': () => {
        invitations = [];
        return noContent();
      },
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await flushPromises();
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

    const patchCall = requests.mock.calls.find(([req]) => req.method === 'PATCH');
    expect(patchCall?.[0].body).toEqual({ role: 'substaff' });
    expect(requests.mock.calls.filter(([req]) => req.path === '/api/projects/p1')).toHaveLength(1);
  });

  it('reloads the project after demoting yourself and hides invitation UI', async () => {
    let role: ProjectRole = 'admin';
    let members: ProjectMember[] = initialMembers();
    const requests = stubApi({
      'GET /api/projects/p1': () => json(makeProject({ role })),
      'GET /api/projects/p1/members': () => json(members),
      'GET /api/projects/p1/invitations': json([pending]),
      'PATCH /api/projects/p1/members/u-carol': (body) => {
        if (!hasRole(body)) throw new Error('Missing role');
        role = body.role;
        const updated = makeMember(carol, { role: body.role });
        members = members.map((m) => (m.userId === carol.id ? updated : m));
        return json(updated);
      },
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', carol);
    await flushPromises();
    expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(true);

    await wrapper.findAll('[data-testid="member"]')[1]?.get('select').setValue('staff');
    await flushPromises();

    expect(requests.mock.calls.filter(([req]) => req.path === '/api/projects/p1')).toHaveLength(2);
    expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(false);
    expect(wrapper.find('[data-testid="pending-invitation"]').exists()).toBe(false);
    expect(wrapper.find('select').exists()).toBe(false);
  });

  it('shows a message when changing the owner role is rejected', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(initialMembers()),
      'GET /api/projects/p1/invitations': json([]),
      'PATCH /api/projects/p1/members/u-bob': json({ error: 'owner_immutable' }, 409),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await flushPromises();
    await wrapper.findAll('[data-testid="member"]')[2]?.get('select').setValue('admin');
    await flushPromises();

    expect(wrapper.get('[role="alert"]').text()).toBe('オーナーのロールは変更できません');
  });
});
