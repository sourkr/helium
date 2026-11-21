import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Check,
  Eraser,
  Flame,
  FolderOpen,
  Hammer,
  Moon,
  Play,
  Plus,
  RotateCcw,
  Save,
  Shield,
  Skull,
  SlidersHorizontal,
  Sun,
  Sunrise,
  Sunset,
  Utensils,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  BLOCK_DEFS,
  BUILDABLE_BLOCKS,
  TerrainPreset,
  TimePreset,
} from '../shared/blocks';
import { EngineSettings } from '../client/GameClient';
import {
  countItemInInventory,
  CRAFTING_RECIPES,
  CraftingCategory,
  FurnaceData,
  GameMode,
  getDurabilityBarColor,
  getFuelBurnTime,
  getMaxCraftCount,
  getRecipeGridPreview,
  getSlotDurability,
  getSmeltingRecipe,
  HOTBAR_SIZE,
  InventorySlot,
  ITEM_DEFS,
  ItemType,
  matchCraftingGrid,
  recipeFitsInGridSize,
  SMELTING_RECIPES,
} from '../shared/survival';

interface InventoryModalProps {
  mode: GameMode;
  gridSize: 2 | 3;
  activeItem: ItemType;
  survivalSlots: Array<InventorySlot | null>;
  craftingGrid: Array<InventorySlot | null>;
  itemIcons: Record<number, string>;
  onSelectCreativeItem: (item: ItemType) => void;
  onSwapSurvivalSlots: (fromIdx: number, toIdx: number) => void;
  onPlaceIntoGrid: (invIdx: number, gridIdx: number, count?: number) => void;
  onReturnGridCell: (gridIdx: number) => void;
  onClearGrid: () => void;
  onFillGridFromRecipe: (recipeId: string) => void;
  onCraftFromGrid: (craftAll: boolean) => void;
  onCraftRecipe: (recipeId: string, craftAll: boolean) => void;
  onEatSlot: (slotIdx: number) => void;
  onClose: () => void;
}

const CREATIVE_CATEGORIES: Array<'Natural' | 'Wood & Foliage' | 'Masonry' | 'Specialty'> = [
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

type RecipeTabKey = 'All' | CraftingCategory;

const CRAFT_TABS: Array<{ key: RecipeTabKey; label: string }> = [
  { key: 'All', label: 'All' },
  { key: 'Tools', label: 'Tools & Weapons' },
  { key: 'Materials', label: 'Materials' },
  { key: 'Food & Utility', label: 'Food & Utility' },
];

export const InventoryModal: React.FC<InventoryModalProps> = ({
  mode,
  gridSize,
  activeItem,
  survivalSlots,
  craftingGrid,
  itemIcons,
  onSelectCreativeItem,
  onSwapSurvivalSlots,
  onPlaceIntoGrid,
  onReturnGridCell,
  onClearGrid,
  onFillGridFromRecipe,
  onCraftFromGrid,
  onCraftRecipe,
  onEatSlot,
  onClose,
}) => {
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);
  const [craftTab, setCraftTab] = useState<RecipeTabKey>('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyCraftable, setOnlyCraftable] = useState(false);
  const [inspectedRecipeId, setInspectedRecipeId] = useState<string | null>(null);
  const [recipeBookOpen, setRecipeBookOpen] = useState(true);

  const cellCount = gridSize * gridSize;
  const matchedGridRecipe = useMemo(
    () => matchCraftingGrid(craftingGrid, gridSize),
    [craftingGrid, gridSize],
  );
  const gridHasItems = useMemo(
    () => craftingGrid.slice(0, cellCount).some((c) => c !== null),
    [craftingGrid, cellCount],
  );
  const gridMaxCraftable = useMemo(() => {
    if (!matchedGridRecipe) return 0;
    let minCount = Infinity;
    for (let i = 0; i < cellCount; i++) {
      const c = craftingGrid[i];
      if (c && c.count > 0) minCount = Math.min(minCount, c.count);
    }
    return Number.isFinite(minCount) ? minCount : 0;
  }, [craftingGrid, cellCount, matchedGridRecipe]);

  if (mode === 'creative' && gridSize === 2) {
    return (
      <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#0B1016]/72">
        <div className="w-full max-w-2xl rounded-xl bg-[#161D24] border border-white/15 shadow-[0_18px_56px_rgba(0,0,0,0.65)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/10">
            <div>
              <h2 className="font-display text-lg font-bold text-stone-100">Creative Block &amp; Item Palette</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Click any block or bucket to equip it into your active hotbar slot.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="mc-btn-sm w-9 h-9 flex items-center justify-center cursor-pointer"
              aria-label="Close Block Palette"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 max-h-[70vh] overflow-y-auto space-y-5">
            {CREATIVE_CATEGORIES.map((category) => {
              const blockItems = BUILDABLE_BLOCKS.filter(
                (id) => BLOCK_DEFS[id].category === category,
              ) as unknown as ItemType[];
              const items =
                category === 'Specialty'
                  ? [...blockItems, ...CREATIVE_EXTRA_SPECIALTY]
                  : blockItems;
              if (items.length === 0) return null;

              return (
                <div key={category}>
                  <h3 className="text-xs font-semibold text-stone-400 mb-2.5">{category}</h3>
                  <div className="grid grid-cols-3 sm:grid-cols-5 gap-2">
                    {items.map((itemId) => {
                      const def = ITEM_DEFS[itemId];
                      const selected = itemId === activeItem;
                      const iconSrc = itemIcons[itemId];

                      return (
                        <button
                          key={itemId}
                          type="button"
                          onClick={() => {
                            onSelectCreativeItem(itemId);
                            onClose();
                          }}
                          className={`flex flex-col items-center gap-1.5 p-2.5 rounded-lg border transition-colors cursor-pointer ${
                            selected
                              ? 'bg-[#28343E] border-[#E8DFC8] text-white'
                              : 'bg-[#1D252E] border-white/8 text-stone-200 hover:bg-[#25303B]'
                          }`}
                        >
                          {iconSrc ? (
                            <img
                              src={iconSrc}
                              alt={def?.name ?? 'Item'}
                              className="w-10 h-10 pixelated"
                              draggable={false}
                            />
                          ) : (
                            <span
                              className="w-8 h-8 rounded"
                              style={{ backgroundColor: def?.accentColor ?? '#888' }}
                            />
                          )}
                          <span className="text-xs font-medium truncate max-w-full">
                            {def?.name ?? 'Item'}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Survival Mode: Interactive 3x3 Crafting Table + Backpack + Smart Recipe Book
  const handleSlotClick = (idx: number) => {
    if (selectedSlotIdx === null) {
      if (survivalSlots[idx] !== null) {
        setSelectedSlotIdx(idx);
      }
      return;
    }
    if (selectedSlotIdx === idx) {
      setSelectedSlotIdx(null);
      return;
    }
    onSwapSurvivalSlots(selectedSlotIdx, idx);
    setSelectedSlotIdx(null);
  };

  const handleGridCellClick = (gridIdx: number, shiftKey: boolean) => {
    if (selectedSlotIdx !== null && survivalSlots[selectedSlotIdx]) {
      const slot = survivalSlots[selectedSlotIdx]!;
      const moveAmt = shiftKey ? slot.count : 1;
      onPlaceIntoGrid(selectedSlotIdx, gridIdx, moveAmt);
      if (slot.count <= moveAmt) {
        setSelectedSlotIdx(null);
      }
      return;
    }
    if (craftingGrid[gridIdx] !== null) {
      onReturnGridCell(gridIdx);
    }
  };

  const selectedSlot = selectedSlotIdx !== null ? survivalSlots[selectedSlotIdx] : null;
  const selectedDef = selectedSlot ? ITEM_DEFS[selectedSlot.item] : null;

  const query = searchQuery.trim().toLowerCase();
  const visibleRecipes = CRAFTING_RECIPES.filter((r) => {
    if (craftTab !== 'All' && r.category !== craftTab) return false;
    const fits = recipeFitsInGridSize(r, gridSize);
    if (onlyCraftable && (!fits || getMaxCraftCount(survivalSlots, r) <= 0)) return false;
    if (query) {
      const outName = ITEM_DEFS[r.output.item]?.name.toLowerCase() ?? '';
      const ingMatch = r.ingredients.some((i) =>
        (ITEM_DEFS[i.item]?.name.toLowerCase() ?? '').includes(query),
      );
      if (!r.name.toLowerCase().includes(query) && !outName.includes(query) && !ingMatch) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    const aFits = recipeFitsInGridSize(a, gridSize) ? 1 : 0;
    const bFits = recipeFitsInGridSize(b, gridSize) ? 1 : 0;
    const ca = aFits && getMaxCraftCount(survivalSlots, a) > 0 ? 2 : aFits;
    const cb = bFits && getMaxCraftCount(survivalSlots, b) > 0 ? 2 : bFits;
    return cb - ca;
  });

  const inspectedRecipe =
    CRAFTING_RECIPES.find((r) => r.id === inspectedRecipeId) ?? null;
  const inspectedPreview =
    inspectedRecipe && recipeFitsInGridSize(inspectedRecipe, gridSize)
      ? getRecipeGridPreview(inspectedRecipe, gridSize)
      : null;

  const renderSlotButton = (idx: number, showNum?: number, textured = false) => {
    const slot = survivalSlots[idx];
    const def = slot ? ITEM_DEFS[slot.item] : null;
    const dur = getSlotDurability(slot);
    const isSelected = selectedSlotIdx === idx;
    const iconSrc = slot ? itemIcons[slot.item] : undefined;

    return (
      <button
        key={idx}
        type="button"
        onClick={() => handleSlotClick(idx)}
        title={
          def
            ? dur
              ? `${def.name} (${dur.current}/${dur.max})`
              : `${def.name} (${slot?.count})`
            : 'Empty Slot'
        }
        className={
          textured
            ? `mc-crafting-cell flex items-center justify-center ${
                isSelected ? 'mc-crafting-cell--selected' : ''
              }`
            : `relative w-11 h-11 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                isSelected
                  ? 'bg-[#31404D] ring-2 ring-[#E8DFC8]'
                  : 'bg-[#1D252E] hover:bg-[#26313D] border border-white/10'
              }`
        }
      >
        {showNum !== undefined && !textured && (
          <span className="absolute top-0.5 left-1 text-[9px] font-mono-num text-stone-500 leading-none">
            {showNum}
          </span>
        )}
        {iconSrc && (
          <img
            src={iconSrc}
            alt={def?.name ?? 'Item'}
            className={`${textured ? 'w-8 h-8' : 'w-7 h-7'} pixelated pointer-events-none`}
            draggable={false}
          />
        )}
        {dur && dur.current < dur.max && (
          <div className="absolute bottom-1 left-1.5 right-1.5 h-[3px] bg-[#0B0F14] pointer-events-none">
            <div
              className="h-full"
              style={{
                width: `${Math.max(5, Math.round(dur.ratio * 100))}%`,
                backgroundColor: getDurabilityBarColor(dur.ratio),
              }}
            />
          </div>
        )}
        {slot && slot.count > 1 && (
          <span
            className="absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold text-white leading-none"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
          >
            {slot.count}
          </span>
        )}
      </button>
    );
  };

  const renderGridCell = (gIdx: number, textured = false) => {
    const cell = craftingGrid[gIdx];
    const ghostItem =
      !cell && !gridHasItems && inspectedPreview ? inspectedPreview[gIdx] : null;
    const iconSrc = cell
      ? itemIcons[cell.item]
      : ghostItem !== null
        ? itemIcons[ghostItem]
        : undefined;
    const cellDef = cell
      ? ITEM_DEFS[cell.item]
      : ghostItem !== null
        ? ITEM_DEFS[ghostItem]
        : null;

    return (
      <button
        key={gIdx}
        type="button"
        onClick={(e) => handleGridCellClick(gIdx, e.shiftKey)}
        onContextMenu={(e) => {
          e.preventDefault();
          if (cell) onReturnGridCell(gIdx);
        }}
        title={
          cell
            ? `${cellDef?.name} (${cell.count}) — Click to return`
            : selectedDef
              ? `Place ${selectedDef.name} here`
              : 'Empty crafting slot'
        }
        className={
          textured
            ? 'mc-crafting-cell relative flex items-center justify-center cursor-pointer'
            : `relative w-12 h-12 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
                selectedSlot
                  ? 'bg-[#1D2832] hover:bg-[#293845] border border-[#96D86E]/35'
                  : 'bg-[#1B222B] hover:bg-[#242E39] border border-white/12'
              }`
        }
      >
        {iconSrc && (
          <img
            src={iconSrc}
            alt={cellDef?.name ?? 'Ingredient'}
            className={`w-8 h-8 pixelated pointer-events-none ${cell ? 'opacity-100' : 'opacity-30'}`}
            draggable={false}
          />
        )}
        {cell && cell.count > 1 && (
          <span
            className="absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold text-white leading-none"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
          >
            {cell.count}
          </span>
        )}
      </button>
    );
  };

  const renderOutputButton = (textured = false) => (
    <button
      type="button"
      disabled={!matchedGridRecipe}
      onClick={() => onCraftFromGrid(false)}
      title={
        matchedGridRecipe
          ? `Click to craft ${matchedGridRecipe.name}`
          : 'Arrange ingredients to craft'
      }
      className={
        textured
          ? `mc-crafting-output flex items-center justify-center ${
              matchedGridRecipe ? 'cursor-pointer' : 'cursor-default'
            }`
          : `relative w-14 h-14 rounded-lg flex items-center justify-center border transition-colors ${
              matchedGridRecipe
                ? 'bg-[#223225] border-[#96D86E] hover:bg-[#2A3F2D] cursor-pointer shadow-[0_0_16px_rgba(92,160,58,0.28)]'
                : 'bg-[#182028] border-white/10 cursor-default'
            }`
      }
    >
      {matchedGridRecipe && itemIcons[matchedGridRecipe.output.item] ? (
        <img
          src={itemIcons[matchedGridRecipe.output.item]}
          alt={matchedGridRecipe.name}
          className="w-9 h-9 pixelated pointer-events-none"
          draggable={false}
        />
      ) : null}
      {matchedGridRecipe && matchedGridRecipe.output.count > 1 && (
        <span
          className="absolute bottom-1 right-1.5 text-xs font-mono-num font-bold text-white leading-none"
          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
        >
          {matchedGridRecipe.output.count}
        </span>
      )}
    </button>
  );

  const renderCraftStatus = () => (
    <div className="text-center">
      <div className="text-xs font-bold text-stone-100 min-h-[16px]">
        {matchedGridRecipe ? matchedGridRecipe.name : 'No recipe matched'}
      </div>
      {matchedGridRecipe && (
        <div className="mt-1.5 flex items-center justify-center gap-1.5">
          <button
            type="button"
            onClick={() => onCraftFromGrid(false)}
            className="mc-btn-sm px-3 py-1 text-[11px] font-bold cursor-pointer whitespace-nowrap"
          >
            Craft ×1
          </button>
          {gridMaxCraftable > 1 && (
            <button
              type="button"
              onClick={() => onCraftFromGrid(true)}
              className="mc-btn-sm px-3 py-1 text-[11px] font-bold cursor-pointer whitespace-nowrap"
            >
              All ×{gridMaxCraftable}
            </button>
          )}
        </div>
      )}
    </div>
  );

  const renderBenchHeader = () => (
    <div className="flex items-center justify-between mb-3">
      <span className="text-xs font-semibold text-stone-200">
        {gridSize === 3 ? '3×3 Crafting Grid' : '2×2 Pocket Grid'}
      </span>
      <div className="flex items-center gap-2">
        {inspectedRecipe && !gridHasItems && (
          <span className="text-[11px] text-stone-400">
            {recipeFitsInGridSize(inspectedRecipe, gridSize)
              ? `Previewing ${inspectedRecipe.name}`
              : 'Requires 3×3 Crafting Table'}
          </span>
        )}
        {gridHasItems && (
          <button
            type="button"
            onClick={onClearGrid}
            className="mc-btn-sm flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold cursor-pointer"
          >
            <Eraser className="w-3 h-3" />
            <span>Clear</span>
          </button>
        )}
      </div>
    </div>
  );

  const renderSelectionBar = () => (
    <div className="flex items-center justify-between min-h-[26px]">
      <span className="text-xs font-semibold text-stone-300">
        {selectedDef
          ? `Selected: ${selectedDef.name} — click slot to swap or ${gridSize}×${gridSize} cell to place`
          : 'Inventory Slots'}
      </span>
      {selectedSlotIdx !== null && selectedDef?.foodRestore && (
        <button
          type="button"
          onClick={() => {
            onEatSlot(selectedSlotIdx);
            setSelectedSlotIdx(null);
          }}
          className="mc-btn-sm flex items-center gap-1.5 px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap"
        >
          <Utensils className="w-3 h-3 text-[#E8C574]" />
          <span>Eat (+{selectedDef.foodRestore})</span>
        </button>
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#0B1016]/74">
      {gridSize === 3 && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close crafting table"
          title="Close crafting table"
          className="absolute right-5 top-5 w-9 h-9 rounded-md bg-[#12181F]/85 hover:bg-[#1E2731]/95 border border-white/15 text-stone-100 flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      <div
        className={
          gridSize === 3
            ? 'contents'
            : 'w-full max-w-5xl rounded-xl bg-[#161D24] border border-white/15 shadow-[0_18px_56px_rgba(0,0,0,0.68)] overflow-hidden'
        }
      >
        {/* Header */}
        <div
          className={
            gridSize === 3
              ? 'hidden'
              : 'flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/10'
          }
        >
          <div>
            <h2 className="font-display text-lg font-bold text-stone-100">
              {gridSize === 3 ? 'Crafting Table (3×3)' : 'Pocket Crafting (2×2) & Backpack'}
            </h2>
            <p className="text-xs text-stone-400 mt-0.5">
              {gridSize === 3
                ? 'Select a slot then click the 3×3 grid to place ingredients (Shift+Click for full stack), or click Fill / Craft in the Recipe Book.'
                : 'Craft planks, sticks, and a Crafting Table in your 2×2 grid. Place and right-click a Crafting Table for 3×3 tools and Furnace.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mc-btn-sm px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Done</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div
          className={
            gridSize === 3
              ? 'flex flex-wrap items-start justify-center gap-1'
              : 'grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10 max-h-[80vh] overflow-y-auto'
          }
        >
          {/* Crafting Grid + Inventory (right side in 3x3 view) */}
          <div className={gridSize === 3 ? 'order-2 flex flex-col items-center' : 'lg:col-span-6 p-5'}>
            {gridSize === 3 ? (
              <div className="flex flex-col items-center gap-2">
                <div className="mc-crafting-surface">
                  <button
                    type="button"
                    className="mc-recipe-book-toggle"
                    data-active={recipeBookOpen ? 'true' : undefined}
                    onClick={() => setRecipeBookOpen((v) => !v)}
                    title={recipeBookOpen ? 'Hide Recipe Book' : 'Show Recipe Book'}
                    aria-label={recipeBookOpen ? 'Hide Recipe Book' : 'Show Recipe Book'}
                  />

                  <div className="mc-crafting-surface__grid">
                    {Array.from({ length: cellCount }, (_, gIdx) => renderGridCell(gIdx, true))}
                  </div>
                  {renderOutputButton(true)}

                  <div className="mc-crafting-inventory mc-crafting-inventory--main">
                    {Array.from({ length: 18 }, (_, i) =>
                      renderSlotButton(HOTBAR_SIZE + i, undefined, true),
                    )}
                  </div>
                  <div className="mc-crafting-inventory mc-crafting-inventory--hotbar">
                    {Array.from({ length: HOTBAR_SIZE }, (_, i) =>
                      renderSlotButton(i, undefined, true),
                    )}
                  </div>
                </div>

                <div className="flex items-center justify-center gap-2">
                  {gridHasItems && (
                    <button
                      type="button"
                      onClick={onClearGrid}
                      className="mc-btn-sm flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold cursor-pointer"
                    >
                      <Eraser className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  )}
                  {selectedSlotIdx !== null && selectedDef?.foodRestore && (
                    <button
                      type="button"
                      onClick={() => {
                        onEatSlot(selectedSlotIdx);
                        setSelectedSlotIdx(null);
                      }}
                      className="mc-btn-sm flex items-center gap-1.5 px-3 py-1 text-xs font-bold cursor-pointer whitespace-nowrap"
                    >
                      <Utensils className="w-3 h-3 text-[#E8C574]" />
                      <span>Eat (+{selectedDef.foodRestore})</span>
                    </button>
                  )}
                </div>

                {renderCraftStatus()}
              </div>
            ) : (
              <div className="space-y-5">
                <div className="p-3.5 rounded-lg bg-[#11171D] border border-white/10">
                  {renderBenchHeader()}
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div className="grid grid-cols-2 gap-1.5">
                      {Array.from({ length: cellCount }, (_, gIdx) => renderGridCell(gIdx))}
                    </div>

                    <ArrowRight className="w-5 h-5 text-stone-500 shrink-0" />

                    <div className="flex-1 min-w-[140px] flex flex-col items-center gap-2">
                      {renderOutputButton()}
                      {renderCraftStatus()}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  {renderSelectionBar()}

                  <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
                    {Array.from({ length: 18 }, (_, i) => renderSlotButton(HOTBAR_SIZE + i))}
                  </div>

                  <div className="pt-2.5 border-t border-white/10">
                    <div className="text-xs font-semibold text-stone-400 mb-2">Hotbar (1–9)</div>
                    <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
                      {Array.from({ length: HOTBAR_SIZE }, (_, i) => renderSlotButton(i, i + 1))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Recipe Book (left side in 3x3 view) */}
          {(gridSize !== 3 || recipeBookOpen) && (
          <div className={gridSize === 3 ? 'order-1' : 'lg:col-span-6 flex justify-center p-5'}>
            <div className="mc-recipe-book self-start">
              <div className="mc-recipe-book__content">
                {/* Search & Craftable Toggle */}
            <div className="mc-recipe-book__search">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search..."
                aria-label="Search recipes"
                className="mc-recipe-book__search-input"
              />
              <button
                type="button"
                data-active={onlyCraftable ? 'true' : undefined}
                onClick={() => setOnlyCraftable((v) => !v)}
                title="Show only craftable recipes"
                aria-label="Show only craftable recipes"
                aria-pressed={onlyCraftable}
                className="mc-recipe-filter-toggle shrink-0"
              />
            </div>

            <div className="mc-recipe-book__body">
              {/* Category Tabs */}
              <div className="mc-recipe-book__tabs">
                {CRAFT_TABS.map((tab) => {
                const allIcon = tab.key === 'All' ? itemIcons[ItemType.Compass] : null;
                const toolIcons =
                  tab.key === 'Tools'
                    ? [itemIcons[ItemType.IronAxe], itemIcons[ItemType.GoldSword]].filter(
                        (icon): icon is string => Boolean(icon),
                      )
                    : [];
                const hasIcons = tab.key === 'All' || tab.key === 'Tools';
                return (
                  <button
                    key={tab.key}
                    type="button"
                    data-active={craftTab === tab.key ? 'true' : undefined}
                    onClick={() => setCraftTab(tab.key)}
                    title={tab.label}
                    aria-label={tab.label}
                    className={`mc-btn-sm mc-recipe-tab flex flex-1 items-center justify-center px-2 py-1.5 text-xs font-bold whitespace-nowrap cursor-pointer${
                      hasIcons ? ' mc-recipe-tab--icons' : ''
                    }`}
                  >
                    {tab.key === 'All' && allIcon ? (
                      <img
                        src={allIcon}
                        alt=""
                        aria-hidden="true"
                        className="mc-recipe-tab__compass"
                        draggable={false}
                      />
                    ) : tab.key === 'Tools' && toolIcons.length > 0 ? (
                      <span className="mc-recipe-tab__tool-icons">
                        {toolIcons.map((src, index) => (
                          <img
                            key={`${src}-${index}`}
                            src={src}
                            alt=""
                            aria-hidden="true"
                            className="mc-recipe-tab__tool-icon"
                            draggable={false}
                          />
                        ))}
                      </span>
                    ) : (
                      tab.label
                    )}
                  </button>
                );
              })}
              </div>

              <div className="mc-recipe-book__main">
                {/* Recipe Slots */}
                <div className="mc-recipe-book__list flex-1 min-h-0 overflow-y-auto pr-1">
                  {visibleRecipes.length === 0 ? (
                    <div className="py-10 text-center text-xs text-stone-400">
                      No recipes match your current filter.
                    </div>
                  ) : (
                    <div className="grid grid-cols-4 gap-2">
                      {visibleRecipes.map((recipe) => {
                        const fitsGrid = recipeFitsInGridSize(recipe, gridSize);
                        const maxCraft = getMaxCraftCount(survivalSlots, recipe);
                        const craftable = fitsGrid && maxCraft > 0;
                        const outIcon = itemIcons[recipe.output.item];
                        const isInspected = inspectedRecipeId === recipe.id;
                        const slotClass = craftable
                          ? maxCraft > 1
                            ? 'mc-recipe-slot--many-craftable'
                            : 'mc-recipe-slot--craftable'
                          : !fitsGrid
                            ? 'mc-recipe-slot--many-uncraftable'
                            : 'mc-recipe-slot--uncraftable';
                        const ingredientText = recipe.ingredients
                          .map(
                            (ing) =>
                              `${ITEM_DEFS[ing.item as ItemType]?.name ?? ing.item} ${countItemInInventory(survivalSlots, ing.item)}/${ing.count}`,
                          )
                          .join(', ');

                        return (
                          <div key={recipe.id} className="flex flex-col items-center gap-0.5">
                            <button
                              type="button"
                              onMouseEnter={() => setInspectedRecipeId(recipe.id)}
                              onFocus={() => setInspectedRecipeId(recipe.id)}
                              onClick={() => {
                                if (craftable) onFillGridFromRecipe(recipe.id);
                              }}
                              title={`${recipe.name} — ${ingredientText}${
                                craftable ? '' : ' (uncraftable)'
                              }`}
                              className={`mc-recipe-slot ${slotClass} w-full aspect-square flex items-center justify-center ${
                                isInspected ? 'mc-recipe-slot--inspected' : ''
                              }`}
                            >
                              {outIcon ? (
                                <img
                                  src={outIcon}
                                  alt={recipe.name}
                                  className="w-[68%] h-[68%] pixelated"
                                  draggable={false}
                                />
                              ) : null}
                            </button>
                            <span className="w-full text-center text-[9px] leading-tight text-stone-300 truncate">
                              {recipe.name}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {inspectedRecipe &&
                  recipeFitsInGridSize(inspectedRecipe, gridSize) &&
                  getMaxCraftCount(survivalSlots, inspectedRecipe) > 0 && (
                    <div className="flex items-center gap-1.5 border-t border-white/10 pt-2 flex-wrap">
                      <span className="text-[10px] font-bold text-stone-200 truncate max-w-[92px]">
                        {inspectedRecipe.name}
                      </span>
                      <button
                        type="button"
                        onClick={() => onCraftRecipe(inspectedRecipe.id, false)}
                        className="mc-btn-sm px-2.5 py-1 text-[11px] font-bold cursor-pointer"
                      >
                        Craft
                      </button>
                      {getMaxCraftCount(survivalSlots, inspectedRecipe) > 1 && (
                        <button
                          type="button"
                          onClick={() => onCraftRecipe(inspectedRecipe.id, true)}
                          className="mc-btn-sm px-2 py-1 text-[11px] font-bold font-mono-num cursor-pointer"
                        >
                          ×{getMaxCraftCount(survivalSlots, inspectedRecipe)}
                        </button>
                      )}
                    </div>
                  )}
              </div>
            </div>
              </div>
            </div>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

interface FurnaceModalProps {
  furnace: FurnaceData;
  survivalSlots: Array<InventorySlot | null>;
  itemIcons: Record<number, string>;
  onSwapSurvivalSlots: (fromIdx: number, toIdx: number) => void;
  onPlaceIntoFurnace: (invIdx: number, slot: 'input' | 'fuel', count?: number) => void;
  onTakeFurnaceSlot: (slot: 'input' | 'fuel' | 'output') => void;
  onQuickLoadSlot: (invIdx: number, fullStack: boolean) => void;
  onQuickLoadRecipe: (inputItem: ItemType) => void;
  onClose: () => void;
}

export const FurnaceModal: React.FC<FurnaceModalProps> = ({
  furnace,
  survivalSlots,
  itemIcons,
  onSwapSurvivalSlots,
  onPlaceIntoFurnace,
  onTakeFurnaceSlot,
  onQuickLoadSlot,
  onQuickLoadRecipe,
  onClose,
}) => {
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);

  const selectedSlot = selectedSlotIdx !== null ? survivalSlots[selectedSlotIdx] : null;
  const selectedDef = selectedSlot ? ITEM_DEFS[selectedSlot.item] : null;
  const selectedCanSmelt = selectedSlot ? getSmeltingRecipe(selectedSlot.item) !== null : false;
  const selectedIsFuel = selectedSlot ? getFuelBurnTime(selectedSlot.item) > 0 : false;

  const burnRatio =
    furnace.burnTotal > 0 ? Math.max(0, Math.min(1, furnace.burnTime / furnace.burnTotal)) : 0;
  const cookRatio =
    furnace.cookTotal > 0 ? Math.max(0, Math.min(1, furnace.cookTime / furnace.cookTotal)) : 0;
  const isBurning = furnace.burnTime > 0;

  const handleInventoryClick = (idx: number, shiftKey: boolean) => {
    if (shiftKey && survivalSlots[idx] !== null) {
      onQuickLoadSlot(idx, true);
      if (selectedSlotIdx === idx) setSelectedSlotIdx(null);
      return;
    }
    if (selectedSlotIdx === null) {
      if (survivalSlots[idx] !== null) {
        setSelectedSlotIdx(idx);
      }
      return;
    }
    if (selectedSlotIdx === idx) {
      setSelectedSlotIdx(null);
      return;
    }
    onSwapSurvivalSlots(selectedSlotIdx, idx);
    setSelectedSlotIdx(null);
  };

  const handleFurnaceSlotClick = (slot: 'input' | 'fuel', shiftKey: boolean) => {
    if (selectedSlotIdx !== null && survivalSlots[selectedSlotIdx]) {
      const src = survivalSlots[selectedSlotIdx]!;
      const amt = shiftKey ? src.count : 1;
      onPlaceIntoFurnace(selectedSlotIdx, slot, amt);
      if (src.count <= amt) {
        setSelectedSlotIdx(null);
      }
      return;
    }
    if (furnace[slot] !== null) {
      onTakeFurnaceSlot(slot);
    }
  };

  const renderSlotButton = (idx: number, showNum?: number) => {
    const slot = survivalSlots[idx];
    const def = slot ? ITEM_DEFS[slot.item] : null;
    const dur = getSlotDurability(slot);
    const isSelected = selectedSlotIdx === idx;
    const iconSrc = slot ? itemIcons[slot.item] : undefined;

    return (
      <button
        key={idx}
        type="button"
        onClick={(e) => handleInventoryClick(idx, e.shiftKey)}
        title={
          def
            ? dur
              ? `${def.name} (${dur.current}/${dur.max}) — Click to select`
              : `${def.name} (${slot?.count}) — Click to select, Shift+Click to load`
            : 'Empty Slot'
        }
        className={`relative w-11 h-11 rounded-md flex items-center justify-center transition-colors cursor-pointer ${
          isSelected
            ? 'bg-[#31404D] ring-2 ring-[#E8DFC8]'
            : 'bg-[#1D252E] hover:bg-[#26313D] border border-white/10'
        }`}
      >
        {showNum !== undefined && (
          <span className="absolute top-0.5 left-1 text-[9px] font-mono-num text-stone-500 leading-none">
            {showNum}
          </span>
        )}
        {iconSrc && (
          <img
            src={iconSrc}
            alt={def?.name ?? 'Item'}
            className="w-7 h-7 pixelated pointer-events-none"
            draggable={false}
          />
        )}
        {dur && dur.current < dur.max && (
          <div className="absolute bottom-1 left-1.5 right-1.5 h-[3px] bg-[#0B0F14] pointer-events-none">
            <div
              className="h-full"
              style={{
                width: `${Math.max(5, Math.round(dur.ratio * 100))}%`,
                backgroundColor: getDurabilityBarColor(dur.ratio),
              }}
            />
          </div>
        )}
        {slot && slot.count > 1 && (
          <span
            className="absolute bottom-0.5 right-1 text-[10px] font-mono-num font-bold text-white leading-none"
            style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
          >
            {slot.count}
          </span>
        )}
      </button>
    );
  };

  const inputDef = furnace.input ? ITEM_DEFS[furnace.input.item] : null;
  const fuelDef = furnace.fuel ? ITEM_DEFS[furnace.fuel.item] : null;
  const outputDef = furnace.output ? ITEM_DEFS[furnace.output.item] : null;

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#0B1016]/74">
      <div className="w-full max-w-5xl rounded-xl bg-[#161D24] border border-white/15 shadow-[0_18px_56px_rgba(0,0,0,0.68)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-4 px-5 py-3.5 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <Flame
              className={`w-5 h-5 shrink-0 ${
                isBurning ? 'text-[#FF9838]' : 'text-stone-500'
              }`}
            />
            <div>
              <h2 className="font-display text-lg font-bold text-stone-100">Furnace</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Load smeltable ore, food, sand, or stone on top and Coal or wood below. Shift+Click inventory slots to quick-load.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mc-btn-sm px-4 py-1.5 text-xs font-bold flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
          >
            <span>Done</span>
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-white/10 max-h-[80vh] overflow-y-auto">
          {/* Left Column: Smelting Chamber + Backpack + Hotbar */}
          <div className="lg:col-span-6 p-5 space-y-5">
            <div className="p-4 rounded-lg bg-[#11171D] border border-white/10">
              <div className="flex items-center justify-between mb-4">
                <span className="text-xs font-semibold text-stone-200">Smelting Hearth</span>
                <span className="text-[11px] font-mono-num text-stone-400">
                  {isBurning
                    ? `Burning · ${Math.ceil(furnace.burnTime)}s fuel left`
                    : 'Idle · Add fuel to ignite'}
                </span>
              </div>

              <div className="flex items-center justify-around gap-4 py-1">
                {/* Input + Flame + Fuel Stack */}
                <div className="flex flex-col items-center gap-2.5">
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-[10px] font-semibold text-stone-400">Input</span>
                    <button
                      type="button"
                      onClick={(e) => handleFurnaceSlotClick('input', e.shiftKey)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (furnace.input) onTakeFurnaceSlot('input');
                      }}
                      title={
                        furnace.input
                          ? `${inputDef?.name} (${furnace.input.count}) — Click to remove`
                          : selectedCanSmelt
                            ? `Load ${selectedDef?.name} (Shift+Click for full stack)`
                            : 'Smeltable input slot'
                      }
                      className={`relative w-14 h-14 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                        selectedCanSmelt
                          ? 'bg-[#22303D] border border-[#96D86E]/55 hover:bg-[#2B3D4D]'
                          : 'bg-[#1B222B] border border-white/15 hover:bg-[#242E39]'
                      }`}
                    >
                      {furnace.input && itemIcons[furnace.input.item] && (
                        <img
                          src={itemIcons[furnace.input.item]}
                          alt={inputDef?.name ?? 'Input'}
                          className="w-9 h-9 pixelated pointer-events-none"
                          draggable={false}
                        />
                      )}
                      {furnace.input && furnace.input.count > 1 && (
                        <span
                          className="absolute bottom-1 right-1.5 text-xs font-mono-num font-bold text-white leading-none"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                        >
                          {furnace.input.count}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Live Flame Indicator */}
                  <div className="flex flex-col items-center gap-1">
                    <div className="relative w-7 h-7 flex items-center justify-center">
                      <Flame className="w-6 h-6 text-stone-700" />
                      {burnRatio > 0 && (
                        <div
                          className="absolute bottom-0 left-0 right-0 overflow-hidden flex items-end justify-center"
                          style={{ height: `${Math.max(15, burnRatio * 100)}%` }}
                        >
                          <Flame className="w-6 h-6 text-[#FF9838] fill-[#FF6B2B] shrink-0" />
                        </div>
                      )}
                    </div>
                    <div className="w-12 h-1.5 rounded-full bg-[#1C232B] overflow-hidden">
                      <div
                        className="h-full bg-[#FF8A2B] transition-[width] duration-75"
                        style={{ width: `${burnRatio * 100}%` }}
                      />
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-1">
                    <button
                      type="button"
                      onClick={(e) => handleFurnaceSlotClick('fuel', e.shiftKey)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (furnace.fuel) onTakeFurnaceSlot('fuel');
                      }}
                      title={
                        furnace.fuel
                          ? `${fuelDef?.name} (${furnace.fuel.count}) — Click to remove`
                          : selectedIsFuel
                            ? `Load ${selectedDef?.name} as fuel (Shift+Click for full stack)`
                            : 'Fuel slot (Coal, Logs, Planks, Wooden Tools, Sticks)'
                      }
                      className={`relative w-14 h-14 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                        selectedIsFuel
                          ? 'bg-[#31261C] border border-[#FF9838]/60 hover:bg-[#3F3123]'
                          : 'bg-[#1B222B] border border-white/15 hover:bg-[#242E39]'
                      }`}
                    >
                      {furnace.fuel && itemIcons[furnace.fuel.item] && (
                        <img
                          src={itemIcons[furnace.fuel.item]}
                          alt={fuelDef?.name ?? 'Fuel'}
                          className="w-9 h-9 pixelated pointer-events-none"
                          draggable={false}
                        />
                      )}
                      {furnace.fuel && furnace.fuel.count > 1 && (
                        <span
                          className="absolute bottom-1 right-1.5 text-xs font-mono-num font-bold text-white leading-none"
                          style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                        >
                          {furnace.fuel.count}
                        </span>
                      )}
                    </button>
                    <span className="text-[10px] font-semibold text-stone-400">Fuel</span>
                  </div>
                </div>

                {/* Live Smelting Progress Arrow */}
                <div className="flex flex-col items-center gap-2 flex-1 max-w-[110px]">
                  <div className="w-full h-3 rounded-full bg-[#1C232B] border border-white/10 overflow-hidden">
                    <div
                      className="h-full bg-[#F5B041] transition-[width] duration-75"
                      style={{ width: `${cookRatio * 100}%` }}
                    />
                  </div>
                  <div className="flex items-center gap-1 text-[11px] font-mono-num text-stone-400">
                    <ArrowRight className="w-4 h-4 text-stone-500" />
                    <span>{Math.round(cookRatio * 100)}%</span>
                  </div>
                </div>

                {/* Output Slot */}
                <div className="flex flex-col items-center gap-2">
                  <span className="text-[10px] font-semibold text-stone-400">Output</span>
                  <button
                    type="button"
                    disabled={!furnace.output}
                    onClick={() => onTakeFurnaceSlot('output')}
                    title={
                      furnace.output
                        ? `Collect ${outputDef?.name} ×${furnace.output.count}`
                        : 'Smelted items appear here'
                    }
                    className={`relative w-16 h-16 rounded-lg flex items-center justify-center border transition-colors ${
                      furnace.output
                        ? 'bg-[#223225] border-[#96D86E] hover:bg-[#2A3F2D] cursor-pointer shadow-[0_0_16px_rgba(92,160,58,0.28)]'
                        : 'bg-[#182028] border-white/10 cursor-default'
                    }`}
                  >
                    {furnace.output && itemIcons[furnace.output.item] && (
                      <img
                        src={itemIcons[furnace.output.item]}
                        alt={outputDef?.name ?? 'Output'}
                        className="w-10 h-10 pixelated pointer-events-none"
                        draggable={false}
                      />
                    )}
                    {furnace.output && furnace.output.count > 1 && (
                      <span
                        className="absolute bottom-1 right-1.5 text-xs font-mono-num font-bold text-white leading-none"
                        style={{ textShadow: '0 1px 2px rgba(0,0,0,0.95)' }}
                      >
                        {furnace.output.count}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    disabled={!furnace.output}
                    onClick={() => onTakeFurnaceSlot('output')}
                    className="mc-btn-sm px-3 py-1 text-[11px] font-bold cursor-pointer whitespace-nowrap"
                  >
                    Collect
                  </button>
                </div>
              </div>
            </div>

            {/* Backpack & Hotbar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between min-h-[22px]">
                <span className="text-xs font-semibold text-stone-300">
                  {selectedDef
                    ? `Selected: ${selectedDef.name} — click Input, Fuel, or another slot`
                    : 'Backpack Storage (Shift+Click to quick-load)'}
                </span>
              </div>

              <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
                {Array.from({ length: 18 }, (_, i) => renderSlotButton(HOTBAR_SIZE + i))}
              </div>

              <div className="pt-2.5 border-t border-white/10">
                <div className="text-xs font-semibold text-stone-400 mb-2">Hotbar (1–9)</div>
                <div className="grid grid-cols-6 sm:grid-cols-9 gap-1.5">
                  {Array.from({ length: HOTBAR_SIZE }, (_, i) => renderSlotButton(i, i + 1))}
                </div>
              </div>
            </div>
          </div>

          {/* Right Column: Smelting Recipes & Fuel Reference */}
          <div className="lg:col-span-6 p-5 flex flex-col justify-between gap-4">
            <div className="space-y-2.5">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-stone-300">Smelting Recipes</h3>
                <span className="text-[11px] text-stone-500">Click Load to auto-fill</span>
              </div>

              <div className="space-y-2 max-h-[410px] overflow-y-auto pr-1">
                {SMELTING_RECIPES.map((recipe) => {
                  const have = countItemInInventory(survivalSlots, recipe.input);
                  const inIcon = itemIcons[recipe.input];
                  const outIcon = itemIcons[recipe.output.item];
                  const inDef = ITEM_DEFS[recipe.input];
                  const outDef = ITEM_DEFS[recipe.output.item];

                  return (
                    <div
                      key={recipe.id}
                      className={`flex items-center justify-between gap-2.5 p-2.5 rounded-lg border ${
                        have > 0
                          ? 'bg-[#1D2731] border-[#96D86E]/30'
                          : 'bg-[#181F27] border-white/8 opacity-75'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center gap-1.5 shrink-0">
                          <div className="w-9 h-9 rounded bg-[#11171D] border border-white/10 flex items-center justify-center">
                            {inIcon && (
                              <img
                                src={inIcon}
                                alt={inDef?.name ?? 'Input'}
                                className="w-6 h-6 pixelated"
                                draggable={false}
                              />
                            )}
                          </div>
                          <ArrowRight className="w-3.5 h-3.5 text-stone-500" />
                          <div className="w-9 h-9 rounded bg-[#11171D] border border-white/10 flex items-center justify-center">
                            {outIcon && (
                              <img
                                src={outIcon}
                                alt={outDef?.name ?? 'Output'}
                                className="w-6 h-6 pixelated"
                                draggable={false}
                              />
                            )}
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="text-xs font-bold text-stone-100 truncate">
                            {outDef?.name}
                          </div>
                          <div className="text-[11px] text-stone-400 font-mono-num">
                            {inDef?.name} ({have}) · {recipe.cookSeconds.toFixed(1)}s
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        disabled={have <= 0}
                        onClick={() => onQuickLoadRecipe(recipe.input)}
                        className="mc-btn-sm px-3 py-1 text-xs font-bold whitespace-nowrap cursor-pointer shrink-0"
                      >
                        Load
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-[#11171D] border border-white/10 text-xs text-stone-400">
              <div className="font-semibold text-stone-200 mb-1">Accepted Fuels</div>
              <div className="font-mono-num text-[11px]">
                Coal (40s) · Oak/Birch Log (15s) · Planks (12s) · Wooden Tools (10s) · Stick (6s)
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

interface PauseModalProps {
  worldName: string;
  worldCount: number;
  currentMode: GameMode;
  currentSeed: number;
  currentPreset: TerrainPreset;
  editCount: number;
  onSelectMode: (mode: GameMode) => void;
  onResume: () => void;
  onSetTime: (preset: TimePreset) => void;
  onSaveNow: () => Promise<void>;
  onOpenWorlds: () => void;
  onOpenNewWorld: () => void;
  onOpenSettings: () => void;
  onResetEdits: () => void;
  onReturnTitle: () => void;
}

const PRESET_LABELS: Record<TerrainPreset, string> = {
  meadows: 'Meadows',
  alpine: 'Alpine Peaks',
  archipelago: 'Archipelago',
  mesa: 'Mesa Canyon',
};

const TIME_OPTIONS: Array<{
  id: TimePreset;
  label: string;
  Icon: React.FC<{ className?: string }>;
}> = [
  { id: 'dawn', label: 'Dawn', Icon: Sunrise },
  { id: 'noon', label: 'Noon', Icon: Sun },
  { id: 'sunset', label: 'Sunset', Icon: Sunset },
  { id: 'night', label: 'Night', Icon: Moon },
];

export const PauseModal: React.FC<PauseModalProps> = ({
  worldName,
  worldCount,
  currentMode,
  currentSeed,
  currentPreset,
  editCount,
  onSelectMode,
  onResume,
  onSetTime,
  onSaveNow,
  onOpenWorlds,
  onOpenNewWorld,
  onOpenSettings,
  onResetEdits,
  onReturnTitle,
}) => {
  const [justSaved, setJustSaved] = useState(false);

  const handleManualSave = async () => {
    await onSaveNow();
    setJustSaved(true);
    window.setTimeout(() => setJustSaved(false), 1800);
  };

  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center p-4 bg-[#0B1016]/72">
      <div className="w-full max-w-lg rounded-xl bg-[#161D24] border border-white/15 shadow-[0_18px_56px_rgba(0,0,0,0.65)] overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-stone-100 truncate">{worldName}</h2>
            <p className="text-xs text-stone-400 mt-0.5 font-mono-num">
              {PRESET_LABELS[currentPreset]} · Seed {currentSeed} · {editCount} edits
            </p>
          </div>
          <button
            type="button"
            onClick={onResume}
            className="mc-btn flex items-center gap-2 px-4 py-1.5 text-sm font-bold cursor-pointer whitespace-nowrap shrink-0"
          >
            <Play className="w-4 h-4 fill-current text-[#96D86E]" />
            <span>Resume</span>
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Worlds & OPFS Save Actions */}
          <div>
            <h3 className="text-xs font-semibold text-stone-400 mb-2">Worlds &amp; Storage</h3>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={handleManualSave}
                className="mc-btn flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                {justSaved ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-[#96D86E]" />
                    <span className="text-[#96D86E]">Saved</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5 text-[#96D86E]" />
                    <span>Save Now</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={onOpenWorlds}
                className="mc-btn flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <FolderOpen className="w-3.5 h-3.5 text-[#E8C574]" />
                <span>Worlds ({worldCount})</span>
              </button>
              <button
                type="button"
                onClick={onOpenNewWorld}
                className="mc-btn flex items-center justify-center gap-1.5 py-2 px-2.5 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-[#96D86E]" />
                <span>New World</span>
              </button>
            </div>
          </div>

          {/* Game Mode Switcher */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="text-xs font-semibold text-stone-400 mb-2">Game Mode</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                data-active={currentMode === 'survival' ? 'true' : undefined}
                onClick={() => onSelectMode('survival')}
                className="mc-btn flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold cursor-pointer"
              >
                <Shield className="w-3.5 h-3.5 text-[#EB8B7B]" />
                <span>Survival</span>
              </button>
              <button
                type="button"
                data-active={currentMode === 'creative' ? 'true' : undefined}
                onClick={() => onSelectMode('creative')}
                className="mc-btn flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold cursor-pointer"
              >
                <Hammer className="w-3.5 h-3.5 text-[#E8C574]" />
                <span>Creative</span>
              </button>
            </div>
          </div>

          {/* Time of Day */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="text-xs font-semibold text-stone-400 mb-2">Time of Day</h3>
            <div className="grid grid-cols-4 gap-1.5">
              {TIME_OPTIONS.map(({ id, label, Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => onSetTime(id)}
                  className="mc-btn-sm flex items-center justify-center gap-1.5 py-1.5 px-2 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  <Icon className="w-3.5 h-3.5 text-[#E8C574]" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Controls Quick Reference */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="text-xs font-semibold text-stone-400 mb-2">Controls</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-stone-300">
              <div className="flex justify-between">
                <span className="text-stone-400">Move / Sprint</span>
                <span className="font-mono-num text-stone-100">WASD / Shift</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Jump / Pause</span>
                <span className="font-mono-num text-stone-100">Space / Esc</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Mine / Fight</span>
                <span className="font-mono-num text-stone-100">Hold LMB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Place / Eat</span>
                <span className="font-mono-num text-stone-100">RMB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Craft / Bag</span>
                <span className="font-mono-num text-stone-100">E</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Hotbar / Mute</span>
                <span className="font-mono-num text-stone-100">1–9 / M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Menu Panorama</span>
                <span className="font-mono-num text-stone-100">F1</span>
              </div>
            </div>
          </div>

          {/* Secondary World Actions */}
          <div className="pt-4 border-t border-white/10 flex flex-wrap items-center justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onOpenSettings}
                className="mc-btn-sm flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <SlidersHorizontal className="w-3.5 h-3.5 text-[#E8C574]" />
                <span>Settings</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  onResetEdits();
                  onResume();
                }}
                className="mc-btn-sm flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset World</span>
              </button>
            </div>

            <button
              type="button"
              onClick={onReturnTitle}
              className="mc-btn-sm px-3.5 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              Save &amp; Title Screen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface DeathModalProps {
  blocksMined: number;
  mobsDefeated: number;
  survivalSeconds: number;
  onRespawn: () => void;
  onReturnTitle: () => void;
}

export const DeathModal: React.FC<DeathModalProps> = ({
  blocksMined,
  mobsDefeated,
  survivalSeconds,
  onRespawn,
  onReturnTitle,
}) => {
  const mins = Math.floor(survivalSeconds / 60);
  const secs = survivalSeconds % 60;

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#260C0E]/78">
      <div className="w-full max-w-md rounded-xl bg-[#191518] border border-[#D65148]/40 shadow-[0_20px_60px_rgba(0,0,0,0.75)] p-6 text-center space-y-5">
        <div className="flex flex-col items-center gap-2">
          <div className="w-12 h-12 rounded-lg bg-[#D65148]/18 border border-[#D65148]/40 flex items-center justify-center text-[#EF6C62]">
            <Skull className="w-6 h-6" />
          </div>
          <h2 className="font-display text-2xl font-extrabold text-[#F9EAEA]">You Died</h2>
          <p className="text-xs text-stone-400">
            Your builds and inventory remain intact at the trailhead.
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 py-3 border-y border-white/10 text-center">
          <div>
            <div className="text-base font-bold font-mono-num text-stone-100">
              {mins}:{String(secs).padStart(2, '0')}
            </div>
            <div className="text-[11px] text-stone-400">Survived</div>
          </div>
          <div>
            <div className="text-base font-bold font-mono-num text-stone-100">{blocksMined}</div>
            <div className="text-[11px] text-stone-400">Blocks Mined</div>
          </div>
          <div>
            <div className="text-base font-bold font-mono-num text-stone-100">{mobsDefeated}</div>
            <div className="text-[11px] text-stone-400">Foes Defeated</div>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onRespawn}
            className="mc-btn w-full py-2.5 font-display font-bold text-sm cursor-pointer"
          >
            Respawn at Trailhead
          </button>
          <button
            type="button"
            onClick={onReturnTitle}
            className="mc-btn w-full py-2 text-xs font-bold cursor-pointer"
          >
            Title Screen
          </button>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  settings: EngineSettings;
  hasPanorama?: boolean;
  onClearPanorama?: () => void;
  onChange: (patch: Partial<EngineSettings>) => void;
  onResetDefaults: () => void;
  onClose: () => void;
}

const RENDER_DISTANCE_OPTIONS = [
  { chunks: 3, label: 'Near (3)' },
  { chunks: 4, label: 'Normal (4)' },
  { chunks: 5, label: 'Far (5)' },
];

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  hasPanorama = false,
  onClearPanorama,
  onChange,
  onResetDefaults,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4 bg-[#0B1016]/76">
      <div className="w-full max-w-lg rounded-xl bg-[#161D24] border border-white/15 shadow-[0_18px_56px_rgba(0,0,0,0.68)] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10">
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="w-5 h-5 text-[#E8C574] shrink-0" />
            <div>
              <h2 className="font-display text-lg font-bold text-stone-100">Settings</h2>
              <p className="text-xs text-stone-400 mt-0.5">
                Adjust camera, video, audio, and HUD preferences.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mc-btn-sm w-9 h-9 flex items-center justify-center cursor-pointer"
            aria-label="Close Settings"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-5 max-h-[75vh] overflow-y-auto">
          {/* Audio, HUD & Shadow Toggles */}
          <div className="grid grid-cols-2 gap-2.5">
            <button
              type="button"
              data-active={!settings.muted ? 'true' : undefined}
              onClick={() => onChange({ muted: !settings.muted })}
              className="mc-btn flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              {settings.muted ? (
                <VolumeX className="w-4 h-4 text-stone-400" />
              ) : (
                <Volume2 className="w-4 h-4 text-[#96D86E]" />
              )}
              <span>Sound: {settings.muted ? 'Off' : 'On'}</span>
            </button>

            <button
              type="button"
              data-active={settings.showFps ? 'true' : undefined}
              onClick={() => onChange({ showFps: !settings.showFps })}
              className="mc-btn flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              <span>Show FPS: {settings.showFps ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              data-active={settings.playerShadow ? 'true' : undefined}
              onClick={() => onChange({ playerShadow: !settings.playerShadow })}
              className="mc-btn flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              <span>Player Shadow: {settings.playerShadow ? 'On' : 'Off'}</span>
            </button>

            <button
              type="button"
              data-active={settings.entityShadows ? 'true' : undefined}
              onClick={() => onChange({ entityShadows: !settings.entityShadows })}
              className="mc-btn flex items-center justify-center gap-2 py-2 px-3 text-xs font-bold cursor-pointer whitespace-nowrap"
            >
              <span>Entity Shadows: {settings.entityShadows ? 'On' : 'Off'}</span>
            </button>
          </div>

          {/* Field of View Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="setting-fov" className="font-semibold text-stone-200">
                Field of View
              </label>
              <span className="font-mono-num text-stone-300 font-bold">{settings.fov}°</span>
            </div>
            <input
              id="setting-fov"
              type="range"
              min={60}
              max={100}
              step={2}
              value={settings.fov}
              onChange={(e) => onChange({ fov: Number(e.target.value) })}
              className="w-full accent-[#7AC150] cursor-pointer"
            />
          </div>

          {/* Mouse Sensitivity Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="setting-sens" className="font-semibold text-stone-200">
                Mouse Sensitivity
              </label>
              <span className="font-mono-num text-stone-300 font-bold">
                {Math.round(settings.mouseSensitivity * 100)}%
              </span>
            </div>
            <input
              id="setting-sens"
              type="range"
              min={0.4}
              max={2.2}
              step={0.1}
              value={settings.mouseSensitivity}
              onChange={(e) => onChange({ mouseSensitivity: Number(e.target.value) })}
              className="w-full accent-[#7AC150] cursor-pointer"
            />
          </div>

          {/* Render Distance Selector */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-stone-200">Render Distance</span>
              <span className="font-mono-num text-stone-400">
                {settings.renderDistance} chunks
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {RENDER_DISTANCE_OPTIONS.map((opt) => (
                <button
                  key={opt.chunks}
                  type="button"
                  data-active={settings.renderDistance === opt.chunks ? 'true' : undefined}
                  onClick={() => onChange({ renderDistance: opt.chunks })}
                  className="mc-btn-sm py-2 px-2 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Main Menu Panorama */}
          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-3">
            <div>
              <div className="text-xs font-semibold text-stone-200">Main Menu Background</div>
              <div className="text-[11px] text-stone-400 mt-0.5">
                {hasPanorama
                  ? 'Custom 360° panorama saved in OPFS. Press F1 in-game to retake.'
                  : 'Default dirt tiles. Press F1 in-game to capture a 360° panorama.'}
              </div>
            </div>
            {hasPanorama && onClearPanorama && (
              <button
                type="button"
                onClick={onClearPanorama}
                className="mc-btn-sm px-3 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
              >
                Reset to Dirt
              </button>
            )}
          </div>

          {/* Controls Summary */}
          <div className="pt-4 border-t border-white/10">
            <h3 className="text-xs font-semibold text-stone-400 mb-2">Controls</h3>
            <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs text-stone-300">
              <div className="flex justify-between">
                <span className="text-stone-400">Move / Sprint</span>
                <span className="font-mono-num text-stone-100">WASD / Shift</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Jump / Pause</span>
                <span className="font-mono-num text-stone-100">Space / Esc</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Mine / Attack</span>
                <span className="font-mono-num text-stone-100">Hold LMB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Place / Use</span>
                <span className="font-mono-num text-stone-100">RMB</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Craft / Bag</span>
                <span className="font-mono-num text-stone-100">E</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Hotbar / Mute</span>
                <span className="font-mono-num text-stone-100">1–9 / M</span>
              </div>
              <div className="flex justify-between">
                <span className="text-stone-400">Menu Panorama</span>
                <span className="font-mono-num text-stone-100">F1</span>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-[#12181E] flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onResetDefaults}
            className="mc-btn-sm flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Defaults</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mc-btn px-6 py-1.5 text-xs font-bold cursor-pointer whitespace-nowrap"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

