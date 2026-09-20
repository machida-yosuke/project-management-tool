<script setup lang="ts">
import { onMounted } from 'vue';
import { useAuthStore } from './stores/auth';

const authStore = useAuthStore();

onMounted(() => {
  if (authStore.status === 'idle') {
    void authStore.fetchMe();
  }
});
</script>

<template>
  <h1>Project Management Tool</h1>
  <div v-if="authStore.status === 'authenticated'">
    <span>{{ authStore.user?.name }}</span>
    <button type="button" @click="authStore.logout()">ログアウト</button>
  </div>
  <router-view />
</template>
