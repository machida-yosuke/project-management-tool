import { createRouter, createWebHistory } from 'vue-router';
import HomeView from '../views/HomeView.vue';
import LoginView from '../views/LoginView.vue';
import { requireAuthGuard } from './guards';

export const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView, meta: { requiresAuth: true } },
    { path: '/login', name: 'login', component: LoginView },
  ],
});

router.beforeEach(requireAuthGuard);
