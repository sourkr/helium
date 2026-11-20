import * as THREE from 'three';
import {
  BLOCK_DEFS,
  BlockType,
  isBedBlock,
  isLeafBlock,
  isLiquidBlock,
  isLogBlock,
  isSolidBlock,
  TerrainPreset,
} from './blocks';
import { hashInt, SeededNoise } from './noise';

export const CHUNK_SIZE = 16;
export const CHUNK_HEIGHT = 48;
export const SEA_LEVEL = 12;

export interface RaycastHit {
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
  block: BlockType;
  distance: number;
}

export interface WorldSaveData {
  seed: number;
  preset: TerrainPreset;
  edits: Array<[string, number]>;
}

export function chunkKey(cx: number, cz: number): string {
  return `${cx},${cz}`;
}

export function blockKey(wx: number, wy: number, wz: number): string {
  return `${wx},${wy},${wz}`;
}

function floorDiv(n: number, d: number): number {
  return Math.floor(n / d);
}

function mod(n: number, d: number): number {
  return ((n % d) + d) % d;
}

export class VoxelWorld {
  public readonly seed: number;
  public readonly preset: TerrainPreset;
  private readonly noise: SeededNoise;
  private readonly detailNoise: SeededNoise;
  private readonly biomeNoise: SeededNoise;
  private readonly caveNoise: SeededNoise;

  private readonly chunks = new Map<string, Uint8Array>();
  private readonly edits = new Map<string, BlockType>();
  private readonly dirtyChunks = new Set<string>();

  constructor(seed: number, preset: TerrainPreset = 'meadows', savedEdits?: Array<[string, number]>) {
    this.seed = seed | 0;
    this.preset = preset;
    this.noise = new SeededNoise(this.seed);
    this.detailNoise = new SeededNoise(this.seed + 1013);
    this.biomeNoise = new SeededNoise(this.seed + 4219);
    this.caveNoise = new SeededNoise(this.seed + 7919);

    if (savedEdits) {
      for (const [key, val] of savedEdits) {
        const block = val in BLOCK_DEFS ? (val as BlockType) : BlockType.Air;
        this.edits.set(key, block);
      }
    }
  }

  public getEditCount(): number {
    return this.edits.size;
  }

  public exportSave(): WorldSaveData {
    return {
      seed: this.seed,
      preset: this.preset,
      edits: Array.from(this.edits.entries()),
    };
  }

  public hasChunk(cx: number, cz: number): boolean {
    return this.chunks.has(chunkKey(cx, cz));
  }

  public getLoadedChunkKeys(): string[] {
    return Array.from(this.chunks.keys());
  }

  public consumeDirtyChunks(): Array<[number, number]> {
    const list: Array<[number, number]> = [];
    for (const key of this.dirtyChunks) {
      const [cxStr, czStr] = key.split(',');
      list.push([Number(cxStr), Number(czStr)]);
    }
    this.dirtyChunks.clear();
    return list;
  }

  public markChunkDirty(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    if (this.chunks.has(key)) {
      this.dirtyChunks.add(key);
    }
  }

  public unloadChunk(cx: number, cz: number) {
    const key = chunkKey(cx, cz);
    this.chunks.delete(key);
    this.dirtyChunks.delete(key);
  }

  /**
   * Computes deterministic terrain elevation & biome scalar for any world (wx, wz).
   */
  public sampleColumn(wx: number, wz: number): { height: number; biome: string; temp: number; moisture: number } {
    const temp = this.biomeNoise.fbm2D(wx * 0.0085 + 17.3, wz * 0.0085 - 9.1, 3);
    const moisture = this.biomeNoise.fbm2D(wx * 0.009 - 41.7, wz * 0.009 + 23.4, 3);

    let height = 16;
    let biome = 'Sunlit Meadow';

    if (this.preset === 'meadows') {
      const continental = this.noise.fbm2D(wx * 0.011, wz * 0.011, 4, 2.0, 0.5);
      const hills = this.detailNoise.fbm2D(wx * 0.028, wz * 0.028, 3, 2.0, 0.45);
      const ridge = this.noise.ridged2D(wx * 0.0095 + 5.2, wz * 0.0095 - 3.8, 3);
      const mountainMask = Math.max(0, (continental + 0.12) * 1.4);
      height = Math.round(14.5 + continental * 10 + hills * 4.2 + ridge * mountainMask * 11.5);

      if (height <= SEA_LEVEL) biome = 'Azure Bay';
      else if (height <= SEA_LEVEL + 2) biome = 'Sandy Cove';
      else if (height >= 26) biome = 'Snowy Peak';
      else if (height >= 21) biome = 'Alpine Ridge';
      else if (moisture > 0.08) biome = 'Oak Woodland';
      else biome = 'Sunlit Meadow';
    } else if (this.preset === 'alpine') {
      const ridge = this.noise.ridged2D(wx * 0.013, wz * 0.013, 4);
      const valley = this.noise.fbm2D(wx * 0.012, wz * 0.012, 3);
      const crag = this.detailNoise.fbm2D(wx * 0.035, wz * 0.035, 3);
      height = Math.round(11 + ridge * 24 + valley * 5.5 + crag * 3.0);

      if (height <= SEA_LEVEL) biome = 'Glacial Tarn';
      else if (height >= 24) biome = 'Snowy Peak';
      else if (height >= 18) biome = 'Alpine Ridge';
      else biome = 'Pine Foothills';
    } else if (this.preset === 'archipelago') {
      const island = this.noise.fbm2D(wx * 0.018, wz * 0.018, 4, 2.0, 0.52);
      const ripple = this.detailNoise.fbm2D(wx * 0.04, wz * 0.04, 2);
      height = Math.round(9.5 + island * 16 + ripple * 2.5);

      if (height <= SEA_LEVEL) biome = 'Coral Sea';
      else if (height <= SEA_LEVEL + 2) biome = 'Sunlit Beach';
      else if (height >= 20) biome = 'Island Crest';
      else biome = 'Coastal Grove';
    } else {
      // Mesa Canyon
      const base = this.noise.fbm2D(wx * 0.012, wz * 0.012, 4);
      const raw = 14 + base * 18;
      // Stepped plateau terracing
      const terrace = Math.floor(raw / 4.5) * 4.5 + Math.min(4.5, Math.max(0, (raw % 4.5) * 1.5 - 1.1));
      const detail = this.detailNoise.fbm2D(wx * 0.035, wz * 0.035, 2) * 1.6;
      height = Math.round(terrace + detail);

      if (height <= SEA_LEVEL) biome = 'Canyon Oasis';
      else if (height >= 22) biome = 'Mesa Plateau';
      else biome = 'Redrock Valley';
    }

    // Gently keep immediate spawn area (0,0) above water so player spawns on dry ground
    const distFromOrigin = Math.hypot(wx, wz);
    if (distFromOrigin < 12) {
      const blend = 1 - distFromOrigin / 12;
      const minSafe = SEA_LEVEL + 3;
      if (height < minSafe) {
        height = Math.round(height + (minSafe - height) * blend);
      }
    }

    height = Math.max(4, Math.min(CHUNK_HEIGHT - 8, height));
    return { height, biome, temp, moisture };
  }

  public getBiomeAt(wx: number, wz: number): string {
    return this.sampleColumn(Math.floor(wx), Math.floor(wz)).biome;
  }

  public ensureChunk(cx: number, cz: number): Uint8Array {
    const key = chunkKey(cx, cz);
    const existing = this.chunks.get(key);
    if (existing) return existing;

    const data = new Uint8Array(CHUNK_SIZE * CHUNK_HEIGHT * CHUNK_SIZE);
    const startX = cx * CHUNK_SIZE;
    const startZ = cz * CHUNK_SIZE;

    const surfaceHeights = new Int16Array(CHUNK_SIZE * CHUNK_SIZE);
    const surfaceBlocks = new Uint8Array(CHUNK_SIZE * CHUNK_SIZE);

    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = startX + lx;
        const wz = startZ + lz;
        const { height } = this.sampleColumn(wx, wz);
        surfaceHeights[lz * CHUNK_SIZE + lx] = height;

        // Pick surface material by preset and altitude
        let topBlock = BlockType.Grass;
        let subBlock = BlockType.Dirt;

        if (this.preset === 'mesa') {
          if (height <= SEA_LEVEL + 1) {
            topBlock = BlockType.Sand;
            subBlock = BlockType.Sandstone;
          } else {
            topBlock = height % 5 === 0 ? BlockType.Sandstone : BlockType.Terracotta;
            subBlock = BlockType.Terracotta;
          }
        } else {
          if (height <= SEA_LEVEL + 1) {
            topBlock = BlockType.Sand;
            subBlock = BlockType.Sand;
          } else if (height >= 26 || (this.preset === 'alpine' && height >= 23)) {
            topBlock = BlockType.Snow;
            subBlock = BlockType.Stone;
          } else if (height >= 22 && this.preset !== 'archipelago') {
            topBlock = BlockType.Stone;
            subBlock = BlockType.Stone;
          }
        }

        surfaceBlocks[lz * CHUNK_SIZE + lx] = topBlock;

        for (let y = 0; y < CHUNK_HEIGHT; y++) {
          let block = BlockType.Air;

          if (y === 0) {
            block = BlockType.Bedrock;
          } else if (y <= height) {
            // Subtle shallow caves underneath hills (never puncturing seabed or surface)
            const isCave =
              y > 2 &&
              y < height - 3 &&
              y < 20 &&
              this.caveNoise.noise3D(wx * 0.085, y * 0.11, wz * 0.085) > 0.48;

            if (isCave) {
              block = BlockType.Air;
            } else if (y === height) {
              block = topBlock;
            } else if (y >= height - 3) {
              block = subBlock;
            } else {
              // Stone with mineral ore veins
              const oreRoll = hashInt(wx, y, wz, this.seed + 55);
              if (y < 14 && oreRoll > 0.968) {
                block = BlockType.IronOre;
              } else if (y < 20 && oreRoll < 0.042) {
                block = BlockType.CoalOre;
              } else if (this.preset === 'mesa' && y > height - 8) {
                block = y % 3 === 0 ? BlockType.Sandstone : BlockType.Terracotta;
              } else {
                block = BlockType.Stone;
              }
            }
          } else if (y <= SEA_LEVEL) {
            block = BlockType.Water;
          }

          data[(y * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = block;
        }
      }
    }

    // Generate trees cleanly within [2..13] local bounds so canopies never clip across chunks
    const treeChance =
      this.preset === 'mesa'
        ? 0.012
        : this.preset === 'alpine'
          ? 0.032
          : this.preset === 'archipelago'
            ? 0.028
            : 0.038;

    for (let lz = 2; lz <= CHUNK_SIZE - 3; lz += 3) {
      for (let lx = 2; lx <= CHUNK_SIZE - 3; lx += 3) {
        const jx = lx + Math.floor(hashInt(cx * 31 + lx, 1, cz * 17 + lz, this.seed) * 2);
        const jz = lz + Math.floor(hashInt(cx * 17 + lx, 2, cz * 31 + lz, this.seed) * 2);
        if (jx < 2 || jx > CHUNK_SIZE - 3 || jz < 2 || jz > CHUNK_SIZE - 3) continue;

        const wx = startX + jx;
        const wz = startZ + jz;

        // Keep spawn clearing & cottage pad free of trees
        if (Math.hypot(wx, wz) < 7 || Math.hypot(wx - 7, wz + 8) < 6) continue;

        const colIdx = jz * CHUNK_SIZE + jx;
        const groundY = surfaceHeights[colIdx];
        const groundBlock = surfaceBlocks[colIdx];

        if (groundBlock !== BlockType.Grass || groundY <= SEA_LEVEL + 1 || groundY > CHUNK_HEIGHT - 9) {
          continue;
        }

        const roll = hashInt(wx, groundY, wz, this.seed + 313);
        const moistureBoost = Math.max(0, this.biomeNoise.noise2D(wx * 0.015, wz * 0.015) * 0.04);
        if (roll > treeChance + moistureBoost) continue;

        const isBirch = hashInt(wx, 99, wz, this.seed) > 0.68;
        const trunkBlock = isBirch ? BlockType.BirchLog : BlockType.OakLog;
        const leafBlock = isBirch ? BlockType.BirchLeaves : BlockType.OakLeaves;
        const trunkHeight = 4 + Math.floor(hashInt(wx, 17, wz, this.seed) * 3);

        // Trunk
        for (let ty = 1; ty <= trunkHeight; ty++) {
          const y = groundY + ty;
          if (y < CHUNK_HEIGHT) {
            data[(y * CHUNK_SIZE + jz) * CHUNK_SIZE + jx] = trunkBlock;
          }
        }

        // Layered rounded voxel canopy
        const canopyBase = groundY + trunkHeight - 1;
        for (let dy = 0; dy <= 3; dy++) {
          const y = canopyBase + dy;
          if (y >= CHUNK_HEIGHT) continue;
          const radius = dy === 3 ? 1 : dy === 0 ? 1 : 2;
          for (let dz = -radius; dz <= radius; dz++) {
            for (let dx = -radius; dx <= radius; dx++) {
              if (Math.abs(dx) === radius && Math.abs(dz) === radius && (dy === 2 || dy === 3 || hashInt(wx + dx, y, wz + dz, this.seed) > 0.45)) {
                continue;
              }
              const nx = jx + dx;
              const nz = jz + dz;
              const idx = (y * CHUNK_SIZE + nz) * CHUNK_SIZE + nx;
              if (data[idx] === BlockType.Air) {
                data[idx] = leafBlock;
              }
            }
          }
        }
      }
    }

    // Generate natural short & tall grass patches on exposed Grass blocks
    if (this.preset !== 'mesa') {
      const grassBaseDensity =
        this.preset === 'meadows'
          ? 0.24
          : this.preset === 'archipelago'
            ? 0.18
            : 0.12;
      for (let lz = 0; lz < CHUNK_SIZE; lz++) {
        const wz = startZ + lz;
        for (let lx = 0; lx < CHUNK_SIZE; lx++) {
          const wx = startX + lx;
          const colIdx = lz * CHUNK_SIZE + lx;
          const groundY = surfaceHeights[colIdx];
          if (
            surfaceBlocks[colIdx] !== BlockType.Grass ||
            groundY <= SEA_LEVEL ||
            groundY >= CHUNK_HEIGHT - 3
          ) {
            continue;
          }
          const aboveIdx = ((groundY + 1) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          if (data[aboveIdx] !== BlockType.Air) continue;

          // Patchy noise clumping so meadows alternate lush tufts and open paths
          const patch = this.detailNoise.noise2D(wx * 0.08 + 11.4, wz * 0.08 - 7.9);
          if (patch < -0.15) continue;

          const roll = hashInt(wx, groundY + 7, wz, this.seed + 881);
          const threshold = grassBaseDensity + Math.max(0, patch) * 0.22;
          if (roll > threshold) continue;

          const tallRoll = hashInt(wx, groundY + 19, wz, this.seed + 1423);
          const above2Idx = ((groundY + 2) * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;
          if (tallRoll < 0.26 && data[above2Idx] === BlockType.Air) {
            data[aboveIdx] = BlockType.TallGrassBottom;
            data[above2Idx] = BlockType.TallGrassTop;
          } else {
            data[aboveIdx] = BlockType.ShortGrass;
          }
        }
      }
    }

    // Re-apply any persistent player edits inside this chunk
    for (const [eKey, blockType] of this.edits) {
      const [ex, ey, ez] = eKey.split(',').map(Number);
      if (
        ey >= 0 &&
        ey < CHUNK_HEIGHT &&
        floorDiv(ex, CHUNK_SIZE) === cx &&
        floorDiv(ez, CHUNK_SIZE) === cz
      ) {
        const lx = mod(ex, CHUNK_SIZE);
        const lz = mod(ez, CHUNK_SIZE);
        data[(ey * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] = blockType;
      }
    }

    this.chunks.set(key, data);
    this.dirtyChunks.add(key);

    // Neighbor chunks also need remeshing on their shared boundary once this chunk loads
    this.markChunkDirty(cx - 1, cz);
    this.markChunkDirty(cx + 1, cz);
    this.markChunkDirty(cx, cz - 1);
    this.markChunkDirty(cx, cz + 1);

    return data;
  }

  public getBlock(wx: number, wy: number, wz: number): BlockType {
    if (wy < 0 || wy >= CHUNK_HEIGHT) return BlockType.Air;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const chunk = this.chunks.get(chunkKey(cx, cz));
    if (!chunk) return BlockType.Air;
    const lx = mod(wx, CHUNK_SIZE);
    const lz = mod(wz, CHUNK_SIZE);
    return chunk[(wy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx] as BlockType;
  }

  public setBlock(wx: number, wy: number, wz: number, block: BlockType): boolean {
    if (wy <= 0 || wy >= CHUNK_HEIGHT) return false;
    const cx = floorDiv(wx, CHUNK_SIZE);
    const cz = floorDiv(wz, CHUNK_SIZE);
    const chunk = this.ensureChunk(cx, cz);
    const lx = mod(wx, CHUNK_SIZE);
    const lz = mod(wz, CHUNK_SIZE);
    const idx = (wy * CHUNK_SIZE + lz) * CHUNK_SIZE + lx;

    if (chunk[idx] === block) return false;
    chunk[idx] = block;
    this.edits.set(blockKey(wx, wy, wz), block);

    this.markChunkDirty(cx, cz);
    if (lx === 0) this.markChunkDirty(cx - 1, cz);
    if (lx === CHUNK_SIZE - 1) this.markChunkDirty(cx + 1, cz);
    if (lz === 0) this.markChunkDirty(cx, cz - 1);
    if (lz === CHUNK_SIZE - 1) this.markChunkDirty(cx, cz + 1);

    return true;
  }

  /**
   * Returns true if a non-air block at (wx, wy, wz) was explicitly placed by the player
   * (used to keep player-placed leaves persistent so they never decay, just like Minecraft).
   */
  public isPlayerPlacedBlock(wx: number, wy: number, wz: number): boolean {
    const edited = this.edits.get(blockKey(wx, wy, wz));
    return edited !== undefined && edited !== BlockType.Air;
  }

  /**
   * Minecraft-style 6-connected Manhattan distance <= 6 BFS from a leaf block
   * through connected leaves to check whether any log still supports it.
   */
  public isLeafSupported(wx: number, wy: number, wz: number, maxDist = 6): boolean {
    if (!isLeafBlock(this.getBlock(wx, wy, wz))) return true;

    const visited = new Set<string>();
    const queueX: number[] = [wx];
    const queueY: number[] = [wy];
    const queueZ: number[] = [wz];
    const queueD: number[] = [0];
    visited.add(blockKey(wx, wy, wz));

    const dirs: ReadonlyArray<[number, number, number]> = [
      [1, 0, 0],
      [-1, 0, 0],
      [0, 1, 0],
      [0, -1, 0],
      [0, 0, 1],
      [0, 0, -1],
    ];

    let head = 0;
    while (head < queueX.length) {
      const cx = queueX[head];
      const cy = queueY[head];
      const cz = queueZ[head];
      const dist = queueD[head];
      head++;

      if (dist >= maxDist) continue;

      for (let i = 0; i < 6; i++) {
        const nx = cx + dirs[i][0];
        const ny = cy + dirs[i][1];
        const nz = cz + dirs[i][2];
        if (ny < 0 || ny >= CHUNK_HEIGHT) continue;

        const nb = this.getBlock(nx, ny, nz);
        if (isLogBlock(nb)) return true;

        if (isLeafBlock(nb) && dist + 1 < maxDist) {
          const nKey = blockKey(nx, ny, nz);
          if (!visited.has(nKey)) {
            visited.add(nKey);
            queueX.push(nx);
            queueY.push(ny);
            queueZ.push(nz);
            queueD.push(dist + 1);
          }
        }
      }
    }

    return false;
  }

  /**
   * Returns the Y coordinate of the top of the highest solid block at (wx, wz).
   */
  public getGroundY(wx: number, wz: number): number {
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const cx = floorDiv(ix, CHUNK_SIZE);
    const cz = floorDiv(iz, CHUNK_SIZE);
    this.ensureChunk(cx, cz);

    for (let y = CHUNK_HEIGHT - 1; y >= 0; y--) {
      const b = this.getBlock(ix, y, iz);
      if (isSolidBlock(b)) {
        return y + 1;
      }
    }
    return SEA_LEVEL + 2;
  }

  /**
   * Returns a valid mob spawn Y (top of a solid, non-leaf, non-liquid block with
   * 2 clear air blocks above), ensuring mobs never spawn on top of tree leaves.
   */
  public getMobSpawnY(wx: number, wz: number): number | null {
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const cx = floorDiv(ix, CHUNK_SIZE);
    const cz = floorDiv(iz, CHUNK_SIZE);
    this.ensureChunk(cx, cz);

    for (let y = CHUNK_HEIGHT - 3; y >= 1; y--) {
      const b = this.getBlock(ix, y, iz);
      if (b === BlockType.Air || isLiquidBlock(b) || isLeafBlock(b)) continue;
      if (!isSolidBlock(b)) continue;
      const above1 = this.getBlock(ix, y + 1, iz);
      const above2 = this.getBlock(ix, y + 2, iz);
      if (
        !isSolidBlock(above1) &&
        !isLiquidBlock(above1) &&
        !isSolidBlock(above2) &&
        !isLiquidBlock(above2)
      ) {
        return y + 1;
      }
    }
    return null;
  }

  /**
   * Returns the solid non-leaf ground Y near or below a mob's current height,
   * so mobs walking beneath tree canopies stay on the ground and never climb leaves.
   */
  public getMobGroundY(wx: number, wz: number, refY: number): number {
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const cx = floorDiv(ix, CHUNK_SIZE);
    const cz = floorDiv(iz, CHUNK_SIZE);
    this.ensureChunk(cx, cz);

    const startY = Math.min(CHUNK_HEIGHT - 3, Math.max(2, Math.floor(refY) + 1));
    for (let y = startY; y >= 1; y--) {
      const b = this.getBlock(ix, y, iz);
      if (b === BlockType.Air || isLiquidBlock(b) || isLeafBlock(b)) continue;
      if (!isSolidBlock(b)) continue;
      const above1 = this.getBlock(ix, y + 1, iz);
      if (!isSolidBlock(above1)) {
        return y + 1;
      }
    }
    return this.getMobSpawnY(wx, wz) ?? this.getGroundY(wx, wz);
  }

  /**
   * Finds the top Y surface of the first solid block directly beneath (wx, wy, wz)
   * within maxDrop blocks for grounding player and entity contact shadows.
   */
  public getShadowSurfaceY(wx: number, wy: number, wz: number, maxDrop = 9): number | null {
    const ix = Math.floor(wx);
    const iz = Math.floor(wz);
    const startY = Math.min(CHUNK_HEIGHT - 1, Math.floor(wy + 0.15));
    const minY = Math.max(0, startY - maxDrop);

    for (let y = startY; y >= minY; y--) {
      const b = this.getBlock(ix, y, iz);
      if (isSolidBlock(b)) {
        const surfaceY = isBedBlock(b) ? y + 9 / 16 : y + 1;
        if (surfaceY <= wy + 0.25) {
          return surfaceY;
        }
      }
    }
    return null;
  }

  /**
   * Fast, zero-allocation Amanatides & Woo 3D voxel DDA raycaster.
   */
  public raycast(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    maxDistance = 6.5,
    includeLiquids = false,
  ): RaycastHit | null {
    let x = Math.floor(origin.x);
    let y = Math.floor(origin.y);
    let z = Math.floor(origin.z);

    const dx = direction.x;
    const dy = direction.y;
    const dz = direction.z;

    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;

    const tDeltaX = dx !== 0 ? Math.abs(1 / dx) : Infinity;
    const tDeltaY = dy !== 0 ? Math.abs(1 / dy) : Infinity;
    const tDeltaZ = dz !== 0 ? Math.abs(1 / dz) : Infinity;

    let tMaxX =
      dx > 0
        ? (x + 1 - origin.x) * tDeltaX
        : dx < 0
          ? (origin.x - x) * tDeltaX
          : Infinity;
    let tMaxY =
      dy > 0
        ? (y + 1 - origin.y) * tDeltaY
        : dy < 0
          ? (origin.y - y) * tDeltaY
          : Infinity;
    let tMaxZ =
      dz > 0
        ? (z + 1 - origin.z) * tDeltaZ
        : dz < 0
          ? (origin.z - z) * tDeltaZ
          : Infinity;

    let nx = 0;
    let ny = 0;
    let nz = 0;
    let dist = 0;

    for (let i = 0; i < 64; i++) {
      if (dist > maxDistance) break;

      const block = this.getBlock(x, y, z);
      if (block !== BlockType.Air && (includeLiquids || !isLiquidBlock(block))) {
        return { x, y, z, nx, ny, nz, block, distance: dist };
      }

      if (tMaxX < tMaxY) {
        if (tMaxX < tMaxZ) {
          dist = tMaxX;
          x += stepX;
          tMaxX += tDeltaX;
          nx = -stepX;
          ny = 0;
          nz = 0;
        } else {
          dist = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      } else {
        if (tMaxY < tMaxZ) {
          dist = tMaxY;
          y += stepY;
          tMaxY += tDeltaY;
          nx = 0;
          ny = -stepY;
          nz = 0;
        } else {
          dist = tMaxZ;
          z += stepZ;
          tMaxZ += tDeltaZ;
          nx = 0;
          ny = 0;
          nz = -stepZ;
        }
      }
    }

    return null;
  }
}
