<script setup lang="ts">
import { DropdownMenuLabel, type DropdownMenuLabelProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<DropdownMenuLabelProps & { class?: string }>();
</script>

<template>
  <DropdownMenuLabel
    v-bind="props"
    :class="cn('px-2 py-1.5 text-xs font-medium text-muted-foreground', props.class)"
  >
    <slot />
  </DropdownMenuLabel>
</template>
