import { enableAutoUnmount, flushPromises, type VueWrapper } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
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
import { currentDialog, openDialog } from '../helpers/dialog';
import { inputValue, mountAt } from '../helpers/mount';
import { chooseOption } from '../helpers/reka-select';

const ROLE_SELECT = '[role="combobox"][aria-label="ロール"]';
// The role select's trigger is also a <button>, so row actions are matched separately.
const ACTION_BUTTON = 'button:not([role="combobox"])';

// Reka UI teleports the dialog to <body>, so it is looked up outside the mounted wrapper.
function openAlertDialog(): HTMLElement {
  const dialog = document.querySelector<HTMLElement>('[role="alertdialog"]');
  if (!dialog) throw new Error('Alert dialog is not open');
  return dialog;
}

function dialogButton(dialog: HTMLElement, label: string): HTMLElement {
  const button = Array.from(dialog.querySelectorAll<HTMLElement>('button')).find(
    (b) => b.textContent?.trim() === label,
  );
  if (!button) throw new Error(`Dialog button not found: ${label}`);
  return button;
}

function memberRow(wrapper: VueWrapper, index: number) {
  const row = wrapper.findAll('[data-testid="member"]')[index];
  if (!row) throw new Error(`Member row not found: ${index}`);
  return row;
}

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
  enableAutoUnmount(afterEach);

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
    expect(ownerRow?.find(ROLE_SELECT).exists()).toBe(false);
    expect(ownerRow?.find(ACTION_BUTTON).exists()).toBe(false);
    expect(selfRow?.find(ROLE_SELECT).exists()).toBe(true);
    expect(selfRow?.find(ACTION_BUTTON).exists()).toBe(false);
    expect(bobRow?.find(ROLE_SELECT).exists()).toBe(true);
    expect(bobRow?.find(ACTION_BUTTON).text()).toBe('削除');

    expect(wrapper.find('[data-testid="invite-form"]').exists()).toBe(false);
    const dialog = await openDialog(wrapper, '招待する');
    expect(dialog.get('h2').text()).toBe('招待する');
    expect(dialog.text()).toContain('暗証番号は招待相手に別の手段で伝えてください');
    expect(dialog.find('[data-testid="invite-form"]').exists()).toBe(true);
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
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false);
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
    const dialog = await openDialog(wrapper, '招待する');
    await dialog.get('input[aria-label="メールアドレス"]').setValue('erin@example.com');
    await chooseOption(dialog.get('[aria-label="招待するロール"]'), 'サブスタッフ');
    await dialog.get('input[aria-label="暗証番号"]').setValue('s3cret');
    await dialog.get('[data-testid="invite-form"]').trigger('submit');
    await flushPromises();

    const postCall = requests.mock.calls.find(([req]) => req.method === 'POST');
    expect(postCall?.[0].body).toEqual({
      email: 'erin@example.com',
      role: 'substaff',
      passcode: 's3cret',
    });
    expect(currentDialog()).toBeNull();
    expect(wrapper.get('[data-testid="pending-invitation"]').text()).toContain('erin@example.com');
    expect(wrapper.text()).not.toContain('s3cret');
    const reopened = await openDialog(wrapper, '招待する');
    expect(inputValue(reopened.get('input[aria-label="メールアドレス"]'))).toBe('');
    expect(reopened.get('[aria-label="招待するロール"]').text()).toBe('スタッフ');
    expect(inputValue(reopened.get('input[aria-label="暗証番号"]'))).toBe('');
  });

  it('shows a message in the dialog when the invitee is already a member', async () => {
    stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(initialMembers()),
      'GET /api/projects/p1/invitations': json([]),
      'POST /api/projects/p1/invitations': json({ error: 'already_member' }, 409),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await flushPromises();
    const dialog = await openDialog(wrapper, '招待する');
    await dialog.get('input[aria-label="メールアドレス"]').setValue('bob@example.com');
    await dialog.get('input[aria-label="暗証番号"]').setValue('1234');
    await dialog.get('[data-testid="invite-form"]').trigger('submit');
    await flushPromises();

    expect(currentDialog()).not.toBeNull();
    expect(dialog.get('[role="alert"]').text()).toContain('すでにメンバーです');
    expect(inputValue(dialog.get('input[aria-label="メールアドレス"]'))).toBe('bob@example.com');
    expect(wrapper.find('[role="alert"]').exists()).toBe(false);
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
    const bobRow = () => memberRow(wrapper, 2);

    await chooseOption(bobRow().get(ROLE_SELECT), 'サブスタッフ');
    expect(bobRow().get(ROLE_SELECT).text()).toBe('サブスタッフ');

    await bobRow().get(ACTION_BUTTON).trigger('click');
    await flushPromises();
    const dialog = openAlertDialog();
    expect(dialog.textContent).toContain('メンバーを削除');
    expect(dialog.textContent).toContain('Bob');
    expect(requests.mock.calls.some(([req]) => req.method === 'DELETE')).toBe(false);

    dialogButton(dialog, '削除').click();
    await flushPromises();
    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(wrapper.findAll('[data-testid="member"]')).toHaveLength(2);

    await wrapper.get('[data-testid="pending-invitation"] button').trigger('click');
    await flushPromises();
    expect(wrapper.find('[data-testid="pending-invitation"]').exists()).toBe(false);

    const patchCall = requests.mock.calls.find(([req]) => req.method === 'PATCH');
    expect(patchCall?.[0].body).toEqual({ role: 'substaff' });
    expect(requests.mock.calls.filter(([req]) => req.path === '/api/projects/p1')).toHaveLength(1);
  });

  it('keeps the member when removal is cancelled', async () => {
    const requests = stubApi({
      'GET /api/projects/p1': json(makeProject({ role: 'admin' })),
      'GET /api/projects/p1/members': json(initialMembers()),
      'GET /api/projects/p1/invitations': json([]),
    });

    const { wrapper } = await mountAt(ProjectMembersView, '/projects/p1/members', alice);
    await flushPromises();
    await memberRow(wrapper, 2).get(ACTION_BUTTON).trigger('click');
    await flushPromises();

    dialogButton(openAlertDialog(), 'キャンセル').click();
    await flushPromises();

    expect(document.querySelector('[role="alertdialog"]')).toBeNull();
    expect(wrapper.findAll('[data-testid="member"]')).toHaveLength(3);
    expect(requests.mock.calls.some(([req]) => req.method === 'DELETE')).toBe(false);
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
    expect(wrapper.findAll('button').map((b) => b.text())).toContain('招待する');

    await chooseOption(memberRow(wrapper, 1).get(ROLE_SELECT), 'スタッフ');

    expect(requests.mock.calls.filter(([req]) => req.path === '/api/projects/p1')).toHaveLength(2);
    expect(wrapper.findAll('button').map((b) => b.text())).not.toContain('招待する');
    expect(wrapper.find('[data-testid="pending-invitation"]').exists()).toBe(false);
    expect(wrapper.find('[role="combobox"]').exists()).toBe(false);
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
    await chooseOption(memberRow(wrapper, 2).get(ROLE_SELECT), '管理者');

    expect(wrapper.get('[role="alert"]').text()).toBe('オーナーのロールは変更できません');
  });
});
