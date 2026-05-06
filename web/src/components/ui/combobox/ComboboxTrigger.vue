<script setup lang="ts">
import {
  ComboboxTrigger,
  type ComboboxTriggerProps,
  useForwardProps,
} from 'reka-ui';

const props = defineProps<ComboboxTriggerProps & { class?: string }>();

const forwarded = useForwardProps(props);
</script>

<template>
  <ComboboxTrigger
    v-bind="forwarded"
    :class="props.class"
  >
    <slot />
  </ComboboxTrigger>
</template>
