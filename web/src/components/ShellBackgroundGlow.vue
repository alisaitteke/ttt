<script setup lang="ts">
/**
 * Fixed viewport top-center soft beam (parity with lookup AppShellBackgroundGlow).
 * Sits at z-0; shell content must use relative z-10. Pointer-events none.
 */
</script>

<template>
  <div
    aria-hidden="true"
    class="pointer-events-none fixed inset-x-0 top-[-200px] z-0 flex justify-center"
  >
    <div class="absolute inset-x-0 flex justify-center">
      <div class="marketing-glow-layer flex flex-col items-center opacity-90">
        <div class="marketing-glow-core h-[420px] w-[560px] max-w-full rounded-full" />
        <div class="marketing-glow-accent -mt-28 h-[280px] w-[380px] max-w-full rounded-full" />
      </div>
    </div>
  </div>
</template>
