<script lang="ts">
  interface Props {
    isOpen: boolean;
    onDismiss: () => void;
  }

  let { isOpen = false, onDismiss }: Props = $props();

  function handleBackdropClick() {
    onDismiss();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      onDismiss();
    }
  }
</script>

<svelte:window on:keydown={handleKeydown} />

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={handleBackdropClick} role="presentation">
    <div class="modal-content" onclick={(e) => e.stopPropagation()}>
      <p class="modal-message">First generate your audio, then adjust the speed</p>
      <button class="modal-button" type="button" onclick={onDismiss}>Got it</button>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.2);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
    animation: fadeIn var(--transition-fast);
  }

  .modal-content {
    background: var(--color-white);
    border-radius: var(--radius-md);
    padding: var(--spacing-lg);
    max-width: 320px;
    box-shadow: var(--shadow-lg);
    display: flex;
    flex-direction: column;
    gap: var(--spacing-md);
    animation: slideUp var(--transition-normal);
  }

  .modal-message {
    font-size: var(--font-size-base);
    color: var(--color-text-primary);
    margin: 0;
    text-align: center;
    line-height: 1.5;
  }

  .modal-button {
    align-self: flex-end;
    padding: var(--spacing-sm) var(--spacing-md);
    background: var(--color-primary);
    border: none;
    border-radius: var(--radius-sm);
    color: var(--color-white);
    font-size: var(--font-size-sm);
    font-weight: 500;
    cursor: pointer;
    transition: background var(--transition-fast);
  }

  .modal-button:hover {
    background: #4a1d9e;
  }

  .modal-button:active {
    background: #3d1680;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @keyframes slideUp {
    from {
      transform: translateY(12px);
      opacity: 0;
    }
    to {
      transform: translateY(0);
      opacity: 1;
    }
  }
</style>
