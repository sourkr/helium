/**
 * Builds crisp, pixel-accurate in-memory TrueType (.ttf) fonts directly from
 * Minecraft's `/assets/font/ascii.png` 16x16 bitmap glyph atlas at runtime,
 * registering both Regular (400) and authentic Minecraft Bold (700) weights
 * under the `MinecraftAscii` font family via the browser FontFace API.
 */

const FONT_ATLAS_URLS = import.meta.glob('/assets/font/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

function findAsciiFontUrl(): string | null {
  for (const [path, url] of Object.entries(FONT_ATLAS_URLS)) {
    const file = (path.split('/').pop() ?? '').toLowerCase();
    if (file.startsWith('ascii.') && url) return url;
  }
  const first = Object.values(FONT_ATLAS_URLS)[0];
  return first ?? null;
}

interface GlyphRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

interface GlyphData {
  codePoint: number;
  advanceWidth: number;
  lsb: number;
  rects: GlyphRect[];
}

// Additional CP437 symbols present in Minecraft's standard 16x16 ascii.png sheet
const EXTRA_CP437_CELLS: ReadonlyArray<{ codePoint: number; cellIndex: number }> = [
  { codePoint: 0x00a3, cellIndex: 0x9c }, // £
  { codePoint: 0x00ab, cellIndex: 0xae }, // «
  { codePoint: 0x00b0, cellIndex: 0xf8 }, // °
  { codePoint: 0x00b1, cellIndex: 0xf1 }, // ±
  { codePoint: 0x00b7, cellIndex: 0xfa }, // ·
  { codePoint: 0x00bb, cellIndex: 0xaf }, // »
  { codePoint: 0x00d7, cellIndex: 0x78 }, // × (mapped cleanly from x cell if needed)
  { codePoint: 0x00f7, cellIndex: 0xf6 }, // ÷
  { codePoint: 0x2022, cellIndex: 0xf9 }, // •
  { codePoint: 0x2264, cellIndex: 0xf3 }, // ≤
  { codePoint: 0x2265, cellIndex: 0xf2 }, // ≥
];

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function extractGlyphsFromAtlas(img: HTMLImageElement, bold: boolean): GlyphData[] {
  const width = img.width;
  const height = img.height;
  const cellW = Math.max(1, Math.floor(width / 16));
  const cellH = Math.max(1, Math.floor(height / 16));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height).data;

  // Detect whether the PNG uses alpha transparency or opaque black background
  let hasTransparentPixels = false;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 128) {
      hasTransparentPixels = true;
      break;
    }
  }

  const isPixelLit = (px: number, py: number): boolean => {
    const idx = (py * width + px) * 4;
    if (hasTransparentPixels) {
      return pixels[idx + 3] >= 64;
    }
    const lum = pixels[idx] * 0.299 + pixels[idx + 1] * 0.587 + pixels[idx + 2] * 0.114;
    return lum >= 96;
  };

  // Scale so 8x8 bitmap cell maps cleanly to 800 font units (100 units per pixel)
  const pxScale = Math.round(800 / cellH);
  const baselineRow = Math.round(cellH * 0.875); // row 7 in 8px tall Minecraft font

  const extractCell = (codePoint: number, cellIndex: number): GlyphData => {
    if (codePoint === 0x20) {
      return {
        codePoint,
        advanceWidth: Math.round(cellW * 0.5) * pxScale,
        lsb: 0,
        rects: [],
      };
    }

    const col = cellIndex % 16;
    const row = Math.floor(cellIndex / 16);
    const ox = col * cellW;
    const oy = row * cellH;

    // Build boolean grid with optional Minecraft +1px horizontal bold smear
    const gridW = cellW + (bold ? 1 : 0);
    const grid: boolean[][] = Array.from({ length: cellH }, () =>
      new Array<boolean>(gridW).fill(false),
    );

    let minX = gridW;
    let maxX = -1;

    for (let y = 0; y < cellH; y++) {
      for (let x = 0; x < cellW; x++) {
        if (isPixelLit(ox + x, oy + y)) {
          grid[y][x] = true;
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (bold) {
            grid[y][x + 1] = true;
            if (x + 1 > maxX) maxX = x + 1;
          }
        }
      }
    }

    if (maxX < 0) {
      return {
        codePoint,
        advanceWidth: Math.round(cellW * 0.5) * pxScale,
        lsb: 0,
        rects: [],
      };
    }

    // Shift glyph left so leading empty columns don't create awkward gaps (Minecraft proportional spacing)
    const xShift = minX;
    const rects: GlyphRect[] = [];

    for (let y = 0; y < cellH; y++) {
      let x = 0;
      while (x < gridW) {
        if (!grid[y][x]) {
          x++;
          continue;
        }
        const runStart = x;
        while (x < gridW && grid[y][x]) x++;
        const runEnd = x;

        const x0 = (runStart - xShift) * pxScale;
        const x1 = (runEnd - xShift) * pxScale;
        // TrueType Y increases upwards; row 0 is top, row baselineRow is y=0
        const yTop = (baselineRow - y) * pxScale;
        const yBot = (baselineRow - (y + 1)) * pxScale;
        rects.push({ x0, y0: yBot, x1, y1: yTop });
      }
    }

    const glyphPixelWidth = maxX - minX + 1;
    // Minecraft leaves 1px gap after each glyph (+1 extra px visual breathing room)
    const advanceWidth = (glyphPixelWidth + 1) * pxScale;

    return {
      codePoint,
      advanceWidth,
      lsb: 0,
      rects,
    };
  };

  const glyphs: GlyphData[] = [];
  for (let cp = 0x20; cp <= 0x7e; cp++) {
    glyphs.push(extractCell(cp, cp));
  }
  for (const extra of EXTRA_CP437_CELLS) {
    glyphs.push(extractCell(extra.codePoint, extra.cellIndex));
  }

  glyphs.sort((a, b) => a.codePoint - b.codePoint);
  return glyphs;
}

class BinaryWriter {
  private buf: number[] = [];

  get length(): number {
    return this.buf.length;
  }

  u8(v: number) {
    this.buf.push(v & 0xff);
  }

  u16(v: number) {
    this.buf.push((v >>> 8) & 0xff, v & 0xff);
  }

  i16(v: number) {
    this.u16(v < 0 ? 0x10000 + v : v);
  }

  u32(v: number) {
    this.buf.push((v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff);
  }

  tag(s: string) {
    for (let i = 0; i < 4; i++) {
      this.u8(s.charCodeAt(i) || 0x20);
    }
  }

  bytes(arr: Uint8Array) {
    for (let i = 0; i < arr.length; i++) {
      this.buf.push(arr[i]);
    }
  }

  pad4() {
    while (this.buf.length % 4 !== 0) {
      this.buf.push(0);
    }
  }

  toUint8Array(): Uint8Array {
    return new Uint8Array(this.buf);
  }
}

function calcTableChecksum(data: Uint8Array): number {
  let sum = 0;
  const len = data.length;
  for (let i = 0; i < len; i += 4) {
    const b0 = data[i] ?? 0;
    const b1 = data[i + 1] ?? 0;
    const b2 = data[i + 2] ?? 0;
    const b3 = data[i + 3] ?? 0;
    const word = ((b0 << 24) | (b1 << 16) | (b2 << 8) | b3) >>> 0;
    sum = (sum + word) >>> 0;
  }
  return sum;
}

function encodeSimpleGlyph(rects: GlyphRect[]): Uint8Array {
  if (rects.length === 0) return new Uint8Array(0);

  let xMin = 32767;
  let yMin = 32767;
  let xMax = -32768;
  let yMax = -32768;

  for (const r of rects) {
    if (r.x0 < xMin) xMin = r.x0;
    if (r.y0 < yMin) yMin = r.y0;
    if (r.x1 > xMax) xMax = r.x1;
    if (r.y1 > yMax) yMax = r.y1;
  }

  const w = new BinaryWriter();
  w.i16(rects.length); // numberOfContours
  w.i16(xMin);
  w.i16(yMin);
  w.i16(xMax);
  w.i16(yMax);

  // Each rectangle has 4 points -> endPtsOfContours = [3, 7, 11, ...]
  for (let i = 0; i < rects.length; i++) {
    w.u16(i * 4 + 3);
  }

  w.u16(0); // instructionLength

  const totalPoints = rects.length * 4;
  // Flags: 0x01 = on-curve, 16-bit signed delta x & y
  for (let i = 0; i < totalPoints; i++) {
    w.u8(0x01);
  }

  // TrueType outer contour winding is CLOCKWISE in Y-up space:
  // (x0, y0) -> (x0, y1) -> (x1, y1) -> (x1, y0)
  const xs: number[] = [];
  const ys: number[] = [];
  for (const r of rects) {
    xs.push(r.x0, r.x0, r.x1, r.x1);
    ys.push(r.y0, r.y1, r.y1, r.y0);
  }

  let prevX = 0;
  for (let i = 0; i < xs.length; i++) {
    w.i16(xs[i] - prevX);
    prevX = xs[i];
  }

  let prevY = 0;
  for (let i = 0; i < ys.length; i++) {
    w.i16(ys[i] - prevY);
    prevY = ys[i];
  }

  w.pad4();
  return w.toUint8Array();
}

function buildTrueTypeFont(glyphs: GlyphData[], familyName: string, bold: boolean): ArrayBuffer {
  const unitsPerEm = 800;
  const ascent = 700;
  const descent = -100;
  const lineGap = 100;

  // Glyph 0 is .notdef (empty box), followed by sorted glyphs
  const notdefRects: GlyphRect[] = [
    { x0: 100, y0: 0, x1: 500, y1: 100 },
    { x0: 100, y0: 600, x1: 500, y1: 700 },
    { x0: 100, y0: 100, x1: 200, y1: 600 },
    { x0: 400, y0: 100, x1: 500, y1: 600 },
  ];

  const allGlyphs: GlyphData[] = [
    { codePoint: 0, advanceWidth: 600, lsb: 100, rects: notdefRects },
    ...glyphs,
  ];
  const numGlyphs = allGlyphs.length;

  // 1. glyf & loca
  const glyfWriter = new BinaryWriter();
  const locaOffsets: number[] = [];
  let maxPoints = 0;
  let maxContours = 0;
  let fontXMin = 0;
  let fontYMin = descent;
  let fontXMax = 600;
  let fontYMax = ascent;
  let maxAdvance = 600;

  for (const g of allGlyphs) {
    locaOffsets.push(glyfWriter.length);
    const encoded = encodeSimpleGlyph(g.rects);
    glyfWriter.bytes(encoded);

    const pts = g.rects.length * 4;
    if (pts > maxPoints) maxPoints = pts;
    if (g.rects.length > maxContours) maxContours = g.rects.length;
    if (g.advanceWidth > maxAdvance) maxAdvance = g.advanceWidth;

    for (const r of g.rects) {
      if (r.x0 < fontXMin) fontXMin = r.x0;
      if (r.y0 < fontYMin) fontYMin = r.y0;
      if (r.x1 > fontXMax) fontXMax = r.x1;
      if (r.y1 > fontYMax) fontYMax = r.y1;
    }
  }
  locaOffsets.push(glyfWriter.length);
  const glyfBytes = glyfWriter.toUint8Array();

  const locaWriter = new BinaryWriter();
  for (const off of locaOffsets) {
    locaWriter.u32(off);
  }
  const locaBytes = locaWriter.toUint8Array();

  // 2. hmtx
  const hmtxWriter = new BinaryWriter();
  for (const g of allGlyphs) {
    hmtxWriter.u16(g.advanceWidth);
    hmtxWriter.i16(g.lsb);
  }
  const hmtxBytes = hmtxWriter.toUint8Array();

  // 3. cmap (Format 4, Windows Unicode BMP platform 3 encoding 1)
  interface CmapSegment {
    start: number;
    end: number;
    delta: number;
  }
  const segments: CmapSegment[] = [];
  for (let i = 1; i < allGlyphs.length; i++) {
    const cp = allGlyphs[i].codePoint;
    const gid = i;
    const delta = (gid - cp) & 0xffff;
    const prev = segments[segments.length - 1];
    if (prev && prev.end + 1 === cp && prev.delta === delta) {
      prev.end = cp;
    } else {
      segments.push({ start: cp, end: cp, delta });
    }
  }
  // Sentinel segment
  segments.push({ start: 0xffff, end: 0xffff, delta: 1 });

  const segCount = segments.length;
  const segCountX2 = segCount * 2;
  let searchRange = 2;
  let entrySelector = 0;
  while (searchRange * 2 <= segCountX2) {
    searchRange *= 2;
    entrySelector++;
  }
  const rangeShift = segCountX2 - searchRange;

  const fmt4Writer = new BinaryWriter();
  const fmt4Length = 16 + segCount * 8;
  fmt4Writer.u16(4); // format
  fmt4Writer.u16(fmt4Length);
  fmt4Writer.u16(0); // language
  fmt4Writer.u16(segCountX2);
  fmt4Writer.u16(searchRange);
  fmt4Writer.u16(entrySelector);
  fmt4Writer.u16(rangeShift);
  for (const s of segments) fmt4Writer.u16(s.end);
  fmt4Writer.u16(0); // reservedPad
  for (const s of segments) fmt4Writer.u16(s.start);
  for (const s of segments) fmt4Writer.u16(s.delta);
  for (let i = 0; i < segCount; i++) fmt4Writer.u16(0); // idRangeOffset
  const fmt4Bytes = fmt4Writer.toUint8Array();

  const cmapWriter = new BinaryWriter();
  cmapWriter.u16(0); // version
  cmapWriter.u16(1); // numTables
  cmapWriter.u16(3); // platformID = Windows
  cmapWriter.u16(1); // encodingID = Unicode BMP
  cmapWriter.u32(12); // offset to subtable
  cmapWriter.bytes(fmt4Bytes);
  const cmapBytes = cmapWriter.toUint8Array();

  // 4. head (54 bytes)
  const headWriter = new BinaryWriter();
  headWriter.u32(0x00010000); // version
  headWriter.u32(0x00010000); // fontRevision
  headWriter.u32(0); // checkSumAdjustment (patched at end)
  headWriter.u32(0x5f0f3cf5); // magicNumber
  headWriter.u16(0x000b); // flags
  headWriter.u16(unitsPerEm);
  headWriter.u32(0);
  headWriter.u32(0); // created
  headWriter.u32(0);
  headWriter.u32(0); // modified
  headWriter.i16(fontXMin);
  headWriter.i16(fontYMin);
  headWriter.i16(fontXMax);
  headWriter.i16(fontYMax);
  headWriter.u16(bold ? 1 : 0); // macStyle
  headWriter.u16(8); // lowestRecPPEM
  headWriter.i16(2); // fontDirectionHint
  headWriter.i16(1); // indexToLocFormat = 1 (32-bit offsets)
  headWriter.i16(0); // glyphDataFormat
  const headBytes = headWriter.toUint8Array();

  // 5. hhea (36 bytes)
  const hheaWriter = new BinaryWriter();
  hheaWriter.u32(0x00010000); // version
  hheaWriter.i16(ascent);
  hheaWriter.i16(descent);
  hheaWriter.i16(lineGap);
  hheaWriter.u16(maxAdvance);
  hheaWriter.i16(0); // minLeftSideBearing
  hheaWriter.i16(0); // minRightSideBearing
  hheaWriter.i16(fontXMax); // xMaxExtent
  hheaWriter.i16(1); // caretSlopeRise
  hheaWriter.i16(0); // caretSlopeRun
  hheaWriter.i16(0); // caretOffset
  hheaWriter.i16(0);
  hheaWriter.i16(0);
  hheaWriter.i16(0);
  hheaWriter.i16(0);
  hheaWriter.i16(0); // metricDataFormat
  hheaWriter.u16(numGlyphs); // numberOfHMetrics
  const hheaBytes = hheaWriter.toUint8Array();

  // 6. maxp (32 bytes)
  const maxpWriter = new BinaryWriter();
  maxpWriter.u32(0x00010000); // version 1.0
  maxpWriter.u16(numGlyphs);
  maxpWriter.u16(maxPoints);
  maxpWriter.u16(maxContours);
  maxpWriter.u16(0); // maxCompositePoints
  maxpWriter.u16(0); // maxCompositeContours
  maxpWriter.u16(2); // maxZones
  maxpWriter.u16(0); // maxTwilightPoints
  maxpWriter.u16(0); // maxStorage
  maxpWriter.u16(0); // maxFunctionDefs
  maxpWriter.u16(0); // maxInstructionDefs
  maxpWriter.u16(0); // maxStackElements
  maxpWriter.u16(0); // maxSizeOfInstructions
  maxpWriter.u16(0); // maxComponentElements
  maxpWriter.u16(0); // maxComponentDepth
  const maxpBytes = maxpWriter.toUint8Array();

  // 7. OS/2 (version 4, 96 bytes)
  const os2Writer = new BinaryWriter();
  os2Writer.u16(4); // version
  os2Writer.i16(500); // xAvgCharWidth
  os2Writer.u16(bold ? 700 : 400); // usWeightClass
  os2Writer.u16(5); // usWidthClass (normal)
  os2Writer.u16(0); // fsType
  os2Writer.i16(400); // ySubscriptXSize
  os2Writer.i16(400); // ySubscriptYSize
  os2Writer.i16(0); // ySubscriptXOffset
  os2Writer.i16(100); // ySubscriptYOffset
  os2Writer.i16(400); // ySuperscriptXSize
  os2Writer.i16(400); // ySuperscriptYSize
  os2Writer.i16(0); // ySuperscriptXOffset
  os2Writer.i16(350); // ySuperscriptYOffset
  os2Writer.i16(100); // yStrikeoutSize
  os2Writer.i16(300); // yStrikeoutPosition
  os2Writer.i16(0); // sFamilyClass
  for (let i = 0; i < 10; i++) os2Writer.u8(0); // panose
  os2Writer.u32(1); // ulUnicodeRange1 (Basic Latin)
  os2Writer.u32(0);
  os2Writer.u32(0);
  os2Writer.u32(0);
  os2Writer.tag('MCFT'); // achVendID
  os2Writer.u16(bold ? 0x0020 : 0x0040); // fsSelection (BOLD or REGULAR)
  os2Writer.u16(0x0020); // usFirstCharIndex
  os2Writer.u16(glyphs[glyphs.length - 1]?.codePoint ?? 0x007e); // usLastCharIndex
  os2Writer.i16(ascent); // sTypoAscender
  os2Writer.i16(descent); // sTypoDescender
  os2Writer.i16(lineGap); // sTypoLineGap
  os2Writer.u16(ascent); // usWinAscent
  os2Writer.u16(Math.abs(descent)); // usWinDescent
  os2Writer.u32(1); // ulCodePageRange1
  os2Writer.u32(0); // ulCodePageRange2
  os2Writer.i16(500); // sxHeight
  os2Writer.i16(700); // sCapHeight
  os2Writer.u16(0); // usDefaultChar
  os2Writer.u16(0x0020); // usBreakChar
  os2Writer.u16(1); // usMaxContext
  const os2Bytes = os2Writer.toUint8Array();

  // 8. name (format 0, UTF-16BE Windows English records)
  const subFamily = bold ? 'Bold' : 'Regular';
  const fullName = `${familyName} ${subFamily}`;
  const psName = `${familyName.replace(/\s+/g, '')}-${subFamily}`;
  const nameEntries: Array<{ id: number; str: string }> = [
    { id: 1, str: familyName },
    { id: 2, str: subFamily },
    { id: 3, str: `${psName}-1.0` },
    { id: 4, str: fullName },
    { id: 5, str: 'Version 1.0' },
    { id: 6, str: psName },
  ];

  const strWriter = new BinaryWriter();
  const records: Array<{ id: number; offset: number; length: number }> = [];
  for (const entry of nameEntries) {
    const offset = strWriter.length;
    for (let i = 0; i < entry.str.length; i++) {
      strWriter.u16(entry.str.charCodeAt(i));
    }
    records.push({ id: entry.id, offset, length: entry.str.length * 2 });
  }
  const strBytes = strWriter.toUint8Array();

  const nameWriter = new BinaryWriter();
  nameWriter.u16(0); // format
  nameWriter.u16(records.length);
  nameWriter.u16(6 + records.length * 12); // stringOffset
  for (const rec of records) {
    nameWriter.u16(3); // platformID = Windows
    nameWriter.u16(1); // encodingID = Unicode BMP
    nameWriter.u16(0x0409); // languageID = en-US
    nameWriter.u16(rec.id);
    nameWriter.u16(rec.length);
    nameWriter.u16(rec.offset);
  }
  nameWriter.bytes(strBytes);
  const nameBytes = nameWriter.toUint8Array();

  // 9. post (format 3.0, 32 bytes)
  const postWriter = new BinaryWriter();
  postWriter.u32(0x00030000); // format 3.0 (no glyph names)
  postWriter.u32(0); // italicAngle
  postWriter.i16(-100); // underlinePosition
  postWriter.i16(50); // underlineThickness
  postWriter.u32(0); // isFixedPitch
  postWriter.u32(0);
  postWriter.u32(0);
  postWriter.u32(0);
  postWriter.u32(0);
  const postBytes = postWriter.toUint8Array();

  // Assemble SFNT tables sorted alphabetically by tag
  const tables: Array<{ tag: string; data: Uint8Array }> = [
    { tag: 'OS/2', data: os2Bytes },
    { tag: 'cmap', data: cmapBytes },
    { tag: 'glyf', data: glyfBytes },
    { tag: 'head', data: headBytes },
    { tag: 'hhea', data: hheaBytes },
    { tag: 'hmtx', data: hmtxBytes },
    { tag: 'loca', data: locaBytes },
    { tag: 'maxp', data: maxpBytes },
    { tag: 'name', data: nameBytes },
    { tag: 'post', data: postBytes },
  ];

  const numTables = tables.length;
  let searchRangeT = 16;
  let entrySelectorT = 0;
  while (searchRangeT * 2 <= numTables * 16) {
    searchRangeT *= 2;
    entrySelectorT++;
  }
  const rangeShiftT = numTables * 16 - searchRangeT;

  const headerSize = 12 + numTables * 16;
  let currentOffset = headerSize;
  const tableOffsets: number[] = [];
  for (const t of tables) {
    tableOffsets.push(currentOffset);
    currentOffset += Math.ceil(t.data.length / 4) * 4;
  }

  const out = new BinaryWriter();
  out.u32(0x00010000); // sfntVersion (TrueType)
  out.u16(numTables);
  out.u16(searchRangeT);
  out.u16(entrySelectorT);
  out.u16(rangeShiftT);

  let headTableOffset = 0;
  for (let i = 0; i < tables.length; i++) {
    const t = tables[i];
    if (t.tag === 'head') headTableOffset = tableOffsets[i];
    out.tag(t.tag);
    out.u32(calcTableChecksum(t.data));
    out.u32(tableOffsets[i]);
    out.u32(t.data.length);
  }

  for (const t of tables) {
    out.bytes(t.data);
    out.pad4();
  }

  const finalBytes = out.toUint8Array();

  // Patch head.checkSumAdjustment
  const totalChecksum = calcTableChecksum(finalBytes);
  const adjustment = (0xb1b0afba - totalChecksum) >>> 0;
  const adjPos = headTableOffset + 8;
  finalBytes[adjPos] = (adjustment >>> 24) & 0xff;
  finalBytes[adjPos + 1] = (adjustment >>> 16) & 0xff;
  finalBytes[adjPos + 2] = (adjustment >>> 8) & 0xff;
  finalBytes[adjPos + 3] = adjustment & 0xff;

  return finalBytes.buffer.slice(
    finalBytes.byteOffset,
    finalBytes.byteOffset + finalBytes.byteLength,
  ) as ArrayBuffer;
}

let fontInitialized = false;

export async function initMinecraftBitmapFont(): Promise<void> {
  if (fontInitialized || typeof document === 'undefined' || typeof FontFace === 'undefined') {
    return;
  }
  fontInitialized = true;

  const url = findAsciiFontUrl();
  if (!url) return;

  const img = await loadImage(url);
  if (!img) return;

  try {
    const regularGlyphs = extractGlyphsFromAtlas(img, false);
    const boldGlyphs = extractGlyphsFromAtlas(img, true);

    const regularTtf = buildTrueTypeFont(regularGlyphs, 'MinecraftAscii', false);
    const boldTtf = buildTrueTypeFont(boldGlyphs, 'MinecraftAscii', true);

    const regularFace = new FontFace('MinecraftAscii', regularTtf, {
      weight: '400',
      style: 'normal',
    });
    const boldFace = new FontFace('MinecraftAscii', boldTtf, {
      weight: '700',
      style: 'normal',
    });

    await Promise.all([regularFace.load(), boldFace.load()]);
    document.fonts.add(regularFace);
    document.fonts.add(boldFace);
    document.documentElement.classList.add('mc-font-loaded');
  } catch (err) {
    console.warn('Failed to initialize Minecraft bitmap font:', err);
  }
}

void initMinecraftBitmapFont();
