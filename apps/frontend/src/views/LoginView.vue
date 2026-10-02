<script setup lang="ts">
import { computed } from 'vue';
import { useRoute } from 'vue-router';
import { validateRedirectPath } from '@pm-tool/shared';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';

const route = useRoute();
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'https://localhost:8787';

const loginUrl = computed(() => {
  const redirectParam = route.query.redirect;
  const redirect = validateRedirectPath(
    typeof redirectParam === 'string' ? redirectParam : undefined,
  );
  return `${apiBaseUrl}/api/auth/google?redirect=${encodeURIComponent(redirect)}`;
});
</script>

<template>
  <div class="grid min-h-[60vh] place-items-center">
    <Card class="w-full max-w-sm">
      <CardHeader>
        <CardTitle class="text-xl">ログイン</CardTitle>
        <CardDescription>Google アカウントでログインしてプロジェクトを管理する。</CardDescription>
      </CardHeader>
      <CardContent>
        <Button as-child size="lg" class="w-full">
          <a :href="loginUrl">Googleでログイン</a>
        </Button>
      </CardContent>
    </Card>
  </div>
</template>
