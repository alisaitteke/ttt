<script setup lang="ts">
import {
  ComboboxInput,
  type ComboboxInputEmits,
  type ComboboxInputProps,
  useForwardPropsEmits,
} from 'reka-ui';
import { cn } from '@/lib/utils';

const props = defineProps<ComboboxInputProps & { class?: string }>();
const emits = defineEmits<ComboboxInputEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <ComboboxInput
    v-bind="forwarded"
    :class="
      cn(
        'flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50',
        props.class
      )
    "
  />
</template>
