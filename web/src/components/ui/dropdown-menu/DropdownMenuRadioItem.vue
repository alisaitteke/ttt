<script setup lang="ts">
import { DropdownMenuRadioItem, type DropdownMenuRadioItemProps } from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<DropdownMenuRadioItemProps & { class?: string }>();
</script>

<template>
  <DropdownMenuRadioItem
    v-bind="props"
    :class="
      cn(
        'relative flex cursor-default select-none items-center gap-2 rounded-sm py-1.5 ps-8 pe-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50',
        props.class
      )
    "
  >
    <slot />
  </DropdownMenuRadioItem>
</template>
