import { ATLAS_COLS, ATLAS_ROWS } from './textures';

export type ModelFaceDir = 'down' | 'up' | 'north' | 'south' | 'west' | 'east';

export interface MinecraftModelFace {
  uv?: [number, number, number, number];
  texture: string;
  cullface?: ModelFaceDir;
  rotation?: 0 | 90 | 180 | 270;
}

export interface MinecraftModelElement {
  from: [number, number, number];
  to: [number, number, number];
  faces: Partial<Record<ModelFaceDir, MinecraftModelFace>>;
}

export interface MinecraftBlockModel {
  ambientocclusion?: boolean;
  textures?: Record<string, string>;
  elements?: MinecraftModelElement[];
}

const RAW_BLOCK_MODELS = import.meta.glob('/assets/models/block/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, MinecraftBlockModel>;

const MODEL_BY_NAME = new Map<string, MinecraftBlockModel>();
for (const [path, model] of Object.entries(RAW_BLOCK_MODELS)) {
  const file = (path.split('/').pop() ?? '').toLowerCase();
  const stem = file.replace(/\.json$/, '');
  if (stem && model) {
    MODEL_BY_NAME.set(stem, model);
  }
}

export function getBlockModel(name: string): MinecraftBlockModel | null {
  return MODEL_BY_NAME.get(name.toLowerCase()) ?? null;
}

export interface ModelMeshTarget {
  positions: number[];
  normals: number[];
  uvs: number[];
  colors: number[];
  indices: number[];
}

function rotatePointY(
  x: number,
  z: number,
  yRotDeg: 0 | 90 | 180 | 270,
): [number, number] {
  switch (yRotDeg) {
    case 90:
      return [1 - z, x];
    case 180:
      return [1 - x, 1 - z];
    case 270:
      return [z, 1 - x];
    default:
      return [x, z];
  }
}

function rotateNormalY(
  nx: number,
  ny: number,
  nz: number,
  yRotDeg: 0 | 90 | 180 | 270,
): [number, number, number] {
  switch (yRotDeg) {
    case 90:
      return [-nz, ny, nx];
    case 180:
      return [-nx, ny, -nz];
    case 270:
      return [nz, ny, -nx];
    default:
      return [nx, ny, nz];
  }
}

function getShadeForNormal(nx: number, ny: number, nz: number): number {
  if (ny > 0.5) return 1.0;
  if (ny < -0.5) return 0.58;
  if (nz > 0.5) return 0.88;
  if (nz < -0.5) return 0.84;
  if (nx > 0.5) return 0.78;
  return 0.74;
}

/**
 * Emits all quads from a Minecraft JSON block model (from /assets/models/block/*.json)
 * into a chunk mesh buffer with exact pixel UVs, UV rotation, and Y-axis blockstate rotation.
 */
export function emitJsonBlockModel(
  target: ModelMeshTarget,
  model: MinecraftBlockModel,
  wx: number,
  wy: number,
  wz: number,
  textureTiles: Record<string, number>,
  yRotDeg: 0 | 90 | 180 | 270 = 0,
): boolean {
  if (!model.elements || model.elements.length === 0) return false;

  const tileW = 1 / ATLAS_COLS;
  const tileH = 1 / ATLAS_ROWS;
  const eps = 0.0012;

  for (const elem of model.elements) {
    const x0 = elem.from[0] / 16;
    const y0 = elem.from[1] / 16;
    const z0 = elem.from[2] / 16;
    const x1 = elem.to[0] / 16;
    const y1 = elem.to[1] / 16;
    const z1 = elem.to[2] / 16;

    const faceEntries: Array<{
      dir: ModelFaceDir;
      normal: [number, number, number];
      // 4 corners in CCW order when viewed from outside: [BL, BR, TR, TL] in face UV space
      corners: [[number, number, number], [number, number, number], [number, number, number], [number, number, number]];
      defaultUv: [number, number, number, number];
    }> = [
      {
        dir: 'down',
        normal: [0, -1, 0],
        corners: [
          [x0, y0, z0],
          [x1, y0, z0],
          [x1, y0, z1],
          [x0, y0, z1],
        ],
        defaultUv: [elem.from[0], 16 - elem.to[2], elem.to[0], 16 - elem.from[2]],
      },
      {
        dir: 'up',
        normal: [0, 1, 0],
        corners: [
          [x0, y1, z1],
          [x1, y1, z1],
          [x1, y1, z0],
          [x0, y1, z0],
        ],
        defaultUv: [elem.from[0], elem.from[2], elem.to[0], elem.to[2]],
      },
      {
        dir: 'north',
        normal: [0, 0, -1],
        corners: [
          [x1, y0, z0],
          [x0, y0, z0],
          [x0, y1, z0],
          [x1, y1, z0],
        ],
        defaultUv: [16 - elem.to[0], 16 - elem.to[1], 16 - elem.from[0], 16 - elem.from[1]],
      },
      {
        dir: 'south',
        normal: [0, 0, 1],
        corners: [
          [x0, y0, z1],
          [x1, y0, z1],
          [x1, y1, z1],
          [x0, y1, z1],
        ],
        defaultUv: [elem.from[0], 16 - elem.to[1], elem.to[0], 16 - elem.from[1]],
      },
      {
        dir: 'west',
        normal: [-1, 0, 0],
        corners: [
          [x0, y0, z0],
          [x0, y0, z1],
          [x0, y1, z1],
          [x0, y1, z0],
        ],
        defaultUv: [elem.from[2], 16 - elem.to[1], elem.to[2], 16 - elem.from[1]],
      },
      {
        dir: 'east',
        normal: [1, 0, 0],
        corners: [
          [x1, y0, z1],
          [x1, y0, z0],
          [x1, y1, z0],
          [x1, y1, z1],
        ],
        defaultUv: [16 - elem.to[2], 16 - elem.to[1], 16 - elem.from[2], 16 - elem.from[1]],
      },
    ];

    for (const f of faceEntries) {
      const faceDef = elem.faces[f.dir];
      if (!faceDef) continue;

      const tileIndex = textureTiles[faceDef.texture] ?? textureTiles[faceDef.texture.replace(/^#/, '')];
      if (tileIndex === undefined) continue;

      const col = tileIndex % ATLAS_COLS;
      const row = Math.floor(tileIndex / ATLAS_COLS);
      const uTileMin = col * tileW + eps;
      const uTileMax = (col + 1) * tileW - eps;
      const vTileMax = 1 - row * tileH - eps;
      const vTileMin = 1 - (row + 1) * tileH + eps;

      const [pu1, pv1, pu2, pv2] = faceDef.uv ?? f.defaultUv;
      const mapU = (pu: number) => uTileMin + (pu / 16) * (uTileMax - uTileMin);
      const mapV = (pv: number) => vTileMax - (pv / 16) * (vTileMax - vTileMin);

      // Corner UVs for [BL, BR, TR, TL]:
      // BL=(pu1,pv2), BR=(pu2,pv2), TR=(pu2,pv1), TL=(pu1,pv1)
      const uvCorners: Array<[number, number]> = [
        [mapU(pu1), mapV(pv2)],
        [mapU(pu2), mapV(pv2)],
        [mapU(pu2), mapV(pv1)],
        [mapU(pu1), mapV(pv1)],
      ];

      // Minecraft face UV rotation rotates UV texture clockwise by 90/180/270 deg
      const rotSteps = ((faceDef.rotation ?? 0) / 90) & 3;
      const [rnx, rny, rnz] = rotateNormalY(f.normal[0], f.normal[1], f.normal[2], yRotDeg);
      const shade = getShadeForNormal(rnx, rny, rnz);
      const baseVertex = target.positions.length / 3;

      for (let c = 0; c < 4; c++) {
        const [cx, cy, cz] = f.corners[c];
        const [rx, rz] = rotatePointY(cx, cz, yRotDeg);
        target.positions.push(wx + rx, wy + cy, wz + rz);
        target.normals.push(rnx, rny, rnz);

        const uvIdx = (c + rotSteps) & 3;
        target.uvs.push(uvCorners[uvIdx][0], uvCorners[uvIdx][1]);
        target.colors.push(shade, shade, shade);
      }

      target.indices.push(
        baseVertex,
        baseVertex + 1,
        baseVertex + 2,
        baseVertex,
        baseVertex + 2,
        baseVertex + 3,
      );
    }
  }

  return true;
}
