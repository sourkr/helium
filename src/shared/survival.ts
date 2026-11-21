import { BLOCK_DEFS, BlockType } from './blocks';

export type GameMode = 'survival' | 'creative';

export enum ItemType {
  // Block items map 1:1 with BlockType numeric values
  Grass = BlockType.Grass,
  Dirt = BlockType.Dirt,
  Stone = BlockType.Stone,
  Cobblestone = BlockType.Cobblestone,
  OakLog = BlockType.OakLog,
  OakPlanks = BlockType.OakPlanks,
  OakLeaves = BlockType.OakLeaves,
  Sand = BlockType.Sand,
  Sandstone = BlockType.Sandstone,
  Brick = BlockType.Brick,
  Glass = BlockType.Glass,
  Snow = BlockType.Snow,
  BirchLog = BlockType.BirchLog,
  BirchPlanks = BlockType.BirchPlanks,
  BirchLeaves = BlockType.BirchLeaves,
  Clay = BlockType.Clay,
  CoalOre = BlockType.CoalOre,
  IronOre = BlockType.IronOre,
  GoldOre = BlockType.GoldOre,
  GoldBlock = BlockType.GoldBlock,
  RedstoneOre = BlockType.RedstoneOre,
  DarkSlate = BlockType.DarkSlate,
  Terracotta = BlockType.Terracotta,
  CraftingTable = BlockType.CraftingTable,
  Furnace = BlockType.Furnace,
  WhiteWool = BlockType.WhiteWool,
  OakDoor = BlockType.OakDoorBottom,
  WhiteBed = BlockType.BedFoot,
  ShortGrass = BlockType.ShortGrass,
  TallGrass = BlockType.TallGrassBottom,

  // Survival resources, food, and tools (100+)
  Stick = 100,
  Coal = 101,
  RawIron = 102,
  Apple = 103,
  RawMutton = 104,
  CookedMutton = 105,
  IronIngot = 106,
  RawGold = 107,
  GoldIngot = 108,
  Redstone = 109,
  WoodPickaxe = 110,
  StonePickaxe = 111,
  IronPickaxe = 112,
  WoodAxe = 113,
  StoneAxe = 114,
  WoodSword = 115,
  StoneSword = 116,
  IronSword = 117,
  IronAxe = 118,
  WoodShovel = 119,
  Bucket = 120,
  WaterBucket = 121,
  GlassBottle = 122,
  WaterBottle = 123,
  StoneShovel = 124,
  IronShovel = 125,
  Clock = 126,
  Compass = 127,
  GoldPickaxe = 128,
  GoldAxe = 129,
  GoldShovel = 130,
  GoldSword = 131,
  LavaBucket = 132,
  ClayBall = 133,
  BrickItem = 134,
}

export type ToolKind = 'hand' | 'pickaxe' | 'axe' | 'shovel' | 'sword';

export interface ItemDefinition {
  id: ItemType;
  name: string;
  maxStack: number;
  blockType?: BlockType;
  foodRestore?: number;
  healthRestore?: number;
  toolKind?: ToolKind;
  toolTier?: number; // 1 = wood, 2 = stone, 3 = iron
  maxDurability?: number;
  miningSpeed?: number;
  attackDamage?: number;
  isBucket?: 'empty' | 'water' | 'lava';
  isBottle?: 'empty' | 'water';
  accentColor: string;
}

export interface InventorySlot {
  item: ItemType;
  count: number;
  durability?: number;
}

export type CraftingCategory = 'Tools' | 'Materials' | 'Food & Utility';

export interface CraftingRecipe {
  id: string;
  name: string;
  output: { item: ItemType; count: number };
  ingredients: Array<{ item: ItemType; count: number }>;
  category: CraftingCategory;
  /** Optional shaped 1..3 row pattern using single-char keys ('.' or ' ' = empty) */
  pattern?: string[];
  key?: Record<string, ItemType>;
  shapeless?: boolean;
}

export const HOTBAR_SIZE = 9;
export const BACKPACK_SIZE = 18;
export const TOTAL_INVENTORY_SLOTS = HOTBAR_SIZE + BACKPACK_SIZE;

const BLOCK_ITEMS: Record<number, ItemDefinition> = {};
for (const def of Object.values(BLOCK_DEFS)) {
  if (def.buildable) {
    BLOCK_ITEMS[def.id] = {
      id: def.id as unknown as ItemType,
      name: def.name,
      maxStack: 64,
      blockType: def.id,
      accentColor: def.particleColor,
    };
  }
}

export const ITEM_DEFS: Record<ItemType, ItemDefinition> = {
  ...(BLOCK_ITEMS as Record<ItemType, ItemDefinition>),
  [ItemType.Stick]: {
    id: ItemType.Stick,
    name: 'Wood Stick',
    maxStack: 64,
    accentColor: '#a87d4c',
  },
  [ItemType.Coal]: {
    id: ItemType.Coal,
    name: 'Coal Lump',
    maxStack: 64,
    accentColor: '#2f3238',
  },
  [ItemType.RawIron]: {
    id: ItemType.RawIron,
    name: 'Raw Iron',
    maxStack: 64,
    accentColor: '#c9a98a',
  },
  [ItemType.IronIngot]: {
    id: ItemType.IronIngot,
    name: 'Iron Ingot',
    maxStack: 64,
    accentColor: '#dce4ed',
  },
  [ItemType.RawGold]: {
    id: ItemType.RawGold,
    name: 'Raw Gold',
    maxStack: 64,
    accentColor: '#d9a62f',
  },
  [ItemType.GoldIngot]: {
    id: ItemType.GoldIngot,
    name: 'Gold Ingot',
    maxStack: 64,
    accentColor: '#f2c84b',
  },
  [ItemType.Redstone]: {
    id: ItemType.Redstone,
    name: 'Redstone Dust',
    maxStack: 64,
    accentColor: '#d43b32',
  },
  [ItemType.Apple]: {
    id: ItemType.Apple,
    name: 'Wild Apple',
    maxStack: 16,
    foodRestore: 4,
    healthRestore: 2,
    accentColor: '#d9483b',
  },
  [ItemType.RawMutton]: {
    id: ItemType.RawMutton,
    name: 'Raw Mutton',
    maxStack: 16,
    foodRestore: 3,
    healthRestore: 0,
    accentColor: '#d67872',
  },
  [ItemType.CookedMutton]: {
    id: ItemType.CookedMutton,
    name: 'Roast Mutton',
    maxStack: 16,
    foodRestore: 8,
    healthRestore: 4,
    accentColor: '#9c5a34',
  },
  [ItemType.WoodPickaxe]: {
    id: ItemType.WoodPickaxe,
    name: 'Wood Pickaxe',
    maxStack: 1,
    toolKind: 'pickaxe',
    toolTier: 1,
    maxDurability: 59,
    miningSpeed: 2.5,
    attackDamage: 3,
    accentColor: '#be8e56',
  },
  [ItemType.StonePickaxe]: {
    id: ItemType.StonePickaxe,
    name: 'Stone Pickaxe',
    maxStack: 1,
    toolKind: 'pickaxe',
    toolTier: 2,
    maxDurability: 131,
    miningSpeed: 4.4,
    attackDamage: 4,
    accentColor: '#959ca6',
  },
  [ItemType.IronPickaxe]: {
    id: ItemType.IronPickaxe,
    name: 'Iron Pickaxe',
    maxStack: 1,
    toolKind: 'pickaxe',
    toolTier: 3,
    maxDurability: 250,
    miningSpeed: 6.8,
    attackDamage: 5,
    accentColor: '#dfe5ec',
  },
  [ItemType.WoodAxe]: {
    id: ItemType.WoodAxe,
    name: 'Wood Axe',
    maxStack: 1,
    toolKind: 'axe',
    toolTier: 1,
    maxDurability: 59,
    miningSpeed: 2.6,
    attackDamage: 5,
    accentColor: '#be8e56',
  },
  [ItemType.StoneAxe]: {
    id: ItemType.StoneAxe,
    name: 'Stone Axe',
    maxStack: 1,
    toolKind: 'axe',
    toolTier: 2,
    maxDurability: 131,
    miningSpeed: 4.5,
    attackDamage: 7,
    accentColor: '#959ca6',
  },
  [ItemType.WoodSword]: {
    id: ItemType.WoodSword,
    name: 'Wood Sword',
    maxStack: 1,
    toolKind: 'sword',
    toolTier: 1,
    maxDurability: 59,
    miningSpeed: 1.4,
    attackDamage: 6,
    accentColor: '#be8e56',
  },
  [ItemType.StoneSword]: {
    id: ItemType.StoneSword,
    name: 'Stone Sword',
    maxStack: 1,
    toolKind: 'sword',
    toolTier: 2,
    maxDurability: 131,
    miningSpeed: 1.5,
    attackDamage: 8,
    accentColor: '#959ca6',
  },
  [ItemType.IronSword]: {
    id: ItemType.IronSword,
    name: 'Iron Sword',
    maxStack: 1,
    toolKind: 'sword',
    toolTier: 3,
    maxDurability: 250,
    miningSpeed: 1.6,
    attackDamage: 11,
    accentColor: '#e4ebf2',
  },
  [ItemType.IronAxe]: {
    id: ItemType.IronAxe,
    name: 'Iron Axe',
    maxStack: 1,
    toolKind: 'axe',
    toolTier: 3,
    maxDurability: 250,
    miningSpeed: 6.5,
    attackDamage: 9,
    accentColor: '#dfe5ec',
  },
  [ItemType.WoodShovel]: {
    id: ItemType.WoodShovel,
    name: 'Wood Shovel',
    maxStack: 1,
    toolKind: 'shovel',
    toolTier: 1,
    maxDurability: 59,
    miningSpeed: 3.2,
    attackDamage: 3,
    accentColor: '#be8e56',
  },
  [ItemType.StoneShovel]: {
    id: ItemType.StoneShovel,
    name: 'Stone Shovel',
    maxStack: 1,
    toolKind: 'shovel',
    toolTier: 2,
    maxDurability: 131,
    miningSpeed: 5.2,
    attackDamage: 4,
    accentColor: '#959ca6',
  },
  [ItemType.IronShovel]: {
    id: ItemType.IronShovel,
    name: 'Iron Shovel',
    maxStack: 1,
    toolKind: 'shovel',
    toolTier: 3,
    maxDurability: 250,
    miningSpeed: 8.0,
    attackDamage: 5,
    accentColor: '#dfe5ec',
  },
  [ItemType.GoldPickaxe]: {
    id: ItemType.GoldPickaxe,
    name: 'Gold Pickaxe',
    maxStack: 1,
    toolKind: 'pickaxe',
    toolTier: 2,
    maxDurability: 32,
    miningSpeed: 9.0,
    attackDamage: 3,
    accentColor: '#e5b93b',
  },
  [ItemType.GoldAxe]: {
    id: ItemType.GoldAxe,
    name: 'Gold Axe',
    maxStack: 1,
    toolKind: 'axe',
    toolTier: 2,
    maxDurability: 32,
    miningSpeed: 9.5,
    attackDamage: 5,
    accentColor: '#e5b93b',
  },
  [ItemType.GoldShovel]: {
    id: ItemType.GoldShovel,
    name: 'Gold Shovel',
    maxStack: 1,
    toolKind: 'shovel',
    toolTier: 2,
    maxDurability: 32,
    miningSpeed: 11.0,
    attackDamage: 3,
    accentColor: '#e5b93b',
  },
  [ItemType.GoldSword]: {
    id: ItemType.GoldSword,
    name: 'Gold Sword',
    maxStack: 1,
    toolKind: 'sword',
    toolTier: 2,
    maxDurability: 32,
    miningSpeed: 2.4,
    attackDamage: 5,
    accentColor: '#e5b93b',
  },
  [ItemType.Bucket]: {
    id: ItemType.Bucket,
    name: 'Iron Bucket',
    maxStack: 16,
    isBucket: 'empty',
    accentColor: '#c8d1db',
  },
  [ItemType.WaterBucket]: {
    id: ItemType.WaterBucket,
    name: 'Water Bucket',
    maxStack: 1,
    isBucket: 'water',
    accentColor: '#3693e6',
  },
  [ItemType.LavaBucket]: {
    id: ItemType.LavaBucket,
    name: 'Lava Bucket',
    maxStack: 1,
    isBucket: 'lava',
    accentColor: '#ff6a1e',
  },
  [ItemType.ClayBall]: {
    id: ItemType.ClayBall,
    name: 'Clay Ball',
    maxStack: 64,
    accentColor: '#c3c9d2',
  },
  [ItemType.BrickItem]: {
    id: ItemType.BrickItem,
    name: 'Brick',
    maxStack: 64,
    accentColor: '#9f4a3c',
  },
  [ItemType.GlassBottle]: {
    id: ItemType.GlassBottle,
    name: 'Glass Bottle',
    maxStack: 64,
    isBottle: 'empty',
    accentColor: '#c4e3f3',
  },
  [ItemType.WaterBottle]: {
    id: ItemType.WaterBottle,
    name: 'Water Bottle',
    maxStack: 1,
    foodRestore: 2,
    healthRestore: 1,
    isBottle: 'water',
    accentColor: '#385dc6',
  },
  [ItemType.Clock]: {
    id: ItemType.Clock,
    name: 'Clock',
    maxStack: 1,
    accentColor: '#d8b64e',
  },
  [ItemType.Compass]: {
    id: ItemType.Compass,
    name: 'Compass',
    maxStack: 1,
    accentColor: '#b72b22',
  },
};

export interface BlockMiningSpec {
  baseTime: number; // Seconds with bare hand
  preferredTool: ToolKind;
}

export function getBlockMiningSpec(block: BlockType): BlockMiningSpec {
  switch (block) {
    case BlockType.ShortGrass:
    case BlockType.TallGrassBottom:
    case BlockType.TallGrassTop:
      return { baseTime: 0.05, preferredTool: 'hand' };
    case BlockType.OakLeaves:
    case BlockType.BirchLeaves:
      return { baseTime: 0.25, preferredTool: 'hand' };
    case BlockType.Snow:
      return { baseTime: 0.25, preferredTool: 'shovel' };
    case BlockType.Glass:
      return { baseTime: 0.3, preferredTool: 'pickaxe' };
    case BlockType.Grass:
    case BlockType.Dirt:
    case BlockType.Sand:
      return { baseTime: 0.42, preferredTool: 'shovel' };
    case BlockType.OakLog:
    case BlockType.BirchLog:
    case BlockType.OakPlanks:
    case BlockType.BirchPlanks:
    case BlockType.CraftingTable:
    case BlockType.OakDoorBottom:
    case BlockType.OakDoorTop:
    case BlockType.OakDoorBottomOpen:
    case BlockType.OakDoorTopOpen:
      return { baseTime: 1.15, preferredTool: 'axe' };
    case BlockType.WhiteWool:
    case BlockType.BedHead:
    case BlockType.BedFoot:
      return { baseTime: 0.42, preferredTool: 'hand' };
    case BlockType.Sandstone:
    case BlockType.Terracotta:
      return { baseTime: 1.45, preferredTool: 'pickaxe' };
    case BlockType.Clay:
      return { baseTime: 0.95, preferredTool: 'shovel' };
    case BlockType.Stone:
    case BlockType.Cobblestone:
    case BlockType.Brick:
    case BlockType.DarkSlate:
    case BlockType.Furnace:
    case BlockType.FurnaceLit:
      return { baseTime: 2.1, preferredTool: 'pickaxe' };
    case BlockType.CoalOre:
      return { baseTime: 2.4, preferredTool: 'pickaxe' };
    case BlockType.IronOre:
    case BlockType.GoldBlock:
      return { baseTime: 2.8, preferredTool: 'pickaxe' };
    case BlockType.GoldOre:
    case BlockType.RedstoneOre:
      return { baseTime: 3.1, preferredTool: 'pickaxe' };
    default:
      return { baseTime: 0.7, preferredTool: 'hand' };
  }
}

export function getMiningDuration(block: BlockType, equipped: ItemType | null): number {
  const spec = getBlockMiningSpec(block);
  if (!equipped) return spec.baseTime;
  const def = ITEM_DEFS[equipped];
  if (def?.toolKind && def.toolKind === spec.preferredTool && def.miningSpeed) {
    return Math.max(0.14, spec.baseTime / def.miningSpeed);
  }
  return spec.baseTime;
}

export function getBlockDrop(block: BlockType): { item: ItemType; count: number } | null {
  switch (block) {
    case BlockType.Grass:
      return { item: ItemType.Dirt, count: 1 };
    case BlockType.Stone:
      return { item: ItemType.Cobblestone, count: 1 };
    case BlockType.CoalOre:
      return { item: ItemType.Coal, count: 1 };
    case BlockType.IronOre:
      return { item: ItemType.RawIron, count: 1 };
    case BlockType.GoldOre:
      return { item: ItemType.RawGold, count: 1 };
    case BlockType.RedstoneOre:
      return { item: ItemType.Redstone, count: 2 + Math.floor(Math.random() * 2) };
    case BlockType.Brick:
      return { item: ItemType.BrickItem, count: 4 };
    case BlockType.Clay:
      return { item: ItemType.ClayBall, count: 4 };
    case BlockType.OakLeaves:
    case BlockType.BirchLeaves:
      return Math.random() < 0.24 ? { item: ItemType.Apple, count: 1 } : null;
    case BlockType.FurnaceLit:
      return { item: ItemType.Furnace, count: 1 };
    case BlockType.OakDoorBottom:
    case BlockType.OakDoorTop:
    case BlockType.OakDoorBottomOpen:
    case BlockType.OakDoorTopOpen:
      return { item: ItemType.OakDoor, count: 1 };
    case BlockType.BedHead:
    case BlockType.BedFoot:
      return { item: ItemType.WhiteBed, count: 1 };
    case BlockType.ShortGrass:
    case BlockType.TallGrassBottom:
    case BlockType.TallGrassTop:
    case BlockType.Water:
    case BlockType.Lava:
    case BlockType.Air:
    case BlockType.Bedrock:
      return null;
    default:
      if (BLOCK_DEFS[block]?.buildable) {
        return { item: block as unknown as ItemType, count: 1 };
      }
      return null;
  }
}

export const CRAFTING_RECIPES: CraftingRecipe[] = [
  // Materials
  {
    id: 'planks_oak',
    name: 'Oak Planks (×4)',
    output: { item: ItemType.OakPlanks, count: 4 },
    ingredients: [{ item: ItemType.OakLog, count: 1 }],
    category: 'Materials',
    shapeless: true,
  },
  {
    id: 'planks_birch',
    name: 'Birch Planks (×4)',
    output: { item: ItemType.BirchPlanks, count: 4 },
    ingredients: [{ item: ItemType.BirchLog, count: 1 }],
    category: 'Materials',
    shapeless: true,
  },
  {
    id: 'sticks',
    name: 'Wood Sticks (×4)',
    output: { item: ItemType.Stick, count: 4 },
    ingredients: [{ item: ItemType.OakPlanks, count: 2 }],
    category: 'Materials',
    pattern: ['P', 'P'],
    key: { P: ItemType.OakPlanks },
  },
  {
    id: 'crafting_table',
    name: 'Crafting Table',
    output: { item: ItemType.CraftingTable, count: 1 },
    ingredients: [{ item: ItemType.OakPlanks, count: 4 }],
    category: 'Materials',
    pattern: ['PP', 'PP'],
    key: { P: ItemType.OakPlanks },
  },
  {
    id: 'furnace',
    name: 'Furnace',
    output: { item: ItemType.Furnace, count: 1 },
    ingredients: [{ item: ItemType.Cobblestone, count: 8 }],
    category: 'Materials',
    pattern: ['CCC', 'C.C', 'CCC'],
    key: { C: ItemType.Cobblestone },
  },
  {
    id: 'oak_door',
    name: 'Oak Door (×3)',
    output: { item: ItemType.OakDoor, count: 3 },
    ingredients: [{ item: ItemType.OakPlanks, count: 6 }],
    category: 'Materials',
    pattern: ['PP', 'PP', 'PP'],
    key: { P: ItemType.OakPlanks },
  },
  {
    id: 'sandstone_block',
    name: 'Sandstone (×2)',
    output: { item: ItemType.Sandstone, count: 2 },
    ingredients: [{ item: ItemType.Sand, count: 4 }],
    category: 'Materials',
    pattern: ['SS', 'SS'],
    key: { S: ItemType.Sand },
  },
  {
    id: 'smooth_stone',
    name: 'Smooth Stone (×2)',
    output: { item: ItemType.Stone, count: 2 },
    ingredients: [
      { item: ItemType.Cobblestone, count: 2 },
      { item: ItemType.Coal, count: 1 },
    ],
    category: 'Materials',
    shapeless: true,
  },
  {
    id: 'glass_smelt',
    name: 'Framed Glass (×4)',
    output: { item: ItemType.Glass, count: 4 },
    ingredients: [
      { item: ItemType.Sand, count: 3 },
      { item: ItemType.Coal, count: 1 },
    ],
    category: 'Materials',
    shapeless: true,
  },
  {
    id: 'brick_kiln',
    name: 'Brick (×4)',
    output: { item: ItemType.BrickItem, count: 4 },
    ingredients: [{ item: ItemType.ClayBall, count: 4 }],
    category: 'Materials',
    shapeless: true,
  },
  {
    id: 'bricks_block',
    name: 'Brick Block',
    output: { item: ItemType.Brick, count: 1 },
    ingredients: [{ item: ItemType.BrickItem, count: 4 }],
    category: 'Materials',
    pattern: ['BB', 'BB'],
    key: { B: ItemType.BrickItem },
  },
  {
    id: 'clay_block',
    name: 'Clay',
    output: { item: ItemType.Clay, count: 1 },
    ingredients: [{ item: ItemType.ClayBall, count: 4 }],
    category: 'Materials',
    pattern: ['CC', 'CC'],
    key: { C: ItemType.ClayBall },
  },
  {
    id: 'terracotta_mix',
    name: 'Terracotta (×4)',
    output: { item: ItemType.Terracotta, count: 4 },
    ingredients: [
      { item: ItemType.Dirt, count: 2 },
      { item: ItemType.Sand, count: 2 },
    ],
    category: 'Materials',
    pattern: ['DS', 'SD'],
    key: { D: ItemType.Dirt, S: ItemType.Sand },
  },
  {
    id: 'roof_slate',
    name: 'Roof Slate (×4)',
    output: { item: ItemType.DarkSlate, count: 4 },
    ingredients: [
      { item: ItemType.Cobblestone, count: 3 },
      { item: ItemType.Coal, count: 1 },
    ],
    category: 'Materials',
    shapeless: true,
  },
  {
    id: 'gold_block_craft',
    name: 'Gold Block',
    output: { item: ItemType.GoldBlock, count: 1 },
    ingredients: [
      { item: ItemType.IronIngot, count: 4 },
      { item: ItemType.Coal, count: 2 },
    ],
    category: 'Materials',
    shapeless: true,
  },

  // Tools & Weapons
  {
    id: 'wood_pickaxe',
    name: 'Wood Pickaxe',
    output: { item: ItemType.WoodPickaxe, count: 1 },
    ingredients: [
      { item: ItemType.OakPlanks, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['PPP', '.S.', '.S.'],
    key: { P: ItemType.OakPlanks, S: ItemType.Stick },
  },
  {
    id: 'wood_axe',
    name: 'Wood Axe',
    output: { item: ItemType.WoodAxe, count: 1 },
    ingredients: [
      { item: ItemType.OakPlanks, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['PP.', 'PS.', '.S.'],
    key: { P: ItemType.OakPlanks, S: ItemType.Stick },
  },
  {
    id: 'wood_sword',
    name: 'Wood Sword',
    output: { item: ItemType.WoodSword, count: 1 },
    ingredients: [
      { item: ItemType.OakPlanks, count: 2 },
      { item: ItemType.Stick, count: 1 },
    ],
    category: 'Tools',
    pattern: ['P', 'P', 'S'],
    key: { P: ItemType.OakPlanks, S: ItemType.Stick },
  },
  {
    id: 'stone_pickaxe',
    name: 'Stone Pickaxe',
    output: { item: ItemType.StonePickaxe, count: 1 },
    ingredients: [
      { item: ItemType.Cobblestone, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['CCC', '.S.', '.S.'],
    key: { C: ItemType.Cobblestone, S: ItemType.Stick },
  },
  {
    id: 'stone_axe',
    name: 'Stone Axe',
    output: { item: ItemType.StoneAxe, count: 1 },
    ingredients: [
      { item: ItemType.Cobblestone, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['CC.', 'CS.', '.S.'],
    key: { C: ItemType.Cobblestone, S: ItemType.Stick },
  },
  {
    id: 'stone_sword',
    name: 'Stone Sword',
    output: { item: ItemType.StoneSword, count: 1 },
    ingredients: [
      { item: ItemType.Cobblestone, count: 2 },
      { item: ItemType.Stick, count: 1 },
    ],
    category: 'Tools',
    pattern: ['C', 'C', 'S'],
    key: { C: ItemType.Cobblestone, S: ItemType.Stick },
  },
  {
    id: 'iron_pickaxe',
    name: 'Iron Pickaxe',
    output: { item: ItemType.IronPickaxe, count: 1 },
    ingredients: [
      { item: ItemType.IronIngot, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['III', '.S.', '.S.'],
    key: { I: ItemType.IronIngot, S: ItemType.Stick },
  },
  {
    id: 'iron_axe',
    name: 'Iron Axe',
    output: { item: ItemType.IronAxe, count: 1 },
    ingredients: [
      { item: ItemType.IronIngot, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['II.', 'IS.', '.S.'],
    key: { I: ItemType.IronIngot, S: ItemType.Stick },
  },
  {
    id: 'iron_sword',
    name: 'Iron Sword',
    output: { item: ItemType.IronSword, count: 1 },
    ingredients: [
      { item: ItemType.IronIngot, count: 2 },
      { item: ItemType.Stick, count: 1 },
    ],
    category: 'Tools',
    pattern: ['I', 'I', 'S'],
    key: { I: ItemType.IronIngot, S: ItemType.Stick },
  },
  {
    id: 'wood_shovel',
    name: 'Wood Shovel',
    output: { item: ItemType.WoodShovel, count: 1 },
    ingredients: [
      { item: ItemType.OakPlanks, count: 2 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['P', 'S', 'S'],
    key: { P: ItemType.OakPlanks, S: ItemType.Stick },
  },
  {
    id: 'stone_shovel',
    name: 'Stone Shovel',
    output: { item: ItemType.StoneShovel, count: 1 },
    ingredients: [
      { item: ItemType.Cobblestone, count: 2 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['C', 'S', 'S'],
    key: { C: ItemType.Cobblestone, S: ItemType.Stick },
  },
  {
    id: 'iron_shovel',
    name: 'Iron Shovel',
    output: { item: ItemType.IronShovel, count: 1 },
    ingredients: [
      { item: ItemType.IronIngot, count: 2 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['I', 'S', 'S'],
    key: { I: ItemType.IronIngot, S: ItemType.Stick },
  },
  {
    id: 'gold_pickaxe',
    name: 'Gold Pickaxe',
    output: { item: ItemType.GoldPickaxe, count: 1 },
    ingredients: [
      { item: ItemType.GoldIngot, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['GGG', '.S.', '.S.'],
    key: { G: ItemType.GoldIngot, S: ItemType.Stick },
  },
  {
    id: 'gold_axe',
    name: 'Gold Axe',
    output: { item: ItemType.GoldAxe, count: 1 },
    ingredients: [
      { item: ItemType.GoldIngot, count: 3 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['GG.', 'GS.', '.S.'],
    key: { G: ItemType.GoldIngot, S: ItemType.Stick },
  },
  {
    id: 'gold_shovel',
    name: 'Gold Shovel',
    output: { item: ItemType.GoldShovel, count: 1 },
    ingredients: [
      { item: ItemType.GoldIngot, count: 2 },
      { item: ItemType.Stick, count: 2 },
    ],
    category: 'Tools',
    pattern: ['G', 'S', 'S'],
    key: { G: ItemType.GoldIngot, S: ItemType.Stick },
  },
  {
    id: 'gold_sword',
    name: 'Gold Sword',
    output: { item: ItemType.GoldSword, count: 1 },
    ingredients: [
      { item: ItemType.GoldIngot, count: 2 },
      { item: ItemType.Stick, count: 1 },
    ],
    category: 'Tools',
    pattern: ['G', 'G', 'S'],
    key: { G: ItemType.GoldIngot, S: ItemType.Stick },
  },

  // Food & Utility
  {
    id: 'iron_bucket',
    name: 'Iron Bucket',
    output: { item: ItemType.Bucket, count: 1 },
    ingredients: [{ item: ItemType.IronIngot, count: 3 }],
    category: 'Food & Utility',
    pattern: ['I.I', '.I.'],
    key: { I: ItemType.IronIngot },
  },
  {
    id: 'glass_bottle',
    name: 'Glass Bottle',
    output: { item: ItemType.GlassBottle, count: 3 },
    ingredients: [{ item: ItemType.Glass, count: 3 }],
    category: 'Food & Utility',
    pattern: ['G.G', '.G.'],
    key: { G: ItemType.Glass },
  },
  {
    id: 'clock',
    name: 'Clock',
    output: { item: ItemType.Clock, count: 1 },
    ingredients: [
      { item: ItemType.GoldIngot, count: 4 },
      { item: ItemType.Redstone, count: 1 },
    ],
    category: 'Food & Utility',
    pattern: ['.G.', 'GRG', '.G.'],
    key: { G: ItemType.GoldIngot, R: ItemType.Redstone },
  },
  {
    id: 'compass',
    name: 'Compass',
    output: { item: ItemType.Compass, count: 1 },
    ingredients: [
      { item: ItemType.IronIngot, count: 4 },
      { item: ItemType.Redstone, count: 1 },
    ],
    category: 'Food & Utility',
    pattern: ['.I.', 'IRI', '.I.'],
    key: { I: ItemType.IronIngot, R: ItemType.Redstone },
  },
  {
    id: 'roast_mutton',
    name: 'Roast Mutton',
    output: { item: ItemType.CookedMutton, count: 1 },
    ingredients: [
      { item: ItemType.RawMutton, count: 1 },
      { item: ItemType.Coal, count: 1 },
    ],
    category: 'Food & Utility',
    shapeless: true,
  },
  {
    id: 'white_bed',
    name: 'White Bed',
    output: { item: ItemType.WhiteBed, count: 1 },
    ingredients: [
      { item: ItemType.WhiteWool, count: 3 },
      { item: ItemType.OakPlanks, count: 3 },
    ],
    category: 'Food & Utility',
    pattern: ['WWW', 'PPP'],
    key: { W: ItemType.WhiteWool, P: ItemType.OakPlanks },
  },
];

export function createStarterSurvivalInventory(): Array<InventorySlot | null> {
  return new Array(TOTAL_INVENTORY_SLOTS).fill(null);
}

export function countItemInInventory(
  slots: Array<InventorySlot | null>,
  item: ItemType,
): number {
  let total = 0;
  for (const s of slots) {
    if (s && s.item === item) total += s.count;
  }
  return total;
}

export function getSlotDurability(
  slot: InventorySlot | null | undefined,
): { current: number; max: number; ratio: number } | null {
  if (!slot) return null;
  const max = ITEM_DEFS[slot.item]?.maxDurability;
  if (!max || max <= 0) return null;
  const current = Math.max(0, Math.min(max, slot.durability ?? max));
  return { current, max, ratio: current / max };
}

export function getDurabilityBarColor(ratio: number): string {
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = Math.round(clamped * 120);
  return `hsl(${hue}, 86%, 48%)`;
}

export function damageToolSlot(
  slots: Array<InventorySlot | null>,
  slotIdx: number,
  amount = 1,
): { damaged: boolean; broken: boolean; itemName?: string; accentColor?: string } {
  const slot = slots[slotIdx];
  if (!slot || amount <= 0) return { damaged: false, broken: false };
  const def = ITEM_DEFS[slot.item];
  if (!def?.maxDurability) return { damaged: false, broken: false };

  const next = (slot.durability ?? def.maxDurability) - amount;
  if (next <= 0) {
    slots[slotIdx] = null;
    return {
      damaged: true,
      broken: true,
      itemName: def.name,
      accentColor: def.accentColor,
    };
  }
  slot.durability = next;
  return {
    damaged: true,
    broken: false,
    itemName: def.name,
    accentColor: def.accentColor,
  };
}

export function addItemToInventory(
  slots: Array<InventorySlot | null>,
  item: ItemType,
  amount: number,
  durability?: number,
): boolean {
  const def = ITEM_DEFS[item];
  if (!def || amount <= 0) return false;
  let remaining = amount;

  // 1. Fill existing stacks first
  if (def.maxStack > 1) {
    for (let i = 0; i < slots.length && remaining > 0; i++) {
      const s = slots[i];
      if (s && s.item === item && s.count < def.maxStack) {
        const space = def.maxStack - s.count;
        const add = Math.min(space, remaining);
        s.count += add;
        remaining -= add;
      }
    }
  }

  // 2. Place in empty slots
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    if (slots[i] === null) {
      const add = Math.min(def.maxStack, remaining);
      const nextSlot: InventorySlot = { item, count: add };
      if (def.maxDurability !== undefined) {
        nextSlot.durability = Math.max(1, Math.min(def.maxDurability, durability ?? def.maxDurability));
      }
      slots[i] = nextSlot;
      remaining -= add;
    }
  }

  return remaining < amount;
}

export function consumeItemFromInventory(
  slots: Array<InventorySlot | null>,
  item: ItemType,
  amount: number,
): boolean {
  if (countItemInInventory(slots, item) < amount) return false;
  let remaining = amount;
  for (let i = 0; i < slots.length && remaining > 0; i++) {
    const s = slots[i];
    if (s && s.item === item) {
      const take = Math.min(s.count, remaining);
      s.count -= take;
      remaining -= take;
      if (s.count <= 0) slots[i] = null;
    }
  }
  return true;
}

export function getMaxCraftCount(
  slots: Array<InventorySlot | null>,
  recipe: CraftingRecipe,
): number {
  let maxTimes = Infinity;
  for (const ing of recipe.ingredients) {
    const have = countItemInInventory(slots, ing.item);
    maxTimes = Math.min(maxTimes, Math.floor(have / ing.count));
  }
  return Number.isFinite(maxTimes) ? Math.max(0, maxTimes) : 0;
}

export function canCraftRecipe(
  slots: Array<InventorySlot | null>,
  recipe: CraftingRecipe,
): boolean {
  return getMaxCraftCount(slots, recipe) > 0;
}

export function executeCraftRecipe(
  slots: Array<InventorySlot | null>,
  recipe: CraftingRecipe,
): boolean {
  return executeCraftRecipeBatch(slots, recipe, 1) > 0;
}

export function executeCraftRecipeBatch(
  slots: Array<InventorySlot | null>,
  recipe: CraftingRecipe,
  requestedTimes: number,
): number {
  const maxPossible = getMaxCraftCount(slots, recipe);
  const times = Math.min(maxPossible, Math.max(0, Math.floor(requestedTimes)));
  if (times <= 0) return 0;

  // Respect stackable capacity: cap non-stackable tools to available empty slots
  const outDef = ITEM_DEFS[recipe.output.item];
  let actualTimes = times;
  if (outDef && outDef.maxStack === 1) {
    const emptySlots = slots.filter((s) => s === null).length;
    actualTimes = Math.min(times, Math.max(1, emptySlots));
  }

  for (const ing of recipe.ingredients) {
    consumeItemFromInventory(slots, ing.item, ing.count * actualTimes);
  }
  addItemToInventory(slots, recipe.output.item, recipe.output.count * actualTimes);
  return actualTimes;
}

/**
 * Checks whether a crafting recipe fits inside a 2x2 pocket grid or requires a 3x3 Crafting Table.
 */
export function recipeFitsInGridSize(recipe: CraftingRecipe, gridSize: 2 | 3): boolean {
  if (gridSize === 3) return true;
  if (recipe.pattern && recipe.key) {
    const pH = recipe.pattern.length;
    const pW = Math.max(...recipe.pattern.map((row) => row.length));
    return pH <= 2 && pW <= 2;
  }
  const totalCount = recipe.ingredients.reduce((sum, ing) => sum + ing.count, 0);
  return totalCount <= 4;
}

/**
 * Returns a canonical gridSize x gridSize layout for a recipe (used for Recipe Book preview & auto-fill).
 */
export function getRecipeGridPreview(
  recipe: CraftingRecipe,
  gridSize: 2 | 3 = 3,
): Array<ItemType | null> {
  const cellCount = gridSize * gridSize;
  const cells: Array<ItemType | null> = new Array(cellCount).fill(null);
  if (!recipeFitsInGridSize(recipe, gridSize)) return cells;

  const pattern = recipe.pattern;
  const key = recipe.key;
  if (pattern && key) {
    const rows = pattern.length;
    const cols = Math.max(...pattern.map((row) => row.length));
    const rowOff = rows < gridSize ? Math.floor((gridSize - rows) / 2) : 0;
    const colOff = cols < gridSize ? Math.floor((gridSize - cols) / 2) : 0;

    for (let r = 0; r < rows && r + rowOff < gridSize; r++) {
      const rowStr: string = pattern[r] ?? '';
      for (let c = 0; c < rowStr.length && c + colOff < gridSize; c++) {
        const ch = rowStr[c];
        if (ch !== '.' && ch !== ' ' && key[ch] !== undefined) {
          cells[(r + rowOff) * gridSize + (c + colOff)] = key[ch];
        }
      }
    }
    return cells;
  }

  // Shapeless: lay ingredients out sequentially across the grid
  let cursor = 0;
  for (const ing of recipe.ingredients) {
    for (let k = 0; k < ing.count && cursor < cellCount; k++) {
      cells[cursor++] = ing.item;
    }
  }
  return cells;
}

/**
 * Matches a 2x2 or 3x3 crafting grid (trimmed bounding box for shaped recipes,
 * exact multiset for shapeless recipes, plus horizontal mirror support for axes/shaped tools).
 */
export function matchCraftingGrid(
  grid: Array<InventorySlot | null>,
  gridSize: 2 | 3 = 3,
): CraftingRecipe | null {
  const cellCount = gridSize * gridSize;
  let minR: number = gridSize;
  let maxR = -1;
  let minC: number = gridSize;
  let maxC = -1;
  const itemCounts = new Map<ItemType, number>();
  let nonEmptyCells = 0;

  for (let i = 0; i < cellCount; i++) {
    const slot = grid[i];
    if (!slot || slot.count <= 0) continue;
    nonEmptyCells++;
    const r = Math.floor(i / gridSize);
    const c = i % gridSize;
    if (r < minR) minR = r;
    if (r > maxR) maxR = r;
    if (c < minC) minC = c;
    if (c > maxC) maxC = c;
    itemCounts.set(slot.item, (itemCounts.get(slot.item) ?? 0) + 1);
  }

  if (nonEmptyCells === 0) return null;

  const boxH = maxR - minR + 1;
  const boxW = maxC - minC + 1;

  // 1. Check shaped recipes first (allowing horizontal flip so left/right axes both match)
  for (const recipe of CRAFTING_RECIPES) {
    if (!recipe.pattern || !recipe.key) continue;
    const pH = recipe.pattern.length;
    const pW = Math.max(...recipe.pattern.map((row) => row.length));
    if (pH !== boxH || pW !== boxW) continue;

    for (const mirrored of [false, true]) {
      let ok = true;
      for (let r = 0; r < pH && ok; r++) {
        for (let c = 0; c < pW && ok; c++) {
          const patCol = mirrored ? pW - 1 - c : c;
          const ch = recipe.pattern[r][patCol] ?? '.';
          const expected = ch !== '.' && ch !== ' ' ? recipe.key[ch] ?? null : null;
          const actual = grid[(minR + r) * gridSize + (minC + c)]?.item ?? null;
          if (expected !== actual) {
            ok = false;
          }
        }
      }
      if (ok) return recipe;
    }
  }

  // 2. Check shapeless recipes (exact multiset match of placed cells)
  for (const recipe of CRAFTING_RECIPES) {
    if (!recipe.shapeless) continue;
    let totalNeeded = 0;
    let ok = true;
    for (const ing of recipe.ingredients) {
      totalNeeded += ing.count;
      if ((itemCounts.get(ing.item) ?? 0) !== ing.count) {
        ok = false;
        break;
      }
    }
    if (ok && totalNeeded === nonEmptyCells) {
      return recipe;
    }
  }

  return null;
}

// --- Furnace Smelting System ---

export interface SmeltingRecipe {
  id: string;
  input: ItemType;
  output: { item: ItemType; count: number };
  cookSeconds: number;
  label: string;
}

export const SMELTING_RECIPES: SmeltingRecipe[] = [
  {
    id: 'smelt_iron',
    input: ItemType.RawIron,
    output: { item: ItemType.IronIngot, count: 1 },
    cookSeconds: 5.0,
    label: 'Raw Iron → Iron Ingot',
  },
  {
    id: 'smelt_gold',
    input: ItemType.RawGold,
    output: { item: ItemType.GoldIngot, count: 1 },
    cookSeconds: 6.0,
    label: 'Raw Gold → Gold Ingot',
  },
  {
    id: 'smelt_mutton',
    input: ItemType.RawMutton,
    output: { item: ItemType.CookedMutton, count: 1 },
    cookSeconds: 4.5,
    label: 'Raw Mutton → Roast Mutton',
  },
  {
    id: 'smelt_glass',
    input: ItemType.Sand,
    output: { item: ItemType.Glass, count: 1 },
    cookSeconds: 3.5,
    label: 'Sand → Framed Glass',
  },
  {
    id: 'smelt_stone',
    input: ItemType.Cobblestone,
    output: { item: ItemType.Stone, count: 1 },
    cookSeconds: 3.5,
    label: 'Cobblestone → Smooth Stone',
  },
  {
    id: 'smelt_brick',
    input: ItemType.ClayBall,
    output: { item: ItemType.BrickItem, count: 1 },
    cookSeconds: 4.0,
    label: 'Clay Ball → Brick',
  },
  {
    id: 'smelt_charcoal_oak',
    input: ItemType.OakLog,
    output: { item: ItemType.Coal, count: 1 },
    cookSeconds: 4.0,
    label: 'Oak Log → Coal',
  },
  {
    id: 'smelt_charcoal_birch',
    input: ItemType.BirchLog,
    output: { item: ItemType.Coal, count: 1 },
    cookSeconds: 4.0,
    label: 'Birch Log → Coal',
  },
];

export const FUEL_BURN_SECONDS: Partial<Record<ItemType, number>> = {
  [ItemType.Coal]: 40,
  [ItemType.LavaBucket]: 120,
  [ItemType.OakLog]: 15,
  [ItemType.BirchLog]: 15,
  [ItemType.OakPlanks]: 12,
  [ItemType.BirchPlanks]: 12,
  [ItemType.CraftingTable]: 12,
  [ItemType.OakDoor]: 12,
  [ItemType.WoodPickaxe]: 10,
  [ItemType.WoodAxe]: 10,
  [ItemType.WoodSword]: 10,
  [ItemType.Stick]: 6,
};

export interface FurnaceData {
  input: InventorySlot | null;
  fuel: InventorySlot | null;
  output: InventorySlot | null;
  burnTime: number;
  burnTotal: number;
  cookTime: number;
  cookTotal: number;
}

export function createEmptyFurnaceData(): FurnaceData {
  return {
    input: null,
    fuel: null,
    output: null,
    burnTime: 0,
    burnTotal: 0,
    cookTime: 0,
    cookTotal: 5.0,
  };
}

export function getSmeltingRecipe(item: ItemType): SmeltingRecipe | null {
  return SMELTING_RECIPES.find((r) => r.input === item) ?? null;
}

export function getFuelBurnTime(item: ItemType): number {
  const direct = FUEL_BURN_SECONDS[item];
  if (direct !== undefined) return direct;
  if (ITEM_DEFS[item]?.toolTier === 1) return 10;
  return 0;
}

/**
 * Generates crisp 16x16 pixel-art icons (scaled cleanly) for non-block survival items & tools.
 */
export function createSurvivalItemIcons(): Record<number, string> {
  const icons: Record<number, string> = {};

  const drawGrid = (
    pixels: string[],
    palette: Record<string, string>,
  ): string => {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingEnabled = false;
    const scale = 4;
    for (let y = 0; y < pixels.length; y++) {
      const row = pixels[y];
      for (let x = 0; x < row.length; x++) {
        const ch = row[x];
        const color = palette[ch];
        if (color) {
          ctx.fillStyle = color;
          ctx.fillRect(x * scale, y * scale, scale, scale);
        }
      }
    }
    return canvas.toDataURL('image/png');
  };

  // Stick
  icons[ItemType.Stick] = drawGrid(
    [
      '................',
      '.............#..',
      '............#a..',
      '...........#a...',
      '..........#a....',
      '.........#a.....',
      '........#a......',
      '.......#a.......',
      '......#a........',
      '.....#a.........',
      '....#a..........',
      '...#a...........',
      '..#a............',
      '..a.............',
      '................',
      '................',
    ],
    { '#': '#734d28', a: '#b5844f' },
  );

  // Coal
  icons[ItemType.Coal] = drawGrid(
    [
      '................',
      '................',
      '......####......',
      '....##aaaa##....',
      '...#aabbbbaa#...',
      '...#abccccba#...',
      '..#aabccccba#...',
      '..#aabbccbaa#...',
      '..#aabbbbbaa#...',
      '...#aaaaaaa#....',
      '...##aaaaa##....',
      '.....#####......',
      '................',
      '................',
      '................',
      '................',
    ],
    { '#': '#14171c', a: '#272b33', b: '#3e434f', c: '#5c6372' },
  );

  // Raw Iron
  icons[ItemType.RawIron] = drawGrid(
    [
      '................',
      '................',
      '.....#####......',
      '...##abbba##....',
      '..#abccddcba#...',
      '..#abcddddba#...',
      '..#abbcccbba#...',
      '...#aabbbaa#....',
      '...##aabaa##....',
      '.....#####......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { '#': '#5c4b3c', a: '#967c66', b: '#c7aa8f', c: '#e3cbb5', d: '#f5e8da' },
  );

  // Iron Ingot (smelted silver bar)
  icons[ItemType.IronIngot] = drawGrid(
    [
      '................',
      '................',
      '................',
      '........####....',
      '......##llll#...',
      '.....#llccccb#..',
      '....#lccccccab#.',
      '...#lcccccaab#..',
      '..#lccccaaab#...',
      '..#cccaaaab#....',
      '..#aaaaaab#.....',
      '...#aaabb#......',
      '....#####.......',
      '................',
      '................',
      '................',
    ],
    { '#': '#343b45', a: '#7e8896', b: '#a5b0bf', c: '#d8e0eb', l: '#f4f8fc' },
  );

  // Raw Gold
  icons[ItemType.RawGold] = drawGrid(
    [
      '................',
      '................',
      '.....######.....',
      '...##aaaabb#....',
      '..#abbbbbccb#...',
      '..#abbbccccb#...',
      '..#aabbcccb#....',
      '...#aabbbb#.....',
      '...##aaaa##.....',
      '.....####.......',
      '................',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { '#': '#6d5014', a: '#a97c1e', b: '#e3b83c', c: '#ffe28a' },
  );

  // Gold Ingot (smelted gold bar)
  icons[ItemType.GoldIngot] = drawGrid(
    [
      '................',
      '................',
      '................',
      '........####....',
      '......##llll#...',
      '.....#llccccb#..',
      '....#lccccccab#.',
      '...#lcccccaab#..',
      '..#lccccaaab#...',
      '..#cccaaaab#....',
      '..#aaaaaab#.....',
      '...#aaabb#......',
      '....#####.......',
      '................',
      '................',
      '................',
    ],
    { '#': '#6b4d12', a: '#a97b1c', b: '#d8a82f', c: '#f5cf55', l: '#fff0a8' },
  );

  // Redstone Dust
  icons[ItemType.Redstone] = drawGrid(
    [
      '................',
      '................',
      '.......##.......',
      '.....##rr##.....',
      '....#rrrrrr#....',
      '...#rrddddrr#...',
      '...#rdddddrr#...',
      '...#rddddrrr#...',
      '....#rrrrrr#....',
      '.....##rr##.....',
      '.......##.......',
      '................',
      '................',
      '................',
      '................',
      '................',
    ],
    { '#': '#4a100d', r: '#b72b22', d: '#f04a3a' },
  );

  // Clock (procedural fallback; PNG frames override it once assets load)
  icons[ItemType.Clock] = drawGrid(
    [
      '................',
      '.....######.....',
      '...##gggggg##...',
      '..#ggwwwwwwgg#..',
      '..#gwwwwwwwwg#..',
      '.#gwwwwwwwddwg#.',
      '.#gwwwwwwddwwg#.',
      '.#gwwwwwddwwwg#.',
      '.#gwwww#wwwwwg#.',
      '.#gwwww#wwwwwg#.',
      '.#gwwwwwwwwwgg#.',
      '..#gwwwwwwwwg#..',
      '..#ggwwwwwwgg#..',
      '...##gggggg##...',
      '.....######.....',
      '................',
    ],
    { '#': '#6b4d12', g: '#d7a93b', w: '#f4f0dc', d: '#9c3a28' },
  );

  // Compass (procedural fallback; PNG frames override it once assets load)
  icons[ItemType.Compass] = drawGrid(
    [
      '................',
      '.....######.....',
      '...##gggggg##...',
      '..#ggwwwwwwgg#..',
      '..#gwwwwwwwwg#..',
      '.#gwwwwwdwwwwg#.',
      '.#gwwwddddwwwg#.',
      '.#gwwwwddwwwbg#.',
      '.#gwwwwdbwwwbg#.',
      '.#gwwwwdbwwwbg#.',
      '.#gwwwwwwwwwgg#.',
      '..#gwwwwwwwwg#..',
      '..#ggwwwwwwgg#..',
      '...##gggggg##...',
      '.....######.....',
      '................',
    ],
    { '#': '#6b4d12', g: '#d7a93b', w: '#f4f0dc', d: '#b72b22', b: '#5a6470' },
  );

  // Apple
  icons[ItemType.Apple] = drawGrid(
    [
      '................',
      '........##......',
      '.......#gg#.....',
      '.......#........',
      '....####..###...',
      '...#rrrr##rrr#..',
      '..#rrllrrrrrrr#.',
      '..#rrllrrrrrrd#.',
      '..#rrrrrrrrrrd#.',
      '..#rrrrrrrrrdd#.',
      '...#rrrrrrrrd#..',
      '...#rrrrrrrdd#..',
      '....#rrrrrdd#...',
      '.....###.###....',
      '................',
      '................',
    ],
    { '#': '#421614', g: '#5ea63e', r: '#d9382e', l: '#ff8a7a', d: '#9c201b' },
  );

  // Mutton helper
  const makeMutton = (cooked: boolean) =>
    drawGrid(
      [
        '................',
        '................',
        '.........###....',
        '.......##bbb#...',
        '.....##mmbbbb#..',
        '....#mmmllmmb#..',
        '...#mmmmllmmm#..',
        '..#mmmmmmmmmd#..',
        '..#mmmmmmmddd#..',
        '..#wwmmmmddd#...',
        '...#wwwdddd#....',
        '....#######.....',
        '................',
        '................',
        '................',
        '................',
      ],
      cooked
        ? { '#': '#3b1e0e', b: '#e8dcc8', w: '#d9c5a7', m: '#9e532b', l: '#c77542', d: '#693418' }
        : { '#': '#542424', b: '#f2ece1', w: '#f7d9d4', m: '#db6c67', l: '#f09e99', d: '#a84745' },
    );
  icons[ItemType.RawMutton] = makeMutton(false);
  icons[ItemType.CookedMutton] = makeMutton(true);

  // Pickaxe helper
  const makePickaxe = (dark: string, mid: string, light: string) =>
    drawGrid(
      [
        '................',
        '....#######.....',
        '...#llllll##....',
        '....##mmmmmm#...',
        '.......##mmmd#..',
        '........#s#md#..',
        '.......#s..#d#..',
        '......#s....#...',
        '.....#s.........',
        '....#s..........',
        '...#s...........',
        '..#s............',
        '..s.............',
        '................',
        '................',
        '................',
      ],
      { '#': '#1f2329', d: dark, m: mid, l: light, s: '#b07e46' },
    );

  icons[ItemType.WoodPickaxe] = makePickaxe('#7a532b', '#b8854c', '#d6a66b');
  icons[ItemType.StonePickaxe] = makePickaxe('#5f656e', '#9299a3', '#bcc3cc');
  icons[ItemType.IronPickaxe] = makePickaxe('#8f9aa8', '#d2dbe6', '#f4f8fc');

  // Shovel helper
  const makeShovel = (dark: string, mid: string, light: string) =>
    drawGrid(
      [
        '................',
        '......####......',
        '.....#llll#.....',
        '....#lmmmmm#....',
        '....#mmmmmmd#...',
        '.....#mmmmd#....',
        '.......##s#.....',
        '.......#s.......',
        '......#s........',
        '.....#s.........',
        '....#s..........',
        '...#s...........',
        '..#s............',
        '..s.............',
        '................',
        '................',
      ],
      { '#': '#1f2329', d: dark, m: mid, l: light, s: '#b07e46' },
    );

  icons[ItemType.WoodShovel] = makeShovel('#7a532b', '#b8854c', '#d6a66b');
  icons[ItemType.StoneShovel] = makeShovel('#5f656e', '#9299a3', '#bcc3cc');
  icons[ItemType.IronShovel] = makeShovel('#8f9aa8', '#d2dbe6', '#f4f8fc');

  // Axe helper
  const makeAxe = (dark: string, mid: string, light: string) =>
    drawGrid(
      [
        '................',
        '......#####.....',
        '.....#lllll#....',
        '....#llmmmmm#...',
        '....#lmmmmmmd#..',
        '.....#mmmmd##...',
        '......###s#.....',
        '.......#s.......',
        '......#s........',
        '.....#s.........',
        '....#s..........',
        '...#s...........',
        '..#s............',
        '..s.............',
        '................',
        '................',
      ],
      { '#': '#1f2329', d: dark, m: mid, l: light, s: '#b07e46' },
    );

  icons[ItemType.WoodAxe] = makeAxe('#7a532b', '#b8854c', '#d6a66b');
  icons[ItemType.StoneAxe] = makeAxe('#5f656e', '#9299a3', '#bcc3cc');
  icons[ItemType.IronAxe] = makeAxe('#8f9aa8', '#d2dbe6', '#f4f8fc');

  // Sword helper
  const makeSword = (dark: string, mid: string, light: string) =>
    drawGrid(
      [
        '................',
        '............###.',
        '...........#ll#.',
        '..........#lm#..',
        '.........#lm#...',
        '........#lm#....',
        '.......#lm#.....',
        '......#lm#......',
        '...###lmd#......',
        '....#ggd#.......',
        '....#s#g#.......',
        '...#s..#........',
        '..#s............',
        '..##............',
        '................',
        '................',
      ],
      { '#': '#1f2329', d: dark, m: mid, l: light, g: '#7a5730', s: '#b07e46' },
    );

  icons[ItemType.WoodSword] = makeSword('#7a532b', '#b8854c', '#d6a66b');
  icons[ItemType.StoneSword] = makeSword('#5f656e', '#9299a3', '#bcc3cc');
  icons[ItemType.IronSword] = makeSword('#8f9aa8', '#d2dbe6', '#f4f8fc');

  // Gold tools (procedural fallbacks; /assets item textures override them once loaded)
  icons[ItemType.GoldPickaxe] = makePickaxe('#a8781f', '#e5b93b', '#ffe58a');
  icons[ItemType.GoldAxe] = makeAxe('#a8781f', '#e5b93b', '#ffe58a');
  icons[ItemType.GoldShovel] = makeShovel('#a8781f', '#e5b93b', '#ffe58a');
  icons[ItemType.GoldSword] = makeSword('#a8781f', '#e5b93b', '#ffe58a');

  // Iron Bucket (empty)
  icons[ItemType.Bucket] = drawGrid(
    [
      '................',
      '.....######.....',
      '....#hhhhhh#....',
      '...#h......h#...',
      '..#ll######ll#..',
      '..#lddddddddl#..',
      '..#lmmddddmml#..',
      '...#lmmmmmml#...',
      '...#lmmmmmml#...',
      '...#lmmmmmml#...',
      '....#lmmmml#....',
      '....#lmmmml#....',
      '....#ddmmdd#....',
      '.....######.....',
      '................',
      '................',
    ],
    { '#': '#222830', h: '#7e8896', l: '#e4ebf2', m: '#b4bfcc', d: '#6c7785' },
  );

  // Water Bucket (filled with sparkling blue water)
  icons[ItemType.WaterBucket] = drawGrid(
    [
      '................',
      '.....######.....',
      '....#hhhhhh#....',
      '...#h......h#...',
      '..#ll######ll#..',
      '..#lwwccccwwl#..',
      '..#lbbwwwwbbl#..',
      '...#lmmmmmml#...',
      '...#lmmmmmml#...',
      '...#lmmmmmml#...',
      '....#lmmmml#....',
      '....#lmmmml#....',
      '....#ddmmdd#....',
      '.....######.....',
      '................',
      '................',
    ],
    {
      '#': '#222830',
      h: '#7e8896',
      l: '#e4ebf2',
      m: '#b4bfcc',
      d: '#6c7785',
      b: '#2678cc',
      w: '#42a4f5',
      c: '#9ce0ff',
    },
  );

  // Lava Bucket (filled with glowing molten lava)
  icons[ItemType.LavaBucket] = drawGrid(
    [
      '................',
      '.....######.....',
      '....#hhhhhh#....',
      '...#h......h#...',
      '..#ll######ll#..',
      '..#loooooooll#..',
      '..#lyorrrroyl#..',
      '...#lmmmmmml#...',
      '...#lmmmmmml#...',
      '...#lmmmmmml#...',
      '....#lmmmml#....',
      '....#lmmmml#....',
      '....#ddmmdd#....',
      '.....######.....',
      '................',
      '................',
    ],
    {
      '#': '#222830',
      h: '#7e8896',
      l: '#e4ebf2',
      m: '#b4bfcc',
      d: '#6c7785',
      o: '#e85a12',
      r: '#ffb020',
      y: '#ffe066',
    },
  );

  // Clay Ball
  icons[ItemType.ClayBall] = drawGrid(
    [
      '................',
      '................',
      '.....######.....',
      '...##llllll##...',
      '..#llllllllll#..',
      '.#llllllllllll#.',
      '.#llmmmmmmmlll#.',
      '.#lmmmmmmmmmll#.',
      '.#lmmmmmmmmmml#.',
      '.#lmmmmmmmmdll#.',
      '..#lmmmmmmddl#..',
      '..#llddddddl#...',
      '...##dddd##.....',
      '.....####.......',
      '................',
      '................',
    ],
    { '#': '#7d838d', l: '#c3c9d2', m: '#d9dde4', d: '#9299a5' },
  );

  // Brick
  icons[ItemType.BrickItem] = drawGrid(
    [
      '................',
      '................',
      '..############..',
      '..#gggggggggg#..',
      '..#gggggggggg#..',
      '..############..',
      '..#gggggggggg#..',
      '..#gggggggggg#..',
      '..############..',
      '..#gggggggggg#..',
      '..#gggggggggg#..',
      '..############..',
      '................',
      '................',
      '................',
      '................',
    ],
    { '#': '#d8c9b8', g: '#9f4a3c' },
  );

  // Glass Bottle (empty)
  icons[ItemType.GlassBottle] = drawGrid(
    [
      '................',
      '......cccc......',
      '.....gccccg.....',
      '......g..g......',
      '......g..g......',
      '.....gl..dg.....',
      '....gl....dg....',
      '...gl......dg...',
      '...gl......dg...',
      '...gl......dg...',
      '...gl......dg...',
      '....gl....dg....',
      '.....gggggg.....',
      '................',
      '................',
      '................',
    ],
    { c: '#8f562e', g: '#6990b8', l: '#d4ecfa', d: '#4f739c' },
  );

  // Water Bottle (filled with blue water)
  icons[ItemType.WaterBottle] = drawGrid(
    [
      '................',
      '......cccc......',
      '.....gccccg.....',
      '......g..g......',
      '......g..g......',
      '.....gl..dg.....',
      '....gl....dg....',
      '...glbbwwbbdg...',
      '...glbbbbbbdg...',
      '...glbbwwbbdg...',
      '...glbbbbbbdg...',
      '....glbbbbdg....',
      '.....gggggg.....',
      '................',
      '................',
      '................',
    ],
    { c: '#8f562e', g: '#6990b8', l: '#d4ecfa', d: '#4f739c', b: '#385dc6', w: '#6492f0' },
  );

  return icons;
}
