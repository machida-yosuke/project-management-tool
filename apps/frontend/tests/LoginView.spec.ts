import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import { createRouter, createWebHistory } from 'vue-router';
import LoginView from '../src/views/LoginView.vue';

async function mountAtLoginPath(fullPath: string) {
  const router = createRouter({
    history: createWebHistory(),
    routes: [{ path: '/login', name: 'login', component: LoginView }],
  });
  await router.push(fullPath);
  await router.isReady();
  return mount(LoginView, { global: { plugins: [router] } });
}

describe('LoginView', () => {
  it('links to the Google OAuth endpoint with a validated redirect', async () => {
    const wrapper = await mountAtLoginPath('/login?redirect=/projects/1');

    expect(wrapper.get('a').attributes('href')).toBe(
      'http://localhost:8787/api/auth/google?redirect=%2Fprojects%2F1',
    );
  });

  it('falls back to / for an external redirect value', async () => {
    const wrapper = await mountAtLoginPath('/login?redirect=https://evil.com');

    expect(wrapper.get('a').attributes('href')).toBe(
      'http://localhost:8787/api/auth/google?redirect=%2F',
    );
  });

  it('defaults to / when no redirect query is given', async () => {
    const wrapper = await mountAtLoginPath('/login');

    expect(wrapper.get('a').attributes('href')).toBe(
      'http://localhost:8787/api/auth/google?redirect=%2F',
    );
  });
});
