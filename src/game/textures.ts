import * as THREE from 'three';
import { BLOCK_DEFS, BlockType, TILE } from '../shared/blocks';
import { mulberry32 } from '../shared/noise';

export const ATLAS_COLS = 8;
export const ATLAS_ROWS = 7;
export const TILE_PIXELS = 16;

interface RGB {
  r: number;
  g: number;
  b: number;
  a?: number;
}

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbStr(c: RGB): string {
  const a = c.a ?? 1;
  return a < 1
    ? `rgba(${clampByte(c.r)},${clampByte(c.g)},${clampByte(c.b)},${a})`
    : `rgb(${clampByte(c.r)},${clampByte(c.g)},${clampByte(c.b)})`;
}

function vary(base: RGB, amount: number, rand: () => number): RGB {
  const d = (rand() - 0.5) * 2 * amount;
  return {
    r: base.r + d,
    g: base.g + d,
    b: base.b + d,
    a: base.a,
  };
}

function drawTilePixel(
  ctx: CanvasRenderingContext2D,
  ox: number,
  oy: number,
  x: number,
  y: number,
  color: RGB,
) {
  ctx.fillStyle = rgbStr(color);
  ctx.fillRect(ox + x, oy + y, 1, 1);
}

function paintTile(
  ctx: CanvasRenderingContext2D,
  tileIndex: number,
  painter: (x: number, y: number, rand: () => number) => RGB,
) {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  const ox = col * TILE_PIXELS;
  const oy = row * TILE_PIXELS;
  const rand = mulberry32(tileIndex * 9973 + 1337);

  ctx.clearRect(ox, oy, TILE_PIXELS, TILE_PIXELS);
  for (let y = 0; y < TILE_PIXELS; y++) {
    for (let x = 0; x < TILE_PIXELS; x++) {
      const c = painter(x, y, rand);
      drawTilePixel(ctx, ox, oy, x, y, c);
    }
  }
}

export interface ProceduralAtlasResult {
  atlasTexture: THREE.CanvasTexture;
  atlasCanvas: HTMLCanvasElement;
  blockIcons: Record<number, string>;
}

/**
 * Procedurally paints all 16x16 crisp pixel-art block textures into a single atlas
 * and renders isometric 3D block icon thumbnails for the HUD.
 */
export function createProceduralAtlas(maxAnisotropy: number): ProceduralAtlasResult {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_COLS * TILE_PIXELS;
  canvas.height = ATLAS_ROWS * TILE_PIXELS;
  const ctx = canvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  // 0: Grass Top (lush organic mottled green)
  paintTile(ctx, TILE.GRASS_TOP, (x, y, rand) => {
    const blade = ((x * 7 + y * 13) % 5 === 0 ? 10 : 0) - ((x + y * 3) % 7 === 0 ? 8 : 0);
    return vary({ r: 102 + blade, g: 164 + blade, b: 68 + blade * 0.5 }, 13, rand);
  });

  // 1: Grass Side (rich dirt with organic overhanging grass fringe)
  paintTile(ctx, TILE.GRASS_SIDE, (x, y, rand) => {
    const fringe = 3 + ((x * 5 + 2) % 3) + (x % 4 === 0 ? 1 : 0);
    if (y < fringe) {
      const shade = y === fringe - 1 ? -14 : 0;
      return vary({ r: 96 + shade, g: 158 + shade, b: 64 + shade }, 10, rand);
    }
    const pebble = rand() > 0.9 ? -18 : rand() > 0.85 ? 12 : 0;
    return vary({ r: 136 + pebble, g: 96 + pebble, b: 64 + pebble }, 10, rand);
  });

  // 2: Dirt
  paintTile(ctx, TILE.DIRT, (_x, _y, rand) => {
    const roll = rand();
    if (roll > 0.92) return { r: 104, g: 72, b: 48 };
    if (roll > 0.86) return { r: 158, g: 118, b: 84 };
    return vary({ r: 134, g: 95, b: 63 }, 11, rand);
  });

  // 3: Stone (layered mineral grain with faint horizontal cracks)
  paintTile(ctx, TILE.STONE, (x, y, rand) => {
    const strata = (y % 4 === 0 && (x + y) % 3 !== 0) ? -9 : 0;
    const crack = (y === 6 && x >= 3 && x <= 8) || (y === 12 && x >= 9 && x <= 14) ? -18 : 0;
    return vary({ r: 132 + strata + crack, g: 136 + strata + crack, b: 141 + strata + crack }, 9, rand);
  });

  // 4: Cobblestone (interlocking hand-laid stones with dark mortar)
  paintTile(ctx, TILE.COBBLESTONE, (x, y, rand) => {
    const row = Math.floor(y / 4);
    const offset = (row % 2) * 4;
    const lx = (x + offset) % 8;
    const ly = y % 4;
    const isMortar = ly === 0 || lx === 0 || (ly === 3 && lx === 7);
    if (isMortar) return vary({ r: 84, g: 88, b: 94 }, 6, rand);
    const highlight = ly === 1 ? 14 : ly === 3 ? -10 : 0;
    const tint = ((row * 3 + Math.floor((x + offset) / 8)) % 3 - 1) * 7;
    return vary({ r: 132 + highlight + tint, g: 135 + highlight + tint, b: 140 + highlight + tint }, 7, rand);
  });

  // 5: Oak Log Side (vertical grooved bark)
  paintTile(ctx, TILE.OAK_LOG_SIDE, (x, y, rand) => {
    const groove = x % 4 === 0 ? -18 : x % 4 === 2 ? 9 : 0;
    const knot = (x === 9 || x === 10) && (y === 7 || y === 8) ? -22 : 0;
    return vary({ r: 112 + groove + knot, g: 82 + groove + knot, b: 50 + groove + knot }, 7, rand);
  });

  // 6: Oak Log Top (concentric growth rings)
  paintTile(ctx, TILE.OAK_LOG_TOP, (x, y, rand) => {
    const dx = Math.abs(x - 7.5);
    const dy = Math.abs(y - 7.5);
    const dist = Math.max(dx, dy);
    if (dist >= 6.5) return vary({ r: 96, g: 70, b: 42 }, 6, rand);
    const ring = Math.floor(dist) % 2 === 0 ? -12 : 10;
    return vary({ r: 176 + ring, g: 142 + ring, b: 95 + ring }, 6, rand);
  });

  // 7: Oak Planks (horizontal timber boards with seams)
  paintTile(ctx, TILE.OAK_PLANKS, (x, y, rand) => {
    const board = Math.floor(y / 4);
    const seamY = y % 4 === 0;
    const jointX = (board % 2 === 0 && x === 7) || (board % 2 === 1 && x === 14);
    if (seamY || jointX) return vary({ r: 122, g: 86, b: 48 }, 5, rand);
    const bevel = y % 4 === 1 ? 10 : y % 4 === 3 ? -8 : 0;
    const boardTone = (board % 2 === 0 ? 4 : -4);
    return vary({ r: 186 + bevel + boardTone, g: 142 + bevel + boardTone, b: 88 + bevel + boardTone }, 6, rand);
  });

  // 8: Oak Leaves (rich layered botanical canopy)
  paintTile(ctx, TILE.OAK_LEAVES, (x, y, rand) => {
    const pattern = (x * 3 + y * 5) % 7;
    if (pattern === 0 || rand() > 0.85) return vary({ r: 44, g: 92, b: 36 }, 6, rand);
    if (pattern === 3) return vary({ r: 94, g: 152, b: 64 }, 8, rand);
    return vary({ r: 66, g: 124, b: 48 }, 9, rand);
  });

  // 9: Sand (warm sun-baked fine dunes)
  paintTile(ctx, TILE.SAND, (x, y, rand) => {
    const ripple = (x + y * 2) % 6 === 0 ? 7 : 0;
    return vary({ r: 224 + ripple, g: 204 + ripple, b: 150 + ripple }, 8, rand);
  });

  // 10: Sandstone Top
  paintTile(ctx, TILE.SANDSTONE_TOP, (x, y, rand) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15 ? -10 : 0;
    return vary({ r: 218 + border, g: 196 + border, b: 142 + border }, 7, rand);
  });

  // 11: Sandstone Side (carved desert strata bands)
  paintTile(ctx, TILE.SANDSTONE_SIDE, (_x, y, rand) => {
    if (y < 3) return vary({ r: 222, g: 202, b: 150 }, 6, rand);
    if (y === 3 || y === 10) return vary({ r: 182, g: 158, b: 108 }, 5, rand);
    const band = y > 10 ? -10 : 4;
    return vary({ r: 210 + band, g: 188 + band, b: 134 + band }, 7, rand);
  });

  // 12: Water (azure translucent waves)
  paintTile(ctx, TILE.WATER, (x, y, rand) => {
    const wave = Math.sin((x + y * 1.4) * 0.7) * 14;
    const glint = (x + y) % 9 === 0 ? 18 : 0;
    return {
      r: 50 + wave * 0.5 + glint,
      g: 138 + wave + glint,
      b: 208 + wave * 0.6 + glint * 0.5,
      a: 0.76,
    };
  });

  // 13: Brick (classic warm clay masonry)
  paintTile(ctx, TILE.BRICK, (x, y, rand) => {
    const row = Math.floor(y / 4);
    const shift = (row % 2) * 4;
    const mortar = y % 4 === 0 || (x + shift) % 8 === 0;
    if (mortar) return vary({ r: 196, g: 188, b: 174 }, 5, rand);
    const brickVar = ((row * 5 + Math.floor((x + shift) / 8)) % 3 - 1) * 10;
    return vary({ r: 164 + brickVar, g: 76 + brickVar * 0.5, b: 58 + brickVar * 0.4 }, 7, rand);
  });

  // 14: Framed Glass (crisp border with specular diagonal shine)
  paintTile(ctx, TILE.GLASS, (x, y, _rand) => {
    const edge = x === 0 || y === 0 || x === 15 || y === 15;
    if (edge) return { r: 196, g: 226, b: 238, a: 0.92 };
    const innerEdge = x === 1 || y === 1 || x === 14 || y === 14;
    if (innerEdge) return { r: 150, g: 196, b: 215, a: 0.45 };
    const glint = (x + y === 6 || x + y === 7 || (x === 11 && y === 11) || (x === 12 && y === 10));
    if (glint) return { r: 245, g: 252, b: 255, a: 0.78 };
    return { r: 175, g: 225, b: 244, a: 0.22 };
  });

  // 15: Snow (clean crisp alpine snow with cool micro-shadows)
  paintTile(ctx, TILE.SNOW, (_x, _y, rand) => {
    const cool = rand() > 0.75 ? -9 : 0;
    return vary({ r: 236 + cool, g: 243 + cool * 0.6, b: 250 }, 5, rand);
  });

  // 16: Birch Log Side (ivory bark with dark charcoal lenticels)
  paintTile(ctx, TILE.BIRCH_LOG_SIDE, (x, y, rand) => {
    const dash =
      (y === 3 && x >= 2 && x <= 5) ||
      (y === 7 && x >= 9 && x <= 13) ||
      (y === 11 && x >= 4 && x <= 8) ||
      (y === 14 && x >= 11 && x <= 14) ||
      (y === 5 && x === 12);
    if (dash) return vary({ r: 58, g: 56, b: 54 }, 8, rand);
    return vary({ r: 222, g: 219, b: 208 }, 7, rand);
  });

  // 17: Birch Log Top
  paintTile(ctx, TILE.BIRCH_LOG_TOP, (x, y, rand) => {
    const d = Math.max(Math.abs(x - 7.5), Math.abs(y - 7.5));
    if (d >= 6.5) return vary({ r: 214, g: 210, b: 198 }, 6, rand);
    const ring = Math.floor(d) % 2 === 0 ? -10 : 8;
    return vary({ r: 198 + ring, g: 174 + ring, b: 132 + ring }, 6, rand);
  });

  // 18: Birch Leaves (lighter spring-green canopy)
  paintTile(ctx, TILE.BIRCH_LEAVES, (x, y, rand) => {
    const p = (x * 5 + y * 3) % 6;
    if (p === 0) return vary({ r: 72, g: 120, b: 54 }, 7, rand);
    if (p === 2) return vary({ r: 124, g: 176, b: 84 }, 8, rand);
    return vary({ r: 98, g: 152, b: 68 }, 8, rand);
  });

  // 50: Birch Planks (pale, warm-toned boards)
  paintTile(ctx, TILE.BIRCH_PLANKS, (x, y, rand) => {
    const seam = y % 4 === 0 || (x + Math.floor(y / 4) * 3) % 11 === 0;
    if (seam) return vary({ r: 150, g: 137, b: 106 }, 7, rand);
    return vary({ r: 216, g: 207, b: 180 }, 8, rand);
  });

  // 51: Lava (molten orange with dark cooling crust)
  paintTile(ctx, TILE.LAVA_STILL, (x, y, rand) => {
    const crust =
      (x + Math.floor(y / 3) * 5) % 9 === 0 ||
      (x * 3 + y * 5) % 17 === 0;
    if (crust) return vary({ r: 92, g: 32, b: 18 }, 9, rand);
    const glow = (x * 2 + y * 3) % 7 === 0;
    return vary(glow ? { r: 255, g: 208, b: 72 } : { r: 226, g: 92, b: 24 }, 14, rand);
  });

  // 52: Flowing Lava (darker channels with bright moving streaks)
  paintTile(ctx, TILE.LAVA_FLOW, (x, y, rand) => {
    const streak = (x + Math.floor(y / 4) * 3) % 6 === 0;
    const ember = (x * 5 + y * 7) % 19 === 0;
    if (streak) return vary({ r: 255, g: 174, b: 48 }, 12, rand);
    if (ember) return vary({ r: 255, g: 224, b: 112 }, 10, rand);
    return vary({ r: 178, g: 54, b: 18 }, 12, rand);
  });

  // 53: Clay (pale bluish-gray compacted earth)
  paintTile(ctx, TILE.CLAY, (x, y, rand) => {
    const fleck = (x * 7 + y * 11) % 13 === 0;
    return vary(fleck ? { r: 166, g: 174, b: 186 } : { r: 198, g: 204, b: 214 }, 6, rand);
  });

  // 19: Coal Ore
  paintTile(ctx, TILE.COAL_ORE, (x, y, rand) => {
    const coal =
      (x >= 3 && x <= 5 && y >= 3 && y <= 5) ||
      (x >= 10 && x <= 12 && y >= 6 && y <= 8) ||
      (x >= 5 && x <= 8 && y >= 10 && y <= 12) ||
      (x === 12 && y === 12);
    if (coal) return vary({ r: 36, g: 38, b: 44 }, 7, rand);
    return vary({ r: 130, g: 134, b: 140 }, 9, rand);
  });

  // 20: Iron Ore
  paintTile(ctx, TILE.IRON_ORE, (x, y, rand) => {
    const fleck =
      (x >= 3 && x <= 5 && y >= 4 && y <= 5) ||
      (x >= 9 && x <= 12 && y >= 4 && y <= 6) ||
      (x >= 5 && x <= 7 && y >= 10 && y <= 12) ||
      (x >= 11 && x <= 13 && y >= 11 && y <= 12);
    if (fleck) return vary({ r: 204, g: 174, b: 144 }, 9, rand);
    return vary({ r: 130, g: 134, b: 140 }, 9, rand);
  });

  // 48: Gold Ore
  paintTile(ctx, TILE.GOLD_ORE, (x, y, rand) => {
    const nugget =
      (x >= 3 && x <= 5 && y >= 4 && y <= 6) ||
      (x >= 9 && x <= 12 && y >= 3 && y <= 5) ||
      (x >= 5 && x <= 8 && y >= 9 && y <= 12) ||
      (x >= 12 && x <= 13 && y >= 10 && y <= 12);
    if (nugget) return vary({ r: 237, g: 185, b: 48 }, 10, rand);
    return vary({ r: 130, g: 134, b: 140 }, 9, rand);
  });

  // 49: Redstone Ore
  paintTile(ctx, TILE.REDSTONE_ORE, (x, y, rand) => {
    const vein =
      (x >= 4 && x <= 6 && y >= 3 && y <= 5) ||
      (x >= 10 && x <= 13 && y >= 6 && y <= 8) ||
      (x >= 5 && x <= 9 && y >= 10 && y <= 12) ||
      (x === 12 && y === 12);
    if (vein) return vary({ r: 206, g: 48, b: 39 }, 12, rand);
    return vary({ r: 118, g: 122, b: 130 }, 9, rand);
  });

  // 21: Gilded Gold Block (beveled metallic plate)
  paintTile(ctx, TILE.GOLD_BLOCK, (x, y, rand) => {
    const border = x === 0 || y === 0 ? 28 : x === 15 || y === 15 ? -28 : 0;
    const inner = (x === 2 || y === 2) && x >= 2 && y >= 2 && x <= 13 && y <= 13 ? 18 : 0;
    const sheen = Math.abs(x - y) < 3 ? 16 : 0;
    return vary({ r: 232 + border + inner + sheen, g: 186 + border + inner + sheen, b: 56 + border * 0.4 + sheen }, 6, rand);
  });

  // 23: Dark Slate (architectural shingled roof stone)
  paintTile(ctx, TILE.DARK_SLATE, (x, y, rand) => {
    const row = Math.floor(y / 4);
    const seam = y % 4 === 0 || ((x + (row % 2) * 4) % 8 === 0);
    if (seam) return vary({ r: 42, g: 48, b: 58 }, 4, rand);
    const bevel = y % 4 === 1 ? 10 : -4;
    return vary({ r: 64 + bevel, g: 72 + bevel, b: 86 + bevel }, 6, rand);
  });

  // 24: Terracotta / Mesa Clay (warm layered desert ochre)
  paintTile(ctx, TILE.TERRACOTTA, (_x, y, rand) => {
    const stripe = y % 5 === 0 ? -14 : y % 5 === 2 ? 10 : 0;
    return vary({ r: 184 + stripe, g: 102 + stripe * 0.7, b: 68 + stripe * 0.5 }, 7, rand);
  });

  // 25: Bedrock (dense dark unbreakable basalt)
  paintTile(ctx, TILE.BEDROCK, (_x, _y, rand) => {
    const roll = rand();
    if (roll > 0.75) return { r: 30, g: 32, b: 38 };
    if (roll < 0.2) return { r: 86, g: 90, b: 98 };
    return vary({ r: 54, g: 58, b: 64 }, 10, rand);
  });

  // 26: Snow Grass Side
  paintTile(ctx, TILE.SNOW_GRASS_SIDE, (x, y, rand) => {
    const fringe = 3 + ((x * 3 + 1) % 3);
    if (y < fringe) return vary({ r: 236, g: 242, b: 248 }, 5, rand);
    return vary({ r: 134, g: 95, b: 63 }, 10, rand);
  });

  // 27: Crafting Table Top (warm woodworking table with crisp 3x3 grid lines)
  paintTile(ctx, TILE.CRAFTING_TABLE_TOP, (x, y, rand) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    if (border) return vary({ r: 102, g: 64, b: 34 }, 5, rand);
    const innerFrame = x === 1 || y === 1 || x === 14 || y === 14;
    if (innerFrame) return vary({ r: 146, g: 98, b: 54 }, 5, rand);
    const gridLine = x === 5 || x === 10 || y === 5 || y === 10;
    if (gridLine) return vary({ r: 74, g: 46, b: 24 }, 4, rand);
    return vary({ r: 184, g: 136, b: 82 }, 6, rand);
  });

  // 28: Crafting Table Side (timber planks with iron saw & tool rack details)
  paintTile(ctx, TILE.CRAFTING_TABLE_SIDE, (x, y, rand) => {
    if (y <= 1) return vary({ r: 104, g: 66, b: 36 }, 5, rand);
    if (y === 2 || y === 15 || x === 0 || x === 15) return vary({ r: 126, g: 82, b: 44 }, 5, rand);
    // Hanging iron saw blade on left
    if (x >= 3 && x <= 5 && y >= 5 && y <= 11) {
      return vary({ r: 164, g: 170, b: 178 }, 7, rand);
    }
    if (x >= 3 && x <= 5 && y === 4) {
      return vary({ r: 130, g: 76, b: 38 }, 5, rand);
    }
    // Hanging hammer on right
    if (x >= 10 && x <= 12 && y >= 5 && y <= 6) {
      return vary({ r: 148, g: 154, b: 162 }, 7, rand);
    }
    if (x === 11 && y >= 7 && y <= 11) {
      return vary({ r: 122, g: 78, b: 42 }, 5, rand);
    }
    const plankSeam = y % 4 === 0 ? -16 : 0;
    return vary({ r: 174 + plankSeam, g: 128 + plankSeam, b: 78 + plankSeam }, 6, rand);
  });

  // 29: Furnace Top (beveled smooth stone masonry cap)
  paintTile(ctx, TILE.FURNACE_TOP, (x, y, rand) => {
    const border = x === 0 || y === 0 || x === 15 || y === 15;
    if (border) return vary({ r: 86, g: 90, b: 96 }, 5, rand);
    const bevel = x === 1 || y === 1 ? 14 : x === 14 || y === 14 ? -12 : 0;
    const seam = (x === 7 || y === 7) && (x > 1 && x < 14 && y > 1 && y < 14) ? -10 : 0;
    return vary({ r: 130 + bevel + seam, g: 134 + bevel + seam, b: 140 + bevel + seam }, 7, rand);
  });

  // 30: Furnace Side (interlocking fitted stone blocks)
  paintTile(ctx, TILE.FURNACE_SIDE, (x, y, rand) => {
    const row = Math.floor(y / 4);
    const shift = (row % 2) * 4;
    const mortar = y % 4 === 0 || (x + shift) % 8 === 0 || x === 0 || x === 15;
    if (mortar) return vary({ r: 78, g: 82, b: 88 }, 5, rand);
    const bevel = y % 4 === 1 ? 10 : y % 4 === 3 ? -8 : 0;
    return vary({ r: 126 + bevel, g: 130 + bevel, b: 136 + bevel }, 7, rand);
  });

  // 31: Furnace Front (upper firebox arch & lower glowing ash hearth)
  paintTile(ctx, TILE.FURNACE_FRONT, (x, y, rand) => {
    const upperMouth = x >= 3 && x <= 12 && y >= 3 && y <= 7;
    const archCorner = (x === 3 || x === 12) && y === 3;
    if (upperMouth && !archCorner) {
      if (y === 7 && x >= 5 && x <= 10) return vary({ r: 58, g: 50, b: 46 }, 5, rand);
      return vary({ r: 28, g: 30, b: 34 }, 4, rand);
    }
    const lowerMouth = x >= 4 && x <= 11 && y >= 11 && y <= 14;
    if (lowerMouth) {
      if (y === 14 && (x === 6 || x === 9)) return vary({ r: 175, g: 88, b: 32 }, 10, rand);
      return vary({ r: 24, g: 26, b: 30 }, 4, rand);
    }
    const mortar = y === 0 || y === 9 || y === 15 || x === 0 || x === 15;
    if (mortar) return vary({ r: 74, g: 78, b: 84 }, 5, rand);
    return vary({ r: 128, g: 132, b: 138 }, 7, rand);
  });

  // 32: Crafting Table Front (timber planks with hanging saw & shears)
  paintTile(ctx, TILE.CRAFTING_TABLE_FRONT, (x, y, rand) => {
    if (y <= 1) return vary({ r: 104, g: 66, b: 36 }, 5, rand);
    if (y === 2 || y === 15 || x === 0 || x === 15) return vary({ r: 126, g: 82, b: 44 }, 5, rand);
    if (x >= 4 && x <= 6 && y >= 5 && y <= 11) {
      return vary({ r: 168, g: 174, b: 182 }, 7, rand);
    }
    if (x >= 10 && x <= 12 && y >= 6 && y <= 11) {
      return vary({ r: 152, g: 158, b: 166 }, 7, rand);
    }
    const plankSeam = y % 4 === 0 ? -16 : 0;
    return vary({ r: 174 + plankSeam, g: 128 + plankSeam, b: 78 + plankSeam }, 6, rand);
  });

  // 33: Furnace Front Lit (glowing orange-gold embers inside the hearth)
  paintTile(ctx, TILE.FURNACE_FRONT_ON, (x, y, rand) => {
    const upperMouth = x >= 3 && x <= 12 && y >= 3 && y <= 7;
    const archCorner = (x === 3 || x === 12) && y === 3;
    if (upperMouth && !archCorner) {
      if (y >= 6 && x >= 4 && x <= 11) return vary({ r: 242, g: 146, b: 42 }, 12, rand);
      return vary({ r: 52, g: 34, b: 26 }, 6, rand);
    }
    const lowerMouth = x >= 4 && x <= 11 && y >= 11 && y <= 14;
    if (lowerMouth) {
      if (y >= 12 && x >= 5 && x <= 10) return vary({ r: 255, g: 178, b: 56 }, 12, rand);
      return vary({ r: 224, g: 98, b: 28 }, 10, rand);
    }
    const mortar = y === 0 || y === 9 || y === 15 || x === 0 || x === 15;
    if (mortar) return vary({ r: 74, g: 78, b: 84 }, 5, rand);
    return vary({ r: 128, g: 132, b: 138 }, 7, rand);
  });

  // 34: White Wool (soft woven cream-white fleece)
  paintTile(ctx, TILE.WHITE_WOOL, (x, y, rand) => {
    const weave = ((x + y) % 3 === 0 ? -8 : 0) + ((x * 2 + y) % 5 === 0 ? 5 : 0);
    return vary({ r: 236 + weave, g: 236 + weave, b: 232 + weave }, 7, rand);
  });

  // 35: Oak Door Top (warm oak frame with 4 transparent window cutouts)
  paintTile(ctx, TILE.OAK_DOOR_TOP, (x, y, rand) => {
    const inPane =
      ((x >= 3 && x <= 6) || (x >= 9 && x <= 12)) &&
      ((y >= 3 && y <= 6) || (y >= 8 && y <= 11));
    if (inPane) return { r: 0, g: 0, b: 0, a: 0 };
    if (x >= 11 && x <= 13 && y === 14) return vary({ r: 118, g: 126, b: 136 }, 6, rand);
    const frame = x <= 1 || x >= 14 || y <= 1 || x === 7 || x === 8 ? -16 : 0;
    return vary({ r: 172 + frame, g: 128 + frame, b: 74 + frame }, 7, rand);
  });

  // 36: Oak Door Bottom (paneled oak timber with iron hinges)
  paintTile(ctx, TILE.OAK_DOOR_BOTTOM, (x, y, rand) => {
    if (x <= 1 && (y === 3 || y === 11)) return vary({ r: 110, g: 118, b: 128 }, 6, rand);
    const panel =
      ((x >= 3 && x <= 6) || (x >= 9 && x <= 12)) &&
      ((y >= 2 && y <= 6) || (y >= 9 && y <= 13));
    const shade = panel ? -14 : x === 0 || x === 15 || y === 15 ? -22 : 4;
    return vary({ r: 172 + shade, g: 128 + shade, b: 74 + shade }, 7, rand);
  });

  // 37: Bed Head Up (pillow at North/top + white quilt)
  paintTile(ctx, TILE.BED_HEAD_UP, (x, y, rand) => {
    const pillow = x >= 2 && x <= 13 && y >= 1 && y <= 6;
    if (pillow) {
      const rim = x === 2 || x === 13 || y === 1 || y === 6 ? -18 : 6;
      return vary({ r: 242 + rim, g: 244 + rim, b: 246 + rim }, 4, rand);
    }
    if (y === 7 || y === 8) return vary({ r: 196, g: 204, b: 208 }, 5, rand);
    return vary({ r: 235, g: 238, b: 240 }, 6, rand);
  });

  // 38: Bed Foot Up (clean white quilted blanket)
  paintTile(ctx, TILE.BED_FOOT_UP, (x, y, rand) => {
    const fold = (x + y) % 7 === 0 ? -8 : 0;
    return vary({ r: 238 + fold, g: 240 + fold, b: 242 + fold }, 6, rand);
  });

  // 39: Bed Down (oak slat underside)
  paintTile(ctx, TILE.BED_DOWN, (_x, y, rand) => {
    const seam = y % 4 === 0 ? -20 : 0;
    return vary({ r: 162 + seam, g: 122 + seam, b: 72 + seam }, 6, rand);
  });

  // 40-45: Bed Side/End fallback tiles (transparent top 7px, mattress 4px, oak frame + legs 5px)
  const paintBedSide = (tile: number, legLeft: boolean, legRight: boolean) => {
    paintTile(ctx, tile, (x, y, rand) => {
      if (y < 7) return { r: 0, g: 0, b: 0, a: 0 };
      if (y <= 10) return vary({ r: 222, g: 226, b: 230 }, 6, rand);
      if (y <= 12) return vary({ r: 158, g: 116, b: 64 }, 6, rand);
      const isLeftLeg = legLeft && x <= 3;
      const isRightLeg = legRight && x >= 12;
      if (isLeftLeg || isRightLeg) return vary({ r: 138, g: 98, b: 52 }, 6, rand);
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  };
  paintBedSide(TILE.BED_HEAD_NORTH, true, true);
  paintBedSide(TILE.BED_HEAD_EAST, false, true);
  paintBedSide(TILE.BED_HEAD_WEST, true, false);
  paintBedSide(TILE.BED_FOOT_SOUTH, true, true);
  paintBedSide(TILE.BED_FOOT_EAST, true, false);
  paintBedSide(TILE.BED_FOOT_WEST, false, true);

  // Short Grass & Tall Grass procedural cutout fallback tiles
  const paintGrassBlades = (tileIdx: number, denseTop: boolean, shortMode: boolean) => {
    paintTile(ctx, tileIdx, (x, y, rand) => {
      const hLimit = shortMode ? 4 : denseTop ? 2 : 0;
      if (y < hLimit) return { r: 0, g: 0, b: 0, a: 0 };
      const bladeA = Math.abs(x - (2 + Math.floor((15 - y) * 0.14))) <= 0;
      const bladeB = Math.abs(x - (5 + Math.floor(Math.sin(y * 0.35)))) <= 0;
      const bladeC = Math.abs(x - (8 - Math.floor((15 - y) * 0.08))) <= 0;
      const bladeD = Math.abs(x - (11 + Math.floor((15 - y) * 0.12))) <= 0;
      const bladeE = Math.abs(x - (14 - Math.floor((15 - y) * 0.15))) <= 0;
      const denseBase = !denseTop && y >= 11 && ((x + y) % 2 === 0 || rand() > 0.35);
      if (bladeA || bladeB || bladeC || bladeD || bladeE || denseBase) {
        const shade = 0.85 + (1 - y / 16) * 0.2 + (rand() - 0.5) * 0.1;
        return {
          r: Math.min(255, Math.round(92 * shade)),
          g: Math.min(255, Math.round(168 * shade)),
          b: Math.min(255, Math.round(62 * shade)),
          a: 255,
        };
      }
      return { r: 0, g: 0, b: 0, a: 0 };
    });
  };
  paintGrassBlades(TILE.SHORT_GRASS, false, true);
  paintGrassBlades(TILE.TALL_GRASS_BOTTOM, false, false);
  paintGrassBlades(TILE.TALL_GRASS_TOP, true, false);

  const atlasTexture = new THREE.CanvasTexture(canvas);
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.anisotropy = Math.min(maxAnisotropy, 8);
  atlasTexture.wrapS = THREE.ClampToEdgeWrapping;
  atlasTexture.wrapT = THREE.ClampToEdgeWrapping;
  atlasTexture.needsUpdate = true;

  // Build crisp 2D isometric cube thumbnails for every block
  const blockIcons = buildBlockIconsFromAtlas(canvas);

  return { atlasTexture, atlasCanvas: canvas, blockIcons };
}

export function buildBlockIconsFromAtlas(canvas: HTMLCanvasElement): Record<number, string> {
  const blockIcons: Record<number, string> = {};
  for (const def of Object.values(BLOCK_DEFS)) {
    if (def.id === BlockType.Air) continue;
    if (def.id === BlockType.OakDoorBottom) {
      blockIcons[def.id] = renderDoorIcon(canvas);
      continue;
    }
    if (def.id === BlockType.BedFoot) {
      blockIcons[def.id] = renderBedIcon(canvas);
      continue;
    }
    if (def.id === BlockType.ShortGrass) {
      blockIcons[def.id] = renderFlatTileIcon(canvas, TILE.SHORT_GRASS);
      continue;
    }
    if (def.id === BlockType.TallGrassBottom) {
      blockIcons[def.id] = renderFlatTileIcon(canvas, TILE.TALL_GRASS_TOP);
      continue;
    }
    blockIcons[def.id] = renderIsometricBlockIcon(
      canvas,
      def.tiles,
      def.transparent,
      def.cutout === true,
      def.frontTile,
    );
  }
  return blockIcons;
}

function renderFlatTileIcon(atlas: HTMLCanvasElement, tileIndex: number): string {
  const size = 64;
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = size;
  iconCanvas.height = size;
  const ctx = iconCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const [tx, ty, tw, th] = getTileRect(tileIndex);
  ctx.drawImage(atlas, tx, ty, tw, th, 8, 8, 48, 48);
  return iconCanvas.toDataURL('image/png');
}

function renderDoorIcon(atlas: HTMLCanvasElement): string {
  const size = 64;
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = size;
  iconCanvas.height = size;
  const ctx = iconCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const [tx, ty, tw, th] = getTileRect(TILE.OAK_DOOR_TOP);
  const [bx, by, bw, bh] = getTileRect(TILE.OAK_DOOR_BOTTOM);
  // Crisp centered 2-tile tall Minecraft door silhouette
  const drawW = 28;
  const drawH = 28;
  const ox = Math.floor((size - drawW) / 2);
  ctx.drawImage(atlas, tx, ty, tw, th, ox, 4, drawW, drawH);
  ctx.drawImage(atlas, bx, by, bw, bh, ox, 4 + drawH, drawW, drawH);
  return iconCanvas.toDataURL('image/png');
}

function renderBedIcon(atlas: HTMLCanvasElement): string {
  const size = 64;
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = size;
  iconCanvas.height = size;
  const ctx = iconCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const [hx, hy, hw, hh] = getTileRect(TILE.BED_HEAD_UP);
  const [fx, fy, fw, fh] = getTileRect(TILE.BED_FOOT_UP);
  const [sx, sy, sw, sh] = getTileRect(TILE.BED_FOOT_SOUTH);
  const [ex, ey, ew, eh] = getTileRect(TILE.BED_FOOT_EAST);

  const cx = 32;
  const cy = 38;
  const r = 17;

  // Bed Head Top (upper-right isometric half)
  ctx.save();
  ctx.translate(cx + 8, cy - 18);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  ctx.drawImage(atlas, hx, hy, hw, hh, 0, 0, r, r);
  ctx.restore();

  // Bed Foot Top (lower-left isometric half)
  ctx.save();
  ctx.translate(cx - 8, cy - 10);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  ctx.drawImage(atlas, fx, fy, fw, fh, 0, 0, r, r);
  ctx.restore();

  // Front-left Foot South side (mattress + frame + legs)
  ctx.save();
  ctx.translate(cx - 25, cy - 12);
  ctx.transform(1, 0.5, 0, 1.0, 0, 0);
  ctx.drawImage(atlas, sx, sy, sw, sh, 0, 0, r, r);
  ctx.restore();

  // Front-right side (foot + head side)
  ctx.save();
  ctx.translate(cx - 8, cy - 3);
  ctx.transform(1, -0.5, 0, 1.0, 0, 0);
  ctx.drawImage(atlas, ex, ey, ew, eh, 0, 0, r, r);
  ctx.restore();

  ctx.save();
  ctx.translate(cx + 8, cy - 11);
  ctx.transform(1, -0.5, 0, 1.0, 0, 0);
  const [hex, hey, hew, heh] = getTileRect(TILE.BED_HEAD_EAST);
  ctx.drawImage(atlas, hex, hey, hew, heh, 0, 0, r, r);
  ctx.restore();

  return iconCanvas.toDataURL('image/png');
}

function getTileRect(tileIndex: number): [number, number, number, number] {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  return [col * TILE_PIXELS, row * TILE_PIXELS, TILE_PIXELS, TILE_PIXELS];
}

/**
 * Renders a crisp 64x64 isometric voxel cube icon directly from the texture atlas.
 */
function renderIsometricBlockIcon(
  atlas: HTMLCanvasElement,
  tiles: [number, number, number],
  transparent: boolean,
  cutout: boolean,
  frontTile?: number,
): string {
  const size = 64;
  const iconCanvas = document.createElement('canvas');
  iconCanvas.width = size;
  iconCanvas.height = size;
  const ctx = iconCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  const [topTile, sideTile] = tiles;
  const leftTile = frontTile ?? sideTile;
  const cx = size / 2;
  const cy = size / 2 + 1;
  const r = 22;
  const h = 11.5;

  // Top face (brightest)
  ctx.save();
  ctx.translate(cx, cy - r);
  ctx.transform(1, 0.5, -1, 0.5, 0, 0);
  if (cutout) {
    ctx.fillStyle = 'rgba(26, 54, 18, 0.72)';
    ctx.fillRect(0, 0, r, r);
  }
  const [tx, ty, tw, th] = getTileRect(topTile);
  ctx.drawImage(atlas, tx, ty, tw, th, 0, 0, r, r);
  ctx.restore();

  // Left face (shows frontTile like Furnace firebox when present)
  ctx.save();
  ctx.translate(cx - r, cy - h);
  ctx.transform(1, 0.5, 0, 1.05, 0, 0);
  if (cutout) {
    ctx.fillStyle = 'rgba(20, 44, 14, 0.78)';
    ctx.fillRect(0, 0, r, r);
  }
  const [lx, ly, lw, lh] = getTileRect(leftTile);
  ctx.drawImage(atlas, lx, ly, lw, lh, 0, 0, r, r);
  if (!transparent) {
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    ctx.fillRect(0, 0, r, r);
  }
  ctx.restore();

  // Right face (deeper shadow)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.transform(1, -0.5, 0, 1.05, 0, 0);
  if (cutout) {
    ctx.fillStyle = 'rgba(14, 34, 10, 0.84)';
    ctx.fillRect(0, 0, r, r);
  }
  const [sx, sy, sw, sh] = getTileRect(sideTile);
  ctx.drawImage(atlas, sx, sy, sw, sh, 0, 0, r, r);
  if (!transparent) {
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    ctx.fillRect(0, 0, r, r);
  }
  ctx.restore();

  return iconCanvas.toDataURL('image/png');
}
