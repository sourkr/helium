/**
 * Shared primitives for the canvas-rendered game UI.
 *
 * The UI is drawn into a fixed 320x240 virtual surface which is scaled by the
 * configured GUI scale. Everything here is presentation-only and has no
 * React/DOM event behaviour beyond the canvas 2D API.
 */

import { drawBitmapText } from './bitmapText';

export const GUI_WIDTH = 320;
export const GUI_HEIGHT = 240;

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SliderSpec {
  min: number;
  max: number;
  step: number;
  onInput: (value: number) => void;
}

export interface TextSpec {
  id: string;
  value: string;
  placeholder?: string;
  maxLength?: number;
  onChange: (value: string) => void;
}

export interface Region {
  id: string;
  rect: Rect;
  clip?: Rect;
  onMouseDown?: (event: MouseEvent) => void;
  onRightClick?: (event: MouseEvent) => void;
  onHover?: () => void;
  onDoubleClick?: () => void;
  text?: TextSpec;
  slider?: SliderSpec;
  scrollId?: string;
  cursor?: 'pointer' | 'text' | 'ew-resize' | 'default';
}

export interface ScrollArea {
  id: string;
  rect: Rect;
  contentHeight: number;
  scroll: number;
}

export interface GuiFrame {
  regions: Region[];
  scrollAreas: ScrollArea[];
  pointer: { x: number; y: number };
  xOffset: number;
  yOffset: number;
  clip?: Rect;
}

export function createGuiFrame(pointerX: number, pointerY: number): GuiFrame {
  return {
    regions: [],
    scrollAreas: [],
    pointer: { x: pointerX, y: pointerY },
    xOffset: 0,
    yOffset: 0,
  };
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/** Resolves the GUI scale. `0` means Auto (largest integer scale that fits). */
export function resolveGuiScale(guiScale: number, viewWidth: number, viewHeight: number): number {
  if (!Number.isFinite(guiScale) || guiScale <= 0) {
    const fitted = Math.floor(Math.min(viewWidth / GUI_WIDTH, viewHeight / GUI_HEIGHT));
    return clamp(Number.isFinite(fitted) ? fitted : 1, 1, 4);
  }
  return clamp(Math.round(guiScale), 1, 4);
}

export function pointInRect(x: number, y: number, rect: Rect): boolean {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

export function hitRegion(frame: GuiFrame, x: number, y: number): Region | undefined {
  for (let i = frame.regions.length - 1; i >= 0; i--) {
    const region = frame.regions[i];
    if (!pointInRect(x, y, region.rect)) continue;
    if (region.clip && !pointInRect(x, y, region.clip)) continue;
    return region;
  }
  return undefined;
}

export function hitScrollArea(
  frame: GuiFrame,
  x: number,
  y: number,
): ScrollArea | undefined {
  for (let i = frame.scrollAreas.length - 1; i >= 0; i--) {
    const area = frame.scrollAreas[i];
    if (pointInRect(x, y, area.rect)) return area;
  }
  return undefined;
}

export function pushRegion(frame: GuiFrame, region: Omit<Region, 'rect'> & { rect: Rect }): void {
  frame.regions.push({
    ...region,
    rect: {
      x: region.rect.x + frame.xOffset,
      y: region.rect.y + frame.yOffset,
      w: region.rect.w,
      h: region.rect.h,
    },
    clip: frame.clip,
  });
}

export function beginScroll(
  frame: GuiFrame,
  id: string,
  rect: Rect,
  contentHeight: number,
  scrollMap: Record<string, number>,
): { scroll: number; maxScroll: number } {
  const maxScroll = Math.max(0, contentHeight - rect.h);
  const scroll = clamp(scrollMap[id] ?? 0, 0, maxScroll);
  scrollMap[id] = scroll;
  frame.scrollAreas.push({ id, rect, contentHeight, scroll });
  return { scroll, maxScroll };
}

export class ImageCache {
  private images = new Map<string, HTMLImageElement>();

  get(url: string | null | undefined): HTMLImageElement | null {
    if (!url) return null;
    const existing = this.images.get(url);
    if (existing) return existing.complete && existing.naturalWidth > 0 ? existing : null;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    this.images.set(url, image);
    return null;
  }
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 8,
  color = '#ffffff',
  align: CanvasTextAlign = 'left',
  _bold = false,
  maxWidth?: number,
  snapScale = 0,
): void {
  // `_bold` is accepted for existing call sites but ignored: every label uses
  // the normal glyphs from assets/font.
  drawBitmapText(ctx, text, x, y, size, color, align, maxWidth, snapScale);
}

export function truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = '…';
  let low = 0;
  let high = text.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (ctx.measureText(`${text.slice(0, mid)}${ellipsis}`).width <= maxWidth) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return `${text.slice(0, low)}${ellipsis}`;
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  fill = 'rgba(18,24,31,0.94)',
  border = 'rgba(255,255,255,0.18)',
): void {
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.strokeStyle = border;
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
}

export function drawNineSlice(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  rect: Rect,
  slice: number,
): boolean {
  if (!image || !image.complete || image.naturalWidth === 0) return false;
  const s = clamp(slice, 1, Math.min(image.naturalWidth, image.naturalHeight) / 2);
  const srcW = image.naturalWidth - s * 2;
  const srcH = image.naturalHeight - s * 2;
  if (srcW <= 0 || srcH <= 0) return false;
  const dstS = Math.min(s, rect.w / 2, rect.h / 2);
  const dstMidW = Math.max(0, rect.w - dstS * 2);
  const dstMidH = Math.max(0, rect.h - dstS * 2);
  ctx.drawImage(image, 0, 0, s, s, rect.x, rect.y, dstS, dstS);
  ctx.drawImage(image, s, 0, srcW, s, rect.x + dstS, rect.y, dstMidW, dstS);
  ctx.drawImage(image, image.naturalWidth - s, 0, s, s, rect.x + rect.w - dstS, rect.y, dstS, dstS);
  ctx.drawImage(image, 0, s, s, srcH, rect.x, rect.y + dstS, dstS, dstMidH);
  ctx.drawImage(
    image,
    s,
    s,
    srcW,
    srcH,
    rect.x + dstS,
    rect.y + dstS,
    dstMidW,
    dstMidH,
  );
  ctx.drawImage(
    image,
    image.naturalWidth - s,
    s,
    s,
    srcH,
    rect.x + rect.w - dstS,
    rect.y + dstS,
    dstS,
    dstMidH,
  );
  ctx.drawImage(image, 0, image.naturalHeight - s, s, s, rect.x, rect.y + rect.h - dstS, dstS, dstS);
  ctx.drawImage(
    image,
    s,
    image.naturalHeight - s,
    srcW,
    s,
    rect.x + dstS,
    rect.y + rect.h - dstS,
    dstMidW,
    dstS,
  );
  ctx.drawImage(
    image,
    image.naturalWidth - s,
    image.naturalHeight - s,
    s,
    s,
    rect.x + rect.w - dstS,
    rect.y + rect.h - dstS,
    dstS,
    dstS,
  );
  return true;
}

export function drawTexturedButton(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  rect: Rect,
  slice: number,
  label: string,
  active: boolean,
  disabled: boolean,
  textSize = 8,
  textActive = active,
): void {
  if (!drawNineSlice(ctx, image, rect, slice)) {
    drawPanel(
      ctx,
      rect,
      disabled
        ? 'rgba(48,48,48,0.9)'
        : active
          ? 'rgba(80,120,70,0.96)'
          : 'rgba(42,72,42,0.94)',
      'rgba(0,0,0,0.75)',
    );
  }
  if (label) {
    drawBitmapText(
      ctx,
      label,
      rect.x + rect.w / 2,
      rect.y + rect.h / 2,
      textSize,
      disabled ? '#a8a8a8' : textActive ? '#ffffa0' : '#ffffff',
      'center',
      rect.w - 6,
    );
  }
}

export function drawImageFit(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!image || !image.complete || image.naturalWidth === 0) return;
  const scale = Math.min(w / image.naturalWidth, h / image.naturalHeight);
  const dw = image.naturalWidth * scale;
  const dh = image.naturalHeight * scale;
  ctx.drawImage(image, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
}

export function drawImageCropped(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  srcX: number,
  srcY: number,
  srcW: number,
  srcH: number,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  if (!image || !image.complete || image.naturalWidth === 0) return;
  ctx.drawImage(image, srcX, srcY, srcW, srcH, x, y, w, h);
}

export function drawBar(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  ratio: number,
  fill: string,
  background = '#1c232b',
): void {
  ctx.fillStyle = background;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  ctx.fillStyle = fill;
  ctx.fillRect(rect.x, rect.y, Math.max(0, rect.w * clamp(ratio, 0, 1)), rect.h);
  ctx.strokeStyle = 'rgba(0,0,0,0.65)';
  ctx.lineWidth = 1;
  ctx.strokeRect(rect.x + 0.5, rect.y + 0.5, rect.w - 1, rect.h - 1);
}

