<script setup lang="ts">
import {
  ComboboxEmpty,
  type ComboboxEmptyProps,
  useForwardProps,
} from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<ComboboxEmptyProps & { class?: string }>();

const forwarded = useForwardProps(props);
</script>

<template>
  <ComboboxEmpty
    v-bind="forwarded"
    :class="cn('px-2 py-6 text-center text-sm text-muted-foreground', props.class)"
  >
    <slot />
  </ComboboxEmpty>
</template>
