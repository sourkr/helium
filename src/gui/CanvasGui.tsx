import { useEffect, useRef } from 'react';
import { EngineSettings, GamePhase, HudSnapshot } from '../client/GameClient';
import { getAssetUrl, getWaterOverlayTextureUrl } from '../game/assetPack';
import {
  GUI_BUTTON_SPRITES,
  GUI_CRAFTING_TABLE_TEXTURE_URL,
  GUI_FOOD_TEXTURES,
  GUI_HEART_TEXTURES,
  GUI_HOTBAR_SELECTION_TEXTURE_URL,
  GUI_HOTBAR_TEXTURE_URL,
  GUI_RECIPE_BOOK_TEXTURE_URL,
  GUI_RECIPE_FILTER_TEXTURES,
  GUI_RECIPE_SLOT_TEXTURES,
  GUI_RECIPE_TAB_TEXTURES,
  GUI_TEXT_FIELD_SPRITES,
} from '../game/guiAssets';
import { WorldSummary } from '../game/opfsStorage';
import { BLOCK_DEFS, BlockType, BUILDABLE_BLOCKS, TerrainPreset, TimePreset } from '../shared/blocks';
import {
  countItemInInventory,
  CRAFTING_RECIPES,
  CraftingCategory,
  FurnaceData,
  GameMode,
  getDurabilityBarColor,
  getMaxCraftCount,
  getRecipeGridPreview,
  getSlotDurability,
  HOTBAR_SIZE,
  InventorySlot,
  ITEM_DEFS,
  ItemType,
  matchCraftingGrid,
  recipeFitsInGridSize,
  SMELTING_RECIPES,
} from '../shared/survival';
import {
  beginScroll,
  clamp,
  createGuiFrame,
  drawBar,
  drawImageCropped,
  drawImageFit,
  drawNineSlice,
  drawPanel,
  drawText,
  drawTexturedButton,
  GUI_HEIGHT,
  GUI_WIDTH,
  GuiFrame,
  hitRegion,
  hitScrollArea,
  ImageCache,
  pointInRect,
  pushRegion,
  Rect,
  resolveGuiScale,
} from './canvasGui';
import {
  createComponentNodes,
  describeMenuLayout,
  MAIN_MENU_LAYOUT,
  MenuAlignment,
  MenuButtonSpec,
  MenuNode,
  MenuVarValue,
  WORLD_LIST_LAYOUT,
} from './menuLayout';

/** A custom `<event>` declared by a component and fired by `onclick="trigger(name)"`. */
export interface GuiXmlEvent {
  name: string;
  component: string;
  attrs: Record<string, string>;
  vars: Record<string, MenuVarValue>;
}

export interface ActiveWorldInfo {
  id: string;
  name: string;
  seed: number;
  preset: TerrainPreset;
}

export interface CanvasGuiProps {
  phase: GamePhase;
  hud: HudSnapshot;
  mode: GameMode;
  creativeHotbar: ItemType[];
  survivalSlots: Array<InventorySlot | null>;
  craftingGrid: Array<InventorySlot | null>;
  activeSlot: number;
  itemIcons: Record<number, string>;
  settings: EngineSettings;
  settingsOpen: boolean;
  worlds: WorldSummary[];
  worldInfo: ActiveWorldInfo;
  worldModalView: 'list' | 'create' | null;
  contextLost: boolean;
  hasPanorama: boolean;
  dirtTextureUrl: string | null;
  activeFurnace: FurnaceData | null;
  onSelectSlot: (slot: number) => void;
  onOpenPause: () => void;
  onToggleMute: () => void;
  onToggleFly: () => void;
  onSelectCreativeItem: (item: ItemType) => void;
  onSwapSurvivalSlots: (fromIdx: number, toIdx: number) => void;
  onPlaceIntoGrid: (invIdx: number, gridIdx: number, count?: number) => void;
  onReturnGridCell: (gridIdx: number) => void;
  onClearGrid: () => void;
  onFillGridFromRecipe: (recipeId: string) => void;
  onCraftFromGrid: (craftAll: boolean) => void;
  onCraftRecipe: (recipeId: string, craftAll: boolean) => void;
  onEatSlot: (slotIdx: number) => void;
  onPlaceIntoFurnace: (invIdx: number, slot: 'input' | 'fuel', count?: number) => void;
  onTakeFurnaceSlot: (slot: 'input' | 'fuel' | 'output') => void;
  onQuickLoadFurnaceSlot: (invIdx: number, fullStack: boolean) => void;
  onQuickLoadFurnaceRecipe: (inputItem: ItemType) => void;
  onRespawn: () => void;
  onSetTime: (preset: TimePreset) => void;
  onSelectMode: (mode: GameMode) => void;
  onResume: () => void;
  onSaveNow: () => Promise<void>;
  onOpenWorlds: () => void;
  onOpenNewWorld: () => void;
  onOpenSettings: () => void;
  onCloseSettings: () => void;
  onResetEdits: () => void;
  onReturnTitle: () => void;
  onOpenSingleplayer: () => void;
  onSelectWorld: (worldId: string) => void;
  onPlayWorld: (worldId: string) => void;
  onCreateWorld: (options: {
    name: string;
    seed: number;
    preset: TerrainPreset;
    mode: GameMode;
    enterImmediately: boolean;
  }) => void;
  onRenameWorld: (worldId: string, nextName: string) => void;
  onDuplicateWorld: (worldId: string) => void;
  onDeleteWorld: (worldId: string) => void;
  onCloseWorldModal: () => void;
  onClearPanorama: () => void;
  onChangeSettings: (patch: Partial<EngineSettings>) => void;
  onResetSettings: () => void;
  onCloseInventory: () => void;
  onReload: () => void;
  onGuiEvent?: (event: GuiXmlEvent) => void;
}

type RecipeTabKey = 'All' | CraftingCategory;
type CreativeCategory = 'Natural' | 'Wood & Foliage' | 'Masonry' | 'Specialty';

interface LocalState {
  pointer: { x: number; y: number };
  scroll: Record<string, number>;
  focus: string | null;
  hover: string | null;
  drag: {
    min: number;
    max: number;
    step: number;
    x: number;
    w: number;
    onInput: (value: number) => void;
  } | null;
  lastClick: { id: string; time: number } | null;
  recipeBookOpen: boolean;
  craftTab: RecipeTabKey;
  recipeSearch: string;
  onlyCraftable: boolean;
  inspectedRecipeId: string | null;
  craftSelectedSlot: number | null;
  furnaceSelectedSlot: number | null;
  worldView: 'list' | 'create';
  worldSearch: string;
  xmlFields: Record<string, string>;
  xmlWorldListKey: string;
  xmlWorldNodes: MenuNode[];
  selectedWorldId: string;
  renamingId: string | null;
  renameText: string;
  confirmDeleteId: string | null;
  newName: string;
  nameTouched: boolean;
  newSeed: string;
  newPreset: TerrainPreset;
  newMode: GameMode;
  justSaved: boolean;
  lastLabelKey: string;
  labelUntil: number;
}

interface GuiViewport {
  width: number;
  height: number;
  dpr: number;
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface DrawState {
  ctx: CanvasRenderingContext2D;
  frame: GuiFrame;
  res: ImageCache;
  p: CanvasGuiProps;
  s: LocalState;
  view: GuiViewport;
}

interface ButtonOpts {
  active?: boolean;
  disabled?: boolean;
  size?: number;
  onRightClick?: (event: MouseEvent) => void;
}

const TABS: Array<{ key: RecipeTabKey; label: string }> = [
  { key: 'All', label: 'All' },
  { key: 'Tools', label: 'Tools & Weapons' },
  { key: 'Materials', label: 'Materials' },
  { key: 'Food & Utility', label: 'Food & Utility' },
];

const CREATIVE_CATEGORIES: CreativeCategory[] = [
  'Natural',
  'Wood & Foliage',
  'Masonry',
  'Specialty',
];

const CREATIVE_EXTRA_SPECIALTY: ItemType[] = [
  ItemType.WaterBucket,
  ItemType.LavaBucket,
  ItemType.Bucket,
  ItemType.WaterBottle,
  ItemType.GlassBottle,
  ItemType.RawGold,
  ItemType.GoldIngot,
  ItemType.Redstone,
  ItemType.WoodShovel,
  ItemType.StoneShovel,
  ItemType.IronShovel,
  ItemType.GoldPickaxe,
  ItemType.GoldAxe,
  ItemType.GoldShovel,
  ItemType.GoldSword,
  ItemType.ClayBall,
  ItemType.BrickItem,
  ItemType.Clock,
  ItemType.Compass,
];

const PRESET_OPTIONS: Array<{ id: TerrainPreset; label: string; description: string }> = [
  { id: 'meadows', label: 'Meadows', description: 'Rolling hills, oak forests, sunlit valleys' },
  { id: 'alpine', label: 'Alpine Peaks', description: 'Steep snow-capped ridges & glacial tarns' },
  { id: 'archipelago', label: 'Archipelago', description: 'Oceanic islands, beaches & coastal groves' },
  { id: 'mesa', label: 'Mesa Canyon', description: 'Terraced redrock plateaus & canyon oases' },
];

const PRESET_LABELS: Record<TerrainPreset, string> = {
  meadows: 'Meadows',
  alpine: 'Alpine Peaks',
  archipelago: 'Archipelago',
  mesa: 'Mesa Canyon',
};

const PRESET_ACCENT: Record<TerrainPreset, { sky: string; ground: string; top: string }> = {
  meadows: { sky: '#7ec0ee', ground: '#6e4c32', top: '#63a642' },
  alpine: { sky: '#9ec4e8', ground: '#6d737a', top: '#e9f0f5' },
  archipelago: { sky: '#65b5eb', ground: '#d5c188', top: '#3c77de' },
  mesa: { sky: '#e0a978', ground: '#9c4e31', top: '#c46c43' },
};

const TIME_OPTIONS: Array<{ id: TimePreset; label: string }> = [
  { id: 'dawn', label: 'Dawn' },
  { id: 'noon', label: 'Noon' },
  { id: 'sunset', label: 'Sunset' },
  { id: 'night', label: 'Night' },
];

const RENDER_OPTIONS = [
  { chunks: 3, label: 'Near (3)' },
  { chunks: 4, label: 'Normal (4)' },
  { chunks: 5, label: 'Far (5)' },
];

const GUI_SCALE_OPTIONS = [
  { value: 0, label: 'Auto' },
  { value: 1, label: '1x' },
  { value: 2, label: '2x' },
  { value: 3, label: '3x' },
  { value: 4, label: '4x' },
];

const WATER_OVERLAY_URL = getWaterOverlayTextureUrl();
const WHITE = '#f6f4ec';
const MUTED = '#b8b8b8';
const GREEN = '#96d86e';
const YELLOW = '#ffffa0';
const RED = '#eb8b7b';

function image(res: ImageCache, url: string | null | undefined): HTMLImageElement | null {
  return res.get(url);
}

function getTimeLabel(t: number): string {
  if (t >= 0.2 && t < 0.34) return 'Dawn';
  if (t >= 0.34 && t < 0.66) return 'Daylight';
  if (t >= 0.66 && t < 0.8) return 'Sunset';
  return 'Night';
}

function formatPlayedDate(timestamp: number): string {
  try {
    const d = new Date(timestamp);
    return d.toLocaleString(undefined, {
      month: 'numeric',
      day: 'numeric',
      year: '2-digit',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Recently';
  }
}

function suggestWorldName(preset: TerrainPreset, count: number): string {
  const bases: Record<TerrainPreset, string> = {
    meadows: 'New World',
    alpine: 'Alpine Peaks',
    archipelago: 'Coral Isles',
    mesa: 'Redrock Mesa',
  };
  return count === 0 && preset === 'meadows' ? 'New World' : `${bases[preset]} ${count + 1}`;
}

function createLocalState(p: CanvasGuiProps): LocalState {
  return {
    pointer: { x: -1, y: -1 },
    scroll: {},
    focus: null,
    hover: null,
    drag: null,
    lastClick: null,
    recipeBookOpen: true,
    craftTab: 'All',
    recipeSearch: '',
    onlyCraftable: false,
    inspectedRecipeId: null,
    craftSelectedSlot: null,
    furnaceSelectedSlot: null,
    worldView: p.worldModalView ?? 'list',
    worldSearch: '',
    xmlFields: {},
    xmlWorldListKey: '',
    xmlWorldNodes: [],
    selectedWorldId: p.worldInfo.id || p.worlds[0]?.id || '',
    renamingId: null,
    renameText: '',
    confirmDeleteId: null,
    newName: suggestWorldName('meadows', p.worlds.length),
    nameTouched: false,
    newSeed: String(Math.floor(10000 + Math.random() * 89999)),
    newPreset: 'meadows',
    newMode: 'survival',
    justSaved: false,
    lastLabelKey: '',
    labelUntil: 0,
  };
}

function button(
  d: DrawState,
  id: string,
  rect: Rect,
  label: string,
  onMouseDown: (event: MouseEvent) => void,
  opts: ButtonOpts = {},
): void {
  const hovered = d.s.hover === id;
  const disabled = opts.disabled ?? false;
  const active = opts.active ?? false;
  const sprite = disabled
    ? GUI_BUTTON_SPRITES.disabledUrl
    : hovered || active
      ? GUI_BUTTON_SPRITES.highlightedUrl
      : GUI_BUTTON_SPRITES.normalUrl;
  const slice = disabled
    ? GUI_BUTTON_SPRITES.disabledSlice
    : hovered || active
      ? GUI_BUTTON_SPRITES.highlightedSlice
      : GUI_BUTTON_SPRITES.normalSlice;
  drawTexturedButton(
    d.ctx,
    image(d.res, sprite),
    rect,
    slice,
    label,
    active || hovered,
    disabled,
    opts.size ?? 8,
    active,
  );
  if (!disabled) {
    pushRegion(d.frame, {
      id,
      rect,
      cursor: 'pointer',
      onMouseDown,
      onRightClick: opts.onRightClick,
    });
  }
}

function textField(
  d: DrawState,
  id: string,
  rect: Rect,
  value: string,
  placeholder: string,
  onChange: (value: string) => void,
  maxLength = 64,
): void {
  const focused = d.s.focus === id;
  const sprite = focused ? GUI_TEXT_FIELD_SPRITES.highlightedUrl : GUI_TEXT_FIELD_SPRITES.normalUrl;
  const slice = focused
    ? GUI_TEXT_FIELD_SPRITES.highlightedSlice
    : GUI_TEXT_FIELD_SPRITES.normalSlice;
  if (!drawNineSlice(d.ctx, image(d.res, sprite), rect, slice)) {
    drawPanel(d.ctx, rect, 'rgba(16,20,26,0.96)', focused ? '#e8dfc8' : 'rgba(255,255,255,0.2)');
  }
  const text = value || placeholder;
  const color = value ? WHITE : '#8d8d8d';
  const font = `8px MinecraftAscii, "DM Sans", monospace`;
  d.ctx.save();
  d.ctx.font = font;
  const textWidth = d.ctx.measureText(value).width;
  d.ctx.restore();
  drawText(d.ctx, text, rect.x + 4, rect.y + rect.h / 2, 8, color, 'left', false, rect.w - 8);
  if (focused && Math.floor(performance.now() / 450) % 2 === 0) {
    const caretX = rect.x + 4 + Math.min(textWidth, rect.w - 8);
    d.ctx.fillStyle = WHITE;
    d.ctx.fillRect(caretX, rect.y + 3, 1, rect.h - 6);
  }
  pushRegion(d.frame, {
    id,
    rect,
    cursor: 'text',
    text: { id, value, placeholder, maxLength, onChange },
  });
}

function slider(
  d: DrawState,
  id: string,
  x: number,
  y: number,
  w: number,
  label: string,
  valueLabel: string,
  value: number,
  min: number,
  max: number,
  step: number,
  onInput: (next: number) => void,
): void {
  drawText(d.ctx, label, x, y, 8, WHITE, 'left', true);
  drawText(d.ctx, valueLabel, x + w, y, 8, MUTED, 'right');
  const track: Rect = { x, y: y + 8, w, h: 4 };
  drawBar(d.ctx, track, (value - min) / (max - min), '#7ac150');
  const knobX = track.x + track.w * clamp((value - min) / (max - min), 0, 1);
  d.ctx.fillStyle = '#e8dfc8';
  d.ctx.fillRect(knobX - 3, track.y - 2, 6, 8);
  pushRegion(d.frame, {
    id,
    rect: { x, y: y + 5, w, h: 10 },
    cursor: 'ew-resize',
    slider: { min, max, step, onInput },
  });
}

function sliderValue(spec: { min: number; max: number; step: number }, x: number, w: number, pointerX: number): number {
  const ratio = clamp((pointerX - x) / w, 0, 1);
  const raw = spec.min + ratio * (spec.max - spec.min);
  return clamp(Math.round(raw / spec.step) * spec.step, spec.min, spec.max);
}

function itemIcon(d: DrawState, item: ItemType | number, x: number, y: number, size: number): void {
  const id = Number(item);
  const icon = image(d.res, d.p.itemIcons[id]);
  if (icon) {
    drawImageFit(d.ctx, icon, x, y, size, size);
    return;
  }
  const itemDefs = ITEM_DEFS as Record<number, (typeof ITEM_DEFS)[ItemType] | undefined>;
  const blockDefs = BLOCK_DEFS as Record<number, (typeof BLOCK_DEFS)[BlockType] | undefined>;
  const accent =
    itemDefs[id]?.accentColor ?? blockDefs[id]?.particleColor ?? '#888888';
  d.ctx.fillStyle = accent;
  d.ctx.fillRect(x, y, size, size);
  d.ctx.strokeStyle = 'rgba(0,0,0,0.7)';
  d.ctx.lineWidth = 1;
  d.ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
}

interface SlotOpts {
  number?: number;
  selected?: boolean;
  onClick?: (shiftKey: boolean) => void;
  onRightClick?: () => void;
  iconSize?: number;
}

function slot(d: DrawState, id: string, rect: Rect, contents: InventorySlot | null, opts: SlotOpts = {}): void {
  drawPanel(d.ctx, rect, 'rgba(29,37,46,0.94)', 'rgba(255,255,255,0.12)');
  if (opts.selected) {
    d.ctx.strokeStyle = '#e8dfc8';
    d.ctx.lineWidth = 2;
    d.ctx.strokeRect(rect.x + 1, rect.y + 1, rect.w - 2, rect.h - 2);
  }
  if (opts.number !== undefined) {
    drawText(d.ctx, String(opts.number), rect.x + 2, rect.y + 4, 6, '#888888', 'left');
  }
  if (contents) {
    const pad = Math.max(1, (rect.w - (opts.iconSize ?? Math.min(18, rect.w - 4))) / 2);
    itemIcon(
      d,
      contents.item,
      rect.x + pad,
      rect.y + pad,
      opts.iconSize ?? Math.min(18, rect.w - 4),
    );
    if (contents.count > 1) {
      drawText(
        d.ctx,
        String(contents.count),
        rect.x + rect.w - 2,
        rect.y + rect.h - 3,
        6,
        WHITE,
        'right',
        true,
      );
    }
    const dur = getSlotDurability(contents);
    if (dur && dur.current < dur.max) {
      drawBar(
        d.ctx,
        { x: rect.x + 2, y: rect.y + rect.h - 4, w: rect.w - 4, h: 2 },
        dur.ratio,
        getDurabilityBarColor(dur.ratio),
      );
    }
  }
  pushRegion(d.frame, {
    id,
    rect,
    cursor: 'pointer',
    onMouseDown: opts.onClick ? (event) => opts.onClick?.(event.shiftKey) : undefined,
    onRightClick: opts.onRightClick ? () => opts.onRightClick?.() : undefined,
  });
}

function scrollable(d: DrawState, id: string, rect: Rect, contentHeight: number, draw: () => void): void {
  const { scroll, maxScroll } = beginScroll(d.frame, id, rect, contentHeight, d.s.scroll);
  const previousXOffset = d.frame.xOffset;
  const previousYOffset = d.frame.yOffset;
  const previousClip = d.frame.clip;
  d.frame.xOffset = rect.x;
  d.frame.yOffset = rect.y - scroll;
  d.frame.clip = rect;
  d.ctx.save();
  d.ctx.beginPath();
  d.ctx.rect(rect.x, rect.y, rect.w, rect.h);
  d.ctx.clip();
  d.ctx.translate(rect.x, rect.y - scroll);
  draw();
  d.ctx.restore();
  d.frame.xOffset = previousXOffset;
  d.frame.yOffset = previousYOffset;
  d.frame.clip = previousClip;
  if (maxScroll > 0) {
    const thumbH = Math.max(14, (rect.h / contentHeight) * rect.h);
    const thumbY = rect.y + ((rect.h - thumbH) * scroll) / maxScroll;
    d.ctx.fillStyle = 'rgba(255,255,255,0.22)';
    d.ctx.fillRect(rect.x + rect.w - 3, thumbY, 2, thumbH);
  }
}

function sectionLabel(d: DrawState, text: string, x: number, y: number, w: number): void {
  drawText(d.ctx, text, x, y, 7, '#b8b8b8', 'left', true, w);
}

function drawFullscreenDirt(
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement | null,
  overlay: string,
  view: GuiViewport,
): void {
  ctx.fillStyle = '#3b2a1e';
  ctx.fillRect(0, 0, view.width, view.height);
  if (image && image.complete && image.naturalWidth > 0) {
    const tile = Math.max(8, 32 * view.scale);
    for (let y = 0; y < view.height; y += tile) {
      for (let x = 0; x < view.width; x += tile) {
        ctx.drawImage(image, x, y, tile, tile);
      }
    }
  }
  ctx.fillStyle = overlay;
  ctx.fillRect(0, 0, view.width, view.height);
}

function drawFullscreenOverlay(
  ctx: CanvasRenderingContext2D,
  color: string,
  view: GuiViewport,
): void {
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, view.width, view.height);
}

function drawWaterBackdrop(
  ctx: CanvasRenderingContext2D,
  water: HTMLImageElement | null,
  view: GuiViewport,
): void {
  ctx.save();
  ctx.globalAlpha = 0.35;
  ctx.fillStyle = '#1b4ea8';
  ctx.fillRect(0, 0, view.width, view.height);
  if (water && water.complete && water.naturalWidth > 0) {
    const tile = Math.max(32, 128 * view.scale);
    for (let y = 0; y < view.height; y += tile) {
      for (let x = 0; x < view.width; x += tile) {
        ctx.drawImage(water, x, y, tile, tile);
      }
    }
  }
  ctx.restore();
}

function drawDamageBackdrop(
  ctx: CanvasRenderingContext2D,
  strength: number,
  view: GuiViewport,
): void {
  const cx = view.width / 2;
  const cy = view.height / 2;
  const inner = 40 * view.scale;
  const outer = Math.max(190 * view.scale, Math.hypot(cx, cy));
  const gradient = ctx.createRadialGradient(cx, cy, inner, cx, cy, outer);
  gradient.addColorStop(0, 'rgba(210,38,38,0)');
  gradient.addColorStop(1, `rgba(210,38,38,${(strength * 0.7).toFixed(3)})`);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, view.width, view.height);
}

function drawScreenBackdrop(
  ctx: CanvasRenderingContext2D,
  p: CanvasGuiProps,
  res: ImageCache,
  view: GuiViewport,
): void {
  if (p.contextLost) {
    drawFullscreenOverlay(ctx, 'rgba(17,24,32,0.98)', view);
    return;
  }

  if (p.phase === 'title') {
    // The XML screen decides the background. <panorama> tiles dirt over the
    // whole viewport; <game> leaves the WebGL world visible underneath.
    if (MAIN_MENU_LAYOUT.background === 'panorama') {
      drawFullscreenDirt(ctx, image(res, p.dirtTextureUrl), PANORAMA_TINT, view);
    }
  } else if (p.phase === 'playing') {
    if (p.hud.underwater) {
      drawWaterBackdrop(ctx, image(res, WATER_OVERLAY_URL), view);
    }
    if (p.hud.damageFlash > 0.01) {
      drawDamageBackdrop(ctx, p.hud.damageFlash, view);
    }
  } else if (p.phase === 'dead') {
    drawFullscreenOverlay(ctx, 'rgba(38,12,14,0.78)', view);
  } else {
    drawFullscreenOverlay(ctx, 'rgba(11,16,22,0.74)', view);
  }

  if (p.worldModalView !== null && WORLD_LIST_LAYOUT.background === 'panorama') {
    drawFullscreenDirt(ctx, image(res, p.dirtTextureUrl), PANORAMA_TINT, view);
  }
  if (p.settingsOpen) {
    drawFullscreenOverlay(ctx, 'rgba(11,16,22,0.76)', view);
  }
}

/** Debug FPS readout: anchored to the real viewport, outside the GUI layout. */
function drawFpsOverlay(ctx: CanvasRenderingContext2D, p: CanvasGuiProps, view: GuiViewport): void {
  if (!p.settings.showFps) return;
  const scale = view.scale;
  const pad = 4 * scale;
  const rect = { x: pad, y: pad, w: 48 * scale, h: 12 * scale };
  drawPanel(ctx, rect, 'rgba(18,24,31,0.8)');
  drawText(
    ctx,
    `${p.hud.fps} FPS`,
    rect.x + 4 * scale,
    rect.y + rect.h / 2,
    8 * scale,
    p.hud.fps >= 50 ? GREEN : p.hud.fps >= 30 ? YELLOW : RED,
    'left',
    false,
    rect.w - 8 * scale,
  );
}

const MENU_BUTTON_WIDTH = 130;
const MENU_BUTTON_HEIGHT = 18;
const MENU_TEXT_SIZE = 13;
const MENU_IMAGE_SIZE = 16;
const MENU_FIELD_WIDTH = 180;
const MENU_FIELD_HEIGHT = 16;
const MENU_COLUMN_EDGE = 8;
const MENU_CENTER: MenuAlignment = { horizontal: 'center', vertical: 'center' };
const MENU_ROW_ALIGN: MenuAlignment = { horizontal: 'start', vertical: 'center' };
const PANORAMA_TINT = 'rgba(0,0,0,0.25)';

function titleButtonAction(p: CanvasGuiProps, button: MenuButtonSpec): () => void {
  const id = button.id.toLowerCase();
  if (id === 'btn.singleplay' || id === 'btn.singleplayer' || button.label === 'Singleplayer') {
    return p.onOpenSingleplayer;
  }
  if (id === 'btn.setting' || id === 'btn.settings' || button.label === 'Settings') {
    return p.onOpenSettings;
  }
  return () => {};
}

function parseMenuSize(value: string | null | undefined, available: number): number {
  if (!value) return available;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) {
    const ratio = Number.parseFloat(trimmed.slice(0, -1));
    return Number.isFinite(ratio) ? (available * ratio) / 100 : available;
  }
  const pixels = Number.parseFloat(trimmed);
  return Number.isFinite(pixels) ? pixels : available;
}

function drawMenuButtonNode(
  d: DrawState,
  p: CanvasGuiProps,
  node: MenuNode,
  x: number,
  y: number,
  width: number,
): void {
  if (!node.id) return;
  const spec: MenuButtonSpec = {
    id: node.id,
    label: node.label || node.id,
    disabled: node.disabled ?? false,
  };
  button(
    d,
    `title:${spec.id}`,
    { x, y, w: width, h: MENU_BUTTON_HEIGHT },
    spec.label,
    titleButtonAction(p, spec),
    { disabled: spec.disabled, size: 9 },
  );
}

function menuTextSize(node: MenuNode): number {
  const parsed = Number.parseFloat(node.size ?? '');
  return Number.isFinite(parsed) && parsed > 0 ? parsed : MENU_TEXT_SIZE;
}

function menuTextHeight(node: MenuNode): number {
  return Math.max(1, Math.round(menuTextSize(node)));
}

function isRenderableMenuNode(node: MenuNode): boolean {
  return ['button', 'text', 'text-field', 'image', 'row', 'column', 'box'].includes(node.type);
}

function menuTruthy(value: unknown): boolean {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'number') return value !== 0;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    return normalized !== '' && !['false', '0', 'no', 'off', 'normal'].includes(normalized);
  }
  return Boolean(value);
}

function menuNodeVisible(node: MenuNode): boolean {
  const raw = node.visible;
  if (raw === undefined) return true;
  const key = raw.trim().replace(/^\$/, '');
  if (node.componentVars && Object.prototype.hasOwnProperty.call(node.componentVars, key)) {
    return menuTruthy(node.componentVars[key]);
  }
  return menuTruthy(raw);
}

function menuSearchText(d: DrawState): string {
  const fields = d.s.xmlFields;
  const explicit = fields['field.search'];
  if (explicit !== undefined) return explicit.trim().toLowerCase();
  const searchEntry = Object.entries(fields).find(([id]) => id.toLowerCase().includes('search'));
  return (searchEntry?.[1] ?? '').trim().toLowerCase();
}

function menuMatchesSearch(node: MenuNode, search: string): boolean {
  if (!search) return true;
  const attrs = Object.values(node.componentAttrs ?? {}).join(' ');
  return `${attrs} ${node.label ?? ''}`.toLowerCase().includes(search);
}

function isWorldListNode(node: MenuNode): boolean {
  return node.id === 'list.world' || node.listSource === 'world';
}

function worldListKey(worlds: CanvasGuiProps['worlds']): string {
  return worlds
    .map((world) => `${world.id}:${world.name}:${world.updatedAt}`)
    .join('|');
}

function worldListChildren(d: DrawState, node: MenuNode): MenuNode[] {
  const key = worldListKey(d.p.worlds);
  if (d.s.xmlWorldListKey !== key) {
    const componentName = node.itemComponent ?? 'world-info';
    const definition = WORLD_LIST_LAYOUT.components.find(
      (candidate) => candidate.name === componentName,
    );
    d.s.xmlWorldNodes = definition
      ? d.p.worlds.flatMap((world) =>
          createComponentNodes(definition, {
            id: world.id,
            name: world.name,
            seed: String(world.seed),
            preset: world.preset,
            mode: world.mode,
            createdAt: String(world.createdAt),
            updatedAt: String(world.updatedAt),
          }),
        )
      : node.children.filter((child) => isRenderableMenuNode(child) && menuNodeVisible(child));
    d.s.xmlWorldListKey = key;
  }
  return d.s.xmlWorldNodes;
}

function menuChildren(d: DrawState, node: MenuNode): MenuNode[] {
  let children = node.children.filter(
    (child) => isRenderableMenuNode(child) && menuNodeVisible(child),
  );
  if (isWorldListNode(node)) {
    children = worldListChildren(d, node);
    const search = menuSearchText(d);
    return children.filter((child) => menuMatchesSearch(child, search));
  }
  return children;
}

function staticMenuChildren(node: MenuNode): MenuNode[] {
  return node.children.filter(
    (child) => isRenderableMenuNode(child) && menuNodeVisible(child),
  );
}

function menuItemHeight(node: MenuNode, d?: DrawState): number {
  switch (node.type) {
    case 'button':
      return MENU_BUTTON_HEIGHT;
    case 'text':
      return menuTextHeight(node);
    case 'text-field':
      return Math.max(MENU_FIELD_HEIGHT, menuTextHeight(node));
    case 'image':
      return Math.max(1, Math.round(parseMenuSize(node.size ?? '', MENU_IMAGE_SIZE)));
    case 'box':
      return Math.max(1, Math.round(parseMenuSize(node.size ?? '', MENU_IMAGE_SIZE)));
    case 'row': {
      const children = d ? menuChildren(d, node) : staticMenuChildren(node);
      if (children.length === 0) return 0;
      return Math.max(...children.map((child) => menuItemHeight(child, d)));
    }
    case 'column':
      return menuStackHeight(node, d);
    default:
      return 0;
  }
}

function menuItemWidth(node: MenuNode, available: number, d?: DrawState): number {
  switch (node.type) {
    case 'button':
      return Math.min(MENU_BUTTON_WIDTH, available);
    case 'text':
      return clamp(
        Math.ceil((node.label?.length ?? 0) * menuTextSize(node) * 0.75),
        1,
        available,
      );
    case 'text-field':
      return Math.min(MENU_FIELD_WIDTH, available);
    case 'image':
      return clamp(parseMenuSize(node.size ?? '', MENU_IMAGE_SIZE), 1, available);
    case 'box':
      return clamp(parseMenuSize(node.size ?? '', available), 1, available);
    case 'row': {
      const children = d ? menuChildren(d, node) : staticMenuChildren(node);
      const total = children.reduce(
        (sum, child) => sum + menuItemWidth(child, available, d),
        0,
      );
      return clamp(total + Math.max(0, children.length - 1) * (node.gap ?? 0), 1, available);
    }
    case 'column':
      return clamp(parseMenuSize(node.size ?? '', available), 1, available);
    default:
      return 0;
  }
}

function menuStackHeight(node: MenuNode, d?: DrawState): number {
  const children = d ? menuChildren(d, node) : staticMenuChildren(node);
  const padding = node.type === 'column' ? node.paddingTop ?? 0 : 0;
  if (children.length === 0) return padding;
  const total = children.reduce((sum, child) => sum + menuItemHeight(child, d), 0);
  return padding + total + (children.length - 1) * (node.gap ?? 0);
}

function menuAlignedRect(
  align: MenuAlignment,
  outer: Rect,
  width: number,
  height: number,
): Rect {
  return {
    x:
      outer.x +
      (align.horizontal === 'center'
        ? (outer.w - width) / 2
        : align.horizontal === 'end'
          ? outer.w - width - MENU_COLUMN_EDGE
          : 0),
    y:
      outer.y +
      (align.vertical === 'center'
        ? (outer.h - height) / 2
        : align.vertical === 'end'
          ? outer.h - height
          : 0),
    w: width,
    h: height,
  };
}

function drawMenuTextNode(
  d: DrawState,
  node: MenuNode,
  x: number,
  y: number,
  width: number,
  align: MenuAlignment,
): void {
  if (!node.label) return;
  const textX =
    align.horizontal === 'center'
      ? x + width / 2
      : align.horizontal === 'end'
        ? x + width
        : x;
  const textAlign = align.horizontal === 'center' ? 'center' : align.horizontal === 'end' ? 'right' : 'left';
  drawText(
    d.ctx,
    node.label,
    textX,
    y + menuTextHeight(node) / 2,
    menuTextSize(node),
    WHITE,
    textAlign,
    true,
    width,
    d.view.scale,
  );
}

function drawMenuImageNode(node: MenuNode, rect: Rect, align: MenuAlignment, d: DrawState): void {
  const available = Math.min(rect.w, rect.h);
  const requested = node.size ? parseMenuSize(node.size, available) : MENU_IMAGE_SIZE;
  const size = Math.max(1, Math.min(available, requested));
  const target = menuAlignedRect(align, { ...rect, w: size, h: size }, size, size);
  if (node.backgroundColor) {
    d.ctx.fillStyle = node.backgroundColor;
    d.ctx.fillRect(target.x, target.y, target.w, target.h);
  }
  const overImage = pointInRect(d.s.pointer.x, d.s.pointer.y, target);
  const componentHovered = Object.values(node.componentVars ?? {}).some(
    (value) => typeof value === 'boolean' && value,
  );
  const src = (node.hoverSrc && (overImage || componentHovered) ? node.hoverSrc : node.src) ?? '';
  if (!src) return;
  const url = getAssetUrl(src.split('/').pop() ?? src);
  drawImageFit(d.ctx, image(d.res, url), target.x, target.y, target.w, target.h);
}

function drawMenuTextFieldNode(d: DrawState, node: MenuNode, rect: Rect): void {
  const id = node.id || `xml:${node.label || 'field'}`;
  const value = d.s.xmlFields[id] ?? '';
  textField(
    d,
    id,
    rect,
    value,
    node.label ?? '',
    (next) => {
      d.s.xmlFields[id] = next;
    },
    64,
  );
}

function applyComponentEvents(d: DrawState, node: MenuNode, rect: Rect): void {
  if (!node.componentRoot || !node.componentVars || !node.componentEvents) return;
  const inside = pointInRect(d.s.pointer.x, d.s.pointer.y, rect);
  for (const event of node.componentEvents) {
    if (event.name.toLowerCase() !== 'hover') continue;
    const match = event.expression.match(/^\s*([A-Za-z0-9_-]+)\s*=\s*event\.inside\s*$/i);
    if (!match || !Object.prototype.hasOwnProperty.call(node.componentVars, match[1])) continue;
    node.componentVars[match[1]] = inside;
  }
}

function triggerComponentEvent(d: DrawState, node: MenuNode, name: string): void {
  if (!node.componentEvents?.some((event) => event.name === name)) return;
  d.p.onGuiEvent?.({
    name,
    component: node.component ?? '',
    attrs: { ...(node.componentAttrs ?? {}) },
    vars: { ...(node.componentVars ?? {}) },
  });
}

/** Renders a <box>: every child is drawn over the same square. */
function drawMenuBox(d: DrawState, p: CanvasGuiProps, node: MenuNode, rect: Rect): void {
  const align = node.alignItems ?? MENU_CENTER;
  for (const child of menuChildren(d, node)) {
    drawMenuItem(d, p, child, rect, align);
  }
}

function drawMenuItem(
  d: DrawState,
  p: CanvasGuiProps,
  node: MenuNode,
  rect: Rect,
  align: MenuAlignment,
): void {
  if (!menuNodeVisible(node)) return;
  applyComponentEvents(d, node, rect);
  const clickEvent = node.clickEvent;
  if (clickEvent) {
    pushRegion(d.frame, {
      id: `xml:${node.componentId ?? node.type}:${clickEvent}`,
      rect,
      cursor: 'pointer',
      onMouseDown: () => triggerComponentEvent(d, node, clickEvent),
    });
  }
  switch (node.type) {
    case 'button':
      drawMenuButtonNode(d, p, node, rect.x, rect.y, rect.w);
      break;
    case 'text':
      drawMenuTextNode(d, node, rect.x, rect.y, rect.w, align);
      break;
    case 'text-field':
      drawMenuTextFieldNode(d, node, rect);
      break;
    case 'image':
      drawMenuImageNode(node, rect, align, d);
      break;
    case 'box':
      drawMenuBox(d, p, node, rect);
      break;
    case 'row':
      drawMenuRow(d, p, node, rect);
      break;
    case 'column':
      drawMenuColumn(d, p, node, rect);
      break;
  }
}

/** Renders a <column>: children form one stack aligned on both axes. */
function drawMenuColumn(d: DrawState, p: CanvasGuiProps, node: MenuNode, area: Rect): void {
  const columnWidth = clamp(parseMenuSize(node.size ?? '', area.w), 1, area.w);
  const align = node.alignItems ?? MENU_CENTER;
  const columnX =
    area.x +
    (align.horizontal === 'center'
      ? (area.w - columnWidth) / 2
      : align.horizontal === 'end'
        ? area.w - columnWidth - MENU_COLUMN_EDGE
        : 0);
  const contentHeight = menuStackHeight(node, d);
  const preferredY =
    align.vertical === 'center'
      ? area.y + (area.h - contentHeight) / 2
      : align.vertical === 'end'
        ? area.y + area.h - contentHeight - MENU_COLUMN_EDGE
        : area.y;
  let y = Math.max(area.y, preferredY) + (node.paddingTop ?? 0);

  const children = menuChildren(d, node);
  children.forEach((child, index) => {
    const childHeight = menuItemHeight(child, d);
    const childWidth = menuItemWidth(child, columnWidth, d);
    const childX =
      columnX +
      (align.horizontal === 'center'
        ? (columnWidth - childWidth) / 2
        : align.horizontal === 'end'
          ? columnWidth - childWidth
          : 0);
    drawMenuItem(d, p, child, { x: childX, y, w: childWidth, h: childHeight }, align);
    y += childHeight;
    if (index < children.length - 1) y += node.gap ?? 0;
  });
}

/** Renders a <row>: children are laid out left-to-right with an optional gap. */
function drawMenuRow(d: DrawState, p: CanvasGuiProps, node: MenuNode, area: Rect): void {
  const children = menuChildren(d, node);
  if (children.length === 0) return;
  const align = node.alignItems ?? MENU_ROW_ALIGN;
  const widths = children.map((child) => menuItemWidth(child, area.w, d));
  const heights = children.map((child) => menuItemHeight(child, d));
  const totalWidth =
    widths.reduce((sum, width) => sum + width, 0) + (children.length - 1) * (node.gap ?? 0);
  const rowHeight = Math.max(...heights);
  const origin = menuAlignedRect(align, area, totalWidth, rowHeight);
  let x = origin.x;

  children.forEach((child, index) => {
    const height = heights[index];
    const childRect: Rect = {
      x,
      y: origin.y + (align.vertical === 'center' ? (rowHeight - height) / 2 : align.vertical === 'end' ? rowHeight - height : 0),
      w: widths[index],
      h: height,
    };
    drawMenuItem(d, p, child, childRect, { horizontal: 'start', vertical: 'center' });
    x += widths[index] + (node.gap ?? 0);
  });
}

/** XML `<screen>` covers the whole viewport, not just the centered GUI canvas. */
function menuScreenArea(view: GuiViewport): Rect {
  return {
    x: -view.offsetX / view.scale,
    y: -view.offsetY / view.scale,
    w: view.width / view.scale,
    h: view.height / view.scale,
  };
}

function drawMenuNode(d: DrawState, p: CanvasGuiProps, node: MenuNode, area: Rect): void {
  switch (node.type) {
    case 'screen':
    case 'panorama':
    case 'game':
      node.children
        .filter(
          (child) =>
            child.type === 'panorama' ||
            child.type === 'game' ||
            (isRenderableMenuNode(child) && menuNodeVisible(child)),
        )
        .forEach((child) => drawMenuNode(d, p, child, area));
      break;
    case 'column':
      drawMenuColumn(d, p, node, area);
      break;
    case 'row':
      drawMenuRow(d, p, node, area);
      break;
    case 'button':
    case 'text':
    case 'text-field':
    case 'image':
    case 'box':
      drawMenuColumn(
        d,
        p,
        { type: 'column', size: '100%', alignItems: MENU_CENTER, children: [node] },
        area,
      );
      break;
  }
}

function describeComponentVars(node: MenuNode | null, out: string[] = []): string[] {
  if (!node) return out;
  if (node.componentRoot && node.componentId && node.componentVars) {
    const vars = Object.entries(node.componentVars)
      .map(([key, value]) => `${key}=${value}`)
      .join(',');
    out.push(`${node.componentId}:${vars}`);
  }
  node.children.forEach((child) => describeComponentVars(child, out));
  return out;
}

function drawTitle(d: DrawState): void {
  const { p } = d;
  if (MAIN_MENU_LAYOUT.screen) {
    drawMenuNode(d, p, MAIN_MENU_LAYOUT.screen, menuScreenArea(d.view));
  }
}

function showOxygenIcons(p: CanvasGuiProps): boolean {
  return p.mode === 'survival' && (p.hud.underwater || p.hud.oxygen < p.hud.maxOxygen);
}

function drawVitalIcons(d: DrawState): void {
  const { ctx, p, res, s } = d;
  const hotbarX = 69;
  const heartsX = hotbarX + 2;
  const hungerX = hotbarX + 92;
  const y = 193;
  const showOxygen = showOxygenIcons(p);
  if (showOxygen) {
    for (let i = 0; i < 10; i++) {
      const filled = p.hud.oxygen >= i + 0.5;
      ctx.fillStyle = filled ? '#4db3f2' : '#1a232d';
      ctx.beginPath();
      ctx.arc(heartsX + i * 9 + 4, y - 11, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#0c131c';
      ctx.lineWidth = 1;
      ctx.stroke();
      if (filled) {
        ctx.fillStyle = '#e3f6ff';
        ctx.fillRect(heartsX + i * 9 + 2, y - 13, 2, 2);
      }
    }
  }
  const container = image(res, GUI_HEART_TEXTURES.containerUrl);
  const full = image(res, GUI_HEART_TEXTURES.fullUrl);
  const half = image(res, GUI_HEART_TEXTURES.halfUrl);
  for (let i = 0; i < 10; i++) {
    const value = p.hud.health - i * 2;
    const state = value >= 2 ? 'full' : value >= 1 ? 'half' : 'empty';
    const x = heartsX + i * 9;
    if (state === 'empty' && container) ctx.drawImage(container, x, y, 9, 9);
    if (state !== 'empty') {
      const sprite = state === 'full' ? full : half;
      if (sprite) ctx.drawImage(sprite, x, y, 9, 9);
      else {
        ctx.fillStyle = '#e04646';
        ctx.fillRect(x + 1, y + 2, state === 'full' ? 7 : 4, 6);
      }
    }
  }
  const foodEmpty = image(res, GUI_FOOD_TEXTURES.emptyUrl);
  const foodFull = image(res, GUI_FOOD_TEXTURES.fullUrl);
  const foodHalf = image(res, GUI_FOOD_TEXTURES.halfUrl);
  for (let i = 0; i < 10; i++) {
    const idx = 9 - i;
    const value = p.hud.hunger - idx * 2;
    const state = value >= 2 ? 'full' : value >= 1 ? 'half' : 'empty';
    const x = hungerX + i * 9;
    if (state === 'empty' && foodEmpty) ctx.drawImage(foodEmpty, x, y, 9, 9);
    if (state !== 'empty') {
      const sprite = state === 'full' ? foodFull : foodHalf;
      if (sprite) ctx.drawImage(sprite, x, y, 9, 9);
      else {
        ctx.fillStyle = '#d68c3f';
        ctx.fillRect(x + 2, y + 2, state === 'full' ? 6 : 3, 6);
      }
    }
  }
  if (s.lastLabelKey === '') s.lastLabelKey = 'init';
}

function activeItemLabel(p: CanvasGuiProps): string {
  if (p.mode === 'creative') {
    const item = p.creativeHotbar[p.activeSlot] ?? ItemType.Grass;
    return ITEM_DEFS[item]?.name ?? BLOCK_DEFS[item as unknown as BlockType]?.name ?? 'Block';
  }
  const slot = p.survivalSlots[p.activeSlot];
  return slot ? ITEM_DEFS[slot.item]?.name ?? 'Item' : 'Empty Hand';
}

function drawHud(d: DrawState): void {
  const { ctx, p, res, s } = d;
  drawPanel(ctx, { x: 4, y: 4, w: 158, h: 24 }, 'rgba(18,24,31,0.84)');
  const modeLabel = p.mode === 'survival' ? 'Survival' : 'Creative';
  const flyLabel = p.hud.flying ? ' · Flying' : '';
  drawText(
    ctx,
    `${p.hud.biome} · ${getTimeLabel(p.hud.timeOfDay)} · ${modeLabel}${flyLabel}`,
    9,
    11,
    7,
    WHITE,
    'left',
    false,
    148,
  );
  const target = p.hud.targetedBlock ? ` / ${p.hud.targetedBlock}` : '';
  drawText(
    ctx,
    `X ${p.hud.x}  Y ${p.hud.y}  Z ${p.hud.z}${target}`,
    9,
    21,
    7,
    '#c8c8c8',
    'left',
    false,
    148,
  );

  let actionX = 296;
  if (p.mode === 'creative') {
    button(d, 'hud:fly', { x: 244, y: 6, w: 22, h: 14 }, 'Fly', p.onToggleFly, {
      active: p.hud.flying,
      size: 7,
    });
  }
  button(
    d,
    'hud:mute',
    { x: actionX - 24, y: 6, w: 22, h: 14 },
    p.settings.muted ? 'Off' : 'Snd',
    p.onToggleMute,
    { size: 7 },
  );
  button(d, 'hud:menu', { x: actionX, y: 6, w: 20, h: 14 }, 'Menu', p.onOpenPause, { size: 7 });

  const crosshairScale = 1 + p.hud.crosshairPulse * 0.22;
  ctx.save();
  ctx.translate(160, 120);
  ctx.scale(crosshairScale, crosshairScale);
  ctx.fillStyle = 'rgba(10,14,18,0.8)';
  ctx.fillRect(-1.8, -11, 3.6, 22);
  ctx.fillRect(-11, -1.8, 22, 3.6);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(-0.9, -10, 1.8, 20);
  ctx.fillRect(-10, -0.9, 20, 1.8);
  ctx.restore();
  if (p.hud.miningProgress > 0.01) {
    drawBar(ctx, { x: 152, y: 132, w: 16, h: 2 }, p.hud.miningProgress, '#e9e4d8');
  }

  const labelKey = `${p.mode}:${p.activeSlot}:${activeItemLabel(p)}`;
  if (s.lastLabelKey !== labelKey) {
    s.lastLabelKey = labelKey;
    s.labelUntil = performance.now() + 2200;
  }
  let notice = '';
  if (p.hud.toastText) notice = p.hud.toastText;
  else if (performance.now() < s.labelUntil) notice = activeItemLabel(p);
  else if (!p.hud.pointerLocked) notice = 'Click world to lock cursor · LMB mine · RMB place';
  if (notice) {
    const noticeY = showOxygenIcons(p) ? 162 : 176;
    drawPanel(ctx, { x: 74, y: noticeY, w: 172, h: 12 }, 'rgba(18,24,31,0.82)');
    drawText(ctx, notice, 160, noticeY + 6, 7, '#f1e6c8', 'center', true, 166);
  }

  drawVitalIcons(d);

  const hotbarX = 69;
  const hotbarY = 206;
  drawImageCropped(
    ctx,
    image(res, GUI_HOTBAR_TEXTURE_URL),
    0,
    0,
    182,
    22,
    hotbarX,
    hotbarY,
    182,
    22,
  );
  const selection = image(res, GUI_HOTBAR_SELECTION_TEXTURE_URL);
  if (selection) {
    ctx.drawImage(selection, hotbarX + p.activeSlot * 20 - 2, hotbarY - 1, 24, 23);
  } else {
    ctx.strokeStyle = '#e8dfc8';
    ctx.lineWidth = 2;
    ctx.strokeRect(hotbarX + p.activeSlot * 20 + 1, hotbarY + 1, 18, 20);
  }
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const x = hotbarX + i * 20;
    const contents: InventorySlot | null =
      p.mode === 'survival'
        ? p.survivalSlots[i] ?? null
        : { item: p.creativeHotbar[i] ?? ItemType.Grass, count: 1 };
    if (contents) {
      itemIcon(d, contents.item, x + 3, hotbarY + 3, 14);
      const dur = getSlotDurability(contents);
      if (dur && dur.current < dur.max) {
        drawBar(
          ctx,
          { x: x + 3, y: hotbarY + 18, w: 14, h: 2 },
          dur.ratio,
          getDurabilityBarColor(dur.ratio),
        );
      }
      if (p.mode === 'survival' && contents.count > 1) {
        drawText(ctx, String(contents.count), x + 18, hotbarY + 19, 6, WHITE, 'right', true);
      }
    }
    pushRegion(d.frame, {
      id: `hotbar:${i}`,
      rect: { x, y: hotbarY, w: 20, h: 22 },
      cursor: 'pointer',
      onMouseDown: () => p.onSelectSlot(i),
    });
  }
}

function creativeItems(): Array<{ category: CreativeCategory; items: ItemType[] }> {
  return CREATIVE_CATEGORIES.map((category) => {
    const blockItems = BUILDABLE_BLOCKS.filter(
      (id) => BLOCK_DEFS[id].category === category,
    ) as unknown as ItemType[];
    return {
      category,
      items:
        category === 'Specialty' ? [...blockItems, ...CREATIVE_EXTRA_SPECIALTY] : blockItems,
    };
  }).filter((entry) => entry.items.length > 0);
}

function drawCreativeScreen(d: DrawState): void {
  const { ctx, p } = d;
  drawPanel(ctx, { x: 18, y: 14, w: 284, h: 212 });
  drawText(ctx, 'Creative Block & Item Palette', 26, 26, 10, WHITE, 'left', true);
  drawText(ctx, 'Click an item to equip it into your active hotbar slot.', 26, 37, 7, MUTED);
  button(d, 'creative:close', { x: 284, y: 19, w: 12, h: 12 }, 'X', p.onCloseInventory, {
    size: 7,
  });
  const sections = creativeItems();
  const contentHeight = sections.reduce((total, section) => {
    return total + 18 + Math.ceil(section.items.length / 5) * 38 + 6;
  }, 8);
  scrollable(d, 'creative', { x: 26, y: 46, w: 268, h: 158 }, contentHeight, () => {
    let y = 6;
    sections.forEach((section) => {
      drawText(ctx, section.category, 0, y, 8, '#b8b8b8', 'left', true);
      y += 12;
      section.items.forEach((item, index) => {
        const col = index % 5;
        const row = Math.floor(index / 5);
        const x = col * 53;
        const cellY = y + row * 38;
        const selected = item === p.creativeHotbar[p.activeSlot];
        drawPanel(
          ctx,
          { x, y: cellY, w: 50, h: 35 },
          selected ? 'rgba(40,52,62,0.96)' : 'rgba(29,37,46,0.94)',
          selected ? '#e8dfc8' : 'rgba(255,255,255,0.1)',
        );
        itemIcon(d, item, x + 15, cellY + 2, 20);
        drawText(ctx, ITEM_DEFS[item]?.name ?? 'Item', x + 25, cellY + 25, 6, WHITE, 'center', false, 46);
        pushRegion(d.frame, {
          id: `creative:${item}`,
          rect: { x, y: cellY, w: 50, h: 35 },
          cursor: 'pointer',
          onMouseDown: () => {
            p.onSelectCreativeItem(item);
            p.onCloseInventory();
          },
        });
      });
      y += Math.ceil(section.items.length / 5) * 38 + 6;
    });
  });
}

function visibleCraftingRecipes(d: DrawState) {
  const { p, s } = d;
  const query = s.recipeSearch.trim().toLowerCase();
  return CRAFTING_RECIPES.filter((recipe) => {
    if (s.craftTab !== 'All' && recipe.category !== s.craftTab) return false;
    const fits = recipeFitsInGridSize(recipe, p.phase === 'crafting' ? 3 : 2);
    if (s.onlyCraftable && (!fits || getMaxCraftCount(p.survivalSlots, recipe) <= 0)) return false;
    if (query) {
      const outName = ITEM_DEFS[recipe.output.item]?.name.toLowerCase() ?? '';
      const ingredientMatch = recipe.ingredients.some((ingredient) =>
        (ITEM_DEFS[ingredient.item]?.name.toLowerCase() ?? '').includes(query),
      );
      if (
        !recipe.name.toLowerCase().includes(query) &&
        !outName.includes(query) &&
        !ingredientMatch
      ) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const gridSize = p.phase === 'crafting' ? 3 : 2;
    const rank = (recipe: typeof a) => {
      const fits = recipeFitsInGridSize(recipe, gridSize);
      return fits && getMaxCraftCount(p.survivalSlots, recipe) > 0 ? 2 : fits ? 1 : 0;
    };
    return rank(b) - rank(a);
  });
}

function drawRecipeBook(d: DrawState, x: number, y: number, gridSize: 2 | 3): void {
  const { ctx, p, res, s } = d;
  drawImageCropped(ctx, image(res, GUI_RECIPE_BOOK_TEXTURE_URL), 0, 0, 147, 166, x, y, 146, 166);

  textField(
    d,
    'recipe:search',
    { x: x + 8, y: y + 8, w: 112, h: 14 },
    s.recipeSearch,
    'Search...',
    (value) => {
      s.recipeSearch = value;
    },
    40,
  );
  const filterRect = { x: x + 122, y: y + 8, w: 16, h: 14 };
  const filterUrl = s.onlyCraftable
    ? GUI_RECIPE_FILTER_TEXTURES.enabledUrl
    : GUI_RECIPE_FILTER_TEXTURES.disabledUrl;
  drawImageFit(ctx, image(res, filterUrl), filterRect.x, filterRect.y, filterRect.w, filterRect.h);
  pushRegion(d.frame, {
    id: 'recipe:filter',
    rect: filterRect,
    cursor: 'pointer',
    onMouseDown: () => {
      s.onlyCraftable = !s.onlyCraftable;
    },
  });

  TABS.forEach((tab, index) => {
    const tabRect = { x: x + 4, y: y + 26 + index * 28, w: 34, h: 27 };
    const active = s.craftTab === tab.key;
    const tabImage = image(res, active ? GUI_RECIPE_TAB_TEXTURES.selectedUrl : GUI_RECIPE_TAB_TEXTURES.normalUrl);
    if (tabImage) ctx.drawImage(tabImage, tabRect.x, tabRect.y, tabRect.w, tabRect.h);
    else drawPanel(ctx, tabRect, active ? 'rgba(80,120,70,0.9)' : 'rgba(60,60,60,0.9)');
    if (tab.key === 'All') {
      const compass = image(res, p.itemIcons[ItemType.Compass]);
      if (compass) drawImageFit(ctx, compass, tabRect.x + 4, tabRect.y + 2, 26, 24);
      else drawText(ctx, 'All', tabRect.x + 17, tabRect.y + 14, 7, WHITE, 'center', true);
    } else if (tab.key === 'Tools') {
      const axe = image(res, p.itemIcons[ItemType.IronAxe]);
      const sword = image(res, p.itemIcons[ItemType.GoldSword]);
      if (axe) drawImageFit(ctx, axe, tabRect.x + 4, tabRect.y + 6, 16, 16);
      if (sword) drawImageFit(ctx, sword, tabRect.x + 13, tabRect.y + 6, 16, 16);
      if (!axe && !sword) drawText(ctx, 'T', tabRect.x + 17, tabRect.y + 14, 7, WHITE, 'center', true);
    } else {
      drawText(ctx, tab.label, tabRect.x + 17, tabRect.y + 14, 6, WHITE, 'center', true, 32);
    }
    pushRegion(d.frame, {
      id: `recipe:tab:${tab.key}`,
      rect: tabRect,
      cursor: 'pointer',
      onMouseDown: () => {
        s.craftTab = tab.key;
        s.scroll.recipes = 0;
      },
    });
  });

  const recipes = visibleCraftingRecipes(d);
  const listRect = { x: x + 42, y: y + 28, w: 96, h: 100 };
  scrollable(d, 'recipes', listRect, Math.ceil(recipes.length / 4) * 26, () => {
    if (recipes.length === 0) {
      drawText(ctx, 'No recipes match.', 48, 40, 7, MUTED);
      return;
    }
    recipes.forEach((recipe, index) => {
      const col = index % 4;
      const row = Math.floor(index / 4);
      const cellX = col * 24;
      const cellY = row * 26;
      const fits = recipeFitsInGridSize(recipe, gridSize);
      const maxCraft = getMaxCraftCount(p.survivalSlots, recipe);
      const craftable = fits && maxCraft > 0;
      const slotUrl = craftable
        ? maxCraft > 1
          ? GUI_RECIPE_SLOT_TEXTURES.manyCraftableUrl
          : GUI_RECIPE_SLOT_TEXTURES.craftableUrl
        : fits
          ? GUI_RECIPE_SLOT_TEXTURES.uncraftableUrl
          : GUI_RECIPE_SLOT_TEXTURES.manyUncraftableUrl;
      drawImageFit(ctx, image(res, slotUrl), cellX + 2, cellY, 20, 20);
      itemIcon(d, recipe.output.item, cellX + 5, cellY + 3, 14);
      drawText(
        ctx,
        recipe.name,
        cellX + 12,
        cellY + 23,
        6,
        s.inspectedRecipeId === recipe.id ? YELLOW : '#d8d8d8',
        'center',
        false,
        23,
      );
      pushRegion(d.frame, {
        id: `recipe:${recipe.id}`,
        rect: { x: cellX + 2, y: cellY, w: 20, h: 20 },
        cursor: 'pointer',
        onHover: () => {
          s.inspectedRecipeId = recipe.id;
        },
        onMouseDown: () => {
          if (craftable) p.onFillGridFromRecipe(recipe.id);
        },
      });
    });
  });

  const inspected = CRAFTING_RECIPES.find((recipe) => recipe.id === s.inspectedRecipeId) ?? null;
  const inspectMax = inspected ? getMaxCraftCount(p.survivalSlots, inspected) : 0;
  if (inspected && recipeFitsInGridSize(inspected, gridSize) && inspectMax > 0) {
    drawText(ctx, inspected.name, x + 44, y + 136, 7, WHITE, 'left', true, 92);
    button(d, 'recipe:craft', { x: x + 42, y: y + 146, w: 44, h: 12 }, 'Craft', () =>
      p.onCraftRecipe(inspected.id, false),
    );
    if (inspectMax > 1) {
      button(
        d,
        'recipe:craft-all',
        { x: x + 90, y: y + 146, w: 48, h: 12 },
        `×${inspectMax}`,
        () => p.onCraftRecipe(inspected.id, true),
      );
    }
  } else if (inspected) {
    drawText(
      ctx,
      recipeFitsInGridSize(inspected, gridSize) ? 'Missing ingredients' : 'Requires 3x3 table',
      x + 44,
      y + 140,
      7,
      MUTED,
    );
  }
}

function drawCraftingScreen(d: DrawState): void {
  const { ctx, p, res, s } = d;
  const gridSize: 2 | 3 = p.phase === 'crafting' ? 3 : 2;
  const cellCount = gridSize * gridSize;
  const craftX = s.recipeBookOpen ? 0 : 72;
  const panelY = 38;
  drawImageCropped(
    ctx,
    image(res, GUI_CRAFTING_TABLE_TEXTURE_URL),
    0,
    0,
    176,
    166,
    craftX,
    panelY,
    176,
    166,
  );

  const matched = matchCraftingGrid(p.craftingGrid, gridSize);
  const gridHasItems = p.craftingGrid.slice(0, cellCount).some((cell) => cell !== null);
  let gridMax = 0;
  if (matched) {
    let min = Infinity;
    for (let i = 0; i < cellCount; i++) {
      const cell = p.craftingGrid[i];
      if (cell && cell.count > 0) min = Math.min(min, cell.count);
    }
    gridMax = Number.isFinite(min) ? min : 0;
  }
  const inspected = CRAFTING_RECIPES.find((recipe) => recipe.id === s.inspectedRecipeId) ?? null;
  const preview =
    inspected && !gridHasItems && recipeFitsInGridSize(inspected, gridSize)
      ? getRecipeGridPreview(inspected, gridSize)
      : null;
  const selectedContents =
    s.craftSelectedSlot !== null ? p.survivalSlots[s.craftSelectedSlot] ?? null : null;

  const placeInGrid = (gridIndex: number, shift: boolean) => {
    if (s.craftSelectedSlot !== null && p.survivalSlots[s.craftSelectedSlot]) {
      const contents = p.survivalSlots[s.craftSelectedSlot]!;
      const amount = shift ? contents.count : 1;
      p.onPlaceIntoGrid(s.craftSelectedSlot, gridIndex, amount);
      if (contents.count <= amount) s.craftSelectedSlot = null;
      return;
    }
    if (p.craftingGrid[gridIndex]) p.onReturnGridCell(gridIndex);
  };

  const gridStartX = craftX + (gridSize === 3 ? 30 : 39);
  const gridStartY = panelY + (gridSize === 3 ? 17 : 35);
  for (let i = 0; i < cellCount; i++) {
    const cell = p.craftingGrid[i];
    const ghost = !cell && preview ? preview[i] : null;
    const rect = {
      x: gridStartX + (i % gridSize) * 18,
      y: gridStartY + Math.floor(i / gridSize) * 18,
      w: 18,
      h: 18,
    };
    drawPanel(ctx, rect, 'rgba(0,0,0,0.08)', 'rgba(255,255,255,0.05)');
    if (cell) itemIcon(d, cell.item, rect.x + 2, rect.y + 2, 14);
    else if (ghost !== null && ghost !== undefined) {
      ctx.save();
      ctx.globalAlpha = 0.32;
      itemIcon(d, ghost, rect.x + 2, rect.y + 2, 14);
      ctx.restore();
    }
    if (cell && cell.count > 1) {
      drawText(ctx, String(cell.count), rect.x + 17, rect.y + 17, 6, WHITE, 'right', true);
    }
    pushRegion(d.frame, {
      id: `craft:grid:${i}`,
      rect,
      cursor: 'pointer',
      onMouseDown: (event) => placeInGrid(i, event.shiftKey),
      onRightClick: () => {
        if (p.craftingGrid[i]) p.onReturnGridCell(i);
      },
    });
  }

  const outputRect = {
    x: craftX + (gridSize === 3 ? 120 : 108),
    y: panelY + (gridSize === 3 ? 31 : 39),
    w: 24,
    h: 24,
  };
  if (matched) itemIcon(d, matched.output.item, outputRect.x + 4, outputRect.y + 4, 16);
  if (matched && matched.output.count > 1) {
    drawText(
      ctx,
      String(matched.output.count),
      outputRect.x + 23,
      outputRect.y + 22,
      6,
      WHITE,
      'right',
      true,
    );
  }
  pushRegion(d.frame, {
    id: 'craft:output',
    rect: outputRect,
    cursor: matched ? 'pointer' : 'default',
    onMouseDown: () => {
      if (matched) p.onCraftFromGrid(false);
    },
  });

  const inventorySlot = (index: number, rect: Rect, number?: number) => {
    const contents = p.survivalSlots[index] ?? null;
    const chosen = s.craftSelectedSlot === index;
    slot(d, `craft:inv:${index}`, rect, contents, {
      number,
      selected: chosen,
      onRightClick: () => p.onEatSlot(index),
      onClick: () => {
        if (s.craftSelectedSlot === index) {
          s.craftSelectedSlot = null;
        } else if (contents) {
          s.craftSelectedSlot = index;
        }
      },
    });
  };
  for (let i = 0; i < 18; i++) {
    inventorySlot(HOTBAR_SIZE + i, {
      x: craftX + 8 + (i % 9) * 18,
      y: panelY + 84 + Math.floor(i / 9) * 18,
      w: 18,
      h: 18,
    });
  }
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    inventorySlot(i, { x: craftX + 8 + i * 18, y: panelY + 142, w: 18, h: 18 });
  }

  const toggleRect = { x: craftX + 167, y: panelY + 4, w: 9, h: 14 };
  const toggleImage = image(
    res,
    s.recipeBookOpen
      ? GUI_RECIPE_TAB_TEXTURES.selectedUrl
      : GUI_RECIPE_TAB_TEXTURES.normalUrl,
  );
  if (toggleImage) ctx.drawImage(toggleImage, toggleRect.x, toggleRect.y, toggleRect.w, toggleRect.h);
  pushRegion(d.frame, {
    id: 'craft:toggle-book',
    rect: toggleRect,
    cursor: 'pointer',
    onMouseDown: () => {
      s.recipeBookOpen = !s.recipeBookOpen;
    },
  });

  if (s.recipeBookOpen) drawRecipeBook(d, 174, panelY, gridSize);

  button(d, 'craft:close', { x: 306, y: 8, w: 12, h: 12 }, 'X', p.onCloseInventory, { size: 7 });

  if (gridHasItems) {
    button(d, 'craft:clear', { x: 72, y: 210, w: 38, h: 13 }, 'Clear', p.onClearGrid, { size: 7 });
  }
  if (selectedContents && ITEM_DEFS[selectedContents.item]?.foodRestore) {
    button(
      d,
      'craft:eat',
      { x: 114, y: 210, w: 62, h: 13 },
      `Eat (+${ITEM_DEFS[selectedContents.item]?.foodRestore})`,
      () => {
        if (s.craftSelectedSlot !== null) p.onEatSlot(s.craftSelectedSlot);
        s.craftSelectedSlot = null;
      },
      { size: 7 },
    );
  }
  const status = matched ? matched.name : 'No recipe matched';
  drawText(ctx, status, 176, 216, 8, matched ? GREEN : MUTED, 'center', true, 180);
  if (matched) {
    button(d, 'craft:craft-one', { x: 124, y: 224, w: 68, h: 12 }, 'Craft x1', () =>
      p.onCraftFromGrid(false),
    );
    if (gridMax > 1) {
      button(d, 'craft:craft-all', { x: 196, y: 224, w: 80, h: 12 }, `All x${gridMax}`, () =>
        p.onCraftFromGrid(true),
      );
    }
  }
}

function drawFurnaceScreen(d: DrawState): void {
  const { ctx, p, res, s } = d;
  const furnace = p.activeFurnace;
  drawPanel(ctx, { x: 16, y: 14, w: 288, h: 212 });
  drawText(ctx, 'Furnace', 26, 26, 11, WHITE, 'left', true);
  button(d, 'furnace:close', { x: 286, y: 19, w: 12, h: 12 }, 'X', p.onCloseInventory, { size: 7 });

  const burnRatio = furnace && furnace.burnTotal > 0 ? furnace.burnTime / furnace.burnTotal : 0;
  const cookRatio = furnace && furnace.cookTotal > 0 ? furnace.cookTime / furnace.cookTotal : 0;
  drawPanel(ctx, { x: 24, y: 42, w: 132, h: 56 }, 'rgba(17,23,29,0.9)');
  drawText(ctx, 'Smelting Hearth', 28, 48, 7, '#c8c8c8', 'left', true);
  drawText(
    ctx,
    furnace && furnace.burnTime > 0 ? `${Math.ceil(furnace.burnTime)}s fuel` : 'Idle',
    152,
    48,
    6,
    furnace && furnace.burnTime > 0 ? '#ff9838' : MUTED,
    'right',
  );
  drawText(ctx, 'Input', 42, 58, 6, MUTED, 'center');
  drawText(ctx, 'Fuel', 100, 58, 6, MUTED, 'center');
  drawText(ctx, 'Output', 142, 58, 6, MUTED, 'center');

  const putIntoFurnace = (target: 'input' | 'fuel', shift: boolean) => {
    if (s.furnaceSelectedSlot !== null && p.survivalSlots[s.furnaceSelectedSlot]) {
      const contents = p.survivalSlots[s.furnaceSelectedSlot]!;
      const amount = shift ? contents.count : 1;
      p.onPlaceIntoFurnace(s.furnaceSelectedSlot, target, amount);
      if (contents.count <= amount) s.furnaceSelectedSlot = null;
      return;
    }
    if (furnace && furnace[target]) p.onTakeFurnaceSlot(target);
  };
  slot(d, 'furnace:input', { x: 30, y: 64, w: 26, h: 26 }, furnace?.input ?? null, {
    onClick: (shift) => putIntoFurnace('input', shift),
    onRightClick: () => {
      if (furnace?.input) p.onTakeFurnaceSlot('input');
    },
  });
  slot(d, 'furnace:fuel', { x: 88, y: 64, w: 26, h: 26 }, furnace?.fuel ?? null, {
    onClick: (shift) => putIntoFurnace('fuel', shift),
    onRightClick: () => {
      if (furnace?.fuel) p.onTakeFurnaceSlot('fuel');
    },
  });
  drawBar(ctx, { x: 62, y: 76, w: 20, h: 5 }, burnRatio, '#ff8a2b');
  drawBar(ctx, { x: 62, y: 86, w: 20, h: 4 }, cookRatio, '#f5b041');
  drawText(ctx, `${Math.round(cookRatio * 100)}%`, 72, 95, 6, MUTED, 'center');
  slot(d, 'furnace:output', { x: 128, y: 64, w: 24, h: 24 }, furnace?.output ?? null, {
    onClick: () => {
      if (furnace?.output) p.onTakeFurnaceSlot('output');
    },
  });

  const selected = s.furnaceSelectedSlot !== null ? p.survivalSlots[s.furnaceSelectedSlot] : null;
  drawText(
    ctx,
    selected
      ? `Selected: ${ITEM_DEFS[selected.item]?.name ?? 'Item'}`
      : 'Select an item, then click Input or Fuel.',
    24,
    106,
    7,
    selected ? GREEN : MUTED,
    'left',
    false,
    132,
  );
  for (let i = 0; i < 18; i++) {
    const index = HOTBAR_SIZE + i;
    slot(d, `furnace:inv:${index}`, { x: 24 + (i % 9) * 14, y: 116 + Math.floor(i / 9) * 14, w: 13, h: 13 }, p.survivalSlots[index] ?? null, {
      iconSize: 10,
      onClick: (shift) => {
        if (shift && p.survivalSlots[index]) {
          p.onQuickLoadFurnaceSlot(index, true);
          if (s.furnaceSelectedSlot === index) s.furnaceSelectedSlot = null;
          return;
        }
        if (s.furnaceSelectedSlot === index) s.furnaceSelectedSlot = null;
        else if (p.survivalSlots[index]) s.furnaceSelectedSlot = index;
      },
    });
  }
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    slot(d, `furnace:hotbar:${i}`, { x: 24 + i * 14, y: 146, w: 13, h: 13 }, p.survivalSlots[i] ?? null, {
      number: i + 1,
      iconSize: 10,
      onClick: (shift) => {
        if (shift && p.survivalSlots[i]) {
          p.onQuickLoadFurnaceSlot(i, true);
          if (s.furnaceSelectedSlot === i) s.furnaceSelectedSlot = null;
          return;
        }
        if (s.furnaceSelectedSlot === i) s.furnaceSelectedSlot = null;
        else if (p.survivalSlots[i]) s.furnaceSelectedSlot = i;
      },
    });
  }

  drawText(ctx, 'Smelting Recipes', 164, 46, 8, WHITE, 'left', true);
  scrollable(d, 'furnace-recipes', { x: 164, y: 54, w: 126, h: 122 }, SMELTING_RECIPES.length * 22, () => {
    SMELTING_RECIPES.forEach((recipe, index) => {
      const y = index * 22;
      const have = countItemInInventory(p.survivalSlots, recipe.input);
      drawPanel(
        ctx,
        { x: 0, y, w: 122, h: 20 },
        have > 0 ? 'rgba(29,39,49,0.94)' : 'rgba(24,31,39,0.9)',
        have > 0 ? 'rgba(150,216,110,0.3)' : 'rgba(255,255,255,0.08)',
      );
      itemIcon(d, recipe.input, 4, y + 3, 14);
      drawText(ctx, '>', 21, y + 10, 7, MUTED, 'center');
      itemIcon(d, recipe.output.item, 30, y + 3, 14);
      drawText(ctx, ITEM_DEFS[recipe.output.item]?.name ?? 'Item', 48, y + 7, 7, WHITE, 'left', true, 48);
      drawText(ctx, `${ITEM_DEFS[recipe.input]?.name ?? 'Item'} (${have})`, 48, y + 15, 6, MUTED, 'left', false, 48);
      button(
        d,
        `furnace:load:${recipe.id}`,
        { x: 98, y: y + 4, w: 22, h: 12 },
        'Load',
        () => p.onQuickLoadFurnaceRecipe(recipe.input),
        { disabled: have <= 0, size: 6 },
      );
    });
  });
  drawPanel(ctx, { x: 164, y: 182, w: 126, h: 28 }, 'rgba(17,23,29,0.9)');
  drawText(ctx, 'Accepted Fuels', 168, 189, 7, WHITE, 'left', true);
  drawText(
    ctx,
    'Coal 40s · Logs 15s · Planks 12s · Tools 10s · Sticks 6s',
    168,
    200,
    6,
    MUTED,
    'left',
    false,
    118,
  );
  void res;
}

function drawPauseScreen(d: DrawState): void {
  const { ctx, p, s } = d;
  drawPanel(ctx, { x: 52, y: 10, w: 216, h: 220 });
  drawText(ctx, p.worldInfo.name, 60, 22, 11, WHITE, 'left', true, 148);
  drawText(
    ctx,
    `${PRESET_LABELS[p.worldInfo.preset]} · Seed ${p.worldInfo.seed} · ${p.hud.editCount} edits`,
    60,
    33,
    7,
    MUTED,
    'left',
    false,
    150,
  );
  button(d, 'pause:resume', { x: 220, y: 14, w: 42, h: 14 }, 'Resume', p.onResume, { size: 7 });

  scrollable(d, 'pause', { x: 60, y: 44, w: 200, h: 154 }, 168, () => {
    sectionLabel(d, 'Worlds & Storage', 0, 6, 196);
    button(d, 'pause:save', { x: 0, y: 14, w: 64, h: 14 }, s.justSaved ? 'Saved' : 'Save Now', async () => {
      await p.onSaveNow();
      s.justSaved = true;
      window.setTimeout(() => {
        s.justSaved = false;
      }, 1800);
    }, { size: 7 });
    button(d, 'pause:worlds', { x: 68, y: 14, w: 64, h: 14 }, `Worlds (${Math.max(1, p.worlds.length)})`, p.onOpenWorlds, { size: 7 });
    button(d, 'pause:new-world', { x: 136, y: 14, w: 64, h: 14 }, 'New World', p.onOpenNewWorld, { size: 7 });

    sectionLabel(d, 'Game Mode', 0, 36, 196);
    button(d, 'pause:mode:survival', { x: 0, y: 44, w: 98, h: 14 }, 'Survival', () => p.onSelectMode('survival'), {
      active: p.mode === 'survival',
      size: 7,
    });
    button(d, 'pause:mode:creative', { x: 102, y: 44, w: 98, h: 14 }, 'Creative', () => p.onSelectMode('creative'), {
      active: p.mode === 'creative',
      size: 7,
    });

    sectionLabel(d, 'Time of Day', 0, 66, 196);
    TIME_OPTIONS.forEach((option, index) => {
      button(
        d,
        `pause:time:${option.id}`,
        { x: index * 51, y: 74, w: 48, h: 14 },
        option.label,
        () => p.onSetTime(option.id),
        { size: 7 },
      );
    });

    sectionLabel(d, 'Controls', 0, 96, 196);
    const controls: Array<[string, string]> = [
      ['Move / Sprint', 'WASD / Shift'],
      ['Jump / Pause', 'Space / Esc'],
      ['Mine / Fight', 'Hold LMB'],
      ['Place / Eat', 'RMB'],
      ['Craft / Bag', 'E'],
      ['Hotbar / Mute', '1-9 / M'],
      ['Menu Panorama', 'F1'],
    ];
    controls.forEach(([label, keys], index) => {
      const rowY = 106 + index * 9;
      drawText(d.ctx, label, 0, rowY, 7, MUTED);
      drawText(d.ctx, keys, 196, rowY, 7, WHITE, 'right');
    });
  });

  button(d, 'pause:settings', { x: 60, y: 206, w: 96, h: 14 }, 'Settings', p.onOpenSettings, {
    size: 7,
  });
  button(
    d,
    'pause:reset',
    { x: 160, y: 206, w: 96, h: 14 },
    'Reset World',
    () => {
      p.onResetEdits();
      p.onResume();
    },
    { size: 7 },
  );
}

function drawSettingsScreen(d: DrawState): void {
  const { ctx, p } = d;
  drawPanel(ctx, { x: 44, y: 8, w: 232, h: 224 });
  drawText(ctx, 'Settings', 52, 20, 12, WHITE, 'left', true);
  drawText(ctx, 'Adjust camera, video, audio, and HUD preferences.', 52, 31, 7, MUTED);
  button(d, 'settings:done', { x: 244, y: 12, w: 26, h: 13 }, 'Done', p.onCloseSettings, { size: 7 });

  scrollable(d, 'settings', { x: 52, y: 40, w: 216, h: 172 }, 216, () => {
    button(
      d,
      'settings:sound',
      { x: 0, y: 0, w: 106, h: 14 },
      `Sound: ${p.settings.muted ? 'Off' : 'On'}`,
      () => p.onChangeSettings({ muted: !p.settings.muted }),
      { active: !p.settings.muted, size: 7 },
    );
    button(
      d,
      'settings:fps',
      { x: 110, y: 0, w: 106, h: 14 },
      `Show FPS: ${p.settings.showFps ? 'On' : 'Off'}`,
      () => p.onChangeSettings({ showFps: !p.settings.showFps }),
      { active: p.settings.showFps, size: 7 },
    );
    button(
      d,
      'settings:player-shadow',
      { x: 0, y: 16, w: 106, h: 14 },
      `Player Shadow: ${p.settings.playerShadow ? 'On' : 'Off'}`,
      () => p.onChangeSettings({ playerShadow: !p.settings.playerShadow }),
      { active: p.settings.playerShadow, size: 7 },
    );
    button(
      d,
      'settings:entity-shadows',
      { x: 110, y: 16, w: 106, h: 14 },
      `Entity Shadows: ${p.settings.entityShadows ? 'On' : 'Off'}`,
      () => p.onChangeSettings({ entityShadows: !p.settings.entityShadows }),
      { active: p.settings.entityShadows, size: 7 },
    );

    slider(d, 'settings:fov', 0, 38, 216, 'Field of View', `${p.settings.fov}°`, p.settings.fov, 60, 100, 2, (value) =>
      p.onChangeSettings({ fov: value }),
    );
    slider(
      d,
      'settings:sensitivity',
      0,
      60,
      216,
      'Mouse Sensitivity',
      `${Math.round(p.settings.mouseSensitivity * 100)}%`,
      p.settings.mouseSensitivity,
      0.4,
      2.2,
      0.1,
      (value) => p.onChangeSettings({ mouseSensitivity: Math.round(value * 10) / 10 }),
    );

    sectionLabel(d, 'Render Distance', 0, 88, 216);
    RENDER_OPTIONS.forEach((option, index) => {
      button(
        d,
        `settings:render:${option.chunks}`,
        { x: index * 73, y: 96, w: 70, h: 14 },
        option.label,
        () => p.onChangeSettings({ renderDistance: option.chunks }),
        { active: p.settings.renderDistance === option.chunks, size: 7 },
      );
    });

    sectionLabel(d, 'GUI Scale', 0, 118, 216);
    GUI_SCALE_OPTIONS.forEach((option, index) => {
      button(
        d,
        `settings:gui-scale:${option.value}`,
        { x: index * 44, y: 126, w: 41, h: 14 },
        option.label,
        () => p.onChangeSettings({ guiScale: option.value }),
        { active: p.settings.guiScale === option.value, size: 7 },
      );
    });
    drawText(
      d.ctx,
      'Auto (Recommended) uses the largest scale that fits the window.',
      0,
      146,
      6,
      MUTED,
    );

    sectionLabel(d, 'Main Menu Background', 0, 160, 216);
    drawText(
      d.ctx,
      p.hasPanorama
        ? 'Custom panorama saved. Press F1 in-game to retake.'
        : 'Default dirt tiles. Press F1 in-game to capture a panorama.',
      0,
      170,
      6,
      MUTED,
      'left',
      false,
      216,
    );
    if (p.hasPanorama) {
      button(d, 'settings:clear-panorama', { x: 154, y: 178, w: 62, h: 12 }, 'Reset to Dirt', p.onClearPanorama, {
        size: 6,
      });
    }

    sectionLabel(d, 'Controls', 0, 198, 216);
    drawText(d.ctx, 'WASD Move · Space Jump · LMB Mine · RMB Place · E Bag · 1-9 Hotbar · M Mute · F1 Panorama', 0, 208, 6, MUTED, 'left', false, 216);
  });

  button(d, 'settings:reset', { x: 52, y: 214, w: 104, h: 14 }, 'Reset Defaults', p.onResetSettings, {
    size: 7,
  });
  button(d, 'settings:close', { x: 160, y: 214, w: 104, h: 14 }, 'Done', p.onCloseSettings, {
    size: 7,
  });
}

function drawWorldManager(d: DrawState): void {
  const { ctx, p, s } = d;
  if (s.worldView === 'create') {
    drawText(ctx, 'Create New World', GUI_WIDTH / 2, 14, 13, WHITE, 'center', true);
    scrollable(d, 'world-create', { x: 40, y: 32, w: 240, h: 150 }, 152, () => {
      sectionLabel(d, 'World Name', 0, 4, 236);
      textField(d, 'world:name', { x: 0, y: 12, w: 236, h: 16 }, s.newName, 'World name', (value) => {
        s.nameTouched = true;
        s.newName = value;
      }, 36);
      sectionLabel(d, 'Game Mode', 0, 38, 236);
      button(d, 'world:mode:survival', { x: 0, y: 46, w: 116, h: 14 }, 'Survival', () => {
        s.newMode = 'survival';
      }, { active: s.newMode === 'survival', size: 7 });
      button(d, 'world:mode:creative', { x: 120, y: 46, w: 116, h: 14 }, 'Creative', () => {
        s.newMode = 'creative';
      }, { active: s.newMode === 'creative', size: 7 });

      sectionLabel(d, 'World Type', 0, 68, 236);
      PRESET_OPTIONS.forEach((option, index) => {
        const col = index % 2;
        const row = Math.floor(index / 2);
        button(
          d,
          `world:preset:${option.id}`,
          { x: col * 120, y: 76 + row * 22, w: 116, h: 19 },
          option.label,
          () => {
            s.newPreset = option.id;
            if (!s.nameTouched) s.newName = suggestWorldName(option.id, p.worlds.length);
          },
          { active: s.newPreset === option.id, size: 7 },
        );
      });

      sectionLabel(d, 'Seed for the World Generator', 0, 126, 236);
      textField(d, 'world:seed', { x: 0, y: 134, w: 174, h: 16 }, s.newSeed, 'Random seed', (value) => {
        s.newSeed = value.replace(/[^0-9-]/g, '').slice(0, 8);
      }, 8);
      button(
        d,
        'world:random-seed',
        { x: 178, y: 134, w: 58, h: 16 },
        'Random',
        () => {
          s.newSeed = String(Math.floor(10000 + Math.random() * 89999));
        },
        { size: 7 },
      );
    });
    button(
      d,
      'world:create',
      { x: 50, y: 192, w: 110, h: 16 },
      'Create New World',
      () => {
        const parsed = parseInt(s.newSeed, 10);
        const seed = Number.isFinite(parsed) ? parsed : Math.floor(10000 + Math.random() * 89999);
        p.onCreateWorld({
          name: s.newName.trim() || suggestWorldName(s.newPreset, p.worlds.length),
          seed,
          preset: s.newPreset,
          mode: s.newMode,
          enterImmediately: true,
        });
      },
      { size: 8 },
    );
    button(d, 'world:create-cancel', { x: 160, y: 192, w: 110, h: 16 }, 'Cancel', () => {
      s.worldView = 'list';
    }, { size: 8 });
    return;
  }

  if (WORLD_LIST_LAYOUT.screen) {
    drawMenuNode(d, p, WORLD_LIST_LAYOUT.screen, menuScreenArea(d.view));
  }
}

function drawDeathScreen(d: DrawState): void {
  const { ctx, p } = d;
  drawPanel(ctx, { x: 66, y: 36, w: 188, h: 168 }, 'rgba(25,21,24,0.97)', 'rgba(214,81,72,0.5)');
  ctx.fillStyle = '#ef6c62';
  ctx.beginPath();
  ctx.arc(160, 62, 12, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#191518';
  ctx.fillRect(154, 58, 4, 5);
  ctx.fillRect(162, 58, 4, 5);
  drawText(ctx, 'You Died', 160, 86, 14, '#f9eaea', 'center', true);
  drawText(ctx, 'Your builds and inventory remain at the trailhead.', 160, 100, 7, MUTED, 'center', false, 168);
  const mins = Math.floor(p.hud.survivalSeconds / 60);
  const secs = p.hud.survivalSeconds % 60;
  const stats: Array<[string, string]> = [
    [`${mins}:${String(secs).padStart(2, '0')}`, 'Survived'],
    [String(p.hud.blocksMined), 'Blocks Mined'],
    [String(p.hud.mobsDefeated), 'Foes Defeated'],
  ];
  stats.forEach(([value, label], index) => {
    const x = 82 + index * 58;
    drawText(ctx, value, x, 121, 11, WHITE, 'center', true, 54);
    drawText(ctx, label, x, 134, 6, MUTED, 'center', false, 54);
  });
  button(d, 'death:respawn', { x: 86, y: 150, w: 148, h: 16 }, 'Respawn at Trailhead', p.onRespawn, { size: 8 });
  button(d, 'death:title', { x: 86, y: 170, w: 148, h: 14 }, 'Title Screen', p.onReturnTitle, { size: 7 });
}

function drawContextLost(d: DrawState): void {
  const { ctx, p } = d;
  drawPanel(ctx, { x: 48, y: 66, w: 224, h: 108 });
  drawText(ctx, 'Graphics Context Paused', 160, 92, 12, WHITE, 'center', true);
  drawText(
    ctx,
    'WebGL rendering was interrupted. Reload the view to restore your world.',
    160,
    112,
    7,
    MUTED,
    'center',
    false,
    200,
  );
  button(d, 'context:reload', { x: 110, y: 138, w: 100, h: 16 }, 'Reload World', p.onReload, { size: 8 });
}

function drawScreen(d: DrawState): void {
  const { p } = d;
  if (p.contextLost) {
    drawContextLost(d);
    return;
  }
  // Overlays are modal: never draw or register hit regions for the screen below them.
  if (p.worldModalView !== null) {
    drawWorldManager(d);
    return;
  }
  if (p.settingsOpen) {
    drawSettingsScreen(d);
    return;
  }
  switch (p.phase) {
    case 'title':
      drawTitle(d);
      break;
    case 'playing':
      drawHud(d);
      break;
    case 'inventory':
    case 'crafting':
      if (p.mode === 'creative' && p.phase === 'inventory') drawCreativeScreen(d);
      else drawCraftingScreen(d);
      break;
    case 'furnace':
      drawFurnaceScreen(d);
      break;
    case 'paused':
      drawPauseScreen(d);
      break;
    case 'dead':
      drawDeathScreen(d);
      break;
  }
}

export default function CanvasGui(props: CanvasGuiProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const resourcesRef = useRef(new ImageCache());
  const frameRef = useRef<GuiFrame>(createGuiFrame(-1, -1));
  const stateRef = useRef<LocalState | null>(null);
  if (!stateRef.current) stateRef.current = createLocalState(props);
  const viewRef = useRef({ width: 0, height: 0, dpr: 1, scale: 1, offsetX: 0, offsetY: 0 });

  useEffect(() => {
    const phase = props.phase;
    const state = stateRef.current!;
    if (phase === 'inventory' || phase === 'crafting') {
      state.craftSelectedSlot = null;
      state.inspectedRecipeId = null;
      state.recipeBookOpen = true;
      state.recipeSearch = '';
      state.craftTab = 'All';
      state.onlyCraftable = false;
      state.scroll.recipes = 0;
    }
    if (phase === 'furnace') state.furnaceSelectedSlot = null;
  }, [props.phase]);

  useEffect(() => {
    const state = stateRef.current!;
    if (!props.worldModalView) return;
    state.worldView = props.worldModalView;
    state.worldSearch = '';
    state.xmlFields = {};
    state.selectedWorldId = props.worldInfo.id || props.worlds[0]?.id || '';
    state.renamingId = null;
    state.renameText = '';
    state.confirmDeleteId = null;
    state.newPreset = 'meadows';
    state.newMode = 'survival';
    state.newName = suggestWorldName('meadows', props.worlds.length);
    state.nameTouched = false;
    state.newSeed = String(Math.floor(10000 + Math.random() * 89999));
    state.focus = null;
    state.scroll.worldList = 0;
    state.scroll['world-create'] = 0;
  }, [props.worldModalView, props.worldInfo.id, props.worlds]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      const width = window.innerWidth;
      const height = window.innerHeight;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      const scale = resolveGuiScale(propsRef.current.settings.guiScale, width, height);
      viewRef.current = {
        width,
        height,
        dpr,
        scale,
        offsetX: (width - GUI_WIDTH * scale) / 2,
        offsetY: (height - GUI_HEIGHT * scale) / 2,
      };
      canvas.dataset.guiScale = String(scale);
      canvas.dataset.guiOffsetX = String(viewRef.current.offsetX);
      canvas.dataset.guiOffsetY = String(viewRef.current.offsetY);
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [props.settings.guiScale]);

  useEffect(() => {
    let raf = 0;
    const render = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (canvas && ctx) {
        const view = viewRef.current;
        const state = stateRef.current!;
        ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
        ctx.clearRect(0, 0, view.width, view.height);
        ctx.imageSmoothingEnabled = false;
        drawScreenBackdrop(ctx, propsRef.current, resourcesRef.current, view);
        ctx.save();
        ctx.translate(view.offsetX, view.offsetY);
        ctx.scale(view.scale, view.scale);
        const frame = createGuiFrame(state.pointer.x, state.pointer.y);
        drawScreen({
          ctx,
          frame,
          res: resourcesRef.current,
          p: propsRef.current,
          s: state,
          view,
        });
        frameRef.current = frame;
        ctx.restore();
        drawFpsOverlay(ctx, propsRef.current, view);
        canvas.dataset.screen = propsRef.current.contextLost
          ? 'context-lost'
          : propsRef.current.worldModalView
            ? `world:${state.worldView}`
            : propsRef.current.settingsOpen
              ? 'settings'
              : propsRef.current.phase;
        canvas.dataset.activeTab = state.craftTab;
        canvas.dataset.recipeBookOpen = String(state.recipeBookOpen);
        canvas.dataset.recipeSearch = state.recipeSearch;
        canvas.dataset.onlyCraftable = String(state.onlyCraftable);
        canvas.dataset.worldView = state.worldView;
        canvas.dataset.focus = state.focus ?? '';
        canvas.dataset.hover = state.hover ?? '';
        canvas.dataset.menuSource = MAIN_MENU_LAYOUT.source ?? 'fallback';
        canvas.dataset.menuTree = describeMenuLayout(MAIN_MENU_LAYOUT);
        canvas.dataset.menuBackground = MAIN_MENU_LAYOUT.background ?? 'none';
        canvas.dataset.menuErrors = MAIN_MENU_LAYOUT.errors.join(' | ');
        canvas.dataset.worldMenuSource = WORLD_LIST_LAYOUT.source ?? 'fallback';
        canvas.dataset.worldMenuTree = describeMenuLayout(WORLD_LIST_LAYOUT);
        canvas.dataset.worldMenuErrors = WORLD_LIST_LAYOUT.errors.join(' | ');
        canvas.dataset.xmlVars = [
          ...describeComponentVars(WORLD_LIST_LAYOUT.screen),
          ...state.xmlWorldNodes.flatMap((node) => describeComponentVars(node)),
        ].join('|');
        canvas.dataset.worldListItems = state.xmlWorldNodes
          .map((node) => String(node.componentAttrs?.name ?? ''))
          .join('|');
        canvas.dataset.titleButtons = MAIN_MENU_LAYOUT.buttons
          .map((entry) => `${entry.id}:${entry.disabled ? 'disabled' : 'enabled'}`)
          .join(',');
      }
      raf = window.requestAnimationFrame(render);
    };
    raf = window.requestAnimationFrame(render);
    return () => window.cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    const toVirtual = (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      const rect = canvas?.getBoundingClientRect();
      const view = viewRef.current;
      return {
        x: (clientX - (rect?.left ?? 0) - view.offsetX) / view.scale,
        y: (clientY - (rect?.top ?? 0) - view.offsetY) / view.scale,
      };
    };
    const setCursor = (region?: ReturnType<typeof hitRegion>) => {
      if (typeof document === 'undefined') return;
      document.body.style.cursor = region?.cursor ?? (region ? 'pointer' : '');
    };
    const onMouseMove = (event: MouseEvent) => {
      const state = stateRef.current!;
      const point = toVirtual(event.clientX, event.clientY);
      state.pointer = point;
      const region = hitRegion(frameRef.current, point.x, point.y);
      if (region?.id !== state.hover) {
        state.hover = region?.id ?? null;
        region?.onHover?.();
      }
      if (state.drag) {
        const value = sliderValue(state.drag, state.drag.x, state.drag.w, point.x);
        state.drag.onInput(value);
      }
      setCursor(region);
    };
    const onMouseDown = (event: MouseEvent) => {
      const point = toVirtual(event.clientX, event.clientY);
      const region = hitRegion(frameRef.current, point.x, point.y);
      if (!region) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = stateRef.current!;
      if (region.text) {
        state.focus = region.text.id;
        setCursor(region);
        return;
      }
      if (region.slider) {
        const value = sliderValue(region.slider, region.rect.x, region.rect.w, point.x);
        state.drag = {
          min: region.slider.min,
          max: region.slider.max,
          step: region.slider.step,
          x: region.rect.x,
          w: region.rect.w,
          onInput: region.slider.onInput,
        };
        region.slider.onInput(value);
        return;
      }
      if (event.button === 2) {
        region.onRightClick?.(event);
        return;
      }
      if (event.button !== 0) return;
      const now = performance.now();
      if (region.onDoubleClick && state.lastClick?.id === region.id && now - state.lastClick.time < 360) {
        state.lastClick = null;
        region.onDoubleClick();
        return;
      }
      state.lastClick = { id: region.id, time: now };
      region.onMouseDown?.(event);
    };
    const onMouseUp = () => {
      stateRef.current!.drag = null;
    };
    const onWheel = (event: WheelEvent) => {
      const point = toVirtual(event.clientX, event.clientY);
      const area = hitScrollArea(frameRef.current, point.x, point.y);
      if (!area) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const state = stateRef.current!;
      const max = Math.max(0, area.contentHeight - area.rect.h);
      state.scroll[area.id] = clamp((state.scroll[area.id] ?? 0) + Math.sign(event.deltaY) * 14, 0, max);
    };
    const focusedText = () => {
      const state = stateRef.current!;
      return frameRef.current.regions.find((region) => region.text?.id === state.focus)?.text;
    };
    const handleEscape = (event: KeyboardEvent) => {
      const p = propsRef.current;
      const state = stateRef.current!;
      if (p.settingsOpen) {
        event.preventDefault();
        event.stopImmediatePropagation();
        p.onCloseSettings();
        return true;
      }
      if (p.worldModalView) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (state.renamingId) state.renamingId = null;
        else if (state.confirmDeleteId) state.confirmDeleteId = null;
        else if (state.worldView === 'create') state.worldView = 'list';
        else p.onCloseWorldModal();
        return true;
      }
      if (state.focus) {
        state.focus = null;
        event.preventDefault();
        event.stopImmediatePropagation();
        return true;
      }
      return false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      const text = focusedText();
      if (text) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (event.key === 'Escape') {
          stateRef.current!.focus = null;
          return;
        }
        if (event.key === 'Enter') {
          stateRef.current!.focus = null;
          return;
        }
        if (event.key === 'Backspace') {
          text.onChange(text.value.slice(0, -1));
          return;
        }
        if (event.key === 'Delete') {
          text.onChange('');
          return;
        }
        if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
          const max = text.maxLength ?? 64;
          if (text.value.length < max) text.onChange(`${text.value}${event.key}`);
        }
        return;
      }
      if (event.key === 'Escape') handleEscape(event);
    };
    const onPaste = (event: ClipboardEvent) => {
      const text = focusedText();
      if (!text) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      const pasted = event.clipboardData?.getData('text') ?? '';
      const max = text.maxLength ?? 64;
      text.onChange(`${text.value}${pasted}`.slice(0, max));
    };
    const onContextMenu = (event: MouseEvent) => {
      const point = toVirtual(event.clientX, event.clientY);
      const region = hitRegion(frameRef.current, point.x, point.y);
      if (!region) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      region.onRightClick?.(event);
    };

    window.addEventListener('mousemove', onMouseMove, true);
    window.addEventListener('mousedown', onMouseDown, true);
    window.addEventListener('mouseup', onMouseUp, true);
    window.addEventListener('wheel', onWheel, { capture: true, passive: false });
    window.addEventListener('keydown', onKeyDown, true);
    window.addEventListener('paste', onPaste, true);
    window.addEventListener('contextmenu', onContextMenu, true);
    return () => {
      window.removeEventListener('mousemove', onMouseMove, true);
      window.removeEventListener('mousedown', onMouseDown, true);
      window.removeEventListener('mouseup', onMouseUp, true);
      window.removeEventListener('wheel', onWheel, true);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('paste', onPaste, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
      document.body.style.cursor = '';
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 30,
        pointerEvents: 'none',
        imageRendering: 'pixelated',
      }}
    />
  );
}
