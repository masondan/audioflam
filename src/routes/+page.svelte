<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { splashScreenVisible } from '$lib/stores';

  let visible = true;

  onMount(() => {
    // Simulate loading time or wait for user interaction if preferred
    // For now, auto-redirect after 3 seconds for smooth effect
    setTimeout(() => {
        handleEnter();
    }, 2500);
  });

  function handleEnter() {
    visible = false;
    splashScreenVisible.set(false);
    setTimeout(() => {
        goto('/app');
    }, 500); // Wait for fade out
  }
</script>

{#if visible}
<div class="splash-container" class:fading-out={!visible}>
  <div class="logo-wrapper">
    <img src="/icons/logo-audioflam-maskable.png" alt="AudioFlam Logo" class="logo" />
    <h1 class="brand-name">AudioFlam</h1>
    <p class="tagline">Your voice. Your story.</p>
  </div>
</div>
{/if}

<style>
  .splash-container {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: var(--color-indigo-bloom);
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 9999;
    color: white;
    transition: opacity 0.5s ease-in-out;
  }

  .fading-out {
    opacity: 0;
    pointer-events: none;
  }

  .logo-wrapper {
    text-align: center;
    animation: fadeInUp 1s ease-out;
  }

  .logo {
    width: 120px;
    height: 120px;
    margin-bottom: var(--spacing-md);
    border-radius: var(--radius-lg);
    box-shadow: var(--shadow-lg);
  }

  .brand-name {
    font-size: 2.5rem;
    font-weight: 700;
    margin-bottom: var(--spacing-xs);
    letter-spacing: -0.02em;
  }

  .tagline {
    font-size: 1.1rem;
    opacity: 0.8;
  }

  @keyframes fadeInUp {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
