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

export interface LayerConfig {
  waveform?: WaveformConfig;
  title?: TitleConfig;
  lightEffect?: {
    enabled: boolean;
    opacity: number;
    speed: number;
    phase: number;
  };
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
  const { position, color, style, frequencyData, isEditing } = config;
  
  const x = position.x * canvas.width;
  const y = position.y * canvas.height;
  const width = position.width * canvas.width;
  const height = position.height * canvas.height;

  ctx.save();

  if (isEditing) {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    ctx.fillStyle = 'white';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.lineWidth = 1;

    // Corner handles - larger circles
    const cornerHandleSize = 12;
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

    // Edge handles - chunky pill/capsule shapes
    const edgeHandleWidth = 6;
    const edgeHandleLength = 20;
    const edgeHandleRadius = edgeHandleWidth / 2;

    // Top edge handle (horizontal pill)
    roundedRect(ctx, x + width / 2 - edgeHandleLength / 2, y - edgeHandleWidth / 2, edgeHandleLength, edgeHandleWidth, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();

    // Bottom edge handle (horizontal pill)
    ctx.beginPath();
    roundedRect(ctx, x + width / 2 - edgeHandleLength / 2, y + height - edgeHandleWidth / 2, edgeHandleLength, edgeHandleWidth, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();

    // Left edge handle (vertical pill)
    ctx.beginPath();
    roundedRect(ctx, x - edgeHandleWidth / 2, y + height / 2 - edgeHandleLength / 2, edgeHandleWidth, edgeHandleLength, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();

    // Right edge handle (vertical pill)
    ctx.beginPath();
    roundedRect(ctx, x + width - edgeHandleWidth / 2, y + height / 2 - edgeHandleLength / 2, edgeHandleWidth, edgeHandleLength, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();
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

function generateStaticWaveformData(count: number): Uint8Array {
  const data = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    data[i] = 80 + Math.sin(i * 0.5) * 60 + Math.random() * 40;
  }
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

    const cornerHandleSize = 12;
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

    const edgeHandleWidth = 6;
    const edgeHandleLength = 20;
    const edgeHandleRadius = edgeHandleWidth / 2;

    roundedRect(ctx, x + width / 2 - edgeHandleLength / 2, y - edgeHandleWidth / 2, edgeHandleLength, edgeHandleWidth, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundedRect(ctx, x + width / 2 - edgeHandleLength / 2, y + height - edgeHandleWidth / 2, edgeHandleLength, edgeHandleWidth, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundedRect(ctx, x - edgeHandleWidth / 2, y + height / 2 - edgeHandleLength / 2, edgeHandleWidth, edgeHandleLength, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();

    ctx.beginPath();
    roundedRect(ctx, x + width - edgeHandleWidth / 2, y + height / 2 - edgeHandleLength / 2, edgeHandleWidth, edgeHandleLength, edgeHandleRadius);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}
