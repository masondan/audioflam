export interface CompositorState {
  image: HTMLImageElement | null;
  imageRect: { x: number; y: number; width: number; height: number };
}

export interface WaveformPosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface WaveformConfig {
  enabled: boolean;
  position: WaveformPosition;
  color: string;
  style: 'bars' | 'thin' | 'blocks';
  frequencyData?: Uint8Array;
  isEditing?: boolean;
  opacity?: number;
}

export interface TitlePosition {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TitleConfig {
  enabled: boolean;
  text: string;
  font: 'Inter' | 'Roboto Slab' | 'Lora';
  style: 'transparent' | 'background';
  color: string;
  position: TitlePosition;
  isEditing?: boolean;
}

export interface LightEffectConfig {
  enabled: boolean;
  opacity: number;
  speed: number;
  phase: number;
}

export interface LayerConfig {
  waveform?: WaveformConfig;
  title?: TitleConfig;
  lightEffect?: LightEffectConfig;
}

export function calculateCanvasDimensions(
  imageWidth: number | null,
  imageHeight: number | null,
  containerWidth: number
): { width: number; height: number } {
  if (!imageWidth || !imageHeight) {
    return { width: containerWidth, height: Math.round(containerWidth * (16 / 9)) };
  }
  
  const aspectRatio = imageHeight / imageWidth;
  return {
    width: containerWidth,
    height: Math.round(containerWidth * aspectRatio)
  };
}

export function renderImageLayer(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  canvasWidth: number,
  canvasHeight: number
): void {
  ctx.drawImage(image, 0, 0, canvasWidth, canvasHeight);
}

export function renderFrame(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  image: HTMLImageElement | null,
  layers: LayerConfig
): void {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (image) {
    renderImageLayer(ctx, image, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (layers.lightEffect?.enabled) {
    renderLightEffectLayer(ctx, canvas, layers.lightEffect);
  }

  if (layers.waveform?.enabled) {
    renderWaveformLayer(ctx, canvas, layers.waveform);
  }

  if (layers.title?.enabled && layers.title.text) {
    renderTitleLayer(ctx, canvas, layers.title);
  }
}

export function renderWaveformLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: WaveformConfig
): void {
  const { position, color, style, frequencyData, isEditing, opacity = 1 } = config;
  
  const x = position.x * canvas.width;
  const y = position.y * canvas.height;
  const width = position.width * canvas.width;
  const height = position.height * canvas.height;

  ctx.save();
  ctx.globalAlpha = opacity;

  if (isEditing) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;

    // Corner handles only
    const cornerHandleSize = 18;
    const cornerHandles = [
      { hx: x, hy: y },
      { hx: x + width, hy: y },
      { hx: x, hy: y + height },
      { hx: x + width, hy: y + height }
    ];

    for (const handle of cornerHandles) {
      ctx.beginPath();
      ctx.arc(handle.hx, handle.hy, cornerHandleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  const data = frequencyData || generateStaticWaveformData(32);
  
  if (style === 'bars') {
    drawBarsWaveform(ctx, x, y, width, height, data, color);
  } else if (style === 'thin') {
    drawThinWaveform(ctx, x, y, width, height, data, color);
  } else {
    drawBlocksWaveform(ctx, x, y, width, height, data, color);
  }

  ctx.restore();
}

// Cache static waveform data to prevent flickering during re-renders
let cachedStaticWaveformData: Uint8Array | null = null;

function generateStaticWaveformData(count: number): Uint8Array {
  // Return cached data if available and same size
  if (cachedStaticWaveformData && cachedStaticWaveformData.length === count) {
    return cachedStaticWaveformData;
  }
  
  const data = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    // Use deterministic pseudo-random based on index for consistent appearance
    const pseudoRandom = Math.sin(i * 12.9898 + i * 78.233) * 43758.5453;
    const randomPart = (pseudoRandom - Math.floor(pseudoRandom)) * 40;
    data[i] = 80 + Math.sin(i * 0.5) * 60 + randomPart;
  }
  
  cachedStaticWaveformData = data;
  return data;
}

function drawBarsWaveform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Uint8Array,
  color: string
): void {
  // Waveform 1: Solid vertical bars, no center line, bars closer together
  const barCount = Math.min(data.length, 32);
  const totalBarSpace = width / barCount;
  const barWidth = totalBarSpace * 0.75;
  const gap = totalBarSpace * 0.25;
  const centerY = y + height / 2;
  const maxBarHeight = height / 2 - 4;

  ctx.fillStyle = color;

  for (let i = 0; i < barCount; i++) {
    const barX = x + i * totalBarSpace + gap / 2;
    const normalized = data[Math.floor(i * data.length / barCount)] / 255;
    const barHeight = Math.max(6, normalized * maxBarHeight);
    const radius = Math.min(barWidth / 2, 4);

    // Single continuous bar spanning both directions from center
    ctx.beginPath();
    roundedRect(ctx, barX, centerY - barHeight, barWidth, barHeight * 2, radius);
    ctx.fill();
  }
}

function drawThinWaveform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Uint8Array,
  color: string
): void {
  // Waveform 2: Very thin bars, densely packed
  const lineCount = Math.min(data.length, 80);
  const spacing = width / lineCount;
  const barWidth = Math.max(1.5, spacing * 0.4);
  const centerY = y + height / 2;
  const maxLineHeight = height / 2 - 2;

  ctx.fillStyle = color;

  for (let i = 0; i < lineCount; i++) {
    const lineX = x + i * spacing + (spacing - barWidth) / 2;
    const normalized = data[Math.floor(i * data.length / lineCount)] / 255;
    const lineHeight = Math.max(4, normalized * maxLineHeight);
    const radius = Math.min(barWidth / 2, 1);

    // Single continuous bar spanning both directions from center
    ctx.beginPath();
    roundedRect(ctx, lineX, centerY - lineHeight, barWidth, lineHeight * 2, radius);
    ctx.fill();
  }
}

function drawBlocksWaveform(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  data: Uint8Array,
  color: string
): void {
  // Waveform 3: Building blocks - more columns, smaller blocks
  const columnCount = Math.min(data.length, 40);
  const totalColumnSpace = width / columnCount;
  const columnWidth = totalColumnSpace * 0.75;
  const columnGap = totalColumnSpace * 0.25;
  const maxSegments = 12;
  const segmentGap = 2;
  const segmentHeight = (height - (maxSegments - 1) * segmentGap) / maxSegments;

  ctx.fillStyle = color;

  for (let i = 0; i < columnCount; i++) {
    const colX = x + i * totalColumnSpace + columnGap / 2;
    const normalized = data[Math.floor(i * data.length / columnCount)] / 255;
    const segments = Math.max(1, Math.round(normalized * maxSegments));

    for (let j = 0; j < segments; j++) {
      const segY = y + height - (j + 1) * (segmentHeight + segmentGap) + segmentGap;
      ctx.fillRect(colX, segY, columnWidth, segmentHeight);
    }
  }
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number
): void {
  ctx.beginPath();
  radius = Math.min(radius, width / 2, height / 2);
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = url;
  });
}

export function renderTitleLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: TitleConfig
): void {
  const { position, text, font, style, color, isEditing } = config;

  const x = position.x * canvas.width;
  const y = position.y * canvas.height;
  const width = position.width * canvas.width;
  const height = position.height * canvas.height;

  ctx.save();

  const fontFamily = font === 'Inter' 
    ? "'Inter', sans-serif" 
    : font === 'Roboto Slab' 
      ? "'Roboto Slab', serif" 
      : "'Lora', serif";

  const lines = text.split('\n');
  const lineHeight = height / Math.max(lines.length, 1);
  const fontSize = Math.min(lineHeight * 0.8, width * 0.15);

  ctx.font = `700 ${fontSize}px ${fontFamily}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padding = fontSize * 0.3;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineY = y + (i + 0.5) * lineHeight;
    const lineX = x + width / 2;
    const textMetrics = ctx.measureText(line);
    const textWidth = textMetrics.width;

    if (style === 'background') {
      ctx.fillStyle = color;
      const bgX = lineX - textWidth / 2 - padding;
      const bgY = lineY - fontSize / 2 - padding / 2;
      const bgWidth = textWidth + padding * 2;
      const bgHeight = fontSize + padding;
      roundedRect(ctx, bgX, bgY, bgWidth, bgHeight, 4);
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.fillText(line, lineX, lineY);
    } else {
      ctx.fillStyle = color;
      ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
      ctx.fillText(line, lineX, lineY);
      ctx.shadowColor = 'transparent';
    }
  }

  if (isEditing) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;

    const cornerHandleSize = 18;
    const cornerHandles = [
      { hx: x, hy: y },
      { hx: x + width, hy: y },
      { hx: x, hy: y + height },
      { hx: x + width, hy: y + height }
    ];

    for (const handle of cornerHandles) {
      ctx.beginPath();
      ctx.arc(handle.hx, handle.hy, cornerHandleSize / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  ctx.restore();
}

export function renderLightEffectLayer(
  ctx: CanvasRenderingContext2D,
  canvas: HTMLCanvasElement,
  config: LightEffectConfig
): void {
  const { opacity, speed, phase } = config;
  
  if (opacity <= 0) return;

  ctx.save();
  ctx.globalAlpha = opacity * 1.8;

  const bokehCircles = generateBokehPositions(canvas.width, canvas.height, phase, speed);

  for (const circle of bokehCircles) {
    const gradient = ctx.createRadialGradient(
      circle.x, circle.y, 0,
      circle.x, circle.y, circle.radius
    );
    
    gradient.addColorStop(0, circle.color);
    gradient.addColorStop(0.5, circle.color.replace(/[\d.]+\)$/, `${circle.opacity * 0.5})`));
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(circle.x, circle.y, circle.radius, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

interface BokehCircle {
  x: number;
  y: number;
  radius: number;
  color: string;
  opacity: number;
}

function generateBokehPositions(
  width: number,
  height: number,
  phase: number,
  speed: number
): BokehCircle[] {
  const circles: BokehCircle[] = [];
  const baseCount = 16;
  
  const bokehColors = [
    { r: 255, g: 248, b: 200 },  // Warm cream
    { r: 255, g: 220, b: 180 },  // Peach
    { r: 255, g: 200, b: 150 },  // Light orange
    { r: 255, g: 180, b: 180 },  // Soft pink
    { r: 220, g: 200, b: 255 },  // Soft lavender
    { r: 200, g: 230, b: 255 },  // Light blue
    { r: 255, g: 240, b: 220 },  // Warm white
    { r: 255, g: 210, b: 160 },  // Amber
    { r: 240, g: 220, b: 200 },  // Beige
    { r: 255, g: 190, b: 200 },  // Rose
  ];

  for (let i = 0; i < baseCount; i++) {
    const seed = i * 7.31;
    const animOffset = phase * speed * 0.025;
    
    const edgeIndex = i % 4;
    let baseX: number, baseY: number;
    
    switch (edgeIndex) {
      case 0: // Top edge
        baseX = (Math.sin(seed) * 0.5 + 0.5) * width;
        baseY = Math.sin(seed * 1.3 + animOffset) * height * 0.2 + height * 0.05;
        break;
      case 1: // Right edge
        baseX = width - Math.sin(seed * 0.9) * width * 0.2 - width * 0.05;
        baseY = (Math.sin(seed * 1.7) * 0.5 + 0.5) * height;
        break;
      case 2: // Bottom edge
        baseX = (Math.cos(seed * 1.1) * 0.5 + 0.5) * width;
        baseY = height - Math.sin(seed * 0.8 + animOffset * 0.7) * height * 0.2 - height * 0.05;
        break;
      default: // Left edge
        baseX = Math.sin(seed * 1.2) * width * 0.2 + width * 0.05;
        baseY = (Math.cos(seed * 0.7) * 0.5 + 0.5) * height;
        break;
    }
    
    const wobbleX = Math.sin(animOffset + seed) * 25;
    const wobbleY = Math.cos(animOffset * 0.8 + seed * 1.3) * 20;
    
    const minDimension = Math.min(width, height);
    const sizeVariation = 0.08 + Math.abs(Math.sin(seed * 2.1)) * 0.12;
    const radius = minDimension * sizeVariation;
    
    const colorIndex = i % bokehColors.length;
    const c = bokehColors[colorIndex];
    const baseOpacity = 0.6 + Math.sin(seed * 3.2) * 0.25;
    
    circles.push({
      x: baseX + wobbleX,
      y: baseY + wobbleY,
      radius,
      color: `rgba(${c.r}, ${c.g}, ${c.b}, ${baseOpacity})`,
      opacity: baseOpacity
    });
  }

  return circles;
}
