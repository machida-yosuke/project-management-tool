<script setup lang="ts">
import { ChevronDown } from '@lucide/vue';
import { RouterLink } from 'vue-router';
import { useAuthStore } from '../../stores/auth';
import AppLogo from '../AppLogo.vue';
import UserAvatar from '../UserAvatar.vue';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu';

const authStore = useAuthStore();
</script>

<template>
  <header class="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
    <div
      class="mx-auto flex h-14 w-full max-w-screen-2xl items-center justify-between px-4 sm:px-6"
    >
      <RouterLink to="/" class="flex items-center" aria-label="Cadence">
        <AppLogo class="size-7" />
      </RouterLink>
      <DropdownMenu v-if="authStore.status === 'authenticated' && authStore.user">
        <DropdownMenuTrigger
          class="flex items-center gap-2 rounded-md px-2 py-1 text-sm outline-none hover:bg-accent focus-visible:ring-3 focus-visible:ring-ring/50"
          data-testid="user-menu"
          :aria-label="authStore.user.name"
        >
          <UserAvatar
            :user-id="authStore.user.id"
            :name="authStore.user.name"
            :avatar-url="authStore.user.avatarUrl"
          />
          <span class="hidden sm:inline">{{ authStore.user.name }}</span>
          <ChevronDown class="size-4 text-muted-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-40">
          <DropdownMenuLabel class="truncate sm:hidden">{{
            authStore.user.name
          }}</DropdownMenuLabel>
          <DropdownMenuSeparator class="sm:hidden" />
          <DropdownMenuItem as-child>
            <RouterLink to="/settings">設定</RouterLink>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem @select="authStore.logout()">ログアウト</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  </header>
</template>
