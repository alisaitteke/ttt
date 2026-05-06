<script setup lang="ts">
import {
  ComboboxViewport,
  type ComboboxViewportProps,
  useForwardProps,
} from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<ComboboxViewportProps & { class?: string }>();

const forwarded = useForwardProps(props);
</script>

<template>
  <ComboboxViewport
    v-bind="forwarded"
    :class="cn('max-h-[min(18rem,var(--reka-combobox-content-available-height))]', props.class)"
  >
    <slot />
  </ComboboxViewport>
</template>
