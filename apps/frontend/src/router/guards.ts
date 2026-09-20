import type { RouteLocationNormalized, RouteLocationNormalizedLoaded } from 'vue-router';
import { useAuthStore } from '../stores/auth';

// Not annotated as `NavigationGuardWithThis<undefined>` on purpose: that interface
// declares a single call signature with 3 required parameters (to, from, next), so a
// direct annotation would force every call site — including direct unit-test calls
// with just (to, from) — to satisfy that arity. Leaving the type inferred keeps this
// function's own signature at 2 parameters, which is still structurally assignable to
// `NavigationGuardWithThis<undefined>` (a function accepting fewer parameters than a
// type requires is assignable to it), so `router.beforeEach(requireAuthGuard)` still
// type-checks.
export const requireAuthGuard = async (
  to: RouteLocationNormalized,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _from: RouteLocationNormalizedLoaded,
) => {
  if (!to.meta.requiresAuth) return true;

  const authStore = useAuthStore();
  if (authStore.status === 'idle') {
    await authStore.fetchMe();
  }
  if (authStore.status !== 'authenticated') {
    return { path: '/login', query: { redirect: to.fullPath } };
  }
  return true;
};
