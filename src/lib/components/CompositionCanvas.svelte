<script lang="ts">
  import { onMount } from 'svelte';
  import { loadImage, renderFrame as renderFrameCanvasLayers, type LayerConfig, type WaveformConfig, type WaveformPosition, type TitleConfig, type TitlePosition, type LightEffectConfig } from '$lib/utils/compositor';

  interface Props {
    imageUrl: string | null;
    loading?: boolean;
    waveformConfig?: WaveformConfig | null;
    titleConfig?: TitleConfig | null;
    lightConfig?: LightEffectConfig | null;
    isPlaying?: boolean;
    onWaveformPositionChange?: (position: WaveformPosition) => void;
    onWaveformClick?: () => void;
    onTitlePositionChange?: (position: TitlePosition) => void;
    onTitleClick?: () => void;
  }

  let { 
    imageUrl, 
    loading = false, 
    waveformConfig = null,
    titleConfig = null,
    lightConfig = null,
    isPlaying = false,
    onWaveformPositionChange,
    onWaveformClick,
    onTitlePositionChange,
    onTitleClick
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
  let activeLayer = $state<'waveform' | 'title' | null>(null);
  let originalTitlePosition = $state<TitlePosition | null>(null);

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
    
    if (lightConfig) {
      layers.lightEffect = lightConfig;
    }
    
    if (waveformConfig) {
      layers.waveform = {
        ...waveformConfig,
        isEditing: waveformConfig.enabled && !isPlaying
      };
    }

    if (titleConfig) {
      layers.title = {
        ...titleConfig,
        isEditing: titleConfig.enabled && !isPlaying
      };
    }
    
    renderFrameCanvasLayers(ctx, canvas, image, layers);
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

  function getHandleAtPoint(x: number, y: number, pos: { x: number; y: number; width: number; height: number }): string | null {
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

  function isInsideRect(x: number, y: number, pos: { x: number; y: number; width: number; height: number }): boolean {
    return x >= pos.x && x <= pos.x + pos.width &&
           y >= pos.y && y <= pos.y + pos.height;
  }

  function isInsideWaveform(x: number, y: number): boolean {
    if (!waveformConfig?.enabled) return false;
    return isInsideRect(x, y, waveformConfig.position);
  }

  function isInsideTitle(x: number, y: number): boolean {
    if (!titleConfig?.enabled || !titleConfig.text) return false;
    return isInsideRect(x, y, titleConfig.position);
  }

  function handlePointerDown(e: PointerEvent) {
    if (isPlaying) return;

    const coords = getCanvasCoords(e);

    // Check title layer first (renders on top)
    if (titleConfig?.enabled && titleConfig.text) {
      const titleHandle = getHandleAtPoint(coords.x, coords.y, titleConfig.position);
      if (titleHandle) {
        activeLayer = 'title';
        isResizing = true;
        resizeHandle = titleHandle;
        dragStartPos = coords;
        originalTitlePosition = { ...titleConfig.position };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (isInsideTitle(coords.x, coords.y)) {
        activeLayer = 'title';
        isDragging = true;
        dragStartPos = coords;
        originalTitlePosition = { ...titleConfig.position };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }

    // Check waveform layer
    if (waveformConfig?.enabled) {
      const waveformHandle = getHandleAtPoint(coords.x, coords.y, waveformConfig.position);
      if (waveformHandle) {
        activeLayer = 'waveform';
        isResizing = true;
        resizeHandle = waveformHandle;
        dragStartPos = coords;
        originalPosition = { ...waveformConfig.position };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
      if (isInsideWaveform(coords.x, coords.y)) {
        activeLayer = 'waveform';
        isDragging = true;
        dragStartPos = coords;
        originalPosition = { ...waveformConfig.position };
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        e.preventDefault();
        return;
      }
    }
  }

  function handlePointerMove(e: PointerEvent) {
    const coords = getCanvasCoords(e);
    const dx = coords.x - dragStartPos.x;
    const dy = coords.y - dragStartPos.y;

    if (activeLayer === 'title' && originalTitlePosition && onTitlePositionChange) {
      if (isDragging) {
        const newX = Math.max(0, Math.min(1 - originalTitlePosition.width, originalTitlePosition.x + dx));
        const newY = Math.max(0, Math.min(1 - originalTitlePosition.height, originalTitlePosition.y + dy));
        onTitlePositionChange({ ...originalTitlePosition, x: newX, y: newY });
      } else if (isResizing && resizeHandle) {
        const newPos = applyResize(originalTitlePosition, resizeHandle, dx, dy, 0.1, 0.05);
        onTitlePositionChange(newPos);
      }
    } else if (activeLayer === 'waveform' && originalPosition && onWaveformPositionChange) {
      if (isDragging) {
        const newX = Math.max(0, Math.min(1 - originalPosition.width, originalPosition.x + dx));
        const newY = Math.max(0, Math.min(1 - originalPosition.height, originalPosition.y + dy));
        onWaveformPositionChange({ ...originalPosition, x: newX, y: newY });
      } else if (isResizing && resizeHandle) {
        const newPos = applyResize(originalPosition, resizeHandle, dx, dy, 0.1, 0.05);
        onWaveformPositionChange(newPos);
      }
    }
  }

  function applyResize(
    pos: { x: number; y: number; width: number; height: number },
    handle: string,
    dx: number,
    dy: number,
    minWidth: number,
    minHeight: number
  ): { x: number; y: number; width: number; height: number } {
    let newPos = { ...pos };

    if (handle.includes('w')) {
      const newX = Math.max(0, pos.x + dx);
      const newWidth = pos.width - (newX - pos.x);
      if (newWidth > minWidth) {
        newPos.x = newX;
        newPos.width = newWidth;
      }
    }
    if (handle.includes('e')) {
      const newWidth = Math.min(1 - pos.x, pos.width + dx);
      if (newWidth > minWidth) {
        newPos.width = newWidth;
      }
    }
    if (handle.includes('n')) {
      const newY = Math.max(0, pos.y + dy);
      const newHeight = pos.height - (newY - pos.y);
      if (newHeight > minHeight) {
        newPos.y = newY;
        newPos.height = newHeight;
      }
    }
    if (handle.includes('s')) {
      const newHeight = Math.min(1 - pos.y, pos.height + dy);
      if (newHeight > minHeight) {
        newPos.height = newHeight;
      }
    }

    return newPos;
  }

  function handlePointerUp() {
    isDragging = false;
    isResizing = false;
    resizeHandle = null;
    originalPosition = null;
    originalTitlePosition = null;
    activeLayer = null;
  }

  function handleClick(e: MouseEvent) {
    const coords = getCanvasCoords(e);
    
    if (titleConfig?.enabled && titleConfig.text && isInsideTitle(coords.x, coords.y) && onTitleClick) {
      onTitleClick();
      return;
    }
    
    if (waveformConfig?.enabled && isInsideWaveform(coords.x, coords.y) && onWaveformClick) {
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

  export function renderFrame() {
    render();
  }

  export function getCanvas(): HTMLCanvasElement | null {
    return canvas;
  }

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
