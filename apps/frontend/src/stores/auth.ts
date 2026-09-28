import { defineStore } from 'pinia';
import type { UserSummary } from '@pm-tool/shared';
import {
  deleteMe,
  getSessionUser,
  logout as logoutRequest,
  removeAvatar as removeAvatarRequest,
  updateMe,
  uploadAvatar as uploadAvatarRequest,
} from '../api/generated';

export type AuthUser = UserSummary;

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  fetchMePromise: Promise<void> | null;
}

export const useAuthStore = defineStore('auth', {
  state: (): AuthState => ({
    user: null,
    status: 'idle',
    fetchMePromise: null,
  }),
  actions: {
    fetchMe() {
      if (this.fetchMePromise) {
        return this.fetchMePromise;
      }
      this.status = 'loading';
      this.fetchMePromise = (async () => {
        try {
          this.user = await getSessionUser();
          this.status = 'authenticated';
        } catch {
          this.user = null;
          this.status = 'unauthenticated';
        } finally {
          this.fetchMePromise = null;
        }
      })();
      return this.fetchMePromise;
    },
    async logout() {
      try {
        await logoutRequest();
      } catch {
        // Ignore network errors on logout — clear local state regardless so the
        // UI reflects "logged out" even if the server call failed.
      }
      this.user = null;
      this.status = 'unauthenticated';
    },
    async updateName(name: string) {
      this.user = await updateMe({ name });
      return this.user;
    },
    async uploadAvatar(file: Blob) {
      const name = file.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg';
      // Wrap in a File rather than passing append's filename argument, which happy-dom ignores for Blobs.
      this.user = await uploadAvatarRequest({ file: new File([file], name, { type: file.type }) });
      return this.user;
    },
    async removeAvatar() {
      this.user = await removeAvatarRequest();
      return this.user;
    },
    async deleteAccount() {
      await deleteMe();
      this.user = null;
      this.status = 'unauthenticated';
    },
  },
});
