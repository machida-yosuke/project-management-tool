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
  <main class="mx-auto w-full max-w-screen-2xl px-4 py-4 sm:px-6 sm:py-8">
    <router-view />
  </main>
</template>
