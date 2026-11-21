export enum BlockType {
  Air = 0,
  Grass = 1,
  Dirt = 2,
  Stone = 3,
  Cobblestone = 4,
  OakLog = 5,
  OakPlanks = 6,
  OakLeaves = 7,
  Sand = 8,
  Sandstone = 9,
  Water = 10,
  Brick = 11,
  Glass = 12,
  Snow = 13,
  BirchLog = 14,
  BirchLeaves = 15,
  CoalOre = 16,
  IronOre = 17,
  GoldBlock = 18,
  GoldOre = 19,
  DarkSlate = 20,
  Terracotta = 21,
  Bedrock = 22,
  CraftingTable = 23,
  Furnace = 24,
  FurnaceLit = 25,
  WhiteWool = 26,
  OakDoorBottom = 27,
  OakDoorTop = 28,
  OakDoorBottomOpen = 29,
  OakDoorTopOpen = 30,
  BedHead = 31,
  BedFoot = 32,
  ShortGrass = 33,
  TallGrassBottom = 34,
  TallGrassTop = 35,
  RedstoneOre = 36,
  BirchPlanks = 37,
  Lava = 38,
  Clay = 39,
}

export type SoundMaterial =
  | 'grass'
  | 'dirt'
  | 'stone'
  | 'wood'
  | 'leaves'
  | 'sand'
  | 'glass'
  | 'snow'
  | 'water'
  | 'metal';

export type TerrainPreset = 'meadows' | 'alpine' | 'archipelago' | 'mesa';

export type TimePreset = 'dawn' | 'noon' | 'sunset' | 'night';

export interface BlockDefinition {
  id: BlockType;
  name: string;
  category: 'Natural' | 'Wood & Foliage' | 'Masonry' | 'Specialty';
  solid: boolean;
  transparent: boolean;
  cutout?: boolean;
  isLiquid?: boolean;
  breakable: boolean;
  emissive?: boolean;
  sound: SoundMaterial;
  /** Atlas tile indices: [top, side, bottom] */
  tiles: [number, number, number];
  /** Optional distinct front (+Z) face tile (e.g. Furnace firebox) */
  frontTile?: number;
  particleColor: string;
  buildable: boolean;
}

/**
 * Tile index map for our 8x7 (56-tile) texture atlas.
 */
export const TILE = {
  GRASS_TOP: 0,
  GRASS_SIDE: 1,
  DIRT: 2,
  STONE: 3,
  COBBLESTONE: 4,
  OAK_LOG_SIDE: 5,
  OAK_LOG_TOP: 6,
  OAK_PLANKS: 7,
  OAK_LEAVES: 8,
  SAND: 9,
  SANDSTONE_TOP: 10,
  SANDSTONE_SIDE: 11,
  WATER: 12,
  BRICK: 13,
  GLASS: 14,
  SNOW: 15,
  BIRCH_LOG_SIDE: 16,
  BIRCH_LOG_TOP: 17,
  BIRCH_LEAVES: 18,
  COAL_ORE: 19,
  IRON_ORE: 20,
  GOLD_BLOCK: 21,
  SHORT_GRASS: 22,
  DARK_SLATE: 23,
  TERRACOTTA: 24,
  BEDROCK: 25,
  SNOW_GRASS_SIDE: 26,
  CRAFTING_TABLE_TOP: 27,
  CRAFTING_TABLE_SIDE: 28,
  FURNACE_TOP: 29,
  FURNACE_SIDE: 30,
  FURNACE_FRONT: 31,
  CRAFTING_TABLE_FRONT: 32,
  FURNACE_FRONT_ON: 33,
  WHITE_WOOL: 34,
  OAK_DOOR_TOP: 35,
  OAK_DOOR_BOTTOM: 36,
  BED_HEAD_UP: 37,
  BED_FOOT_UP: 38,
  BED_DOWN: 39,
  BED_HEAD_NORTH: 40,
  BED_HEAD_EAST: 41,
  BED_HEAD_WEST: 42,
  BED_FOOT_SOUTH: 43,
  BED_FOOT_EAST: 44,
  BED_FOOT_WEST: 45,
  TALL_GRASS_BOTTOM: 46,
  TALL_GRASS_TOP: 47,
  GOLD_ORE: 48,
  REDSTONE_ORE: 49,
  BIRCH_PLANKS: 50,
  LAVA_STILL: 51,
  LAVA_FLOW: 52,
  CLAY: 53,
} as const;

export const BLOCK_DEFS: Record<BlockType, BlockDefinition> = {
  [BlockType.Air]: {
    id: BlockType.Air,
    name: 'Air',
    category: 'Natural',
    solid: false,
    transparent: true,
    breakable: false,
    sound: 'grass',
    tiles: [0, 0, 0],
    particleColor: '#ffffff',
    buildable: false,
  },
  [BlockType.Grass]: {
    id: BlockType.Grass,
    name: 'Grass Block',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'grass',
    tiles: [TILE.GRASS_TOP, TILE.GRASS_SIDE, TILE.DIRT],
    particleColor: '#5fa343',
    buildable: true,
  },
  [BlockType.Dirt]: {
    id: BlockType.Dirt,
    name: 'Dirt',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'dirt',
    tiles: [TILE.DIRT, TILE.DIRT, TILE.DIRT],
    particleColor: '#8b5e3c',
    buildable: true,
  },
  [BlockType.Stone]: {
    id: BlockType.Stone,
    name: 'Stone',
    category: 'Masonry',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.STONE, TILE.STONE, TILE.STONE],
    particleColor: '#83888f',
    buildable: true,
  },
  [BlockType.Cobblestone]: {
    id: BlockType.Cobblestone,
    name: 'Cobblestone',
    category: 'Masonry',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.COBBLESTONE, TILE.COBBLESTONE, TILE.COBBLESTONE],
    particleColor: '#767a80',
    buildable: true,
  },
  [BlockType.OakLog]: {
    id: BlockType.OakLog,
    name: 'Oak Timber',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.OAK_LOG_TOP, TILE.OAK_LOG_SIDE, TILE.OAK_LOG_TOP],
    particleColor: '#6f4f2d',
    buildable: true,
  },
  [BlockType.OakPlanks]: {
    id: BlockType.OakPlanks,
    name: 'Oak Planks',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.OAK_PLANKS, TILE.OAK_PLANKS, TILE.OAK_PLANKS],
    particleColor: '#be8e56',
    buildable: true,
  },
  [BlockType.OakLeaves]: {
    id: BlockType.OakLeaves,
    name: 'Oak Foliage',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'leaves',
    tiles: [TILE.OAK_LEAVES, TILE.OAK_LEAVES, TILE.OAK_LEAVES],
    particleColor: '#3f7d33',
    buildable: true,
  },
  [BlockType.Sand]: {
    id: BlockType.Sand,
    name: 'Sand',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'sand',
    tiles: [TILE.SAND, TILE.SAND, TILE.SAND],
    particleColor: '#dec894',
    buildable: true,
  },
  [BlockType.Sandstone]: {
    id: BlockType.Sandstone,
    name: 'Sandstone',
    category: 'Masonry',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.SANDSTONE_TOP, TILE.SANDSTONE_SIDE, TILE.SANDSTONE_TOP],
    particleColor: '#d4be86',
    buildable: true,
  },
  [BlockType.Water]: {
    id: BlockType.Water,
    name: 'Water',
    category: 'Natural',
    solid: false,
    transparent: true,
    isLiquid: true,
    breakable: false,
    sound: 'water',
    tiles: [TILE.WATER, TILE.WATER, TILE.WATER],
    particleColor: '#3589c9',
    buildable: false,
  },
  [BlockType.Lava]: {
    id: BlockType.Lava,
    name: 'Lava',
    category: 'Natural',
    solid: false,
    transparent: true,
    isLiquid: true,
    breakable: false,
    emissive: true,
    sound: 'water',
    tiles: [TILE.LAVA_STILL, TILE.LAVA_FLOW, TILE.LAVA_STILL],
    particleColor: '#ff6a1e',
    buildable: false,
  },
  [BlockType.Brick]: {
    id: BlockType.Brick,
    name: 'Red Brick',
    category: 'Masonry',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.BRICK, TILE.BRICK, TILE.BRICK],
    particleColor: '#9f4a3c',
    buildable: true,
  },
  [BlockType.Glass]: {
    id: BlockType.Glass,
    name: 'Framed Glass',
    category: 'Specialty',
    solid: true,
    transparent: true,
    breakable: true,
    sound: 'glass',
    tiles: [TILE.GLASS, TILE.GLASS, TILE.GLASS],
    particleColor: '#b8e3f5',
    buildable: true,
  },
  [BlockType.Snow]: {
    id: BlockType.Snow,
    name: 'Snow Block',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'snow',
    tiles: [TILE.SNOW, TILE.SNOW, TILE.SNOW],
    particleColor: '#edf5fa',
    buildable: true,
  },
  [BlockType.BirchLog]: {
    id: BlockType.BirchLog,
    name: 'Birch Timber',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.BIRCH_LOG_TOP, TILE.BIRCH_LOG_SIDE, TILE.BIRCH_LOG_TOP],
    particleColor: '#dcd9ce',
    buildable: true,
  },
  [BlockType.BirchPlanks]: {
    id: BlockType.BirchPlanks,
    name: 'Birch Planks',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.BIRCH_PLANKS, TILE.BIRCH_PLANKS, TILE.BIRCH_PLANKS],
    particleColor: '#d8cfb4',
    buildable: true,
  },
  [BlockType.BirchLeaves]: {
    id: BlockType.BirchLeaves,
    name: 'Birch Foliage',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'leaves',
    tiles: [TILE.BIRCH_LEAVES, TILE.BIRCH_LEAVES, TILE.BIRCH_LEAVES],
    particleColor: '#6da34c',
    buildable: true,
  },
  [BlockType.CoalOre]: {
    id: BlockType.CoalOre,
    name: 'Coal Ore',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.COAL_ORE, TILE.COAL_ORE, TILE.COAL_ORE],
    particleColor: '#3a3d42',
    buildable: true,
  },
  [BlockType.IronOre]: {
    id: BlockType.IronOre,
    name: 'Iron Ore',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.IRON_ORE, TILE.IRON_ORE, TILE.IRON_ORE],
    particleColor: '#b59d84',
    buildable: true,
  },
  [BlockType.GoldOre]: {
    id: BlockType.GoldOre,
    name: 'Gold Ore',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.GOLD_ORE, TILE.GOLD_ORE, TILE.GOLD_ORE],
    particleColor: '#e5b93d',
    buildable: true,
  },
  [BlockType.GoldBlock]: {
    id: BlockType.GoldBlock,
    name: 'Gilded Gold',
    category: 'Specialty',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'metal',
    tiles: [TILE.GOLD_BLOCK, TILE.GOLD_BLOCK, TILE.GOLD_BLOCK],
    particleColor: '#e5b93b',
    buildable: true,
  },
  [BlockType.DarkSlate]: {
    id: BlockType.DarkSlate,
    name: 'Roof Slate',
    category: 'Masonry',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.DARK_SLATE, TILE.DARK_SLATE, TILE.DARK_SLATE],
    particleColor: '#39414d',
    buildable: true,
  },
  [BlockType.Terracotta]: {
    id: BlockType.Terracotta,
    name: 'Mesa Clay',
    category: 'Masonry',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.TERRACOTTA, TILE.TERRACOTTA, TILE.TERRACOTTA],
    particleColor: '#b96946',
    buildable: true,
  },
  [BlockType.Clay]: {
    id: BlockType.Clay,
    name: 'Clay',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'dirt',
    tiles: [TILE.CLAY, TILE.CLAY, TILE.CLAY],
    particleColor: '#c3c9d2',
    buildable: true,
  },
  [BlockType.Bedrock]: {
    id: BlockType.Bedrock,
    name: 'Bedrock',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: false,
    sound: 'stone',
    tiles: [TILE.BEDROCK, TILE.BEDROCK, TILE.BEDROCK],
    particleColor: '#2a2d33',
    buildable: false,
  },
  [BlockType.CraftingTable]: {
    id: BlockType.CraftingTable,
    name: 'Crafting Table',
    category: 'Specialty',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.CRAFTING_TABLE_TOP, TILE.CRAFTING_TABLE_SIDE, TILE.OAK_PLANKS],
    frontTile: TILE.CRAFTING_TABLE_FRONT,
    particleColor: '#b07b42',
    buildable: true,
  },
  [BlockType.Furnace]: {
    id: BlockType.Furnace,
    name: 'Furnace',
    category: 'Specialty',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.FURNACE_TOP, TILE.FURNACE_SIDE, TILE.FURNACE_TOP],
    frontTile: TILE.FURNACE_FRONT,
    particleColor: '#7a7e84',
    buildable: true,
  },
  [BlockType.FurnaceLit]: {
    id: BlockType.FurnaceLit,
    name: 'Furnace',
    category: 'Specialty',
    solid: true,
    transparent: false,
    breakable: true,
    emissive: true,
    sound: 'stone',
    tiles: [TILE.FURNACE_TOP, TILE.FURNACE_SIDE, TILE.FURNACE_TOP],
    frontTile: TILE.FURNACE_FRONT_ON,
    particleColor: '#c97b3e',
    buildable: false,
  },
  [BlockType.WhiteWool]: {
    id: BlockType.WhiteWool,
    name: 'White Wool',
    category: 'Specialty',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'snow',
    tiles: [TILE.WHITE_WOOL, TILE.WHITE_WOOL, TILE.WHITE_WOOL],
    particleColor: '#ecece8',
    buildable: true,
  },
  [BlockType.OakDoorBottom]: {
    id: BlockType.OakDoorBottom,
    name: 'Oak Door',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.OAK_PLANKS, TILE.OAK_DOOR_BOTTOM, TILE.OAK_PLANKS],
    frontTile: TILE.OAK_DOOR_BOTTOM,
    particleColor: '#a87d48',
    buildable: true,
  },
  [BlockType.OakDoorTop]: {
    id: BlockType.OakDoorTop,
    name: 'Oak Door',
    category: 'Wood & Foliage',
    solid: true,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.OAK_PLANKS, TILE.OAK_DOOR_TOP, TILE.OAK_PLANKS],
    frontTile: TILE.OAK_DOOR_TOP,
    particleColor: '#a87d48',
    buildable: false,
  },
  [BlockType.OakDoorBottomOpen]: {
    id: BlockType.OakDoorBottomOpen,
    name: 'Oak Door',
    category: 'Wood & Foliage',
    solid: false,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.OAK_PLANKS, TILE.OAK_DOOR_BOTTOM, TILE.OAK_PLANKS],
    frontTile: TILE.OAK_DOOR_BOTTOM,
    particleColor: '#a87d48',
    buildable: false,
  },
  [BlockType.OakDoorTopOpen]: {
    id: BlockType.OakDoorTopOpen,
    name: 'Oak Door',
    category: 'Wood & Foliage',
    solid: false,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.OAK_PLANKS, TILE.OAK_DOOR_TOP, TILE.OAK_PLANKS],
    frontTile: TILE.OAK_DOOR_TOP,
    particleColor: '#a87d48',
    buildable: false,
  },
  [BlockType.BedHead]: {
    id: BlockType.BedHead,
    name: 'White Bed',
    category: 'Specialty',
    solid: true,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.BED_HEAD_UP, TILE.BED_HEAD_EAST, TILE.BED_DOWN],
    frontTile: TILE.BED_HEAD_NORTH,
    particleColor: '#e6e4de',
    buildable: false,
  },
  [BlockType.BedFoot]: {
    id: BlockType.BedFoot,
    name: 'White Bed',
    category: 'Specialty',
    solid: true,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'wood',
    tiles: [TILE.BED_FOOT_UP, TILE.BED_FOOT_EAST, TILE.BED_DOWN],
    frontTile: TILE.BED_FOOT_SOUTH,
    particleColor: '#e6e4de',
    buildable: true,
  },
  [BlockType.ShortGrass]: {
    id: BlockType.ShortGrass,
    name: 'Short Grass',
    category: 'Wood & Foliage',
    solid: false,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'grass',
    tiles: [TILE.SHORT_GRASS, TILE.SHORT_GRASS, TILE.SHORT_GRASS],
    particleColor: '#67a948',
    buildable: true,
  },
  [BlockType.TallGrassBottom]: {
    id: BlockType.TallGrassBottom,
    name: 'Tall Grass',
    category: 'Wood & Foliage',
    solid: false,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'grass',
    tiles: [TILE.TALL_GRASS_BOTTOM, TILE.TALL_GRASS_BOTTOM, TILE.TALL_GRASS_BOTTOM],
    particleColor: '#67a948',
    buildable: true,
  },
  [BlockType.TallGrassTop]: {
    id: BlockType.TallGrassTop,
    name: 'Tall Grass',
    category: 'Wood & Foliage',
    solid: false,
    transparent: false,
    cutout: true,
    breakable: true,
    sound: 'grass',
    tiles: [TILE.TALL_GRASS_TOP, TILE.TALL_GRASS_TOP, TILE.TALL_GRASS_TOP],
    particleColor: '#67a948',
    buildable: false,
  },
  [BlockType.RedstoneOre]: {
    id: BlockType.RedstoneOre,
    name: 'Redstone Ore',
    category: 'Natural',
    solid: true,
    transparent: false,
    breakable: true,
    sound: 'stone',
    tiles: [TILE.REDSTONE_ORE, TILE.REDSTONE_ORE, TILE.REDSTONE_ORE],
    particleColor: '#c6372f',
    buildable: true,
  },
};

export const DEFAULT_HOTBAR: BlockType[] = [
  BlockType.Grass,
  BlockType.Dirt,
  BlockType.Stone,
  BlockType.Cobblestone,
  BlockType.OakPlanks,
  BlockType.OakLog,
  BlockType.Brick,
  BlockType.Glass,
  BlockType.WhiteWool,
];

export const BUILDABLE_BLOCKS: BlockType[] = Object.values(BLOCK_DEFS)
  .filter((def) => def.buildable)
  .map((def) => def.id);

export function isSolidBlock(block: BlockType): boolean {
  return BLOCK_DEFS[block]?.solid ?? false;
}

export function isTransparentBlock(block: BlockType): boolean {
  return BLOCK_DEFS[block]?.transparent ?? true;
}

export function isCutoutBlock(block: BlockType): boolean {
  return BLOCK_DEFS[block]?.cutout === true;
}

export function isLiquidBlock(block: BlockType): boolean {
  return BLOCK_DEFS[block]?.isLiquid === true;
}

export function isLeafBlock(block: BlockType): boolean {
  return block === BlockType.OakLeaves || block === BlockType.BirchLeaves;
}

export function isLogBlock(block: BlockType): boolean {
  return block === BlockType.OakLog || block === BlockType.BirchLog;
}

export function isDoorBlock(block: BlockType): boolean {
  return (
    block === BlockType.OakDoorBottom ||
    block === BlockType.OakDoorTop ||
    block === BlockType.OakDoorBottomOpen ||
    block === BlockType.OakDoorTopOpen
  );
}

export function isBedBlock(block: BlockType): boolean {
  return block === BlockType.BedHead || block === BlockType.BedFoot;
}

export function isPlantBlock(block: BlockType): boolean {
  return (
    block === BlockType.ShortGrass ||
    block === BlockType.TallGrassBottom ||
    block === BlockType.TallGrassTop
  );
}

export function isReplaceableBlock(block: BlockType): boolean {
  return block === BlockType.Air || isLiquidBlock(block) || isPlantBlock(block);
}
