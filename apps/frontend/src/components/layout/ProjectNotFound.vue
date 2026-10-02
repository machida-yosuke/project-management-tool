<script setup lang="ts">
// Non-members get 404 so the project's existence is not leaked; invitees accept from home.
import { RouterLink } from 'vue-router';
import EmptyState from './EmptyState.vue';
import { Button } from '../ui/button';
</script>

<template>
  <div class="my-4" data-testid="project-not-found">
    <EmptyState message="プロジェクトが見つかりません">
      <div class="flex flex-col items-center gap-4">
        <p>招待を受けている場合は、ホームで招待を受諾してください</p>
        <Button variant="outline" size="sm" as-child>
          <RouterLink :to="{ name: 'home' }">ホームへ戻る</RouterLink>
        </Button>
      </div>
    </EmptyState>
  </div>
</template>
