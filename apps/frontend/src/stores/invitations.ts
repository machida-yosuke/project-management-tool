import { defineStore } from 'pinia';
import type { Project, ProjectInvitation } from '@pm-tool/shared';
import { apiFetch } from '../lib/api';

interface InvitationsState {
  invitations: ProjectInvitation[];
}

export const useInvitationsStore = defineStore('invitations', {
  state: (): InvitationsState => ({
    invitations: [],
  }),
  actions: {
    async fetchMine() {
      this.invitations = await apiFetch<ProjectInvitation[]>('/api/invitations');
    },
    async accept(invitationId: string, passcode: string) {
      const project = await apiFetch<Project>(
        `/api/invitations/${encodeURIComponent(invitationId)}/accept`,
        { method: 'POST', body: { passcode } },
      );
      this.invitations = this.invitations.filter((i) => i.id !== invitationId);
      return project;
    },
  },
});
