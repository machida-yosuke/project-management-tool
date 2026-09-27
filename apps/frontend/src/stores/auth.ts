import { defineStore } from 'pinia';
import type { UserSummary } from '@pm-tool/shared';
import { apiFetch } from '../lib/api';

export type AuthUser = UserSummary;

type AuthStatus = 'idle' | 'loading' | 'authenticated' | 'unauthenticated';

interface AuthState {
  user: AuthUser | null;
  status: AuthStatus;
  fetchMePromise: Promise<void> | null;
}

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:8787';

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
          const res = await fetch(`${apiBaseUrl}/api/auth/me`, { credentials: 'include' });
          if (res.ok) {
            this.user = (await res.json()) as AuthUser;
            this.status = 'authenticated';
          } else {
            this.user = null;
            this.status = 'unauthenticated';
          }
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
        await fetch(`${apiBaseUrl}/api/auth/logout`, { method: 'POST', credentials: 'include' });
      } catch {
        // Ignore network errors on logout — clear local state regardless so the
        // UI reflects "logged out" even if the server call failed.
      }
      this.user = null;
      this.status = 'unauthenticated';
    },
    async updateName(name: string) {
      this.user = await apiFetch<AuthUser>('/api/me', { method: 'PATCH', body: { name } });
      return this.user;
    },
    async uploadAvatar(file: Blob) {
      const form = new FormData();
      const name = file.type === 'image/webp' ? 'avatar.webp' : 'avatar.jpg';
      // Wrap in a File rather than passing append's filename argument, which happy-dom ignores for Blobs.
      form.append('file', new File([file], name, { type: file.type }));
      this.user = await apiFetch<AuthUser>('/api/me/avatar', { method: 'PUT', body: form });
      return this.user;
    },
    async removeAvatar() {
      this.user = await apiFetch<AuthUser>('/api/me/avatar', { method: 'DELETE' });
      return this.user;
    },
    async deleteAccount() {
      await apiFetch<void>('/api/me', { method: 'DELETE' });
      this.user = null;
      this.status = 'unauthenticated';
    },
  },
});
