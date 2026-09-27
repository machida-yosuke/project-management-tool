import { defineStore } from 'pinia';
import type { ProjectInvitation, ProjectMember, ProjectRole } from '@pm-tool/shared';
import { apiFetch } from '../lib/api';

export interface CreateInvitationInput {
  email: string;
  role: ProjectRole;
  passcode: string;
}

interface MembersState {
  members: ProjectMember[];
  invitations: ProjectInvitation[];
}

function projectPath(projectId: string) {
  return `/api/projects/${encodeURIComponent(projectId)}`;
}

export const useMembersStore = defineStore('members', {
  state: (): MembersState => ({
    members: [],
    invitations: [],
  }),
  actions: {
    async fetchMembers(projectId: string) {
      this.members = await apiFetch<ProjectMember[]>(`${projectPath(projectId)}/members`);
    },
    async updateRole(projectId: string, userId: string, role: ProjectRole) {
      const member = await apiFetch<ProjectMember>(
        `${projectPath(projectId)}/members/${encodeURIComponent(userId)}`,
        { method: 'PATCH', body: { role } },
      );
      const index = this.members.findIndex((m) => m.userId === member.userId);
      if (index !== -1) {
        this.members.splice(index, 1, member);
      }
      return member;
    },
    async removeMember(projectId: string, userId: string) {
      await apiFetch<void>(`${projectPath(projectId)}/members/${encodeURIComponent(userId)}`, {
        method: 'DELETE',
      });
      this.members = this.members.filter((m) => m.userId !== userId);
    },
    async fetchInvitations(projectId: string) {
      this.invitations = await apiFetch<ProjectInvitation[]>(
        `${projectPath(projectId)}/invitations`,
      );
    },
    async createInvitation(projectId: string, input: CreateInvitationInput) {
      const invitation = await apiFetch<ProjectInvitation>(
        `${projectPath(projectId)}/invitations`,
        { method: 'POST', body: input },
      );
      // Re-inviting the same email overwrites the pending invitation on the server.
      this.invitations = [
        ...this.invitations.filter((i) => i.id !== invitation.id && i.email !== invitation.email),
        invitation,
      ];
      return invitation;
    },
    async deleteInvitation(projectId: string, invitationId: string) {
      await apiFetch<void>(
        `${projectPath(projectId)}/invitations/${encodeURIComponent(invitationId)}`,
        { method: 'DELETE' },
      );
      this.invitations = this.invitations.filter((i) => i.id !== invitationId);
    },
  },
});
