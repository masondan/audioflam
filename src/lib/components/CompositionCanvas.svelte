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
    onBackgroundClick?: () => void;
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
    onTitleClick,
    onBackgroundClick
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
  let showCenterLine = $state(false);
  
  const CENTER_SNAP_THRESHOLD = 0.02;

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
        isEditing: waveformConfig.isEditing && !isPlaying
      };
    }

    if (titleConfig) {
      layers.title = {
        ...titleConfig,
        isEditing: titleConfig.isEditing && !isPlaying
      };
    }
    
    renderFrameCanvasLayers(ctx, canvas, image, layers);
    
    if (showCenterLine && isDragging && activeLayer === 'title') {
      renderCenterSnapLine(ctx, canvas);
    }
  }
  
  function renderCenterSnapLine(ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) {
    const centerX = canvas.width / 2;
    
    ctx.save();
    ctx.strokeStyle = 'rgba(84, 34, 176, 0.6)';
    ctx.lineWidth = 1;
    
    ctx.beginPath();
    ctx.moveTo(centerX, 0);
    ctx.lineTo(centerX, canvas.height);
    ctx.stroke();
    
    ctx.restore();
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
    const handleSize = 0.03;

    // Corner handles only
    const handles = [
      { name: 'nw', hx: pos.x, hy: pos.y },
      { name: 'ne', hx: pos.x + pos.width, hy: pos.y },
      { name: 'sw', hx: pos.x, hy: pos.y + pos.height },
      { name: 'se', hx: pos.x + pos.width, hy: pos.y + pos.height }
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

  function getTitleRenderedBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!titleConfig?.enabled || !titleConfig.text || !ctx || !canvas) return null;
    
    const { position, text, font, bold, lineHeight: lineHeightRatio, letterSpacing, align, labelSpace } = titleConfig;
    
    const fontFamilyMap: Record<string, string> = {
      'Inter': "'Inter', sans-serif",
      'Lora': "'Lora', serif",
      'Roboto Slab': "'Roboto Slab', serif",
      'Saira Condensed': "'Saira Condensed', sans-serif",
      'Playfair Display': "'Playfair Display', serif",
      'Bebas Neue': "'Bebas Neue', sans-serif"
    };
    const fontFamily = fontFamilyMap[font] || "'Inter', sans-serif";
    const fontWeight = font === 'Bebas Neue' ? 400 : (bold ? (font === 'Inter' ? 800 : 700) : 400);
    
    const lines = text.split('\n');
    const numLines = Math.max(lines.length, 1);
    // Must match compositor.ts: position.width * canvas.width * 0.07
    const fontSize = position.width * canvas.width * 0.07;
    
    ctx.save();
    ctx.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    if (letterSpacing !== 0) {
      ctx.letterSpacing = `${letterSpacing}em`;
    }
    
    let maxTextWidth = 0;
    for (const line of lines) {
      const metrics = ctx.measureText(line);
      maxTextWidth = Math.max(maxTextWidth, metrics.width);
    }
    ctx.restore();
    
    const actualLineHeight = fontSize * lineHeightRatio;
    const totalTextHeight = numLines * actualLineHeight;
    // Must match compositor.ts formula
    const labelPadding = fontSize * (0.15 + labelSpace * 0.6);
    
    const boxWidth = maxTextWidth + labelPadding * 2;
    const boxHeight = totalTextHeight + labelPadding * 2;
    
    let boxX: number;
    if (align === 'left') {
      boxX = position.x;
    } else if (align === 'right') {
      boxX = position.x + position.width - boxWidth / canvas.width;
    } else {
      boxX = position.x + position.width / 2 - boxWidth / canvas.width / 2;
    }
    const boxY = position.y;
    
    return {
      x: boxX,
      y: boxY,
      width: boxWidth / canvas.width,
      height: boxHeight / canvas.height
    };
  }

  function isInsideTitle(x: number, y: number): boolean {
    const bounds = getTitleRenderedBounds();
    if (!bounds) return false;
    return isInsideRect(x, y, bounds);
  }

  function handlePointerDown(e: PointerEvent) {
    if (isPlaying) return;

    const coords = getCanvasCoords(e);

    // Check title layer first (renders on top)
    // Only allow drag/resize when already selected (isEditing: true)
    // This enables "tap to select, then drag" pattern for better mobile scrolling
    if (titleConfig?.enabled && titleConfig.text && titleConfig.isEditing) {
      const titleBounds = getTitleRenderedBounds();
      if (titleBounds) {
        const titleHandle = getHandleAtPoint(coords.x, coords.y, titleBounds);
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
    }

    // Check waveform layer - only when already selected
    if (waveformConfig?.enabled && waveformConfig.isEditing) {
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
        let newX = originalTitlePosition.x + dx;
        let newY = originalTitlePosition.y + dy;
        
        // Get current bounds to constrain within viewport
        const bounds = getTitleRenderedBounds();
        if (bounds) {
          // Calculate the offset from position to bounds
          const offsetX = bounds.x - originalTitlePosition.x;
          const offsetY = bounds.y - originalTitlePosition.y;
          
          // Clamp so bounding box stays within viewport [0, 1]
          const minX = -offsetX;
          const maxX = 1 - bounds.width - offsetX;
          const minY = -offsetY;
          const maxY = 1 - bounds.height - offsetY;
          
          newX = Math.max(minX, Math.min(maxX, newX));
          newY = Math.max(minY, Math.min(maxY, newY));
          
          // Center snap detection
          const finalBoundsX = newX + offsetX;
          const renderedCenterX = finalBoundsX + bounds.width / 2;
          if (Math.abs(renderedCenterX - 0.5) < CENTER_SNAP_THRESHOLD) {
            newX = 0.5 - bounds.width / 2 - offsetX;
            showCenterLine = true;
          } else {
            showCenterLine = false;
          }
        }
        
        onTitlePositionChange({ ...originalTitlePosition, x: newX, y: newY });
      } else if (isResizing && resizeHandle) {
        // Scale uniformly based on drag direction
        let scaleFactor = 0;
        if (resizeHandle === 'se') {
          scaleFactor = (dx + dy) / 2;
        } else if (resizeHandle === 'sw') {
          scaleFactor = (-dx + dy) / 2;
        } else if (resizeHandle === 'ne') {
          scaleFactor = (dx - dy) / 2;
        } else if (resizeHandle === 'nw') {
          scaleFactor = (-dx - dy) / 2;
        }
        
        const newWidth = Math.max(0.15, Math.min(0.9, originalTitlePosition.width + scaleFactor));
        onTitlePositionChange({ ...originalTitlePosition, width: newWidth });
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
    showCenterLine = false;
  }

  function handleClick(e: MouseEvent) {
    const coords = getCanvasCoords(e);
    
    if (titleConfig?.enabled && titleConfig.text && isInsideTitle(coords.x, coords.y) && onTitleClick) {
      onTitleClick();
      return;
    }
    
    if (waveformConfig?.enabled && isInsideWaveform(coords.x, coords.y) && onWaveformClick) {
      onWaveformClick();
      return;
    }
    
    // Clicked on canvas background (outside any overlay)
    if (onBackgroundClick) {
      onBackgroundClick();
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
     try {
       render();
     } catch (err) {
       console.error('[CompositionCanvas] Error in renderFrame:', err);
     }
   }

  export function getCanvas(): HTMLCanvasElement | null {
    return canvas;
  }

</script>

<div class="composition-container" bind:this={container}>
  <canvas
    bind:this={canvas}
    class="composition-canvas"
    class:editing={waveformConfig?.isEditing || titleConfig?.isEditing}
    class:dragging={isDragging || isResizing}
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
    /* Allow scroll by default */
    touch-action: pan-y pinch-zoom;
  }
  
  .composition-canvas.editing,
  .composition-canvas.dragging {
    /* Disable scroll when element is selected (ready for drag) or actively dragging */
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
