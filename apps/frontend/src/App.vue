<script setup lang="ts">
import { onMounted } from 'vue';
import AppHeader from './components/layout/AppHeader.vue';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

onMounted(() => {
  if (authStore.status === 'idle') {
    void authStore.fetchMe();
  }
});
</script>

<template>
  <AppHeader />
  <main class="mx-auto w-full max-w-screen-2xl px-6 py-8">
    <router-view />
  </main>
</template>
