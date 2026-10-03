<script setup lang="ts">
import type { UserSummary } from '@pm-tool/shared';
import UserAvatar from '../UserAvatar.vue';
import RelativeTime from './RelativeTime.vue';

defineProps<{ author: Pick<UserSummary, 'id' | 'name' | 'avatarUrl'>; createdAt: string }>();
</script>

<template>
  <article class="overflow-hidden rounded-lg border bg-background">
    <header
      class="flex min-h-10 flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-1.5 sm:px-4 text-sm"
    >
      <UserAvatar
        :user-id="author.id"
        :name="author.name"
        :avatar-url="author.avatarUrl"
        :size="20"
      />
      <span class="min-w-0 truncate font-semibold">{{ author.name }}</span>
      <RelativeTime :datetime="createdAt" class="text-muted-foreground" />
      <slot name="meta" />
      <div class="ml-auto flex items-center gap-1">
        <slot name="actions" />
      </div>
    </header>
    <div class="p-3 sm:p-4">
      <slot />
    </div>
  </article>
</template>
