import * as THREE from 'three';
import { TILE } from '../shared/blocks';
import { ItemType } from '../shared/survival';
import { ATLAS_COLS, TILE_PIXELS } from './textures';

/**
 * Automatically bundles any PNG/JPG/WebP assets placed under /assets/
 * (supporting both /assets/texture/... and /assets/textures/...).
 */
const DISCOVERED_ASSET_URLS = import.meta.glob('/assets/**/*.{png,jpg,jpeg,webp}', {
  eager: true,
  import: 'default',
}) as Record<string, string>;

const DISCOVERED_BLOCK_MCMETA = import.meta.glob('/assets/**/block/**/*.mcmeta', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

interface RGBTint {
  r: number;
  g: number;
  b: number;
}

const PLAINS_GRASS_TINT: RGBTint = { r: 121, g: 192, b: 90 }; // Classic Minecraft plains green (#79C05A)
const OAK_FOLIAGE_TINT: RGBTint = { r: 108, g: 184, b: 68 };
const BIRCH_FOLIAGE_TINT: RGBTint = { r: 128, g: 167, b: 85 };
const WATER_TINT: RGBTint = { r: 63, g: 118, b: 228 }; // Classic Minecraft water blue (#3F76E4)

export interface AnimatedAtlasTile {
  tile: number;
  frames: HTMLCanvasElement[];
  frameDurationSec: number;
}

interface TileAssetBinding {
  tile: number;
  names: string[];
  tint?: RGBTint;
  tintOnlyIfGrayscale?: boolean;
  alphaScale?: number;
  animated?: boolean;
  overlayNames?: string[];
  overlayTint?: RGBTint;
}

const BLOCK_TILE_BINDINGS: TileAssetBinding[] = [
  {
    tile: TILE.GRASS_TOP,
    names: ['grass_block_top', 'grass_top'],
    tint: PLAINS_GRASS_TINT,
    tintOnlyIfGrayscale: true,
  },
  {
    tile: TILE.GRASS_SIDE,
    names: ['grass_block_side', 'grass_side'],
    overlayNames: ['grass_block_side_overlay', 'grass_side_overlay'],
    overlayTint: PLAINS_GRASS_TINT,
  },
  { tile: TILE.DIRT, names: ['dirt'] },
  { tile: TILE.STONE, names: ['stone'] },
  { tile: TILE.COBBLESTONE, names: ['cobblestone'] },
  { tile: TILE.OAK_LOG_SIDE, names: ['oak_log', 'log_oak'] },
  { tile: TILE.OAK_LOG_TOP, names: ['oak_log_top', 'log_oak_top'] },
  { tile: TILE.OAK_PLANKS, names: ['oak_planks', 'planks_oak'] },
  {
    tile: TILE.OAK_LEAVES,
    names: ['oak_leaves', 'leaves_oak'],
    tint: OAK_FOLIAGE_TINT,
    tintOnlyIfGrayscale: true,
  },
  { tile: TILE.SAND, names: ['sand'] },
  { tile: TILE.SANDSTONE_TOP, names: ['sandstone_top'] },
  { tile: TILE.SANDSTONE_SIDE, names: ['sandstone', 'sandstone_normal'] },
  {
    tile: TILE.WATER,
    names: ['water_still', 'water'],
    tint: WATER_TINT,
    tintOnlyIfGrayscale: true,
    alphaScale: 0.84,
    animated: true,
  },
  { tile: TILE.BRICK, names: ['bricks', 'brick'] },
  { tile: TILE.LAVA_STILL, names: ['lava_still', 'lava'], animated: true },
  { tile: TILE.LAVA_FLOW, names: ['lava_flow'], animated: true },
  { tile: TILE.CLAY, names: ['clay'] },
  { tile: TILE.GLASS, names: ['glass'] },
  { tile: TILE.SNOW, names: ['snow', 'snow_block'] },
  { tile: TILE.BIRCH_LOG_SIDE, names: ['birch_log', 'log_birch'] },
  { tile: TILE.BIRCH_LOG_TOP, names: ['birch_log_top', 'log_birch_top'] },
  { tile: TILE.BIRCH_PLANKS, names: ['birch_planks', 'planks_birch'] },
  {
    tile: TILE.BIRCH_LEAVES,
    names: ['birch_leaves', 'leaves_birch'],
    tint: BIRCH_FOLIAGE_TINT,
    tintOnlyIfGrayscale: true,
  },
  { tile: TILE.COAL_ORE, names: ['coal_ore'] },
  { tile: TILE.IRON_ORE, names: ['iron_ore'] },
  { tile: TILE.GOLD_ORE, names: ['gold_ore'] },
  { tile: TILE.REDSTONE_ORE, names: ['redstone_ore'] },
  { tile: TILE.GOLD_BLOCK, names: ['gold_block'] },
  { tile: TILE.DARK_SLATE, names: ['deepslate_tiles', 'deepslate', 'polished_deepslate'] },
  { tile: TILE.TERRACOTTA, names: ['terracotta', 'orange_terracotta', 'red_sandstone'] },
  { tile: TILE.BEDROCK, names: ['bedrock'] },
  { tile: TILE.SNOW_GRASS_SIDE, names: ['grass_block_snow', 'grass_side_snowed'] },
  { tile: TILE.CRAFTING_TABLE_TOP, names: ['crafting_table_top'] },
  { tile: TILE.CRAFTING_TABLE_SIDE, names: ['crafting_table_side'] },
  { tile: TILE.CRAFTING_TABLE_FRONT, names: ['crafting_table_front', 'crafting_table_side'] },
  { tile: TILE.FURNACE_TOP, names: ['furnace_top'] },
  { tile: TILE.FURNACE_SIDE, names: ['furnace_side'] },
  { tile: TILE.FURNACE_FRONT, names: ['furnace_front'] },
  { tile: TILE.FURNACE_FRONT_ON, names: ['furnace_front_on', 'furnace_front'] },
  { tile: TILE.WHITE_WOOL, names: ['white_wool', 'wool_colored_white'] },
  { tile: TILE.OAK_DOOR_TOP, names: ['oak_door_top', 'door_wood_upper'] },
  { tile: TILE.OAK_DOOR_BOTTOM, names: ['oak_door_bottom', 'door_wood_lower'] },
  { tile: TILE.BED_HEAD_UP, names: ['white_bed_head_up'] },
  { tile: TILE.BED_FOOT_UP, names: ['white_bed_foot_up'] },
  { tile: TILE.BED_DOWN, names: ['bed_down'] },
  { tile: TILE.BED_HEAD_NORTH, names: ['bed_head_north', 'white_bed_head_north'] },
  { tile: TILE.BED_HEAD_EAST, names: ['white_bed_head_east'] },
  { tile: TILE.BED_HEAD_WEST, names: ['white_bed_head_west'] },
  { tile: TILE.BED_FOOT_SOUTH, names: ['white_bed_foot_south'] },
  { tile: TILE.BED_FOOT_EAST, names: ['white_bed_foot_east'] },
  { tile: TILE.BED_FOOT_WEST, names: ['white_bed_foot_west'] },
  {
    tile: TILE.SHORT_GRASS,
    names: ['short_grass', 'grass'],
    tint: PLAINS_GRASS_TINT,
    tintOnlyIfGrayscale: true,
  },
  {
    tile: TILE.TALL_GRASS_BOTTOM,
    names: ['tall_grass_bottom'],
    tint: PLAINS_GRASS_TINT,
    tintOnlyIfGrayscale: true,
  },
  {
    tile: TILE.TALL_GRASS_TOP,
    names: ['tall_grass_top'],
    tint: PLAINS_GRASS_TINT,
    tintOnlyIfGrayscale: true,
  },
];

const WATER_BOTTLE_TINT: RGBTint = { r: 56, g: 93, b: 198 }; // Minecraft water bottle blue (#385DC6)

interface ItemAssetBinding {
  item: ItemType;
  names: string[];
  overlayNames?: string[];
  overlayTint?: RGBTint;
  overlayUnderBase?: boolean;
}

const ITEM_ASSET_BINDINGS: ItemAssetBinding[] = [
  { item: ItemType.Stick, names: ['stick'] },
  { item: ItemType.Coal, names: ['coal'] },
  { item: ItemType.RawIron, names: ['raw_iron'] },
  { item: ItemType.RawGold, names: ['raw_gold'] },
  { item: ItemType.IronIngot, names: ['iron_ingot'] },
  { item: ItemType.GoldIngot, names: ['gold_ingot'] },
  { item: ItemType.Redstone, names: ['redstone', 'redstone_dust'] },
  { item: ItemType.Apple, names: ['apple'] },
  { item: ItemType.RawMutton, names: ['mutton', 'raw_mutton'] },
  { item: ItemType.CookedMutton, names: ['cooked_mutton'] },
  { item: ItemType.WoodPickaxe, names: ['wooden_pickaxe', 'wood_pickaxe'] },
  { item: ItemType.StonePickaxe, names: ['stone_pickaxe'] },
  { item: ItemType.IronPickaxe, names: ['iron_pickaxe'] },
  { item: ItemType.GoldPickaxe, names: ['golden_pickaxe', 'gold_pickaxe'] },
  { item: ItemType.WoodAxe, names: ['wooden_axe', 'wood_axe'] },
  { item: ItemType.StoneAxe, names: ['stone_axe'] },
  { item: ItemType.IronAxe, names: ['iron_axe'] },
  { item: ItemType.GoldAxe, names: ['golden_axe', 'gold_axe'] },
  { item: ItemType.WoodShovel, names: ['wooden_shovel', 'wood_shovel'] },
  { item: ItemType.StoneShovel, names: ['stone_shovel'] },
  { item: ItemType.IronShovel, names: ['iron_shovel'] },
  { item: ItemType.GoldShovel, names: ['golden_shovel', 'gold_shovel'] },
  { item: ItemType.WoodSword, names: ['wooden_sword', 'wood_sword'] },
  { item: ItemType.StoneSword, names: ['stone_sword'] },
  { item: ItemType.IronSword, names: ['iron_sword'] },
  { item: ItemType.GoldSword, names: ['golden_sword', 'gold_sword'] },
  { item: ItemType.Clock, names: ['clock_00', 'clock'] },
  { item: ItemType.Compass, names: ['compass_00', 'compass'] },
  { item: ItemType.Bucket, names: ['bucket'] },
  { item: ItemType.WaterBucket, names: ['water_bucket'] },
  { item: ItemType.LavaBucket, names: ['lava_bucket'] },
  { item: ItemType.ClayBall, names: ['clay_ball'] },
  { item: ItemType.BrickItem, names: ['brick'] },
  { item: ItemType.GlassBottle, names: ['glass_bottle', 'potion'] },
  {
    item: ItemType.WaterBottle,
    names: ['potion'],
    overlayNames: ['potion_overlay'],
    overlayTint: WATER_BOTTLE_TINT,
    overlayUnderBase: true,
  },
];

function buildAssetLookup(pathFilter?: (lowerPath: string) => boolean): Map<string, string> {
  const map = new Map<string, string>();
  for (const [path, url] of Object.entries(DISCOVERED_ASSET_URLS)) {
    const lowerPath = path.toLowerCase();
    if (pathFilter && !pathFilter(lowerPath)) continue;
    const file = path.split('/').pop() ?? '';
    const stem = file.replace(/\.[^.]+$/, '').toLowerCase();
    if (stem && url) {
      map.set(stem, url);
    }
  }
  return map;
}

/** Item textures whose frame files are named `<prefix>00..NN` (e.g. clock, compass). */
const ANIMATED_ITEM_PREFIXES: Partial<Record<ItemType, string>> = {
  [ItemType.Clock]: 'clock_',
  [ItemType.Compass]: 'compass_',
};

/**
 * Discovers ordered frame URLs for animated items. Frames are sorted by their
 * numeric suffix so the client can drive them from the authoritative time of day.
 */
export function discoverAnimatedItemFrames(): Record<number, string[]> {
  const itemLookup = buildAssetLookup((p) => p.includes('/item/') || p.includes('/items/'));
  const result: Record<number, string[]> = {};
  for (const [itemKey, prefix] of Object.entries(ANIMATED_ITEM_PREFIXES)) {
    const frames = Array.from(itemLookup.entries())
      .filter(
        ([stem]) => stem.startsWith(prefix) && /^\d+$/.test(stem.slice(prefix.length)),
      )
      .sort(
        ([a], [b]) => Number(a.slice(prefix.length)) - Number(b.slice(prefix.length)),
      )
      .map(([, url]) => url);
    if (frames.length > 1) result[Number(itemKey)] = frames;
  }
  return result;
}

interface BlockAnimationMeta {
  frameDurationSec: number;
  /** Minecraft mcmeta `frames` order; null when the file has no explicit frame list. */
  frameOrder: number[] | null;
}

function parseBlockAnimation(
  stem: string,
  defaultTicks = 2,
  frameCount = 0,
): BlockAnimationMeta {
  const target = stem.toLowerCase();
  for (const [path, raw] of Object.entries(DISCOVERED_BLOCK_MCMETA)) {
    const file = (path.split('/').pop() ?? '').toLowerCase();
    const fileStem = file.replace(/\.png\.mcmeta$/, '').replace(/\.[^.]+$/, '');
    if (fileStem !== target) continue;
    try {
      const parsed = JSON.parse(raw) as {
        animation?: {
          frametime?: number;
          frames?: Array<number | { index?: number; time?: number }>;
        };
      };
      const ticks = parsed.animation?.frametime;
      const frameDurationSec =
        typeof ticks === 'number' && ticks > 0
          ? Math.max(0.05, ticks * 0.05)
          : Math.max(0.05, defaultTicks * 0.05);

      const rawFrames = parsed.animation?.frames;
      let frameOrder: number[] | null = null;
      if (Array.isArray(rawFrames) && rawFrames.length > 0 && frameCount > 0) {
        frameOrder = rawFrames.map((entry) => {
          const index = typeof entry === 'number' ? entry : entry?.index;
          return typeof index === 'number' && index >= 0 && index < frameCount ? index : 0;
        });
      }
      return { frameDurationSec, frameOrder };
    } catch {
      // Fallback to default tick duration and sequential frames
    }
  }
  return { frameDurationSec: Math.max(0.05, defaultTicks * 0.05), frameOrder: null };
}

export function getAssetUrl(name: string): string | null {
  return buildAssetLookup().get(name.toLowerCase()) ?? null;
}

export function getDirtTextureUrl(): string | null {
  const blockLookup = buildAssetLookup((p) => p.includes('/block/'));
  return blockLookup.get('dirt') ?? buildAssetLookup().get('dirt') ?? null;
}

export function getWaterOverlayTextureUrl(): string | null {
  const blockLookup = buildAssetLookup((p) => p.includes('/block/'));
  return blockLookup.get('water_overlay') ?? null;
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

function isImageGrayscale(data: Uint8ClampedArray): boolean {
  let nonTransparent = 0;
  let maxChroma = 0;
  let sumChroma = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 20) continue;
    nonTransparent++;
    const chroma =
      Math.max(data[i], data[i + 1], data[i + 2]) -
      Math.min(data[i], data[i + 1], data[i + 2]);
    sumChroma += chroma;
    if (chroma > maxChroma) maxChroma = chroma;
  }
  if (nonTransparent === 0) return false;
  const avgChroma = sumChroma / nonTransparent;
  return avgChroma <= 18 && maxChroma <= 34;
}

const _linearColor = new THREE.Color();

/**
 * Converts a 16x16 pixel-art item PNG into a crisp Minecraft-style 3D voxel-extruded
 * BufferGeometry (front, back, and exposed pixel side walls with linear vertex colors).
 */
function buildVoxelSpriteGeometry(
  img: HTMLImageElement | HTMLCanvasElement,
): THREE.BufferGeometry | null {
  const size = 16;
  const off = document.createElement('canvas');
  off.width = size;
  off.height = size;
  const ctx = off.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const srcSize = Math.min(img.width, img.height);
  ctx.drawImage(img, 0, 0, srcSize, srcSize, 0, 0, size, size);

  const data = ctx.getImageData(0, 0, size, size).data;
  const isOpaque = (px: number, py: number): boolean => {
    if (px < 0 || px >= size || py < 0 || py >= size) return false;
    return data[(py * size + px) * 4 + 3] >= 128;
  };

  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  const scale = 0.32;
  const pxStep = scale / size;
  const halfDepth = pxStep * 0.5;

  const pushQuad = (
    p0: [number, number, number],
    p1: [number, number, number],
    p2: [number, number, number],
    p3: [number, number, number],
    nx: number,
    ny: number,
    nz: number,
    r: number,
    g: number,
    b: number,
  ) => {
    const base = positions.length / 3;
    positions.push(...p0, ...p1, ...p2, ...p3);
    normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
    colors.push(r, g, b, r, g, b, r, g, b, r, g, b);
    indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };

  for (let py = 0; py < size; py++) {
    for (let px = 0; px < size; px++) {
      if (!isOpaque(px, py)) continue;
      const idx = (py * size + px) * 4;
      _linearColor.setRGB(
        data[idx] / 255,
        data[idx + 1] / 255,
        data[idx + 2] / 255,
        THREE.SRGBColorSpace,
      );
      const r = _linearColor.r;
      const g = _linearColor.g;
      const b = _linearColor.b;

      const x0 = (px - size * 0.5) * pxStep;
      const x1 = x0 + pxStep;
      // Flip Y so canvas row 0 is at top (+Y)
      const y1 = (size * 0.5 - py) * pxStep;
      const y0 = y1 - pxStep;

      // Front (+Z) & Back (-Z) both at full brightness so held face is always vivid like Minecraft
      pushQuad([x0, y0, halfDepth], [x1, y0, halfDepth], [x1, y1, halfDepth], [x0, y1, halfDepth], 0, 0, 1, r, g, b);
      pushQuad([x1, y0, -halfDepth], [x0, y0, -halfDepth], [x0, y1, -halfDepth], [x1, y1, -halfDepth], 0, 0, -1, r, g, b);

      // Left edge (-X)
      if (!isOpaque(px - 1, py)) {
        pushQuad([x0, y0, -halfDepth], [x0, y0, halfDepth], [x0, y1, halfDepth], [x0, y1, -halfDepth], -1, 0, 0, r * 0.84, g * 0.84, b * 0.84);
      }
      // Right edge (+X)
      if (!isOpaque(px + 1, py)) {
        pushQuad([x1, y0, halfDepth], [x1, y0, -halfDepth], [x1, y1, -halfDepth], [x1, y1, halfDepth], 1, 0, 0, r * 0.84, g * 0.84, b * 0.84);
      }
      // Top edge (+Y)
      if (!isOpaque(px, py - 1)) {
        pushQuad([x0, y1, halfDepth], [x1, y1, halfDepth], [x1, y1, -halfDepth], [x0, y1, -halfDepth], 0, 1, 0, r * 0.96, g * 0.96, b * 0.96);
      }
      // Bottom edge (-Y)
      if (!isOpaque(px, py + 1)) {
        pushQuad([x0, y0, -halfDepth], [x1, y0, -halfDepth], [x1, y0, halfDepth], [x0, y0, halfDepth], 0, -1, 0, r * 0.72, g * 0.72, b * 0.72);
      }
    }
  }

  if (positions.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geom.setIndex(indices);
  geom.computeBoundingSphere();
  return geom;
}

/**
 * Builds 3D Minecraft-style voxel-extruded BufferGeometries from a map of item icon URLs / data URLs.
 */
export async function buildVoxelSpriteGeometriesFromUrls(
  iconUrls: Record<number, string>,
): Promise<Record<number, THREE.BufferGeometry>> {
  const result: Record<number, THREE.BufferGeometry> = {};
  await Promise.all(
    Object.entries(iconUrls).map(async ([key, url]) => {
      const img = await loadImage(url);
      if (!img) return;
      const geom = buildVoxelSpriteGeometry(img);
      if (geom) {
        result[Number(key)] = geom;
      }
    }),
  );
  return result;
}

function renderTintedTileFrameCanvas(
  img: HTMLImageElement,
  frameIndex: number,
  tint?: RGBTint,
  tintOnlyIfGrayscale = false,
  alphaScale = 1,
): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = TILE_PIXELS;
  off.height = TILE_PIXELS;
  const ctx = off.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  const srcSize = Math.min(img.width, img.height);
  const srcY = frameIndex * srcSize;
  ctx.drawImage(img, 0, srcY, srcSize, srcSize, 0, 0, TILE_PIXELS, TILE_PIXELS);

  if (tint || alphaScale < 1) {
    const imgData = ctx.getImageData(0, 0, TILE_PIXELS, TILE_PIXELS);
    const d = imgData.data;
    const shouldTint = Boolean(tint) && (!tintOnlyIfGrayscale || isImageGrayscale(d));
    if (shouldTint || alphaScale < 1) {
      for (let i = 0; i < d.length; i += 4) {
        if (d[i + 3] === 0) continue;
        if (shouldTint && tint) {
          d[i] = Math.min(255, Math.round((d[i] * tint.r) / 255));
          d[i + 1] = Math.min(255, Math.round((d[i + 1] * tint.g) / 255));
          d[i + 2] = Math.min(255, Math.round((d[i + 2] * tint.b) / 255));
        }
        if (alphaScale < 1) {
          d[i + 3] = Math.max(1, Math.min(255, Math.round(d[i + 3] * alphaScale)));
        }
      }
      ctx.putImageData(imgData, 0, 0);
    }
  }
  return off;
}

/**
 * Loads any user-provided block & item textures from /assets/ (including /block/bed/,
 * /block/oak/, /block/water/, and /items/) and composites them directly into the live
 * WebGL texture atlas with Minecraft-accurate biome tinting and animated water frames.
 */
export async function applyUserAssetsToAtlas(
  atlasCanvas: HTMLCanvasElement,
  atlasTexture: THREE.CanvasTexture,
  onComplete: (
    itemIconOverrides: Record<number, string>,
    itemGeometries: Record<number, THREE.BufferGeometry>,
    destroyStageTextures: THREE.Texture[],
    loadedCount: number,
    animatedTiles: AnimatedAtlasTile[],
    animatedItemFrames: Record<number, string[]>,
  ) => void,
): Promise<void> {
  const blockLookup = buildAssetLookup(
    (p) => p.includes('/block/') && !p.includes('/destroy/'),
  );
  const itemLookup = buildAssetLookup((p) => p.includes('/item/') || p.includes('/items/'));
  const allLookup = buildAssetLookup((p) => !p.includes('/gui/') && !p.includes('/font/'));
  if (allLookup.size === 0) return;

  const ctx = atlasCanvas.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;

  let loadedCount = 0;
  const animatedTiles: AnimatedAtlasTile[] = [];

  await Promise.all(
    BLOCK_TILE_BINDINGS.map(async (binding) => {
      const matchedName = binding.names.find((n) => blockLookup.has(n) || allLookup.has(n));
      const baseUrl = matchedName
        ? blockLookup.get(matchedName) ?? allLookup.get(matchedName)
        : undefined;
      const overlayUrl = binding.overlayNames
        ?.map((n) => blockLookup.get(n) ?? allLookup.get(n))
        .find(Boolean);
      if (!baseUrl && !overlayUrl) return;

      const [baseImg, overlayImg] = await Promise.all([
        baseUrl ? loadImage(baseUrl) : Promise.resolve(null),
        overlayUrl ? loadImage(overlayUrl) : Promise.resolve(null),
      ]);
      if (!baseImg && !overlayImg) return;

      const col = binding.tile % ATLAS_COLS;
      const row = Math.floor(binding.tile / ATLAS_COLS);
      const ox = col * TILE_PIXELS;
      const oy = row * TILE_PIXELS;

      if (baseImg) {
        const srcSize = Math.min(baseImg.width, baseImg.height);
        const frameCount =
          binding.animated && srcSize > 0 && baseImg.height >= srcSize * 2
            ? Math.floor(baseImg.height / srcSize)
            : 1;

        const firstFrame = renderTintedTileFrameCanvas(
          baseImg,
          0,
          binding.tint,
          binding.tintOnlyIfGrayscale,
          binding.alphaScale ?? 1,
        );
        ctx.clearRect(ox, oy, TILE_PIXELS, TILE_PIXELS);
        ctx.drawImage(firstFrame, ox, oy);

        if (frameCount > 1) {
          const frames: HTMLCanvasElement[] = [firstFrame];
          for (let f = 1; f < frameCount; f++) {
            frames.push(
              renderTintedTileFrameCanvas(
                baseImg,
                f,
                binding.tint,
                binding.tintOnlyIfGrayscale,
                binding.alphaScale ?? 1,
              ),
            );
          }
          const animation = parseBlockAnimation(
            matchedName ?? 'water_still',
            2,
            frames.length,
          );
          animatedTiles.push({
            tile: binding.tile,
            frames: animation.frameOrder
              ? animation.frameOrder.map((index) => frames[index] ?? frames[0])
              : frames,
            frameDurationSec: animation.frameDurationSec,
          });
        }
      }

      if (overlayImg) {
        const overlayTile = renderTintedTileFrameCanvas(overlayImg, 0, binding.overlayTint, true);
        ctx.drawImage(overlayTile, ox, oy);
      }

      loadedCount++;
    }),
  );

  // Also collect any custom item PNGs from /assets/ and extrude 3D held-item voxel meshes
  const itemIconOverrides: Record<number, string> = {};
  const itemGeometries: Record<number, THREE.BufferGeometry> = {};
  await Promise.all(
    ITEM_ASSET_BINDINGS.map(async (itemBinding) => {
      const url = itemBinding.names
        .map((n) => itemLookup.get(n) ?? allLookup.get(n))
        .find(Boolean);
      if (!url) return;

      const overlayUrl = itemBinding.overlayNames
        ?.map((n) => itemLookup.get(n) ?? allLookup.get(n))
        .find(Boolean);

      const [baseImg, overlayImg] = await Promise.all([
        loadImage(url),
        overlayUrl ? loadImage(overlayUrl) : Promise.resolve(null),
      ]);
      if (!baseImg) return;

      if (overlayImg) {
        // Composite layered item texture (e.g. potion_overlay tinted blue + potion glass bottle)
        const comp = document.createElement('canvas');
        comp.width = TILE_PIXELS;
        comp.height = TILE_PIXELS;
        const cctx = comp.getContext('2d')!;
        cctx.imageSmoothingEnabled = false;

        const tintedOverlay = renderTintedTileFrameCanvas(
          overlayImg,
          0,
          itemBinding.overlayTint,
          true,
          1,
        );
        const baseTile = renderTintedTileFrameCanvas(baseImg, 0);

        if (itemBinding.overlayUnderBase) {
          cctx.drawImage(tintedOverlay, 0, 0);
          cctx.drawImage(baseTile, 0, 0);
        } else {
          cctx.drawImage(baseTile, 0, 0);
          cctx.drawImage(tintedOverlay, 0, 0);
        }

        // Upscale crisp 64x64 data URL for UI icons
        const iconOut = document.createElement('canvas');
        iconOut.width = 64;
        iconOut.height = 64;
        const ictx = iconOut.getContext('2d')!;
        ictx.imageSmoothingEnabled = false;
        ictx.drawImage(comp, 0, 0, 64, 64);
        itemIconOverrides[itemBinding.item] = iconOut.toDataURL('image/png');

        const geom = buildVoxelSpriteGeometry(comp);
        if (geom) {
          itemGeometries[itemBinding.item] = geom;
        }
      } else {
        itemIconOverrides[itemBinding.item] = url;
        const geom = buildVoxelSpriteGeometry(baseImg);
        if (geom) {
          itemGeometries[itemBinding.item] = geom;
        }
      }
      loadedCount++;
    }),
  );

  // Load 10-stage Minecraft block breaking crack animation (prefers /assets/**/destroy/destroy_stage_0..9)
  const destroyStageTextures: THREE.Texture[] = [];
  const resolveDestroyStageUrl = (idx: number): string | undefined => {
    const targetName = `destroy_stage_${idx}`;
    for (const [assetPath, url] of Object.entries(DISCOVERED_ASSET_URLS)) {
      const normalized = assetPath.toLowerCase();
      if (
        normalized.includes('/destroy/') &&
        normalized.endsWith(`/${targetName}.png`)
      ) {
        return url;
      }
    }
    return allLookup.get(targetName);
  };
  const stageUrls = Array.from({ length: 10 }, (_, idx) => resolveDestroyStageUrl(idx));
  if (stageUrls.some(Boolean)) {
    const stageImgs = await Promise.all(
      stageUrls.map((u) => (u ? loadImage(u) : Promise.resolve(null))),
    );
    for (const img of stageImgs) {
      if (!img) continue;
      const stageCanvas = document.createElement('canvas');
      stageCanvas.width = TILE_PIXELS;
      stageCanvas.height = TILE_PIXELS;
      const sctx = stageCanvas.getContext('2d')!;
      sctx.imageSmoothingEnabled = false;
      const srcSize = Math.min(img.width, img.height);
      sctx.drawImage(img, 0, 0, srcSize, srcSize, 0, 0, TILE_PIXELS, TILE_PIXELS);
      const tex = new THREE.CanvasTexture(stageCanvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestFilter;
      tex.generateMipmaps = false;
      tex.needsUpdate = true;
      destroyStageTextures.push(tex);
      loadedCount++;
    }
  }

  if (loadedCount > 0) {
    atlasTexture.needsUpdate = true;
    onComplete(
      itemIconOverrides,
      itemGeometries,
      destroyStageTextures,
      loadedCount,
      animatedTiles,
      discoverAnimatedItemFrames(),
    );
  }
}
