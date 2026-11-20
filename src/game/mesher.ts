import * as THREE from 'three';
import { emitJsonBlockModel, getBlockModel } from './blockModels';
import {
  BLOCK_DEFS,
  BlockType,
  isBedBlock,
  isCutoutBlock,
  isDoorBlock,
  isPlantBlock,
  isSolidBlock,
  isTransparentBlock,
  TILE,
} from './blocks';
import { ATLAS_COLS, ATLAS_ROWS } from './textures';
import { CHUNK_HEIGHT, CHUNK_SIZE, VoxelWorld } from './world';

interface FaceDef {
  dir: [number, number, number];
  /** 4 corners in CCW order when viewed from outside */
  corners: Array<{
    pos: [number, number, number];
    uv: [number, number];
    aoOffsets: [[number, number, number], [number, number, number], [number, number, number]];
  }>;
  shade: number;
  tileSlot: 0 | 1 | 2; // 0 = top, 1 = side, 2 = bottom
}

const FACES: FaceDef[] = [
  // +Y Top
  {
    dir: [0, 1, 0],
    shade: 1.0,
    tileSlot: 0,
    corners: [
      { pos: [0, 1, 1], uv: [0, 0], aoOffsets: [[-1, 1, 0], [0, 1, 1], [-1, 1, 1]] },
      { pos: [1, 1, 1], uv: [1, 0], aoOffsets: [[1, 1, 0], [0, 1, 1], [1, 1, 1]] },
      { pos: [1, 1, 0], uv: [1, 1], aoOffsets: [[1, 1, 0], [0, 1, -1], [1, 1, -1]] },
      { pos: [0, 1, 0], uv: [0, 1], aoOffsets: [[-1, 1, 0], [0, 1, -1], [-1, 1, -1]] },
    ],
  },
  // -Y Bottom
  {
    dir: [0, -1, 0],
    shade: 0.56,
    tileSlot: 2,
    corners: [
      { pos: [0, 0, 0], uv: [0, 0], aoOffsets: [[-1, -1, 0], [0, -1, -1], [-1, -1, -1]] },
      { pos: [1, 0, 0], uv: [1, 0], aoOffsets: [[1, -1, 0], [0, -1, -1], [1, -1, -1]] },
      { pos: [1, 0, 1], uv: [1, 1], aoOffsets: [[1, -1, 0], [0, -1, 1], [1, -1, 1]] },
      { pos: [0, 0, 1], uv: [0, 1], aoOffsets: [[-1, -1, 0], [0, -1, 1], [-1, -1, 1]] },
    ],
  },
  // +Z Front (South)
  {
    dir: [0, 0, 1],
    shade: 0.88,
    tileSlot: 1,
    corners: [
      { pos: [0, 0, 1], uv: [0, 0], aoOffsets: [[-1, 0, 1], [0, -1, 1], [-1, -1, 1]] },
      { pos: [1, 0, 1], uv: [1, 0], aoOffsets: [[1, 0, 1], [0, -1, 1], [1, -1, 1]] },
      { pos: [1, 1, 1], uv: [1, 1], aoOffsets: [[1, 0, 1], [0, 1, 1], [1, 1, 1]] },
      { pos: [0, 1, 1], uv: [0, 1], aoOffsets: [[-1, 0, 1], [0, 1, 1], [-1, 1, 1]] },
    ],
  },
  // -Z Back (North)
  {
    dir: [0, 0, -1],
    shade: 0.84,
    tileSlot: 1,
    corners: [
      { pos: [1, 0, 0], uv: [0, 0], aoOffsets: [[1, 0, -1], [0, -1, -1], [1, -1, -1]] },
      { pos: [0, 0, 0], uv: [1, 0], aoOffsets: [[-1, 0, -1], [0, -1, -1], [-1, -1, -1]] },
      { pos: [0, 1, 0], uv: [1, 1], aoOffsets: [[-1, 0, -1], [0, 1, -1], [-1, 1, -1]] },
      { pos: [1, 1, 0], uv: [0, 1], aoOffsets: [[1, 0, -1], [0, 1, -1], [1, 1, -1]] },
    ],
  },
  // +X Right (East)
  {
    dir: [1, 0, 0],
    shade: 0.78,
    tileSlot: 1,
    corners: [
      { pos: [1, 0, 1], uv: [0, 0], aoOffsets: [[1, 0, 1], [1, -1, 0], [1, -1, 1]] },
      { pos: [1, 0, 0], uv: [1, 0], aoOffsets: [[1, 0, -1], [1, -1, 0], [1, -1, -1]] },
      { pos: [1, 1, 0], uv: [1, 1], aoOffsets: [[1, 0, -1], [1, 1, 0], [1, 1, -1]] },
      { pos: [1, 1, 1], uv: [0, 1], aoOffsets: [[1, 0, 1], [1, 1, 0], [1, 1, 1]] },
    ],
  },
  // -X Left (West)
  {
    dir: [-1, 0, 0],
    shade: 0.74,
    tileSlot: 1,
    corners: [
      { pos: [0, 0, 0], uv: [0, 0], aoOffsets: [[-1, 0, -1], [-1, -1, 0], [-1, -1, -1]] },
      { pos: [0, 0, 1], uv: [1, 0], aoOffsets: [[-1, 0, 1], [-1, -1, 0], [-1, -1, 1]] },
      { pos: [0, 1, 1], uv: [1, 1], aoOffsets: [[-1, 0, 1], [-1, 1, 0], [-1, 1, 1]] },
      { pos: [0, 1, 0], uv: [0, 1], aoOffsets: [[-1, 0, -1], [-1, 1, 0], [-1, 1, -1]] },
    ],
  },
];

const AO_CURVE = [0.54, 0.72, 0.87, 1.0];

interface MeshBuilderBuffers {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function createBuffers(): MeshBuilderBuffers {
  return { positions: [], normals: [], uvs: [], colors: [], indices: [] };
}

function finalizeGeometry(buf: MeshBuilderBuffers): THREE.BufferGeometry | null {
  if (buf.positions.length === 0) return null;
  const geom = new THREE.BufferGeometry();
  geom.setAttribute('position', new THREE.Float32BufferAttribute(buf.positions, 3));
  geom.setAttribute('normal', new THREE.Float32BufferAttribute(buf.normals, 3));
  geom.setAttribute('uv', new THREE.Float32BufferAttribute(buf.uvs, 2));
  geom.setAttribute('color', new THREE.Float32BufferAttribute(buf.colors, 3));
  geom.setIndex(buf.indices);
  geom.computeBoundingSphere();
  return geom;
}

export interface ChunkGeometryBundle {
  opaque: THREE.BufferGeometry | null;
  transparent: THREE.BufferGeometry | null;
}

/**
 * Generates face-culled BufferGeometries for a single chunk with smooth 4-corner
 * Minecraft-style vertex ambient occlusion and diagonal quad-flipping.
 */
export function buildChunkGeometry(
  world: VoxelWorld,
  cx: number,
  cz: number,
): ChunkGeometryBundle {
  const opaqueBuf = createBuffers();
  const transBuf = createBuffers();

  const startX = cx * CHUNK_SIZE;
  const startZ = cz * CHUNK_SIZE;
  const tileW = 1 / ATLAS_COLS;
  const tileH = 1 / ATLAS_ROWS;
  const eps = 0.0012;

  for (let y = 0; y < CHUNK_HEIGHT; y++) {
    for (let lz = 0; lz < CHUNK_SIZE; lz++) {
      const wz = startZ + lz;
      for (let lx = 0; lx < CHUNK_SIZE; lx++) {
        const wx = startX + lx;
        const block = world.getBlock(wx, y, wz);
        if (block === BlockType.Air) continue;

        const def = BLOCK_DEFS[block];
        const isTrans = def.transparent;
        const isCutout = def.cutout === true;
        const isWater = block === BlockType.Water;
        const target = isTrans ? transBuf : opaqueBuf;

        // Minecraft JSON door models from /assets/models/block/door_*.json
        if (isDoorBlock(block)) {
          const isTop = block === BlockType.OakDoorTop || block === BlockType.OakDoorTopOpen;
          const isOpen = block === BlockType.OakDoorBottomOpen || block === BlockType.OakDoorTopOpen;
          const isRightHinge = isDoorBlock(world.getBlock(wx - 1, y, wz));
          const modelName = `door_${isTop ? 'top' : 'bottom'}_${isRightHinge ? 'right' : 'left'}${isOpen ? '_open' : ''}`;
          const doorModel = getBlockModel(modelName);
          const yRotDeg: 0 | 90 | 180 | 270 = isOpen ? (isRightHinge ? 180 : 0) : 270;

          if (
            doorModel &&
            emitJsonBlockModel(
              target,
              doorModel,
              wx,
              y,
              wz,
              {
                '#top': TILE.OAK_DOOR_TOP,
                '#bottom': TILE.OAK_DOOR_BOTTOM,
              },
              yRotDeg,
            )
          ) {
            continue;
          }

          // Fallback procedural door box if JSON model missing
          const mainTile = isTop ? TILE.OAK_DOOR_TOP : TILE.OAK_DOOR_BOTTOM;
          const edgeTile = TILE.OAK_PLANKS;
          const x0 = isOpen && isRightHinge ? 0.8125 : 0;
          const x1 = isOpen && !isRightHinge ? 0.1875 : 1;
          const z0 = isOpen ? 0 : 0.8125;
          const z1 = 1;
          pushBoxQuads(
            target,
            wx,
            y,
            wz,
            x0,
            0,
            z0,
            x1,
            1,
            z1,
            {
              top: edgeTile,
              bottom: edgeTile,
              south: isOpen ? edgeTile : mainTile,
              north: isOpen ? edgeTile : mainTile,
              east: isOpen ? mainTile : edgeTile,
              west: isOpen ? mainTile : edgeTile,
            },
            tileW,
            tileH,
            eps,
            false,
            false,
          );
          continue;
        }

        // Cross-quad Minecraft foliage plants (Short Grass, Tall Grass)
        if (isPlantBlock(block)) {
          pushCrossPlantQuads(target, wx, y, wz, def.tiles[1], tileW, tileH, eps);
          continue;
        }

        // Custom 9/16-tall Minecraft Bed mesh (Head at North -Z, Foot at South +Z)
        if (isBedBlock(block)) {
          const isHead = block === BlockType.BedHead;
          const omitSouth = isHead && world.getBlock(wx, y, wz + 1) === BlockType.BedFoot;
          const omitNorth = !isHead && world.getBlock(wx, y, wz - 1) === BlockType.BedHead;
          pushBedQuads(
            target,
            wx,
            y,
            wz,
            isHead,
            omitNorth,
            omitSouth,
            tileW,
            tileH,
            eps,
          );
          continue;
        }

        // Snow-dusted grass side if snow sits directly above grass
        const blockAbove = world.getBlock(wx, y + 1, wz);
        const snowCoveredGrass = block === BlockType.Grass && blockAbove === BlockType.Snow;

        for (let f = 0; f < FACES.length; f++) {
          const face = FACES[f];
          const nx = wx + face.dir[0];
          const ny = y + face.dir[1];
          const nz = wz + face.dir[2];

          const neighbor = world.getBlock(nx, ny, nz);

          if (!isTrans) {
            // Opaque or cutout block: only cull if neighbor is fully opaque (not air, transparent, or cutout)
            if (
              neighbor !== BlockType.Air &&
              !isTransparentBlock(neighbor) &&
              !isCutoutBlock(neighbor)
            ) {
              continue;
            }
          } else {
            // Transparent block (water/glass): cull against same type or solid non-cutout blocks
            if (neighbor === block) continue;
            if (!isTransparentBlock(neighbor) && !isCutoutBlock(neighbor) && neighbor !== BlockType.Air) continue;
          }

          let tileIndex = def.tiles[face.tileSlot];
          if (f === 2 && def.frontTile !== undefined) {
            tileIndex = def.frontTile;
          }
          if (snowCoveredGrass && face.tileSlot === 1) {
            tileIndex = TILE.SNOW_GRASS_SIDE;
          }

          const col = tileIndex % ATLAS_COLS;
          const row = Math.floor(tileIndex / ATLAS_COLS);
          // Canvas row 0 is at UV v = 1 (CanvasTexture flipY = true)
          const uMin = col * tileW + eps;
          const uMax = (col + 1) * tileW - eps;
          const vMax = 1 - row * tileH - eps;
          const vMin = 1 - (row + 1) * tileH + eps;

          const baseVertex = target.positions.length / 3;
          const aoValues: [number, number, number, number] = [3, 3, 3, 3];

          for (let c = 0; c < 4; c++) {
            const corner = face.corners[c];
            let py = y + corner.pos[1];
            // Slightly recess water surface below full block height for natural shorelines
            if (isWater && corner.pos[1] === 1 && blockAbove === BlockType.Air) {
              py -= 0.14;
            }

            target.positions.push(wx + corner.pos[0], py, wz + corner.pos[2]);
            target.normals.push(face.dir[0], face.dir[1], face.dir[2]);

            const u = corner.uv[0] === 0 ? uMin : uMax;
            const v = corner.uv[1] === 0 ? vMin : vMax;
            target.uvs.push(u, v);

            // Compute smooth 4-corner ambient occlusion (cutout foliage doesn't cast harsh corner shadows)
            let light = face.shade;
            if (!isTrans && !isCutout && !def.emissive) {
              const [o1, o2, oc] = corner.aoOffsets;
              const b1 = world.getBlock(wx + o1[0], y + o1[1], wz + o1[2]);
              const b2 = world.getBlock(wx + o2[0], y + o2[1], wz + o2[2]);
              const bc = world.getBlock(wx + oc[0], y + oc[1], wz + oc[2]);
              const s1 = isSolidBlock(b1) && !isCutoutBlock(b1) ? 1 : 0;
              const s2 = isSolidBlock(b2) && !isCutoutBlock(b2) ? 1 : 0;
              const sc = isSolidBlock(bc) && !isCutoutBlock(bc) ? 1 : 0;
              const ao = s1 && s2 ? 0 : 3 - (s1 + s2 + sc);
              aoValues[c] = ao;
              light *= AO_CURVE[ao];
            } else if (def.emissive) {
              light = 1.25;
            }

            // Slight warm glow tint on emissive blocks (e.g. lit furnace)
            if (def.emissive) {
              target.colors.push(1.25, 1.15, 0.92);
            } else {
              target.colors.push(light, light, light);
            }
          }

          // Flip quad diagonal to eliminate anisotropic AO interpolation artifacts
          if (aoValues[0] + aoValues[2] < aoValues[1] + aoValues[3]) {
            target.indices.push(
              baseVertex + 1,
              baseVertex + 2,
              baseVertex + 3,
              baseVertex + 1,
              baseVertex + 3,
              baseVertex + 0,
            );
          } else {
            target.indices.push(
              baseVertex + 0,
              baseVertex + 1,
              baseVertex + 2,
              baseVertex + 0,
              baseVertex + 2,
              baseVertex + 3,
            );
          }
        }
      }
    }
  }

  return {
    opaque: finalizeGeometry(opaqueBuf),
    transparent: finalizeGeometry(transBuf),
  };
}

function pushTexturedQuad(
  buf: MeshBuilderBuffers,
  p0: [number, number, number],
  p1: [number, number, number],
  p2: [number, number, number],
  p3: [number, number, number],
  nx: number,
  ny: number,
  nz: number,
  tileIndex: number,
  shade: number,
  tileW: number,
  tileH: number,
  eps: number,
) {
  const col = tileIndex % ATLAS_COLS;
  const row = Math.floor(tileIndex / ATLAS_COLS);
  const uMin = col * tileW + eps;
  const uMax = (col + 1) * tileW - eps;
  const vMax = 1 - row * tileH - eps;
  const vMin = 1 - (row + 1) * tileH + eps;

  const base = buf.positions.length / 3;
  buf.positions.push(...p0, ...p1, ...p2, ...p3);
  buf.normals.push(nx, ny, nz, nx, ny, nz, nx, ny, nz, nx, ny, nz);
  buf.uvs.push(uMin, vMin, uMax, vMin, uMax, vMax, uMin, vMax);
  buf.colors.push(
    shade,
    shade,
    shade,
    shade,
    shade,
    shade,
    shade,
    shade,
    shade,
    shade,
    shade,
    shade,
  );
  buf.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushBoxQuads(
  buf: MeshBuilderBuffers,
  wx: number,
  wy: number,
  wz: number,
  x0: number,
  y0: number,
  z0: number,
  x1: number,
  y1: number,
  z1: number,
  tiles: {
    top: number;
    bottom: number;
    south: number;
    north: number;
    east: number;
    west: number;
  },
  tileW: number,
  tileH: number,
  eps: number,
  omitNorth: boolean,
  omitSouth: boolean,
) {
  const ax0 = wx + x0;
  const ax1 = wx + x1;
  const ay0 = wy + y0;
  const ay1 = wy + y1;
  const az0 = wz + z0;
  const az1 = wz + z1;

  // +Y Top
  pushTexturedQuad(
    buf,
    [ax0, ay1, az1],
    [ax1, ay1, az1],
    [ax1, ay1, az0],
    [ax0, ay1, az0],
    0,
    1,
    0,
    tiles.top,
    1.0,
    tileW,
    tileH,
    eps,
  );
  // -Y Bottom
  pushTexturedQuad(
    buf,
    [ax0, ay0, az0],
    [ax1, ay0, az0],
    [ax1, ay0, az1],
    [ax0, ay0, az1],
    0,
    -1,
    0,
    tiles.bottom,
    0.58,
    tileW,
    tileH,
    eps,
  );
  // +Z South
  if (!omitSouth) {
    pushTexturedQuad(
      buf,
      [ax0, ay0, az1],
      [ax1, ay0, az1],
      [ax1, ay1, az1],
      [ax0, ay1, az1],
      0,
      0,
      1,
      tiles.south,
      0.88,
      tileW,
      tileH,
      eps,
    );
  }
  // -Z North
  if (!omitNorth) {
    pushTexturedQuad(
      buf,
      [ax1, ay0, az0],
      [ax0, ay0, az0],
      [ax0, ay1, az0],
      [ax1, ay1, az0],
      0,
      0,
      -1,
      tiles.north,
      0.84,
      tileW,
      tileH,
      eps,
    );
  }
  // +X East
  pushTexturedQuad(
    buf,
    [ax1, ay0, az1],
    [ax1, ay0, az0],
    [ax1, ay1, az0],
    [ax1, ay1, az1],
    1,
    0,
    0,
    tiles.east,
    0.78,
    tileW,
    tileH,
    eps,
  );
  // -X West
  pushTexturedQuad(
    buf,
    [ax0, ay0, az0],
    [ax0, ay0, az1],
    [ax0, ay1, az1],
    [ax0, ay1, az0],
    -1,
    0,
    0,
    tiles.west,
    0.74,
    tileW,
    tileH,
    eps,
  );
}

function pushBedQuads(
  buf: MeshBuilderBuffers,
  wx: number,
  wy: number,
  wz: number,
  isHead: boolean,
  omitNorth: boolean,
  omitSouth: boolean,
  tileW: number,
  tileH: number,
  eps: number,
) {
  const x0 = wx;
  const x1 = wx + 1;
  const z0 = wz;
  const z1 = wz + 1;
  const topY = wy + 9 / 16; // Minecraft bed height: 9px out of 16px
  const underY = wy + 3 / 16; // Leg clearance underneath wooden frame: 3px

  // +Y Top surface (pillow/quilt) at 9/16 height
  pushTexturedQuad(
    buf,
    [x0, topY, z1],
    [x1, topY, z1],
    [x1, topY, z0],
    [x0, topY, z0],
    0,
    1,
    0,
    isHead ? TILE.BED_HEAD_UP : TILE.BED_FOOT_UP,
    1.0,
    tileW,
    tileH,
    eps,
  );

  // -Y Underside (wooden slats) at 3/16 height
  pushTexturedQuad(
    buf,
    [x0, underY, z0],
    [x1, underY, z0],
    [x1, underY, z1],
    [x0, underY, z1],
    0,
    -1,
    0,
    TILE.BED_DOWN,
    0.6,
    tileW,
    tileH,
    eps,
  );

  // Side/end faces span full [wy, wy+1] vertically so 16x16 alpha-cutout bed PNGs align 1:1 with 9/16 top & 3/16 legs
  if (!omitNorth) {
    pushTexturedQuad(
      buf,
      [x1, wy, z0],
      [x0, wy, z0],
      [x0, wy + 1, z0],
      [x1, wy + 1, z0],
      0,
      0,
      -1,
      isHead ? TILE.BED_HEAD_NORTH : TILE.BED_FOOT_SOUTH,
      0.86,
      tileW,
      tileH,
      eps,
    );
  }
  if (!omitSouth) {
    pushTexturedQuad(
      buf,
      [x0, wy, z1],
      [x1, wy, z1],
      [x1, wy + 1, z1],
      [x0, wy + 1, z1],
      0,
      0,
      1,
      isHead ? TILE.BED_HEAD_NORTH : TILE.BED_FOOT_SOUTH,
      0.88,
      tileW,
      tileH,
      eps,
    );
  }
  // +X East
  pushTexturedQuad(
    buf,
    [x1, wy, z1],
    [x1, wy, z0],
    [x1, wy + 1, z0],
    [x1, wy + 1, z1],
    1,
    0,
    0,
    isHead ? TILE.BED_HEAD_EAST : TILE.BED_FOOT_EAST,
    0.8,
    tileW,
    tileH,
    eps,
  );
  // -X West
  pushTexturedQuad(
    buf,
    [x0, wy, z0],
    [x0, wy, z1],
    [x0, wy + 1, z1],
    [x0, wy + 1, z0],
    -1,
    0,
    0,
    isHead ? TILE.BED_HEAD_WEST : TILE.BED_FOOT_WEST,
    0.76,
    tileW,
    tileH,
    eps,
  );
}

/**
 * Emits classic Minecraft X-shaped double-sided crossed foliage quads for Short Grass & Tall Grass,
 * with subtle deterministic X/Z jitter so grassy meadows feel natural and organic.
 */
function pushCrossPlantQuads(
  buf: MeshBuilderBuffers,
  wx: number,
  wy: number,
  wz: number,
  tileIndex: number,
  tileW: number,
  tileH: number,
  eps: number,
) {
  // Deterministic per-column jitter (consistent between TallGrassBottom & TallGrassTop at same wx,wz)
  const h1 = Math.sin(wx * 127.1 + wz * 311.7) * 43758.5453;
  const h2 = Math.sin(wx * 269.5 + wz * 183.3) * 43758.5453;
  const jx = (h1 - Math.floor(h1) - 0.5) * 0.22;
  const jz = (h2 - Math.floor(h2) - 0.5) * 0.22;

  const pad = 0.14;
  const x0 = wx + pad + jx;
  const x1 = wx + 1 - pad + jx;
  const z0 = wz + pad + jz;
  const z1 = wz + 1 - pad + jz;
  const y0 = wy;
  const y1 = wy + 1;

  // Diagonal A: (x0, z0) -> (x1, z1), both sides
  pushTexturedQuad(
    buf,
    [x0, y0, z0],
    [x1, y0, z1],
    [x1, y1, z1],
    [x0, y1, z0],
    0.707,
    0.2,
    -0.707,
    tileIndex,
    0.94,
    tileW,
    tileH,
    eps,
  );
  pushTexturedQuad(
    buf,
    [x1, y0, z1],
    [x0, y0, z0],
    [x0, y1, z0],
    [x1, y1, z1],
    -0.707,
    0.2,
    0.707,
    tileIndex,
    0.88,
    tileW,
    tileH,
    eps,
  );

  // Diagonal B: (x0, z1) -> (x1, z0), both sides
  pushTexturedQuad(
    buf,
    [x0, y0, z1],
    [x1, y0, z0],
    [x1, y1, z0],
    [x0, y1, z1],
    0.707,
    0.2,
    0.707,
    tileIndex,
    0.92,
    tileW,
    tileH,
    eps,
  );
  pushTexturedQuad(
    buf,
    [x1, y0, z0],
    [x0, y0, z1],
    [x0, y1, z1],
    [x1, y1, z0],
    -0.707,
    0.2,
    -0.707,
    tileIndex,
    0.86,
    tileW,
    tileH,
    eps,
  );
}
