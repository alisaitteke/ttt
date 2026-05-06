<script setup lang="ts">
import {
  DialogContent as DialogContentPrimitive,
  type DialogContentEmits,
  type DialogContentProps,
  useForwardPropsEmits,
} from 'reka-ui';
import { cn } from '@/lib/utils';
import DialogOverlay from './DialogOverlay.vue';
import DialogPortal from './DialogPortal.vue';

const props = defineProps<DialogContentProps & { class?: string }>();
const emits = defineEmits<DialogContentEmits>();

const forwarded = useForwardPropsEmits(props, emits);
</script>

<template>
  <DialogPortal>
    <DialogOverlay />
    <DialogContentPrimitive
      v-bind="forwarded"
      :class="
        cn(
          'fixed left-1/2 top-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-card p-5 shadow-lg duration-200 sm:max-w-lg',
          'rounded-xl outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95',
          props.class
        )
      "
    >
      <slot />
    </DialogContentPrimitive>
  </DialogPortal>
</template>
