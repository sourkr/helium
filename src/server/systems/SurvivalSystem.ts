/** Authoritative vitals, mining, inventory, crafting, furnace and block rules. */
import { GameServer } from '../GameServer';
import { damp, clamp, Vec3 } from '../../shared/vec';
import { BLOCK_DEFS, BlockType, isBedBlock, isDoorBlock, isLeafBlock, isLiquidBlock, isLogBlock, isPlantBlock, isReplaceableBlock } from '../../shared/blocks';
import { addItemToInventory, CRAFTING_RECIPES, createEmptyFurnaceData, damageToolSlot, executeCraftRecipeBatch, FurnaceData, GameMode, getBlockDrop, getFuelBurnTime, getMiningDuration, getRecipeGridPreview, getSmeltingRecipe, HOTBAR_SIZE, InventorySlot, ITEM_DEFS, ItemType, matchCraftingGrid, recipeFitsInGridSize } from '../../shared/survival';
import { CHUNK_HEIGHT, RaycastHit } from '../../shared/world';
import { TIME_PRESET_VALUES } from '../../shared/constants';
import { _rayOrigin, _rayDir } from './serverScratch';

export class SurvivalSystem {
  constructor(private readonly s: GameServer) {}

  cloneFurnaceData(f: FurnaceData): FurnaceData {
    return {
      input: f.input ? { ...f.input } : null,
      fuel: f.fuel ? { ...f.fuel } : null,
      output: f.output ? { ...f.output } : null,
      burnTime: f.burnTime,
      burnTotal: f.burnTotal,
      cookTime: f.cookTime,
      cookTotal: f.cookTotal,
    };
  }

  setGameMode(nextMode: GameMode) {
    if (this.s.mode === nextMode) return;
    this.s.mode = nextMode;
    this.s.resetMiningState();
    if (nextMode === 'survival') {
      this.s.flying = false;
      this.s.health = Math.max(this.s.health, 20);
      this.s.hunger = Math.max(this.s.hunger, 20);
      this.s.oxygen = this.s.maxOxygen;
      this.s.fx.toast('Survival Mode');
    } else {
      this.s.fx.clearEntities();
      this.s.damageFlash = 0;
      this.s.fx.toast('Creative Mode');
    }
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
    this.s.emitHud();
  }

  setActiveSlot(slot: number) {
    const clamped = ((slot % HOTBAR_SIZE) + HOTBAR_SIZE) % HOTBAR_SIZE;
    if (clamped !== this.s.activeSlot) {
      this.s.activeSlot = clamped;
      this.s.resetMiningState();
      this.s.fx.viewmodelSync();
      this.s.fx.sound('playUiTick', []);
      this.s.emitInventory();
      this.s.scheduleSave();
    }
  }

  assignBlockToActiveSlot(item: ItemType) {
    if (this.s.mode !== 'creative') return;
    const existingIdx = this.s.creativeHotbar.indexOf(item);
    if (existingIdx !== -1) {
      this.s.activeSlot = existingIdx;
    } else {
      this.s.creativeHotbar[this.s.activeSlot] = item;
    }
    this.s.fx.viewmodelSync();
    this.s.fx.sound('playUiTick', []);
    this.s.emitInventory();
    this.s.scheduleSave();
  }

  swapSurvivalSlots(fromIdx: number, toIdx: number) {
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= this.s.survivalSlots.length ||
      toIdx >= this.s.survivalSlots.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const a = this.s.survivalSlots[fromIdx];
    const b = this.s.survivalSlots[toIdx];
    // Merge stacks if identical stackable item
    if (a && b && a.item === b.item) {
      const maxStack = ITEM_DEFS[a.item]?.maxStack ?? 64;
      if (maxStack > 1 && b.count < maxStack) {
        const transfer = Math.min(maxStack - b.count, a.count);
        b.count += transfer;
        a.count -= transfer;
        if (a.count <= 0) this.s.survivalSlots[fromIdx] = null;
        this.s.fx.sound('playUiTick', []);
        this.s.fx.viewmodelSync();
        this.s.emitInventory();
        this.s.scheduleSave();
        return;
      }
    }
    this.s.survivalSlots[fromIdx] = b;
    this.s.survivalSlots[toIdx] = a;
    this.s.fx.sound('playUiTick', []);
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
  }

  getActiveCraftingGridSize(): 2 | 3 {
    return this.s.phase === 'crafting' ? 3 : 2;
  }

  placeInventoryItemIntoGrid(invIdx: number, gridIdx: number, count = 1): boolean {
    const gridSize = this.s.getActiveCraftingGridSize();
    const maxCells = gridSize * gridSize;
    if (
      invIdx < 0 ||
      invIdx >= this.s.survivalSlots.length ||
      gridIdx < 0 ||
      gridIdx >= maxCells
    ) {
      return false;
    }
    const src = this.s.survivalSlots[invIdx];
    if (!src || src.count <= 0) return false;

    const dst = this.s.craftingGrid[gridIdx];
    const maxStack = ITEM_DEFS[src.item]?.maxStack ?? 64;
    if (dst && dst.item !== src.item) {
      // Return previous item in cell before placing the new one
      addItemToInventory(this.s.survivalSlots, dst.item, dst.count, dst.durability);
      this.s.craftingGrid[gridIdx] = null;
    }

    const activeDst = this.s.craftingGrid[gridIdx];
    const space = activeDst ? maxStack - activeDst.count : maxStack;
    const move = Math.min(src.count, count, space);
    if (move <= 0) return false;

    if (activeDst) {
      activeDst.count += move;
    } else {
      this.s.craftingGrid[gridIdx] =
        src.durability !== undefined
          ? { item: src.item, count: move, durability: src.durability }
          : { item: src.item, count: move };
    }
    src.count -= move;
    if (src.count <= 0) {
      this.s.survivalSlots[invIdx] = null;
    }

    this.s.fx.sound('playUiTick', []);
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
    return true;
  }

  returnGridCellToInventory(gridIdx: number) {
    if (gridIdx < 0 || gridIdx >= 9) return;
    const cell = this.s.craftingGrid[gridIdx];
    if (!cell) return;
    addItemToInventory(this.s.survivalSlots, cell.item, cell.count, cell.durability);
    this.s.craftingGrid[gridIdx] = null;
    this.s.fx.sound('playUiTick', []);
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
  }

  clearCraftingGrid(silent = false) {
    let changed = false;
    for (let i = 0; i < 9; i++) {
      const cell = this.s.craftingGrid[i];
      if (cell) {
        addItemToInventory(this.s.survivalSlots, cell.item, cell.count, cell.durability);
        this.s.craftingGrid[i] = null;
        changed = true;
      }
    }
    if (changed) {
      if (!silent) this.s.fx.sound('playUiTick', []);
      this.s.fx.viewmodelSync();
      this.s.emitInventory();
      this.s.scheduleSave();
    }
  }

  fillCraftingGridFromRecipe(recipeId: string): boolean {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    const gridSize = this.s.getActiveCraftingGridSize();
    if (!recipeFitsInGridSize(recipe, gridSize)) {
      this.s.fx.toast('Requires a Crafting Table');
      return false;
    }

    this.s.clearCraftingGrid(true);

    // Check ingredients exist
    const patternCells = getRecipeGridPreview(recipe, gridSize);
    const needed = new Map<ItemType, number>();
    for (const item of patternCells) {
      if (item !== null) {
        needed.set(item, (needed.get(item) ?? 0) + 1);
      }
    }
    for (const [item, req] of needed.entries()) {
      let have = 0;
      for (const s of this.s.survivalSlots) {
        if (s && s.item === item) have += s.count;
      }
      if (have < req) {
        this.s.fx.viewmodelSync();
        this.s.emitInventory();
        return false;
      }
    }

    // Pull 1 unit per pattern cell from inventory into the active crafting grid
    const cellCount = gridSize * gridSize;
    for (let i = 0; i < cellCount; i++) {
      const item = patternCells[i];
      if (item === null) continue;
      for (let sIdx = 0; sIdx < this.s.survivalSlots.length; sIdx++) {
        const s = this.s.survivalSlots[sIdx];
        if (s && s.item === item && s.count > 0) {
          s.count -= 1;
          if (s.count <= 0) this.s.survivalSlots[sIdx] = null;
          this.s.craftingGrid[i] = { item, count: 1 };
          break;
        }
      }
    }

    this.s.fx.sound('playUiTick', []);
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
    return true;
  }

  craftFromGrid(craftAll = false): boolean {
    const gridSize = this.s.getActiveCraftingGridSize();
    const cellCount = gridSize * gridSize;
    const recipe = matchCraftingGrid(this.s.craftingGrid, gridSize);
    if (!recipe) return false;

    let maxFromGrid = Infinity;
    for (let i = 0; i < cellCount; i++) {
      const cell = this.s.craftingGrid[i];
      if (cell && cell.count > 0) {
        maxFromGrid = Math.min(maxFromGrid, cell.count);
      }
    }
    if (!Number.isFinite(maxFromGrid) || maxFromGrid <= 0) return false;

    let times = craftAll ? maxFromGrid : 1;
    const outDef = ITEM_DEFS[recipe.output.item];
    if (outDef && outDef.maxStack === 1) {
      const emptySlots = this.s.survivalSlots.filter((s) => s === null).length;
      times = Math.min(times, Math.max(1, emptySlots));
    }

    for (let i = 0; i < cellCount; i++) {
      const cell = this.s.craftingGrid[i];
      if (cell) {
        cell.count -= times;
        if (cell.count <= 0) this.s.craftingGrid[i] = null;
      }
    }

    addItemToInventory(this.s.survivalSlots, recipe.output.item, recipe.output.count * times);
    this.s.fx.sound('playCraft', []);
    this.s.fx.toast(
      times > 1
        ? `Crafted ${ITEM_DEFS[recipe.output.item].name} ×${recipe.output.count * times}`
        : `Crafted ${recipe.name}`,
    );
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
    return true;
  }

  craftRecipeById(recipeId: string, craftAll = false): boolean {
    const recipe = CRAFTING_RECIPES.find((r) => r.id === recipeId);
    if (!recipe) return false;
    const gridSize = this.s.getActiveCraftingGridSize();
    if (!recipeFitsInGridSize(recipe, gridSize)) {
      this.s.fx.toast('Requires a Crafting Table');
      return false;
    }
    const crafted = executeCraftRecipeBatch(
      this.s.survivalSlots,
      recipe,
      craftAll ? 64 : 1,
    );
    if (crafted > 0) {
      this.s.fx.sound('playCraft', []);
      this.s.fx.toast(
        crafted > 1
          ? `Crafted ${ITEM_DEFS[recipe.output.item].name} ×${recipe.output.count * crafted}`
          : `Crafted ${recipe.name}`,
      );
      this.s.fx.viewmodelSync();
      this.s.emitInventory();
      this.s.scheduleSave();
      return true;
    }
    return false;
  }

  // --- Furnace Helpers & Interaction ---

  getOrCreateFurnace(key: string): FurnaceData {
    let f = this.s.furnaces.get(key);
    if (!f) {
      f = createEmptyFurnaceData();
      this.s.furnaces.set(key, f);
    }
    return f;
  }

  emitActiveFurnace() {
    if (!this.s.activeFurnaceKey) {
      this.s.fx.furnaceChange(null);
      return;
    }
    const f = this.s.furnaces.get(this.s.activeFurnaceKey);
    this.s.fx.furnaceChange(f ? this.s.cloneFurnaceData(f) : createEmptyFurnaceData());
  }

  placeInventoryItemIntoFurnace(
    invIdx: number,
    targetSlot: 'input' | 'fuel',
    count = 1,
  ): boolean {
    if (!this.s.activeFurnaceKey) return false;
    if (invIdx < 0 || invIdx >= this.s.survivalSlots.length) return false;
    const src = this.s.survivalSlots[invIdx];
    if (!src || src.count <= 0) return false;

    if (targetSlot === 'input' && !getSmeltingRecipe(src.item)) {
      this.s.fx.toast('Cannot smelt this item');
      return false;
    }
    if (targetSlot === 'fuel' && getFuelBurnTime(src.item) <= 0) {
      this.s.fx.toast('Cannot burn this as fuel');
      return false;
    }

    const furnace = this.s.getOrCreateFurnace(this.s.activeFurnaceKey);
    const dst = furnace[targetSlot];
    const maxStack = ITEM_DEFS[src.item]?.maxStack ?? 64;

    if (dst && dst.item !== src.item) {
      addItemToInventory(this.s.survivalSlots, dst.item, dst.count, dst.durability);
      furnace[targetSlot] = null;
      if (targetSlot === 'input') furnace.cookTime = 0;
    }

    const activeDst = furnace[targetSlot];
    const space = activeDst ? maxStack - activeDst.count : maxStack;
    const move = Math.min(src.count, count, space);
    if (move <= 0) return false;

    if (activeDst) {
      activeDst.count += move;
    } else {
      const nextSlot: InventorySlot = { item: src.item, count: move };
      if (src.durability !== undefined) {
        nextSlot.durability = src.durability;
      }
      furnace[targetSlot] = nextSlot;
    }
    src.count -= move;
    if (src.count <= 0) {
      this.s.survivalSlots[invIdx] = null;
    }

    this.s.fx.sound('playUiTick', []);
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.emitActiveFurnace();
    this.s.scheduleSave();
    return true;
  }

  takeFromFurnaceSlot(slot: 'input' | 'fuel' | 'output'): boolean {
    if (!this.s.activeFurnaceKey) return false;
    const furnace = this.s.furnaces.get(this.s.activeFurnaceKey);
    if (!furnace) return false;
    const existing = furnace[slot];
    if (!existing || existing.count <= 0) return false;

    const added = addItemToInventory(
      this.s.survivalSlots,
      existing.item,
      existing.count,
      existing.durability,
    );
    if (!added) {
      this.s.fx.toast('Inventory is full');
      return false;
    }
    furnace[slot] = null;
    if (slot === 'input') furnace.cookTime = 0;

    if (slot === 'output') {
      this.s.fx.sound('playCraft', []);
      this.s.fx.toast(`Collected ${ITEM_DEFS[existing.item].name} ×${existing.count}`);
    } else {
      this.s.fx.sound('playUiTick', []);
    }
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.emitActiveFurnace();
    this.s.scheduleSave();
    return true;
  }

  quickLoadFurnaceSlot(invIdx: number, fullStack = true): boolean {
    if (!this.s.activeFurnaceKey) return false;
    const src = this.s.survivalSlots[invIdx];
    if (!src || src.count <= 0) return false;
    const furnace = this.s.getOrCreateFurnace(this.s.activeFurnaceKey);
    const isSmeltable = getSmeltingRecipe(src.item) !== null;
    const isFuel = getFuelBurnTime(src.item) > 0;
    const amt = fullStack ? src.count : 1;

    if (isSmeltable && isFuel) {
      // Logs can be smelted into Coal OR burned as fuel
      if (furnace.input && furnace.input.item !== src.item) {
        return this.s.placeInventoryItemIntoFurnace(invIdx, 'fuel', amt);
      }
      if (furnace.fuel || furnace.burnTime > 0) {
        return this.s.placeInventoryItemIntoFurnace(invIdx, 'input', amt);
      }
      return this.s.placeInventoryItemIntoFurnace(invIdx, 'fuel', amt);
    }
    if (isSmeltable) {
      return this.s.placeInventoryItemIntoFurnace(invIdx, 'input', amt);
    }
    if (isFuel) {
      return this.s.placeInventoryItemIntoFurnace(invIdx, 'fuel', amt);
    }
    return false;
  }

  quickLoadFurnaceRecipe(inputItem: ItemType): boolean {
    if (!this.s.activeFurnaceKey) return false;
    const invIdx = this.s.survivalSlots.findIndex((s) => s !== null && s.item === inputItem);
    if (invIdx === -1) return false;

    const furnace = this.s.getOrCreateFurnace(this.s.activeFurnaceKey);
    const placed = this.s.placeInventoryItemIntoFurnace(
      invIdx,
      'input',
      this.s.survivalSlots[invIdx]?.count ?? 1,
    );
    if (!placed) return false;

    // Auto-add fuel if furnace is unlit and empty of fuel
    if (furnace.burnTime <= 0 && !furnace.fuel) {
      const preferredFuels: ItemType[] = [
        ItemType.Coal,
        ItemType.OakPlanks,
        ItemType.Stick,
        ItemType.OakLog,
        ItemType.BirchLog,
        ItemType.WoodPickaxe,
        ItemType.WoodAxe,
        ItemType.WoodSword,
      ];
      for (const fuelType of preferredFuels) {
        if (fuelType === inputItem) continue;
        const fuelIdx = this.s.survivalSlots.findIndex((s) => s !== null && s.item === fuelType);
        if (fuelIdx !== -1) {
          this.s.placeInventoryItemIntoFurnace(fuelIdx, 'fuel', 1);
          break;
        }
      }
    }
    return true;
  }

  updateFurnaces(dt: number) {
    if (this.s.furnaces.size === 0) return;
    let activeChanged = false;
    let anyFinished = false;
    let blockStateChanged = false;

    for (const [key, f] of this.s.furnaces.entries()) {
      const isActive = key === this.s.activeFurnaceKey;
      const wasBurning = f.burnTime > 0;
      if (f.burnTime > 0) {
        f.burnTime = Math.max(0, f.burnTime - dt);
        if (f.burnTime === 0) {
          f.burnTotal = 0;
        }
      }

      const recipe = f.input ? getSmeltingRecipe(f.input.item) : null;
      let canOutput = false;
      if (recipe) {
        const outDef = ITEM_DEFS[recipe.output.item];
        const maxStack = outDef?.maxStack ?? 64;
        if (!f.output) {
          canOutput = true;
        } else if (
          f.output.item === recipe.output.item &&
          f.output.count + recipe.output.count <= maxStack
        ) {
          canOutput = true;
        }
      }

      if (recipe && canOutput) {
        f.cookTotal = recipe.cookSeconds;
        if (f.burnTime <= 0 && f.fuel && f.fuel.count > 0) {
          const burnSec = getFuelBurnTime(f.fuel.item);
          if (burnSec > 0) {
            const fuelItem = f.fuel.item;
            const returnedBucket =
              ITEM_DEFS[fuelItem]?.isBucket === 'lava' ? ItemType.Bucket : null;
            f.burnTime = burnSec;
            f.burnTotal = burnSec;
            f.fuel.count -= 1;
            if (f.fuel.count <= 0) {
              f.fuel = returnedBucket !== null ? { item: returnedBucket, count: 1 } : null;
            }
            if (isActive) activeChanged = true;
          }
        }

        if (f.burnTime > 0) {
          f.cookTime += dt;
          if (f.cookTime >= f.cookTotal) {
            f.cookTime -= f.cookTotal;
            if (f.input) {
              f.input.count -= 1;
              if (f.input.count <= 0) {
                f.input = null;
                f.cookTime = 0;
              }
            }
            if (f.output) {
              f.output.count += recipe.output.count;
            } else {
              f.output = { item: recipe.output.item, count: recipe.output.count };
            }
            anyFinished = true;
            if (isActive) activeChanged = true;
          }
        } else if (f.cookTime > 0) {
          f.cookTime = Math.max(0, f.cookTime - dt * 1.5);
        }
      } else {
        if (f.cookTime > 0) f.cookTime = 0;
      }

      const isBurningNow = f.burnTime > 0;
      if (wasBurning !== isBurningNow) {
        const parts = key.split(',').map(Number);
        if (parts.length === 3 && parts.every(Number.isFinite)) {
          const [fx, fy, fz] = parts;
          const curBlock = this.s.world.getBlock(fx, fy, fz);
          if (curBlock === BlockType.Furnace || curBlock === BlockType.FurnaceLit) {
            const desired = isBurningNow ? BlockType.FurnaceLit : BlockType.Furnace;
            if (curBlock !== desired && this.s.world.setBlock(fx, fy, fz, desired)) {
              blockStateChanged = true;
            }
          }
        }
      }

      if (isActive && (wasBurning || isBurningNow || f.cookTime > 0)) {
        this.s.furnaceUiAccum += dt;
        if (this.s.furnaceUiAccum >= 0.08) {
          this.s.furnaceUiAccum = 0;
          activeChanged = true;
        }
      }
    }

    if (blockStateChanged) {
      this.s.fx.chunksDirty();
    }
    if (activeChanged && this.s.phase === 'furnace') {
      this.s.emitActiveFurnace();
    }
    if (anyFinished || blockStateChanged) {
      this.s.scheduleSave();
    }
  }

  eatFromSlot(slotIdx: number): boolean {
    if (this.s.mode !== 'survival') return false;
    const slot = this.s.survivalSlots[slotIdx];
    if (!slot) return false;
    const def = ITEM_DEFS[slot.item];
    if (!def?.foodRestore) return false;
    if (this.s.hunger >= this.s.maxHunger && this.s.health >= this.s.maxHealth) {
      this.s.fx.toast('Already full');
      return false;
    }

    this.s.hunger = Math.min(this.s.maxHunger, this.s.hunger + def.foodRestore);
    if (def.healthRestore) {
      this.s.health = Math.min(this.s.maxHealth, this.s.health + def.healthRestore);
    }
    slot.count -= 1;
    if (slot.count <= 0) {
      this.s.survivalSlots[slotIdx] = null;
    }
    this.s.fx.sound('playEat', []);
    this.s.fx.viewmodelSwing();
    this.s.fx.toast(`Ate ${def.name}`);
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
    this.s.emitHud();
    return true;
  }

  getEquippedItem(): ItemType | null {
    if (this.s.mode === 'creative') {
      return this.s.creativeHotbar[this.s.activeSlot] ?? null;
    }
    return this.s.survivalSlots[this.s.activeSlot]?.item ?? null;
  }

  consumeActiveToolDurability(
    cost: number,
    fxPos?: { x: number; y: number; z: number },
  ): boolean {
    if (this.s.mode !== 'survival' || cost <= 0) return false;
    const res = damageToolSlot(this.s.survivalSlots, this.s.activeSlot, cost);
    if (!res.damaged) return false;

    if (res.broken) {
      this.s.fx.sound('playToolBreak', []);
      if (fxPos) {
        this.s.fx.particleColorBurst(fxPos.x,
          fxPos.y,
          fxPos.z,
          res.accentColor ?? '#c8cfd8',
          12,);
      }
      this.s.fx.toast(`${res.itemName ?? 'Tool'} broke!`);
    }
    this.s.fx.viewmodelSync();
    this.s.emitInventory();
    this.s.scheduleSave();
    return true;
  }

  resetMiningState() {
    this.s.miningHeld = false;
    this.s.miningBlockKey = null;
    this.s.miningElapsed = 0;
    this.s.miningTickAccum = 0;
    this.s.fx.crackVisible(false);
  }

  applyPlayerDamage(amount: number, knockX = 0, knockZ = 0) {
    if (this.s.mode !== 'survival' || this.s.phase !== 'playing') return;
    if (this.s.hurtCooldown > 0) return;

    this.s.health = Math.max(0, this.s.health - amount);
    this.s.hurtCooldown = 0.45;
    this.s.damageFlash = 1.0;
    this.s.cameraShake = Math.max(this.s.cameraShake, 0.09);
    this.s.fx.sound('playHurt', []);

    if (knockX !== 0 || knockZ !== 0) {
      this.s.playerVel.x += knockX * 6.5;
      this.s.playerVel.z += knockZ * 6.5;
      this.s.playerVel.y = Math.max(this.s.playerVel.y, 4.2);
    }

    if (this.s.health <= 0) {
      this.s.setPhase('dead');
    } else {
      this.s.emitHud();
    }
    this.s.scheduleSave();
  }

  updateSurvivalVitals(dt: number, sprinting: boolean, moving: boolean) {
    if (this.s.mode !== 'survival') return;

    this.s.survivalSeconds += dt;
    if (this.s.hurtCooldown > 0) this.s.hurtCooldown = Math.max(0, this.s.hurtCooldown - dt);
    if (this.s.damageFlash > 0) this.s.damageFlash = Math.max(0, this.s.damageFlash - dt * 2.8);

    // Oxygen & drowning
    if (this.s.underwater) {
      this.s.oxygen = Math.max(0, this.s.oxygen - dt * 1.0);
      if (this.s.oxygen <= 0) {
        this.s.drownTimer += dt;
        if (this.s.drownTimer >= 1.2) {
          this.s.drownTimer = 0;
          this.s.applyPlayerDamage(2);
        }
      }
    } else {
      this.s.oxygen = Math.min(this.s.maxOxygen, this.s.oxygen + dt * 3.5);
      this.s.drownTimer = 0;
    }

    // Hunger exhaustion
    if (moving) {
      this.s.exhaustion += dt * (sprinting ? 0.042 : 0.01);
    } else {
      this.s.exhaustion += dt * 0.0025;
    }
    if (this.s.exhaustion >= 1.0) {
      this.s.exhaustion -= 1.0;
      if (this.s.hunger > 0) {
        this.s.hunger = Math.max(0, this.s.hunger - 1);
      }
    }

    // Natural regeneration when well-fed
    if (this.s.hunger >= 16 && this.s.health < this.s.maxHealth && this.s.health > 0) {
      this.s.regenTimer += dt;
      if (this.s.regenTimer >= 3.2) {
        this.s.regenTimer = 0;
        this.s.health = Math.min(this.s.maxHealth, this.s.health + 1);
        this.s.exhaustion += 0.35;
      }
    } else {
      this.s.regenTimer = 0;
    }

    // Starvation warning tick down to 1 HP
    if (this.s.hunger <= 0 && this.s.health > 1) {
      this.s.starveTimer += dt;
      if (this.s.starveTimer >= 4.0) {
        this.s.starveTimer = 0;
        this.s.applyPlayerDamage(1);
      }
    } else {
      this.s.starveTimer = 0;
    }
  }

  updateSurvivalMining(dt: number) {
    if (this.s.mode !== 'survival' || !this.s.miningHeld || !this.s.currentTarget) {
      this.s.miningBlockKey = null;
      this.s.miningElapsed = 0;
      this.s.fx.crackVisible(false);
      return;
    }

    const t = this.s.currentTarget;
    const def = BLOCK_DEFS[t.block];
    if (!def.breakable) {
      this.s.fx.crackVisible(false);
      return;
    }

    const key = `${t.x},${t.y},${t.z}`;
    if (this.s.miningBlockKey !== key) {
      this.s.miningBlockKey = key;
      this.s.miningElapsed = 0;
      this.s.miningTickAccum = 0;
      this.s.miningDuration = getMiningDuration(t.block, this.s.getEquippedItem());
    }

    this.s.miningElapsed += dt;
    this.s.miningTickAccum += dt;
    if (this.s.miningTickAccum >= 0.22) {
      this.s.miningTickAccum = 0;
      this.s.fx.sound('playMineTick', [def.sound]);
      this.s.fx.particleBurst(t.x, t.y, t.z, t.block, 3);
    }

    const ratio = Math.min(1, this.s.miningElapsed / Math.max(0.08, this.s.miningDuration));
    this.s.fx.crackVisible(true);
    if (isBedBlock(t.block)) {
      this.s.fx.crackScale(1, 9 / 16, 1);
      this.s.fx.crackPos(t.x + 0.5, t.y + 9 / 32, t.z + 0.5);
    } else {
      this.s.fx.crackScale(1, 1, 1);
      this.s.fx.crackPos(t.x + 0.5, t.y + 0.5, t.z + 0.5);
    }
    let crackOpacity = 0.16 + ratio * 0.72;
    if (this.s.destroyStageCount > 0) {
      const stage = Math.min(
        this.s.destroyStageCount - 1,
        Math.floor(ratio * this.s.destroyStageCount),
      );
      if (stage !== this.s.lastCrackStage) {
        this.s.lastCrackStage = stage;
        this.s.fx.crackStage(stage);
      }
      crackOpacity = 0.88;
    }
    this.s.fx.crackOpacity(crackOpacity);

    if (this.s.miningElapsed >= this.s.miningDuration) {
      this.s.completeBlockBreak(t);
      this.s.miningBlockKey = null;
      this.s.miningElapsed = 0;
      this.s.lastCrackStage = -1;
      this.s.fx.crackVisible(false);
    }
  }

  completeBlockBreak(t: RaycastHit) {
    const def = BLOCK_DEFS[t.block];
    if (!def.breakable && !(this.s.mode === 'creative' && t.y > 0)) return;

    const changed = this.s.world.setBlock(t.x, t.y, t.z, BlockType.Air);
    if (!changed) return;

    // Remove paired half of 2-block Oak Doors, Beds, and Tall Grass
    if (isDoorBlock(t.block)) {
      const partnerY =
        t.block === BlockType.OakDoorTop || t.block === BlockType.OakDoorTopOpen
          ? t.y - 1
          : t.y + 1;
      if (isDoorBlock(this.s.world.getBlock(t.x, partnerY, t.z))) {
        this.s.world.setBlock(t.x, partnerY, t.z, BlockType.Air);
      }
    } else if (t.block === BlockType.TallGrassBottom) {
      if (this.s.world.getBlock(t.x, t.y + 1, t.z) === BlockType.TallGrassTop) {
        this.s.world.setBlock(t.x, t.y + 1, t.z, BlockType.Air);
      }
    } else if (t.block === BlockType.TallGrassTop) {
      if (this.s.world.getBlock(t.x, t.y - 1, t.z) === BlockType.TallGrassBottom) {
        this.s.world.setBlock(t.x, t.y - 1, t.z, BlockType.Air);
      }
    } else if (t.block === BlockType.BedHead) {
      if (this.s.world.getBlock(t.x, t.y, t.z + 1) === BlockType.BedFoot) {
        this.s.world.setBlock(t.x, t.y, t.z + 1, BlockType.Air);
      }
    } else if (t.block === BlockType.BedFoot) {
      if (this.s.world.getBlock(t.x, t.y, t.z - 1) === BlockType.BedHead) {
        this.s.world.setBlock(t.x, t.y, t.z - 1, BlockType.Air);
      }
    }

    // Pop off unsupported plant blocks resting directly on top of a broken block
    const plantAbove = this.s.world.getBlock(t.x, t.y + 1, t.z);
    if (isPlantBlock(plantAbove)) {
      this.s.world.setBlock(t.x, t.y + 1, t.z, BlockType.Air);
      if (
        plantAbove === BlockType.TallGrassBottom &&
        this.s.world.getBlock(t.x, t.y + 2, t.z) === BlockType.TallGrassTop
      ) {
        this.s.world.setBlock(t.x, t.y + 2, t.z, BlockType.Air);
      }
    }

    // Trigger natural leaf decay check around broken tree logs or leaves
    if (isLogBlock(t.block) || isLeafBlock(t.block)) {
      this.s.enqueueLeavesAround(t.x, t.y, t.z, 6);
    }

    this.s.fx.viewmodelSwing();
    this.s.fx.particleBurst(t.x, t.y, t.z, t.block, 15);
    this.s.fx.sound('playBreak', [def.sound]);
    this.s.cameraShake = 0.022;
    this.s.crosshairPulse = 1;
    this.s.blocksMined += 1;

    if (t.block === BlockType.Furnace || t.block === BlockType.FurnaceLit) {
      const fKey = `${t.x},${t.y},${t.z}`;
      const existingFurnace = this.s.furnaces.get(fKey);
      if (existingFurnace) {
        if (this.s.mode === 'survival') {
          if (existingFurnace.input) {
            addItemToInventory(this.s.survivalSlots, existingFurnace.input.item, existingFurnace.input.count);
          }
          if (existingFurnace.fuel) {
            addItemToInventory(this.s.survivalSlots, existingFurnace.fuel.item, existingFurnace.fuel.count);
          }
          if (existingFurnace.output) {
            addItemToInventory(this.s.survivalSlots, existingFurnace.output.item, existingFurnace.output.count);
          }
        }
        this.s.furnaces.delete(fKey);
      }
    }

    if (this.s.mode === 'survival') {
      this.s.exhaustion += 0.03;
      const equipped = this.s.getEquippedItem();
      if (equipped !== null) {
        const toolKind = ITEM_DEFS[equipped]?.toolKind;
        if (toolKind && toolKind !== 'hand') {
          this.s.consumeActiveToolDurability(toolKind === 'sword' ? 2 : 1, {
            x: t.x + 0.5,
            y: t.y + 0.5,
            z: t.z + 0.5,
          });
        }
      }
      const drop = getBlockDrop(t.block);
      if (drop) {
        addItemToInventory(this.s.survivalSlots, drop.item, drop.count);
      }
      this.s.fx.viewmodelSync();
      this.s.emitInventory();
    }

    this.s.fx.chunksDirty();
    this.s.scheduleSave();
    this.s.emitHud();
  }

  breakTargetedBlock() {
    if (this.s.phase !== 'playing') return;
    if (!this.s.currentTarget) return;
    this.s.completeBlockBreak(this.s.currentTarget);
  }

  useOrPlaceAtTarget() {
    if (this.s.phase !== 'playing') return;

    const sneaking =
      this.s.heldKeys.has('ShiftLeft') || this.s.heldKeys.has('ShiftRight');

    // 0. Interact with placed Crafting Table, Furnace, Oak Door, or Bed (unless sneaking)
    if (this.s.currentTarget && !sneaking) {
      const t = this.s.currentTarget;
      if (t.block === BlockType.CraftingTable) {
        this.s.fx.sound('playUiTick', []);
        this.s.setPhase('crafting');
        return;
      }
      if (t.block === BlockType.Furnace || t.block === BlockType.FurnaceLit) {
        this.s.fx.sound('playUiTick', []);
        const key = `${t.x},${t.y},${t.z}`;
        this.s.activeFurnaceKey = key;
        this.s.getOrCreateFurnace(key);
        this.s.setPhase('furnace');
        return;
      }
      if (isDoorBlock(t.block)) {
        const bottomY =
          t.block === BlockType.OakDoorTop || t.block === BlockType.OakDoorTopOpen
            ? t.y - 1
            : t.y;
        const currentlyOpen =
          t.block === BlockType.OakDoorBottomOpen || t.block === BlockType.OakDoorTopOpen;
        const nextBottom = currentlyOpen
          ? BlockType.OakDoorBottom
          : BlockType.OakDoorBottomOpen;
        const nextTop = currentlyOpen ? BlockType.OakDoorTop : BlockType.OakDoorTopOpen;

        if (isDoorBlock(this.s.world.getBlock(t.x, bottomY, t.z))) {
          this.s.world.setBlock(t.x, bottomY, t.z, nextBottom);
        }
        if (isDoorBlock(this.s.world.getBlock(t.x, bottomY + 1, t.z))) {
          this.s.world.setBlock(t.x, bottomY + 1, t.z, nextTop);
        }
        this.s.fx.viewmodelSwing();
        this.s.fx.sound('playPlace', ['wood']);
        this.s.crosshairPulse = 1;
        this.s.fx.chunksDirty();
        this.s.scheduleSave();
        this.s.emitHud();
        return;
      }
      if (isBedBlock(t.block)) {
        this.s.bedSpawnPoint = { x: t.x + 0.5, y: t.y + 0.65, z: t.z + 0.5 };
        if (this.s.dayFactor < 0.65) {
          this.s.targetTimeOfDay = TIME_PRESET_VALUES.dawn;
          this.s.fx.clearEntities();
          this.s.health = Math.min(this.s.maxHealth, this.s.health + 4);
          this.s.fx.sound('playCraft', []);
          this.s.fx.toast('Slept until dawn · Respawn point set');
        } else {
          this.s.fx.sound('playUiTick', []);
          this.s.fx.toast('Respawn point set · You can sleep at night');
        }
        this.s.scheduleSave();
        this.s.emitHud();
        return;
      }
    }

    const equipped = this.s.getEquippedItem();
    const equippedDef = equipped !== null ? ITEM_DEFS[equipped] : undefined;

    // 1. Empty Iron Bucket: Scoop water or lava from the targeted liquid block
    if (equipped === ItemType.Bucket) {
      _rayOrigin.copy(this.s.eyePos);
      _rayDir.copy(this.s.viewDir);
      const liquidHit = this.s.world.raycast(_rayOrigin, _rayDir, 6.5, true);
      if (
        liquidHit &&
        (liquidHit.block === BlockType.Water || liquidHit.block === BlockType.Lava)
      ) {
        const isLava = liquidHit.block === BlockType.Lava;
        const label = isLava ? 'Lava' : 'Water';
        const filledItem = isLava ? ItemType.LavaBucket : ItemType.WaterBucket;
        const changed = this.s.world.setBlock(liquidHit.x, liquidHit.y, liquidHit.z, BlockType.Air);
        if (changed) {
          if (this.s.mode === 'survival') {
            const slot = this.s.survivalSlots[this.s.activeSlot];
            if (slot && slot.item === ItemType.Bucket) {
              if (slot.count <= 1) {
                this.s.survivalSlots[this.s.activeSlot] = { item: filledItem, count: 1 };
              } else {
                slot.count -= 1;
                addItemToInventory(this.s.survivalSlots, filledItem, 1);
              }
            }
            this.s.fx.viewmodelSync();
            this.s.emitInventory();
            this.s.fx.toast(`Filled ${label} Bucket`);
          } else {
            this.s.fx.toast(`Scooped ${label}`);
          }
          this.s.fx.viewmodelSwing();
          this.s.fx.particleColorBurst(
            liquidHit.x + 0.5,
            liquidHit.y + 0.5,
            liquidHit.z + 0.5,
            isLava ? '#ff6a1e' : '#42a4f5',
            12,
          );
          this.s.fx.sound('playBucketFill', []);
          this.s.crosshairPulse = 1;
          this.s.fx.chunksDirty();
          this.s.scheduleSave();
          this.s.emitHud();
        }
      }
      return;
    }

    // 2. Filled buckets: pour the liquid at the targeted adjacent face
    const filledBucket =
      equipped === ItemType.WaterBucket
        ? { block: BlockType.Water, label: 'Water', color: '#42a4f5' }
        : equipped === ItemType.LavaBucket
          ? { block: BlockType.Lava, label: 'Lava', color: '#ff6a1e' }
          : null;
    if (filledBucket) {
      if (!this.s.currentTarget) return;
      const t = this.s.currentTarget;
      const px = t.x + t.nx;
      const py = t.y + t.ny;
      const pz = t.z + t.nz;
      if (py <= 0 || py >= CHUNK_HEIGHT) return;

      const existing = this.s.world.getBlock(px, py, pz);
      if (existing !== BlockType.Air && !isLiquidBlock(existing)) return;

      const changed = this.s.world.setBlock(px, py, pz, filledBucket.block);
      if (changed) {
        if (this.s.mode === 'survival') {
          this.s.survivalSlots[this.s.activeSlot] = { item: ItemType.Bucket, count: 1 };
          this.s.fx.viewmodelSync();
          this.s.emitInventory();
          this.s.fx.toast(`Poured ${filledBucket.label}`);
        }
        this.s.fx.viewmodelSwing();
        this.s.fx.particleColorBurst(px + 0.5, py + 0.5, pz + 0.5, filledBucket.color, 14);
        this.s.fx.sound('playBucketEmpty', []);
        this.s.crosshairPulse = 1;
        this.s.fx.chunksDirty();
        this.s.scheduleSave();
        this.s.emitHud();
      }
      return;
    }

    // 2b. Empty Glass Bottle: Fill from Water block into a Water Bottle (without consuming the water source)
    if (equipped === ItemType.GlassBottle) {
      _rayOrigin.copy(this.s.eyePos);
      _rayDir.copy(this.s.viewDir);
      const liquidHit = this.s.world.raycast(_rayOrigin, _rayDir, 6.5, true);
      if (liquidHit && liquidHit.block === BlockType.Water) {
        if (this.s.mode === 'survival') {
          const slot = this.s.survivalSlots[this.s.activeSlot];
          if (slot && slot.item === ItemType.GlassBottle) {
            if (slot.count <= 1) {
              this.s.survivalSlots[this.s.activeSlot] = { item: ItemType.WaterBottle, count: 1 };
            } else {
              slot.count -= 1;
              addItemToInventory(this.s.survivalSlots, ItemType.WaterBottle, 1);
            }
          }
          this.s.fx.viewmodelSync();
          this.s.emitInventory();
          this.s.fx.toast('Filled Water Bottle');
        } else {
          this.s.fx.toast('Filled Water Bottle');
        }
        this.s.fx.viewmodelSwing();
        this.s.fx.particleColorBurst(liquidHit.x + 0.5,
          liquidHit.y + 0.65,
          liquidHit.z + 0.5,
          '#42a4f5',
          10,);
        this.s.fx.sound('playBucketFill', []);
        this.s.crosshairPulse = 1;
        this.s.scheduleSave();
        this.s.emitHud();
      }
      return;
    }

    // 2c. Water Bottle: Drink to refresh vitals and return an empty Glass Bottle
    if (equipped === ItemType.WaterBottle) {
      if (this.s.mode === 'survival') {
        this.s.hunger = Math.min(this.s.maxHunger, this.s.hunger + (equippedDef?.foodRestore ?? 2));
        this.s.health = Math.min(this.s.maxHealth, this.s.health + (equippedDef?.healthRestore ?? 1));
        this.s.survivalSlots[this.s.activeSlot] = { item: ItemType.GlassBottle, count: 1 };
        this.s.fx.viewmodelSync();
        this.s.emitInventory();
        this.s.fx.toast('Drank Water Bottle');
      } else {
        this.s.fx.toast('Drank Water Bottle');
      }
      this.s.fx.viewmodelSwing();
      this.s.fx.sound('playBucketEmpty', []);
      this.s.crosshairPulse = 1;
      this.s.scheduleSave();
      this.s.emitHud();
      return;
    }

    // 3. In Survival Mode, right-click eats food if holding an edible item
    if (this.s.mode === 'survival' && equippedDef?.foodRestore) {
      this.s.eatFromSlot(this.s.activeSlot);
      return;
    }

    if (!this.s.currentTarget) return;
    const t = this.s.currentTarget;
    // Replacing Short Grass in-place when aiming directly at it (like Minecraft)
    const replaceInPlace = t.block === BlockType.ShortGrass;
    const px = replaceInPlace ? t.x : t.x + t.nx;
    const py = replaceInPlace ? t.y : t.y + t.ny;
    const pz = replaceInPlace ? t.z : t.z + t.nz;

    if (py <= 0 || py >= CHUNK_HEIGHT) return;

    const chosenBlock = equippedDef?.blockType ?? null;
    if (chosenBlock === null) return;
    const def = BLOCK_DEFS[chosenBlock];
    if (!def?.buildable) return;
    if (def.solid && this.s.blockIntersectsPlayer(px, py, pz)) return;

    const existing = this.s.world.getBlock(px, py, pz);
    if (!isReplaceableBlock(existing)) return;

    let changed = false;

    if (chosenBlock === BlockType.OakDoorBottom) {
      if (py + 1 >= CHUNK_HEIGHT) {
        this.s.fx.toast('Not enough room for a door');
        return;
      }
      const upper = this.s.world.getBlock(px, py + 1, pz);
      if (
        !isReplaceableBlock(upper) ||
        this.s.blockIntersectsPlayer(px, py + 1, pz)
      ) {
        this.s.fx.toast('Not enough room for a door');
        return;
      }
      changed =
        this.s.world.setBlock(px, py, pz, BlockType.OakDoorBottom) &&
        this.s.world.setBlock(px, py + 1, pz, BlockType.OakDoorTop);
    } else if (chosenBlock === BlockType.TallGrassBottom) {
      const below = this.s.world.getBlock(px, py - 1, pz);
      if (below !== BlockType.Grass && below !== BlockType.Dirt) {
        this.s.fx.toast('Grass must be planted on grass or dirt');
        return;
      }
      if (py + 1 >= CHUNK_HEIGHT || !isReplaceableBlock(this.s.world.getBlock(px, py + 1, pz))) {
        this.s.fx.toast('Not enough room for Tall Grass');
        return;
      }
      changed =
        this.s.world.setBlock(px, py, pz, BlockType.TallGrassBottom) &&
        this.s.world.setBlock(px, py + 1, pz, BlockType.TallGrassTop);
    } else if (chosenBlock === BlockType.ShortGrass) {
      const below = this.s.world.getBlock(px, py - 1, pz);
      if (below !== BlockType.Grass && below !== BlockType.Dirt) {
        this.s.fx.toast('Grass must be planted on grass or dirt');
        return;
      }
      changed = this.s.world.setBlock(px, py, pz, BlockType.ShortGrass);
    } else if (chosenBlock === BlockType.BedFoot) {
      const northExisting = this.s.world.getBlock(px, py, pz - 1);
      const canPlaceNorth =
        isReplaceableBlock(northExisting) &&
        !this.s.blockIntersectsPlayer(px, py, pz - 1);
      if (canPlaceNorth) {
        changed =
          this.s.world.setBlock(px, py, pz, BlockType.BedFoot) &&
          this.s.world.setBlock(px, py, pz - 1, BlockType.BedHead);
      } else {
        const southExisting = this.s.world.getBlock(px, py, pz + 1);
        const canPlaceSouth =
          isReplaceableBlock(southExisting) &&
          !this.s.blockIntersectsPlayer(px, py, pz + 1);
        if (canPlaceSouth) {
          changed =
            this.s.world.setBlock(px, py, pz, BlockType.BedHead) &&
            this.s.world.setBlock(px, py, pz + 1, BlockType.BedFoot);
        } else {
          this.s.fx.toast('Not enough room for a bed');
          return;
        }
      }
    } else {
      changed = this.s.world.setBlock(px, py, pz, chosenBlock);
    }

    if (changed) {
      if (this.s.mode === 'survival') {
        const slot = this.s.survivalSlots[this.s.activeSlot];
        if (slot) {
          slot.count -= 1;
          if (slot.count <= 0) {
            this.s.survivalSlots[this.s.activeSlot] = null;
          }
        }
        this.s.fx.viewmodelSync();
        this.s.emitInventory();
      }

      this.s.fx.viewmodelSwing();
      this.s.fx.particleBurst(px, py, pz, chosenBlock, 6);
      this.s.fx.sound('playPlace', [def.sound]);
      this.s.crosshairPulse = 1;
      this.s.fx.chunksDirty();
      this.s.scheduleSave();
      this.s.emitHud();
    }
  }

  throwHeldItem(dropWholeStack = false) {
    if (this.s.phase !== 'playing') return;

    let itemToDrop: ItemType | null = null;
    let dropCount = 1;
    let durability: number | undefined;

    if (this.s.mode === 'survival') {
      const slot = this.s.survivalSlots[this.s.activeSlot];
      if (!slot || slot.count <= 0) return;
      itemToDrop = slot.item;
      dropCount = dropWholeStack ? slot.count : 1;
      durability = slot.durability;
      slot.count -= dropCount;
      if (slot.count <= 0) {
        this.s.survivalSlots[this.s.activeSlot] = null;
      }
      this.s.fx.viewmodelSync();
      this.s.emitInventory();
      this.s.scheduleSave();
    } else {
      const held = this.s.creativeHotbar[this.s.activeSlot];
      if (held === undefined) return;
      itemToDrop = held;
      dropCount = 1;
    }

    if (itemToDrop === null) return;
    const def = ITEM_DEFS[itemToDrop];
    if (!def) return;

    _rayDir.copy(this.s.viewDir);
    const spawnX = this.s.eyePos.x + _rayDir.x * 0.55;
    const spawnY = this.s.eyePos.y - 0.18 + _rayDir.y * 0.25;
    const spawnZ = this.s.eyePos.z + _rayDir.z * 0.55;
    const throwVel = new Vec3(
      _rayDir.x * 5.2 + (Math.random() - 0.5) * 0.35,
      Math.max(1.8, _rayDir.y * 4.2 + 2.4),
      _rayDir.z * 5.2 + (Math.random() - 0.5) * 0.35,
    );

    this.s.fx.drop(itemToDrop,
      dropCount,
      spawnX,
      spawnY,
      spawnZ,
      throwVel,
      1.15,
      durability,);
    this.s.fx.viewmodelSwing();
    this.s.fx.sound('playUiTick', []);
    this.s.fx.toast(
      dropCount > 1 ? `Dropped ${def.name} ×${dropCount}` : `Dropped ${def.name}`,
    );
    this.s.emitHud();
  }

  pickTargetedBlock() {
    if (this.s.phase !== 'playing' || !this.s.currentTarget) return;
    const rawBlock = this.s.currentTarget.block;
    let b = rawBlock === BlockType.FurnaceLit ? BlockType.Furnace : rawBlock;
    if (isDoorBlock(b)) b = BlockType.OakDoorBottom;
    if (isBedBlock(b)) b = BlockType.BedFoot;
    if (b === BlockType.TallGrassTop) b = BlockType.TallGrassBottom;
    if (!BLOCK_DEFS[b]?.buildable) return;

    if (this.s.mode === 'creative') {
      this.s.assignBlockToActiveSlot(b as unknown as ItemType);
    } else {
      // In survival, jump to hotbar slot if you already have that block
      const idx = this.s.survivalSlots
        .slice(0, HOTBAR_SIZE)
        .findIndex((s) => s !== null && s.item === (b as unknown as ItemType));
      if (idx !== -1) {
        this.s.setActiveSlot(idx);
      }
    }
  }
}
