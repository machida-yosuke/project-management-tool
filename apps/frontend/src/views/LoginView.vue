<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { validateRedirectPath } from '@pm-tool/shared';

const route = useRoute();
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8787';

const loginUrl = computed(() => {
  const redirectParam = route.query.redirect;
  const redirect = validateRedirectPath(
    typeof redirectParam === 'string' ? redirectParam : undefined,
  );
  return `${apiBaseUrl}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
});
</script>

<template>
  <div>
    <h1>Login</h1>
    <a :href="loginUrl">Googleでログイン</a>
  </div>
</template>
