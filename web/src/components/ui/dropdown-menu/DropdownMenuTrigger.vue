<script setup lang="ts">
import { DropdownMenuTrigger, type DropdownMenuTriggerProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<DropdownMenuTriggerProps & { class?: string }>();
</script>

<template>
  <DropdownMenuTrigger v-bind="props" :class="cn(props.class)">
    <slot />
  </DropdownMenuTrigger>
</template>
