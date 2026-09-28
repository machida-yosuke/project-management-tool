<script setup lang="ts">
import { computed } from 'vue';
import { formatRelativeTime } from '../../lib/relative-time';

const props = defineProps<{ datetime: string }>();

const label = computed(() => formatRelativeTime(props.datetime));
const absolute = computed(() => new Date(props.datetime).toLocaleString('ja-JP'));
</script>

<template>
  <time :datetime="datetime" :title="absolute">{{ label }}</time>
</template>
