<script setup lang="ts">
import {
  ComboboxItem,
  type ComboboxItemProps,
  useForwardProps,
} from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<ComboboxItemProps & { class?: string }>();

const forwarded = useForwardProps(props);
</script>

<template>
  <ComboboxItem
    v-bind="forwarded"
    :class="
      cn(
        'relative flex cursor-pointer select-none items-center gap-2 rounded-sm px-2 py-2 text-sm outline-none data-[disabled]:pointer-events-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground data-[disabled]:opacity-50',
        props.class
      )
    "
  >
    <slot />
  </ComboboxItem>
</template>
