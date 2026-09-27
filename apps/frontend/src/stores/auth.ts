import { defineStore } from 'pinia';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

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
  },
});
