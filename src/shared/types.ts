/** Shared, environment-agnostic UI/game types. No THREE, DOM or React imports. */
import type { FurnaceData, GameMode, InventorySlot, ItemType } from './survival';
import type { WorldSummary } from './save';

export type GamePhase =
  | 'title'
  | 'playing'
  | 'paused'
  | 'inventory'
  | 'crafting'
  | 'furnace'
  | 'dead';

export interface HudSnapshot {
  mode: GameMode;
  fps: number;
  x: number;
  y: number;
  z: number;
  biome: string;
  flying: boolean;
  underwater: boolean;
  pointerLocked: boolean;
  targetedBlock: string | null;
  editCount: number;
  timeOfDay: number;
  crosshairPulse: number;
  health: number;
  maxHealth: number;
  hunger: number;
  maxHunger: number;
  oxygen: number;
  maxOxygen: number;
  miningProgress: number;
  damageFlash: number;
  toastText: string | null;
  blocksMined: number;
  mobsDefeated: number;
  survivalSeconds: number;
}

export interface EngineSettings {
  fov: number;
  mouseSensitivity: number;
  renderDistance: number;
  muted: boolean;
  showFps: boolean;
  playerShadow: boolean;
  entityShadows: boolean;
  /** 0 = Auto (largest scale that fits), 1-4 = fixed integer GUI scale. */
  guiScale: number;
}

/** Callback surface consumed by the React UI. Implemented by GameClient. */
export interface EngineCallbacks {
  onHudUpdate: (hud: HudSnapshot) => void;
  onInventoryChange: (
    mode: GameMode,
    creativeHotbar: ItemType[],
    survivalSlots: Array<InventorySlot | null>,
    craftingGrid: Array<InventorySlot | null>,
    activeSlot: number,
  ) => void;
  onFurnaceChange?: (furnace: FurnaceData | null) => void;
  onPhaseChange: (phase: GamePhase) => void;
  onAssetsReady: (itemIcons: Record<number, string>) => void;
  onContextLost: (lost: boolean) => void;
  onWorldsUpdated?: (worlds: WorldSummary[]) => void;
  onPanoramaChange?: (hasPanorama: boolean) => void;
}
