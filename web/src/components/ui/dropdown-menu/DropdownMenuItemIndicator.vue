<script setup lang="ts">
import {
  DropdownMenuItemIndicator,
  type DropdownMenuItemIndicatorProps,
} from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<DropdownMenuItemIndicatorProps & { class?: string }>();
</script>

<template>
  <DropdownMenuItemIndicator v-bind="props" :class="cn(props.class)">
    <slot />
  </DropdownMenuItemIndicator>
</template>
