<script lang="ts">
  import { onMount } from 'svelte';
  import { loadImage, renderFrame, type LayerConfig, type WaveformConfig, type WaveformPosition } from '$lib/utils/compositor';

  interface Props {
    imageUrl: string | null;
    loading?: boolean;
    waveformConfig?: WaveformConfig | null;
    isPlaying?: boolean;
    onWaveformPositionChange?: (position: WaveformPosition) => void;
    onWaveformClick?: () => void;
  }

  let { 
    imageUrl, 
    loading = false, 
    waveformConfig = null,
    isPlaying = false,
    onWaveformPositionChange,
    onWaveformClick
  }: Props = $props();

  let canvas = $state<HTMLCanvasElement | null>(null);
  let container = $state<HTMLDivElement | null>(null);
  let ctx = $state<CanvasRenderingContext2D | null>(null);
  let image = $state<HTMLImageElement | null>(null);
  let canvasWidth = $state(0);
  let canvasHeight = $state(0);

  let isDragging = $state(false);
  let isResizing = $state(false);
  let resizeHandle = $state<string | null>(null);
  let dragStartPos = $state({ x: 0, y: 0 });
  let originalPosition = $state<WaveformPosition | null>(null);

  function updateCanvasSize() {
    if (!container || !canvas) return;
    
    const containerWidth = container.clientWidth;
    
    if (image) {
      const aspectRatio = image.height / image.width;
      canvasWidth = containerWidth;
      canvasHeight = Math.round(containerWidth * aspectRatio);
    } else {
      canvasWidth = containerWidth;
      canvasHeight = Math.round(containerWidth * (16 / 9));
    }
    
    canvas.width = canvasWidth;
    canvas.height = canvasHeight;
    
    render();
  }

  function render() {
    if (!ctx || !canvas) return;
    
    const layers: LayerConfig = {};
    
    if (waveformConfig) {
      layers.waveform = {
        ...waveformConfig,
        isEditing: waveformConfig.enabled && !isPlaying
      };
    }
    
    renderFrame(ctx, canvas, image, layers);
  }

  async function loadImageFromUrl(url: string) {
    try {
      image = await loadImage(url);
      updateCanvasSize();
    } catch (err) {
      console.error('Failed to load image:', err);
      image = null;
      updateCanvasSize();
    }
  }

  function getCanvasCoords(e: MouseEvent | Touch): { x: number; y: number } {
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height
    };
  }

  function getHandleAtPoint(x: number, y: number): string | null {
    if (!waveformConfig?.enabled || isPlaying) return null;
    
    const pos = waveformConfig.position;
    const handleSize = 0.02;

    const handles = [
      { name: 'nw', hx: pos.x, hy: pos.y },
      { name: 'ne', hx: pos.x + pos.width, hy: pos.y },
      { name: 'sw', hx: pos.x, hy: pos.y + pos.height },
      { name: 'se', hx: pos.x + pos.width, hy: pos.y + pos.height },
      { name: 'n', hx: pos.x + pos.width / 2, hy: pos.y },
      { name: 's', hx: pos.x + pos.width / 2, hy: pos.y + pos.height },
      { name: 'w', hx: pos.x, hy: pos.y + pos.height / 2 },
      { name: 'e', hx: pos.x + pos.width, hy: pos.y + pos.height / 2 }
    ];

    for (const handle of handles) {
      if (Math.abs(x - handle.hx) < handleSize && Math.abs(y - handle.hy) < handleSize) {
        return handle.name;
      }
    }
    return null;
  }

  function isInsideWaveform(x: number, y: number): boolean {
    if (!waveformConfig?.enabled) return false;
    const pos = waveformConfig.position;
    return x >= pos.x && x <= pos.x + pos.width &&
           y >= pos.y && y <= pos.y + pos.height;
  }

  function handlePointerDown(e: PointerEvent) {
    if (!waveformConfig?.enabled || isPlaying) return;

    const coords = getCanvasCoords(e);
    const handle = getHandleAtPoint(coords.x, coords.y);

    if (handle) {
      isResizing = true;
      resizeHandle = handle;
      dragStartPos = coords;
      originalPosition = { ...waveformConfig.position };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    } else if (isInsideWaveform(coords.x, coords.y)) {
      isDragging = true;
      dragStartPos = coords;
      originalPosition = { ...waveformConfig.position };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  }

  function handlePointerMove(e: PointerEvent) {
    if (!originalPosition || !onWaveformPositionChange) return;

    const coords = getCanvasCoords(e);
    const dx = coords.x - dragStartPos.x;
    const dy = coords.y - dragStartPos.y;

    if (isDragging) {
      const newX = Math.max(0, Math.min(1 - originalPosition.width, originalPosition.x + dx));
      const newY = Math.max(0, Math.min(1 - originalPosition.height, originalPosition.y + dy));
      
      onWaveformPositionChange({
        ...originalPosition,
        x: newX,
        y: newY
      });
    } else if (isResizing && resizeHandle) {
      let newPos = { ...originalPosition };

      if (resizeHandle.includes('w')) {
        const newX = Math.max(0, originalPosition.x + dx);
        const newWidth = originalPosition.width - (newX - originalPosition.x);
        if (newWidth > 0.1) {
          newPos.x = newX;
          newPos.width = newWidth;
        }
      }
      if (resizeHandle.includes('e')) {
        const newWidth = Math.min(1 - originalPosition.x, originalPosition.width + dx);
        if (newWidth > 0.1) {
          newPos.width = newWidth;
        }
      }
      if (resizeHandle.includes('n')) {
        const newY = Math.max(0, originalPosition.y + dy);
        const newHeight = originalPosition.height - (newY - originalPosition.y);
        if (newHeight > 0.05) {
          newPos.y = newY;
          newPos.height = newHeight;
        }
      }
      if (resizeHandle.includes('s')) {
        const newHeight = Math.min(1 - originalPosition.y, originalPosition.height + dy);
        if (newHeight > 0.05) {
          newPos.height = newHeight;
        }
      }

      onWaveformPositionChange(newPos);
    }
  }

  function handlePointerUp() {
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
    originalPosition = null;
  }

  function handleClick(e: MouseEvent) {
    if (!waveformConfig?.enabled) return;
    
    const coords = getCanvasCoords(e);
    if (isInsideWaveform(coords.x, coords.y) && onWaveformClick) {
      onWaveformClick();
    }
  }

  $effect(() => {
    if (imageUrl) {
      loadImageFromUrl(imageUrl);
    } else {
      image = null;
      updateCanvasSize();
    }
  });

  $effect(() => {
    render();
  });

  onMount(() => {
    if (canvas) {
      ctx = canvas.getContext('2d');
      updateCanvasSize();
    }

    const resizeObserver = new ResizeObserver(() => {
      updateCanvasSize();
    });
    
    if (container) {
      resizeObserver.observe(container);
    }

    return () => {
      resizeObserver.disconnect();
    };
  });

  let cursorStyle = $derived.by(() => {
    if (!waveformConfig?.enabled || isPlaying) return 'default';
    return 'default';
  });
</script>

<div class="composition-container" bind:this={container}>
  <canvas
    bind:this={canvas}
    class="composition-canvas"
    width={canvasWidth}
    height={canvasHeight}
    style="cursor: {cursorStyle}"
    onpointerdown={handlePointerDown}
    onpointermove={handlePointerMove}
    onpointerup={handlePointerUp}
    onpointerleave={handlePointerUp}
    onclick={handleClick}
  ></canvas>
  {#if loading}
    <div class="loading-overlay">
      <div class="loading-spinner"></div>
    </div>
  {/if}
</div>

<style>
  .composition-container {
    position: relative;
    width: 100%;
    border-radius: var(--radius-md);
    overflow: hidden;
    background: #1a1a1a;
  }

  .composition-canvas {
    display: block;
    width: 100%;
    height: auto;
    touch-action: none;
  }

  .loading-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.5);
  }

  .loading-spinner {
    width: 32px;
    height: 32px;
    border: 3px solid rgba(255, 255, 255, 0.3);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
