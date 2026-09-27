<script setup lang="ts">
import { onMounted } from 'vue';
import UserAvatar from './components/UserAvatar.vue';
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
  <nav>
    <router-link to="/">ホーム</router-link>
  </nav>
  <div v-if="authStore.status === 'authenticated' && authStore.user" class="account">
    <UserAvatar :name="authStore.user.name" :avatar-url="authStore.user.avatarUrl" />
    <span>{{ authStore.user.name }}</span>
    <button type="button" @click="authStore.logout()">ログアウト</button>
    <router-link to="/settings">設定</router-link>
  </div>
  <router-view />
</template>

<style scoped>
.account {
  display: flex;
  align-items: center;
  gap: 8px;
}
</style>
