/**
 * Direct renderer for all canvas text.
 *
 * Text is drawn from `assets/font/ascii.png` itself rather than from a generated
 * FontFace, so glyphs keep the atlas' exact pixel shapes and spacing. Every
 * glyph uses its normal, non-bold form. The atlas is loaded once, tinted copies
 * are cached per text color, and the renderer falls back to the generated
 * `MinecraftAscii` font only until the PNG is ready. Text has no drop shadow.
 */

const FONT_ATLAS_URLS = import.meta.glob('/assets/font/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

interface GlyphMetrics {
  /** Cropped source x inside the atlas (leading empty columns removed). */
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  advance: number;
}

interface AtlasData {
  image: HTMLImageElement;
  cellW: number;
  cellH: number;
  metrics: GlyphMetrics[];
  tinted: Map<string, HTMLCanvasElement>;
}

interface DrawnGlyph {
  cell: number;
  advance: number;
}

let atlasImage: HTMLImageElement | null = null;
let atlasRequested = false;
let atlasData: AtlasData | null = null;

// CP437 glyphs that are not simply ASCII codes. The indices match the cells in
// Minecraft's ascii.png and mirror the extra mappings in bitmapFont.ts.
const EXTRA_GLYPH_CELLS: Readonly<Record<string, number>> = {
  '\u00a3': 0x9c, // £
  '\u00ab': 0xae, // «
  '\u00b0': 0xf8, // °
  '\u00b1': 0xf1, // ±
  '\u00b7': 0xfa, // ·
  '\u00bb': 0xaf, // »
  '\u00d7': 0x78, // × (uses the clean x cell)
  '\u00f7': 0xf6, // ÷
  '\u2022': 0xf9, // •
  '\u2264': 0xf3, // ≤
  '\u2265': 0xf2, // ≥
};

function findAtlasUrl(): string | null {
  for (const [path, url] of Object.entries(FONT_ATLAS_URLS)) {
    const file = (path.split('/').pop() ?? '').toLowerCase();
    if (file.startsWith('ascii.') && url) return url;
  }
  return Object.values(FONT_ATLAS_URLS)[0] ?? null;
}

function getAtlasImage(): HTMLImageElement | null {
  if (!atlasRequested) {
    atlasRequested = true;
    const url = findAtlasUrl();
    if (!url) return null;
    const image = new Image();
    image.decoding = 'async';
    image.src = url;
    atlasImage = image;
  }
  return atlasImage && atlasImage.complete && atlasImage.naturalWidth > 0 ? atlasImage : null;
}

function buildAtlasData(image: HTMLImageElement): AtlasData {
  const cellW = Math.max(1, Math.floor(image.width / 16));
  const cellH = Math.max(1, Math.floor(image.height / 16));
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  if (!ctx) {
    const spaceAdvance = Math.round(cellW / 2);
    return {
      image,
      cellW,
      cellH,
      metrics: Array.from({ length: 256 }, () => ({
        sx: 0,
        sy: 0,
        sw: 0,
        sh: cellH,
        advance: spaceAdvance,
      })),
      tinted: new Map(),
    };
  }

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  const pixels = ctx.getImageData(0, 0, image.width, image.height).data;
  const metrics: GlyphMetrics[] = [];

  for (let cell = 0; cell < 256; cell++) {
    const ox = (cell % 16) * cellW;
    const oy = Math.floor(cell / 16) * cellH;
    let minX = cellW;
    let maxX = -1;

    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        if (pixels[((oy + y) * image.width + ox + x) * 4 + 3] >= 64) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
        }
      }
    }

    if (maxX < 0) {
      metrics.push({
        sx: ox,
        sy: oy,
        sw: 0,
        sh: cellH,
        advance: Math.round(cellW / 2),
      });
      continue;
    }

    const sw = maxX - minX + 1;
    metrics.push({
      sx: ox + minX,
      sy: oy,
      sw,
      sh: cellH,
      // Minecraft leaves one blank column after each glyph.
      advance: sw + 1,
    });
  }

  return { image, cellW, cellH, metrics, tinted: new Map() };
}

function getAtlasData(): AtlasData | null {
  const image = getAtlasImage();
  if (!image) return null;
  if (!atlasData) atlasData = buildAtlasData(image);
  return atlasData;
}

function getTintedCanvas(data: AtlasData, color: string): HTMLCanvasElement {
  const cached = data.tinted.get(color);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = data.image.width;
  canvas.height = data.image.height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(data.image, 0, 0);
    ctx.globalCompositeOperation = 'source-in';
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  data.tinted.set(color, canvas);
  return canvas;
}

function glyphCell(char: string): number {
  const code = char.codePointAt(0) ?? 0;
  if (code >= 0x20 && code <= 0x7e) return code;
  return EXTRA_GLYPH_CELLS[char] ?? 0x3f; // '?' for unsupported glyphs
}

function prepareGlyphs(
  text: string,
  data: AtlasData,
  scale: number,
  maxWidth?: number,
): DrawnGlyph[] {
  // Keep advances on whole virtual pixels. Fractional advances can round two
  // neighbouring glyphs onto the same pixel and make letters touch.
  const advanceFor = (cell: number): number => {
    const metric = data.metrics[cell];
    const glyphWidth = Math.round(metric.sw * scale);
    return Math.max(1, glyphWidth + 1, Math.ceil(metric.advance * scale));
  };
  let glyphs = Array.from(text).map((char) => {
    const cell = glyphCell(char);
    return { cell, advance: advanceFor(cell) };
  });

  if (maxWidth !== undefined) {
    const total = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0);
    if (total > maxWidth) {
      const dotAdvance = advanceFor(0x2e);
      const limit = Math.max(0, maxWidth - dotAdvance * 3);
      const kept: DrawnGlyph[] = [];
      let width = 0;
      for (const glyph of glyphs) {
        if (width + glyph.advance > limit) break;
        kept.push(glyph);
        width += glyph.advance;
      }
      glyphs = [...kept, ...[0x2e, 0x2e, 0x2e].map((cell) => ({ cell, advance: dotAdvance }))];
    }
  }

  return glyphs;
}

function drawFallbackText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string,
  align: CanvasTextAlign,
  maxWidth?: number,
): void {
  ctx.save();
  ctx.font = `${size}px MinecraftAscii, "DM Sans", monospace`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  let rendered = text;
  if (maxWidth !== undefined && ctx.measureText(rendered).width > maxWidth) {
    while (rendered.length > 0 && ctx.measureText(`${rendered}...`).width > maxWidth) {
      rendered = rendered.slice(0, -1);
    }
    rendered = `${rendered}...`;
  }
  ctx.fillStyle = color;
  ctx.fillText(rendered, x, y);
  ctx.restore();
}

/** Draws a label directly from `assets/font/ascii.png` in its normal style. */
export function drawBitmapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size = 8,
  color = '#ffffff',
  align: CanvasTextAlign = 'left',
  maxWidth?: number,
  snapScale = 0,
): void {
  const data = getAtlasData();
  if (!data || !text) {
    drawFallbackText(ctx, text, x, y, size, color, align, maxWidth);
    return;
  }

  const scale = size / data.cellH;
  const glyphs = prepareGlyphs(text, data, scale, maxWidth);
  const totalWidth = glyphs.reduce((sum, glyph) => sum + glyph.advance, 0);
  let pen = align === 'center' ? x - totalWidth / 2 : align === 'right' ? x - totalWidth : x;
  const rawY = y - size / 2;
  // Snap to the device pixel grid when the GUI scale is known, otherwise keep
  // whole virtual pixels. This keeps glyphs crisp without adding a top gap.
  const destY = snapScale > 0 ? Math.round(rawY * snapScale) / snapScale : Math.round(rawY);
  const fill = getTintedCanvas(data, color);

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  for (const glyph of glyphs) {
    const metric = data.metrics[glyph.cell];
    if (metric.sw > 0) {
      const dx = Math.round(pen);
      const dw = Math.max(1, Math.round(metric.sw * scale));
      const dh = Math.max(1, Math.round(size));
      ctx.drawImage(fill, metric.sx, metric.sy, metric.sw, metric.sh, dx, destY, dw, dh);
    }
    pen += glyph.advance;
  }
  ctx.restore();
}
