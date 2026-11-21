/**
 * Seeded deterministic PRNG and 2D/3D gradient noise for procedural voxel terrain.
 */

export function hashInt(x: number, y: number, z: number, seed: number): number {
  let h = (x * 374761393 + y * 668265263 + z * 2147483647 + seed * 1597334677) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967295;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const GRAD3: ReadonlyArray<[number, number, number]> = [
  [1, 1, 0],
  [-1, 1, 0],
  [1, -1, 0],
  [-1, -1, 0],
  [1, 0, 1],
  [-1, 0, 1],
  [1, 0, -1],
  [-1, 0, -1],
  [0, 1, 1],
  [0, -1, 1],
  [0, 1, -1],
  [0, -1, -1],
];

function fade(t: number): number {
  return t * t * t * (t * (t * 6 - 15) + 10);
}

function lerp(a: number, b: number, t: number): number {
  return a + t * (b - a);
}

export class SeededNoise {
  private readonly perm: Uint8Array;
  public readonly seed: number;

  constructor(seed: number) {
    this.seed = seed | 0;
    this.perm = new Uint8Array(512);
    const base = new Uint8Array(256);
    for (let i = 0; i < 256; i++) {
      base[i] = i;
    }
    const rng = mulberry32(this.seed);
    for (let i = 255; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      const tmp = base[i];
      base[i] = base[j];
      base[j] = tmp;
    }
    for (let i = 0; i < 512; i++) {
      this.perm[i] = base[i & 255];
    }
  }

  public noise2D(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const p = this.perm;
    const aa = p[p[X] + Y] % 12;
    const ab = p[p[X] + Y + 1] % 12;
    const ba = p[p[X + 1] + Y] % 12;
    const bb = p[p[X + 1] + Y + 1] % 12;

    const gAA = GRAD3[aa];
    const gBA = GRAD3[ba];
    const gAB = GRAD3[ab];
    const gBB = GRAD3[bb];

    const x1 = lerp(gAA[0] * xf + gAA[1] * yf, gBA[0] * (xf - 1) + gBA[1] * yf, u);
    const x2 = lerp(
      gAB[0] * xf + gAB[1] * (yf - 1),
      gBB[0] * (xf - 1) + gBB[1] * (yf - 1),
      u,
    );
    return lerp(x1, x2, v);
  }

  public noise3D(x: number, y: number, z: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const Z = Math.floor(z) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const zf = z - Math.floor(z);
    const u = fade(xf);
    const v = fade(yf);
    const w = fade(zf);

    const p = this.perm;
    const A = p[X] + Y;
    const AA = p[A] + Z;
    const AB = p[A + 1] + Z;
    const B = p[X + 1] + Y;
    const BA = p[B] + Z;
    const BB = p[B + 1] + Z;

    const dot = (idx: number, dx: number, dy: number, dz: number) => {
      const g = GRAD3[p[idx] % 12];
      return g[0] * dx + g[1] * dy + g[2] * dz;
    };

    const x1 = lerp(dot(AA, xf, yf, zf), dot(BA, xf - 1, yf, zf), u);
    const x2 = lerp(dot(AB, xf, yf - 1, zf), dot(BB, xf - 1, yf - 1, zf), u);
    const y1 = lerp(x1, x2, v);

    const x3 = lerp(dot(AA + 1, xf, yf, zf - 1), dot(BA + 1, xf - 1, yf, zf - 1), u);
    const x4 = lerp(
      dot(AB + 1, xf, yf - 1, zf - 1),
      dot(BB + 1, xf - 1, yf - 1, zf - 1),
      u,
    );
    const y2 = lerp(x3, x4, v);

    return lerp(y1, y2, w);
  }

  public fbm2D(
    x: number,
    y: number,
    octaves = 4,
    lacunarity = 2.0,
    gain = 0.5,
  ): number {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      total += this.noise2D(x * freq, y * freq) * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return total / norm;
  }

  public ridged2D(
    x: number,
    y: number,
    octaves = 3,
    lacunarity = 2.1,
    gain = 0.5,
  ): number {
    let total = 0;
    let freq = 1;
    let amp = 1;
    let norm = 0;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise2D(x * freq, y * freq));
      total += n * n * amp;
      norm += amp;
      amp *= gain;
      freq *= lacunarity;
    }
    return total / norm;
  }
}
