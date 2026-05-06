<script setup lang="ts">
import {
  ComboboxContent as ComboboxContentPrimitive,
  type ComboboxContentEmits,
  type ComboboxContentProps,
  useForwardPropsEmits,
} from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<ComboboxContentProps & { class?: string }>();
const emits = defineEmits<ComboboxContentEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <ComboboxContentPrimitive
    v-bind="forwarded"
    position="popper"
    side="bottom"
    :side-offset="6"
    :collision-padding="12"
    align="start"
    avoid-collisions
    align-flip
    side-flip
    :class="
      cn(
        'z-[110] min-w-[var(--reka-combobox-trigger-width)] overflow-hidden rounded-md border border-border bg-popover p-0 text-popover-foreground shadow-md outline-none',
        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2',
        props.class
      )
    "
  >
    <slot />
  </ComboboxContentPrimitive>
</template>
