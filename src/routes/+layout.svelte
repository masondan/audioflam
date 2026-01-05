<script lang="ts">
	import { onMount } from 'svelte';
	import { splashScreenVisible } from '$lib/stores';
	import '../app.css';

	let { children } = $props();
	let splashVisible = $state(true);

	onMount(() => {
		// Auto-hide splash screen after 2.5 seconds
		setTimeout(() => {
			splashVisible = false;
			splashScreenVisible.set(false);
		}, 2500);
	});
</script>

<svelte:head>
</svelte:head>

{#if splashVisible}
	<div class="splash-container" class:fading-out={!splashVisible}>
		<div class="logo-wrapper">
			<img src="/icons/logotype-audioflam-white-trs.png" alt="AudioFlam" class="logotype-splash" />
		</div>
	</div>
{/if}

<div class="app-viewport">
	{@render children()}
</div>

<style>
	:global(body) {
		display: flex;
		justify-content: center;
		align-items: flex-start;
		min-height: 100vh;
		padding: var(--spacing-lg);
		background: var(--color-background);
	}

	.app-viewport {
		width: 100%;
		max-width: 480px;
		background: var(--color-surface);
		border-radius: var(--radius-md);
		box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.05), var(--shadow-lg);
		overflow: hidden;
	}

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

	.logotype-splash {
		width: 70%;
		max-width: 336px;
		height: auto;
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

	/* Mobile: full viewport, no shadow needed */
	@media (max-width: 480px) {
		:global(body) {
			padding: 0;
			align-items: stretch;
		}

		.app-viewport {
			max-width: none;
			border-radius: 0;
			box-shadow: none;
			min-height: 100vh;
		}
	}
</style>
