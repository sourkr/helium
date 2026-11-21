/** Serializable save shapes shared by the authoritative server and the UI. */
import type { TerrainPreset } from './blocks';
import type { FurnaceData, GameMode, InventorySlot, ItemType } from './survival';

export interface SavedPlayerState {
  x: number;
  y: number;
  z: number;
  yaw: number;
  pitch: number;
  flying: boolean;
  health: number;
  hunger: number;
  oxygen: number;
  exhaustion: number;
  activeSlot: number;
  creativeHotbar: ItemType[];
  survivalSlots: Array<InventorySlot | null>;
  furnaces?: Record<string, FurnaceData>;
  blocksMined: number;
  mobsDefeated: number;
  survivalSeconds: number;
}

export interface WorldSummary {
  id: string;
  name: string;
  seed: number;
  preset: TerrainPreset;
  mode: GameMode;
  editCount: number;
  blocksMined: number;
  mobsDefeated: number;
  survivalSeconds: number;
  createdAt: number;
  updatedAt: number;
}

export interface FullWorldSave {
  id: string;
  name: string;
  seed: number;
  preset: TerrainPreset;
  mode: GameMode;
  timeOfDay: number;
  createdAt: number;
  updatedAt: number;
  edits: Array<[string, number]>;
  player: SavedPlayerState | null;
}
