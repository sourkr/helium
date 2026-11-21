import * as THREE from 'three';
import {
  BLOCK_DEFS,
  BlockType,
  isLeafBlock,
  isLiquidBlock,
  isSolidBlock,
  TILE,
} from '../shared/blocks';
import { ITEM_DEFS, ItemType } from '../shared/survival';
import { ATLAS_COLS, ATLAS_ROWS } from './textures';
import { VoxelWorld } from '../shared/world';

/**
 * Generates a soft radial Minecraft-style ground contact shadow texture.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 64;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const half = size / 2;
  const grad = ctx.createRadialGradient(half, half, 2, half, half, half);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.36)');
  grad.addColorStop(0.85, 'rgba(0, 0, 0, 0.08)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

/**
 * First-person Player Shadow Rig:
 * 1) Soft circular Minecraft ground contact shadow projected directly beneath the player's feet.
 * 2) Invisible-to-camera shadow-only Minecraft silhouette that casts a real directional sun shadow.
 */
export class PlayerShadowRig {
  public readonly root = new THREE.Group();
  private readonly contactMesh: THREE.Mesh;
  private readonly contactMat: THREE.MeshBasicMaterial;
  private readonly contactTex: THREE.CanvasTexture;
  private readonly bodyGroup = new THREE.Group();
  private readonly leftArm: THREE.Mesh;
  private readonly rightArm: THREE.Mesh;
  private readonly leftLeg: THREE.Mesh;
  private readonly rightLeg: THREE.Mesh;
  private readonly shadowOnlyMat: THREE.MeshBasicMaterial;
  private readonly casterMeshes: THREE.Mesh[] = [];
  private readonly geoms: THREE.BufferGeometry[] = [];
  private walkPhase = 0;
  private enabled = true;

  constructor() {
    this.contactTex = createContactShadowTexture();
    const discGeom = new THREE.PlaneGeometry(0.95, 0.95);
    this.geoms.push(discGeom);
    this.contactMat = new THREE.MeshBasicMaterial({
      map: this.contactTex,
      transparent: true,
      opacity: 0.52,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    this.contactMesh = new THREE.Mesh(discGeom, this.contactMat);
    this.contactMesh.rotation.x = -Math.PI / 2;
    this.contactMesh.renderOrder = 1;
    this.root.add(this.contactMesh);

    // Shadow-only Minecraft player silhouette (writes nothing to color/depth in camera pass,
    // while casting an animated directional shadow onto the terrain from the sun!)
    this.shadowOnlyMat = new THREE.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
    });

    const headGeom = new THREE.BoxGeometry(0.46, 0.46, 0.46);
    const torsoGeom = new THREE.BoxGeometry(0.48, 0.68, 0.24);
    const limbGeom = new THREE.BoxGeometry(0.22, 0.68, 0.22);
    this.geoms.push(headGeom, torsoGeom, limbGeom);

    const head = new THREE.Mesh(headGeom, this.shadowOnlyMat);
    head.position.set(0, 1.56, 0);
    const torso = new THREE.Mesh(torsoGeom, this.shadowOnlyMat);
    torso.position.set(0, 1.0, 0);

    this.leftArm = new THREE.Mesh(limbGeom, this.shadowOnlyMat);
    this.leftArm.position.set(-0.35, 1.0, 0);
    this.rightArm = new THREE.Mesh(limbGeom, this.shadowOnlyMat);
    this.rightArm.position.set(0.35, 1.0, 0);

    this.leftLeg = new THREE.Mesh(limbGeom, this.shadowOnlyMat);
    this.leftLeg.position.set(-0.13, 0.34, 0);
    this.rightLeg = new THREE.Mesh(limbGeom, this.shadowOnlyMat);
    this.rightLeg.position.set(0.13, 0.34, 0);

    this.casterMeshes.push(head, torso, this.leftArm, this.rightArm, this.leftLeg, this.rightLeg);
    for (const m of this.casterMeshes) {
      m.castShadow = true;
      m.receiveShadow = false;
      this.bodyGroup.add(m);
    }
    this.root.add(this.bodyGroup);
  }

  public setEnabled(enabled: boolean) {
    this.enabled = enabled;
    this.root.visible = enabled;
    for (const m of this.casterMeshes) {
      m.castShadow = enabled;
    }
  }

  public update(
    dt: number,
    world: VoxelWorld,
    playerPos: THREE.Vector3,
    yaw: number,
    speedRatio: number,
    grounded: boolean,
  ) {
    if (!this.enabled) return;

    this.bodyGroup.position.copy(playerPos);
    this.bodyGroup.rotation.y = yaw;

    if (grounded && speedRatio > 0.05) {
      this.walkPhase += dt * (7.5 + speedRatio * 5.0);
    }
    const swing = grounded && speedRatio > 0.05 ? Math.sin(this.walkPhase) * 0.55 * speedRatio : 0;
    this.leftLeg.rotation.x = swing;
    this.rightLeg.rotation.x = -swing;
    this.leftArm.rotation.x = -swing * 0.85;
    this.rightArm.rotation.x = swing * 0.85;

    const surfaceY = world.getShadowSurfaceY(playerPos.x, playerPos.y, playerPos.z, 8);
    if (surfaceY !== null) {
      const heightAbove = Math.max(0, playerPos.y - surfaceY);
      const fade = Math.max(0, 1 - heightAbove / 5.5);
      if (fade > 0.02) {
        this.contactMesh.visible = true;
        this.contactMesh.position.set(playerPos.x, surfaceY + 0.016, playerPos.z);
        const s = 1 - Math.min(0.45, heightAbove * 0.08);
        this.contactMesh.scale.set(s, s, 1);
        this.contactMat.opacity = 0.54 * fade;
      } else {
        this.contactMesh.visible = false;
      }
    } else {
      this.contactMesh.visible = false;
    }
  }

  public dispose() {
    for (const g of this.geoms) g.dispose();
    this.contactMat.dispose();
    this.contactTex.dispose();
    this.shadowOnlyMat.dispose();
  }
}

/**
 * Pooled instanced voxel debris particles for snappy block-break, combat, and ember feedback.
 */
interface ParticleItem {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Euler;
  rotVel: THREE.Vector3;
  scale: number;
}

const MAX_PARTICLES = 180;
const _dummy = new THREE.Object3D();
const _color = new THREE.Color();
const _toEntity = new THREE.Vector3();

export class ParticlePool {
  public readonly mesh: THREE.InstancedMesh;
  private readonly items: ParticleItem[] = [];
  private cursor = 0;

  constructor() {
    const geom = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.85,
      metalness: 0.05,
    });
    this.mesh = new THREE.InstancedMesh(geom, mat, MAX_PARTICLES);
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;

    const zeroMat = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      this.mesh.setMatrixAt(i, zeroMat);
      this.mesh.setColorAt(i, _color.setHex(0xffffff));
      this.items.push({
        active: false,
        life: 0,
        maxLife: 0.5,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        rotVel: new THREE.Vector3(),
        scale: 1,
      });
    }
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  public spawnBurst(wx: number, wy: number, wz: number, block: BlockType, count = 14) {
    const def = BLOCK_DEFS[block];
    this.spawnColorBurst(wx + 0.5, wy + 0.5, wz + 0.5, def.particleColor, count);
  }

  public spawnColorBurst(
    cx: number,
    cy: number,
    cz: number,
    hexColor: string,
    count = 12,
  ) {
    for (let i = 0; i < count; i++) {
      const idx = this.cursor;
      this.cursor = (this.cursor + 1) % MAX_PARTICLES;
      const item = this.items[idx];
      item.active = true;
      item.life = 0;
      item.maxLife = 0.34 + Math.random() * 0.28;
      item.pos.set(
        cx + (Math.random() - 0.5) * 0.65,
        cy + (Math.random() - 0.5) * 0.65,
        cz + (Math.random() - 0.5) * 0.65,
      );
      item.vel.set(
        (Math.random() - 0.5) * 4.6,
        1.8 + Math.random() * 3.5,
        (Math.random() - 0.5) * 4.6,
      );
      item.rot.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
      item.rotVel.set(
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
        (Math.random() - 0.5) * 10,
      );
      item.scale = 0.65 + Math.random() * 0.65;

      const shade = 0.85 + Math.random() * 0.3;
      this.mesh.setColorAt(idx, _color.set(hexColor).multiplyScalar(shade));
    }

    if (this.mesh.instanceColor) {
      this.mesh.instanceColor.needsUpdate = true;
    }
  }

  public update(dt: number, world: VoxelWorld) {
    let anyUpdated = false;
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const item = this.items[i];
      if (!item.active) continue;
      anyUpdated = true;
      item.life += dt;
      if (item.life >= item.maxLife) {
        item.active = false;
        _dummy.position.set(0, -100, 0);
        _dummy.scale.set(0, 0, 0);
        _dummy.updateMatrix();
        this.mesh.setMatrixAt(i, _dummy.matrix);
        continue;
      }

      item.vel.y -= 14.5 * dt;
      item.pos.addScaledVector(item.vel, dt);
      item.rot.x += item.rotVel.x * dt;
      item.rot.y += item.rotVel.y * dt;
      item.rot.z += item.rotVel.z * dt;

      const beneath = world.getBlock(
        Math.floor(item.pos.x),
        Math.floor(item.pos.y - 0.08),
        Math.floor(item.pos.z),
      );
      if (isSolidBlock(beneath) && item.vel.y < 0) {
        item.pos.y = Math.floor(item.pos.y - 0.08) + 1.08;
        item.vel.y *= -0.35;
        item.vel.x *= 0.7;
        item.vel.z *= 0.7;
      }

      const t = 1 - item.life / item.maxLife;
      const s = item.scale * Math.min(1, t * 2.2);
      _dummy.position.copy(item.pos);
      _dummy.rotation.copy(item.rot);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }

    if (anyUpdated) {
      this.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

/**
 * Ray-sphere hit helper for crisp melee combat targeting.
 */
function rayHitsSphere(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  center: THREE.Vector3,
  radius: number,
  maxDist: number,
): number | null {
  _toEntity.subVectors(center, origin);
  const proj = _toEntity.dot(dir);
  if (proj < 0 || proj > maxDist) return null;
  const perpSq = _toEntity.lengthSq() - proj * proj;
  if (perpSq > radius * radius) return null;
  return proj;
}

/**
 * Composite 9-part procedural voxel Sheep that grazes, flees when hit, and drops mutton in Survival.
 */
interface CritterState {
  group: THREE.Group;
  bodyMat: THREE.MeshStandardMaterial;
  legs: THREE.Mesh[];
  headGroup: THREE.Group;
  casterMeshes: THREE.Mesh[];
  shadowMesh: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  knockVel: THREE.Vector3;
  yaw: number;
  targetYaw: number;
  speed: number;
  stateTimer: number;
  walking: boolean;
  fleeTimer: number;
  walkPhase: number;
  grazePhase: number;
  hp: number;
  hitFlash: number;
  respawnTimer: number;
  alive: boolean;
}

export class WildlifeManager {
  public readonly root = new THREE.Group();
  private readonly critters: CritterState[] = [];
  private readonly sharedGeoms: THREE.BufferGeometry[] = [];
  private readonly sharedMats: THREE.Material[] = [];
  private readonly shadowTex: THREE.CanvasTexture;
  private shadowsEnabled = true;

  constructor(world: VoxelWorld, count = 8) {
    this.shadowTex = createContactShadowTexture();
    const shadowGeom = new THREE.PlaneGeometry(1.05, 1.25);

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0xc9a58b,
      roughness: 0.72,
      metalness: 0.02,
    });
    const hoofMat = new THREE.MeshStandardMaterial({
      color: 0x3b3531,
      roughness: 0.42,
      metalness: 0.12,
    });
    const eyeMat = new THREE.MeshStandardMaterial({
      color: 0x16181c,
      roughness: 0.2,
      metalness: 0.1,
    });

    const torsoGeom = new THREE.BoxGeometry(0.68, 0.56, 0.98);
    const fleeceCapGeom = new THREE.BoxGeometry(0.74, 0.44, 0.86);
    const headGeom = new THREE.BoxGeometry(0.42, 0.4, 0.46);
    const crownGeom = new THREE.BoxGeometry(0.45, 0.14, 0.36);
    const earGeom = new THREE.BoxGeometry(0.12, 0.16, 0.08);
    const eyeGeom = new THREE.BoxGeometry(0.07, 0.07, 0.04);
    const legGeom = new THREE.BoxGeometry(0.18, 0.46, 0.18);
    const hoofGeom = new THREE.BoxGeometry(0.19, 0.11, 0.19);
    const tailGeom = new THREE.BoxGeometry(0.18, 0.18, 0.16);

    this.sharedGeoms.push(
      shadowGeom,
      torsoGeom,
      fleeceCapGeom,
      headGeom,
      crownGeom,
      earGeom,
      eyeGeom,
      legGeom,
      hoofGeom,
      tailGeom,
    );
    this.sharedMats.push(skinMat, hoofMat, eyeMat);

    for (let i = 0; i < count; i++) {
      const baseAngle = (i / count) * Math.PI * 2 + 0.4;
      const baseDist = 9 + (i % 4) * 5.5;
      let sx = Math.cos(baseAngle) * baseDist;
      let sz = Math.sin(baseAngle) * baseDist;
      let sy = world.getMobSpawnY(sx, sz);

      // Search nearby open ground so sheep never spawn on leaves or water
      for (let attempt = 0; attempt < 20 && sy === null; attempt++) {
        const tryAngle = baseAngle + attempt * 0.37;
        const tryDist = 8 + ((i * 3 + attempt * 2.7) % 20);
        const tx = Math.cos(tryAngle) * tryDist;
        const tz = Math.sin(tryAngle) * tryDist;
        const candY = world.getMobSpawnY(tx, tz);
        if (candY !== null) {
          sx = tx;
          sz = tz;
          sy = candY;
        }
      }
      const spawnY = sy ?? world.getGroundY(sx, sz);

      const group = new THREE.Group();
      const bodyMat = new THREE.MeshStandardMaterial({
        color: i % 3 === 0 ? 0xe6dfd1 : 0xf2efe6,
        roughness: 0.94,
        metalness: 0.0,
      });
      this.sharedMats.push(bodyMat);
      const casterMeshes: THREE.Mesh[] = [];

      const shadowMat = new THREE.MeshBasicMaterial({
        map: this.shadowTex,
        transparent: true,
        opacity: 0.46,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      });
      this.sharedMats.push(shadowMat);
      const shadowMesh = new THREE.Mesh(shadowGeom, shadowMat);
      shadowMesh.rotation.x = -Math.PI / 2;
      shadowMesh.renderOrder = 1;
      shadowMesh.position.set(sx, spawnY + 0.015, sz);
      this.root.add(shadowMesh);

      const torso = new THREE.Mesh(torsoGeom, bodyMat);
      torso.position.set(0, 0.72, 0);
      torso.castShadow = true;
      torso.receiveShadow = true;
      casterMeshes.push(torso);
      group.add(torso);

      const fleece = new THREE.Mesh(fleeceCapGeom, bodyMat);
      fleece.position.set(0, 0.75, 0);
      fleece.castShadow = true;
      casterMeshes.push(fleece);
      group.add(fleece);

      const tail = new THREE.Mesh(tailGeom, bodyMat);
      tail.position.set(0, 0.76, -0.54);
      group.add(tail);

      const headGroup = new THREE.Group();
      headGroup.position.set(0, 0.88, 0.56);

      const head = new THREE.Mesh(headGeom, skinMat);
      head.position.set(0, 0, 0.14);
      head.castShadow = true;
      casterMeshes.push(head);
      headGroup.add(head);

      const crown = new THREE.Mesh(crownGeom, bodyMat);
      crown.position.set(0, 0.21, 0.08);
      headGroup.add(crown);

      const leftEar = new THREE.Mesh(earGeom, skinMat);
      leftEar.position.set(-0.24, 0.04, 0.06);
      leftEar.rotation.z = 0.35;
      headGroup.add(leftEar);

      const rightEar = new THREE.Mesh(earGeom, skinMat);
      rightEar.position.set(0.24, 0.04, 0.06);
      rightEar.rotation.z = -0.35;
      headGroup.add(rightEar);

      const leftEye = new THREE.Mesh(eyeGeom, eyeMat);
      leftEye.position.set(-0.11, 0.05, 0.37);
      headGroup.add(leftEye);

      const rightEye = new THREE.Mesh(eyeGeom, eyeMat);
      rightEye.position.set(0.11, 0.05, 0.37);
      headGroup.add(rightEye);

      group.add(headGroup);

      const legOffsets: Array<[number, number]> = [
        [-0.2, 0.32],
        [0.2, 0.32],
        [-0.2, -0.32],
        [0.2, -0.32],
      ];
      const legs: THREE.Mesh[] = [];
      for (const [lx, lz] of legOffsets) {
        const leg = new THREE.Mesh(legGeom, skinMat);
        leg.position.set(lx, 0.24, lz);
        leg.castShadow = true;
        casterMeshes.push(leg);
        const hoof = new THREE.Mesh(hoofGeom, hoofMat);
        hoof.position.set(0, -0.185, 0);
        leg.add(hoof);
        group.add(leg);
        legs.push(leg);
      }

      const scale = 0.88 + (i % 3) * 0.09;
      group.scale.setScalar(scale);
      group.position.set(sx, spawnY, sz);
      this.root.add(group);

      this.critters.push({
        group,
        bodyMat,
        legs,
        headGroup,
        casterMeshes,
        shadowMesh,
        shadowMat,
        pos: new THREE.Vector3(sx, spawnY, sz),
        knockVel: new THREE.Vector3(),
        yaw: baseAngle,
        targetYaw: baseAngle,
        speed: 0.9 + (i % 3) * 0.2,
        stateTimer: 1.5 + i * 0.7,
        walking: i % 2 === 0,
        fleeTimer: 0,
        walkPhase: i * 1.2,
        grazePhase: i * 0.8,
        hp: 8,
        hitFlash: 0,
        respawnTimer: 0,
        alive: true,
      });
    }
  }

  public setShadowsEnabled(enabled: boolean) {
    this.shadowsEnabled = enabled;
    for (const c of this.critters) {
      c.shadowMesh.visible = enabled && c.alive;
      for (const m of c.casterMeshes) {
        m.castShadow = enabled;
      }
    }
  }

  public tryMeleeHit(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    maxDist = 4.2,
  ): { hit: boolean; killed: boolean; pos: THREE.Vector3 } | null {
    let best: CritterState | null = null;
    let bestDist = maxDist;
    const center = new THREE.Vector3();

    for (const c of this.critters) {
      if (!c.alive) continue;
      center.set(c.pos.x, c.pos.y + 0.72, c.pos.z);
      const d = rayHitsSphere(origin, dir, center, 0.72, bestDist);
      if (d !== null && d < bestDist) {
        bestDist = d;
        best = c;
      }
    }

    if (!best) return null;

    best.hp -= damage;
    best.hitFlash = 0.22;
    best.fleeTimer = 3.2;
    best.walking = true;
    best.knockVel.set(dir.x * 5.2, 3.2, dir.z * 5.2);
    best.targetYaw = Math.atan2(dir.x, dir.z);

    const hitPos = best.pos.clone().add(new THREE.Vector3(0, 0.7, 0));
    if (best.hp <= 0) {
      best.alive = false;
      best.group.visible = false;
      best.shadowMesh.visible = false;
      best.respawnTimer = 28;
      return { hit: true, killed: true, pos: hitPos };
    }
    return { hit: true, killed: false, pos: hitPos };
  }

  public update(dt: number, world: VoxelWorld, playerPos?: THREE.Vector3) {
    for (const c of this.critters) {
      if (!c.alive) {
        c.shadowMesh.visible = false;
        c.respawnTimer -= dt;
        if (c.respawnTimer <= 0) {
          const anchorX = playerPos ? playerPos.x : 0;
          const anchorZ = playerPos ? playerPos.z : 0;
          const ang = Math.random() * Math.PI * 2;
          const dist = 16 + Math.random() * 14;
          const sx = anchorX + Math.cos(ang) * dist;
          const sz = anchorZ + Math.sin(ang) * dist;
          const sy = world.getMobSpawnY(sx, sz);
          if (sy !== null) {
            const surf = world.getBlock(Math.floor(sx), sy - 1, Math.floor(sz));
            if (!isLiquidBlock(surf) && !isLeafBlock(surf)) {
              c.pos.set(sx, sy, sz);
              c.hp = 8;
              c.alive = true;
              c.group.visible = true;
              c.shadowMesh.visible = this.shadowsEnabled;
              c.hitFlash = 0;
            } else {
              c.respawnTimer = 2;
            }
          } else {
            c.respawnTimer = 2;
          }
        }
        continue;
      }

      if (c.hitFlash > 0) {
        c.hitFlash = Math.max(0, c.hitFlash - dt);
        c.bodyMat.emissive.setHex(c.hitFlash > 0 ? 0xcc2222 : 0x000000);
        c.bodyMat.emissiveIntensity = c.hitFlash > 0 ? 0.65 : 0;
      }

      // Apply knockback decay
      if (c.knockVel.lengthSq() > 0.01) {
        c.pos.x += c.knockVel.x * dt;
        c.pos.z += c.knockVel.z * dt;
        c.pos.y += c.knockVel.y * dt;
        c.knockVel.x = THREE.MathUtils.damp(c.knockVel.x, 0, 8, dt);
        c.knockVel.z = THREE.MathUtils.damp(c.knockVel.z, 0, 8, dt);
        c.knockVel.y -= 18 * dt;
        const gY = world.getMobGroundY(c.pos.x, c.pos.z, c.pos.y);
        if (c.pos.y <= gY) {
          c.pos.y = gY;
          c.knockVel.y = 0;
        }
      }

      if (c.fleeTimer > 0) {
        c.fleeTimer = Math.max(0, c.fleeTimer - dt);
      }

      c.stateTimer -= dt;
      if (c.stateTimer <= 0 && c.fleeTimer <= 0) {
        c.walking = !c.walking;
        c.stateTimer = c.walking ? 2.2 + Math.random() * 3.5 : 2.0 + Math.random() * 3.5;
        c.targetYaw = c.yaw + (Math.random() - 0.5) * 2.4;
      }

      let diff = c.targetYaw - c.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      c.yaw += diff * Math.min(1, dt * (c.fleeTimer > 0 ? 6 : 3.2));

      if (c.walking || c.fleeTimer > 0) {
        const moveSpeed = c.fleeTimer > 0 ? c.speed * 2.6 : c.speed;
        const nx = c.pos.x + Math.sin(c.yaw) * moveSpeed * dt;
        const nz = c.pos.z + Math.cos(c.yaw) * moveSpeed * dt;
        const groundY = world.getMobGroundY(nx, nz, c.pos.y);
        const surfaceBlock = world.getBlock(Math.floor(nx), groundY - 1, Math.floor(nz));
        const aboveBlock = world.getBlock(Math.floor(nx), groundY, Math.floor(nz));

        if (
          Math.abs(groundY - c.pos.y) <= 1.2 &&
          !isLiquidBlock(aboveBlock) &&
          !isLiquidBlock(surfaceBlock) &&
          !isLeafBlock(surfaceBlock) &&
          Math.hypot(nx, nz) < 55
        ) {
          c.pos.x = nx;
          c.pos.z = nz;
          c.pos.y = THREE.MathUtils.damp(c.pos.y, groundY, 10, dt);
          c.walkPhase += dt * (c.fleeTimer > 0 ? 14 : 7.5);
        } else {
          c.targetYaw += Math.PI * 0.75;
          c.walking = false;
          c.stateTimer = 0.8;
        }
      } else {
        c.grazePhase += dt * 2.2;
        const curGround = world.getMobGroundY(c.pos.x, c.pos.z, c.pos.y);
        c.pos.y = THREE.MathUtils.damp(c.pos.y, curGround, 10, dt);
      }

      c.group.position.copy(c.pos);
      c.group.rotation.y = c.yaw;

      if (this.shadowsEnabled) {
        const surfY = world.getShadowSurfaceY(c.pos.x, c.pos.y, c.pos.z, 5);
        if (surfY !== null) {
          const h = Math.max(0, c.pos.y - surfY);
          const fade = Math.max(0, 1 - h / 3.5);
          c.shadowMesh.visible = fade > 0.04;
          c.shadowMesh.position.set(c.pos.x, surfY + 0.015, c.pos.z);
          c.shadowMesh.rotation.z = -c.yaw;
          const s = c.group.scale.x * (1 - Math.min(0.4, h * 0.1));
          c.shadowMesh.scale.set(s, s, 1);
          c.shadowMat.opacity = 0.48 * fade;
        } else {
          c.shadowMesh.visible = false;
        }
      } else {
        c.shadowMesh.visible = false;
      }

      const swing = c.walking || c.fleeTimer > 0 ? Math.sin(c.walkPhase) * 0.48 : 0;
      c.legs[0].rotation.x = swing;
      c.legs[3].rotation.x = swing;
      c.legs[1].rotation.x = -swing;
      c.legs[2].rotation.x = -swing;

      const targetHeadPitch =
        c.walking || c.fleeTimer > 0 ? 0.05 : 0.42 + Math.sin(c.grazePhase) * 0.14;
      c.headGroup.rotation.x = THREE.MathUtils.damp(
        c.headGroup.rotation.x,
        targetHeadPitch,
        5,
        dt,
      );
    }
  }

  public dispose() {
    for (const g of this.sharedGeoms) g.dispose();
    for (const m of this.sharedMats) m.dispose();
    this.shadowTex.dispose();
  }
}

/**
 * Hostile Night Walkers (composite 9-part voxel mobs) that spawn during twilight/night in Survival Mode,
 * telegraph melee strikes, take knockback/hit-flash, drop loot, and burn away in morning sunlight.
 */
interface HostileMob {
  group: THREE.Group;
  skinMat: THREE.MeshStandardMaterial;
  arms: [THREE.Mesh, THREE.Mesh];
  legs: [THREE.Mesh, THREE.Mesh];
  casterMeshes: THREE.Mesh[];
  shadowMesh: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  knockVel: THREE.Vector3;
  yaw: number;
  hp: number;
  hitFlash: number;
  walkPhase: number;
  windupTimer: number;
  attackCooldown: number;
  burnTick: number;
}

export class HostileMobManager {
  public readonly root = new THREE.Group();
  private readonly mobs: HostileMob[] = [];
  private readonly sharedGeoms: THREE.BufferGeometry[] = [];
  private readonly sharedMats: THREE.Material[] = [];
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly shadowGeom: THREE.PlaneGeometry;
  private shadowsEnabled = true;
  private spawnTimer = 3.5;

  private readonly tunicMat: THREE.MeshStandardMaterial;
  private readonly pantsMat: THREE.MeshStandardMaterial;
  private readonly eyeMat: THREE.MeshStandardMaterial;

  constructor() {
    this.shadowTex = createContactShadowTexture();
    this.shadowGeom = new THREE.PlaneGeometry(0.98, 0.98);

    this.tunicMat = new THREE.MeshStandardMaterial({
      color: 0x2c4b4e,
      roughness: 0.92,
      metalness: 0.02,
    });
    this.pantsMat = new THREE.MeshStandardMaterial({
      color: 0x262e3d,
      roughness: 0.88,
      metalness: 0.02,
    });
    this.eyeMat = new THREE.MeshStandardMaterial({
      color: 0xffb84d,
      emissive: 0xff8c1a,
      emissiveIntensity: 1.2,
      roughness: 0.2,
      metalness: 0.1,
    });
    this.sharedMats.push(this.tunicMat, this.pantsMat, this.eyeMat);

    // Pre-build shared geometries for all 9 composite parts
    this.sharedGeoms.push(
      new THREE.BoxGeometry(0.56, 0.7, 0.3), // 0: torso
      new THREE.BoxGeometry(0.6, 0.26, 0.34), // 1: tattered shoulder mantle
      new THREE.BoxGeometry(0.46, 0.46, 0.46), // 2: head
      new THREE.BoxGeometry(0.48, 0.1, 0.48), // 3: brow ridge
      new THREE.BoxGeometry(0.09, 0.06, 0.04), // 4: eye
      new THREE.BoxGeometry(0.18, 0.66, 0.18), // 5: arm
      new THREE.BoxGeometry(0.22, 0.68, 0.22), // 6: leg
    );
  }

  public setShadowsEnabled(enabled: boolean) {
    this.shadowsEnabled = enabled;
    for (const m of this.mobs) {
      m.shadowMesh.visible = enabled;
      for (const mesh of m.casterMeshes) {
        mesh.castShadow = enabled;
      }
    }
  }

  private spawnOne(world: VoxelWorld, playerPos: THREE.Vector3) {
    let sx = 0;
    let sz = 0;
    let sy: number | null = null;
    let chosenAngle = 0;

    // Sample candidate ground spots, strictly forbidding leaves and water
    for (let attempt = 0; attempt < 10; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const dist = 16 + Math.random() * 11;
      const tx = playerPos.x + Math.cos(angle) * dist;
      const tz = playerPos.z + Math.sin(angle) * dist;
      const candY = world.getMobSpawnY(tx, tz);
      if (candY === null) continue;
      const surf = world.getBlock(Math.floor(tx), candY - 1, Math.floor(tz));
      const above = world.getBlock(Math.floor(tx), candY, Math.floor(tz));
      if (isLiquidBlock(surf) || isLiquidBlock(above) || isLeafBlock(surf)) continue;
      sx = tx;
      sz = tz;
      sy = candY;
      chosenAngle = angle;
      break;
    }
    if (sy === null) return;

    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x5c8057,
      roughness: 0.78,
      metalness: 0.04,
    });

    const group = new THREE.Group();
    const casterMeshes: THREE.Mesh[] = [];

    const torso = new THREE.Mesh(this.sharedGeoms[0], this.tunicMat);
    torso.position.set(0, 1.03, 0);
    torso.castShadow = this.shadowsEnabled;
    casterMeshes.push(torso);
    group.add(torso);

    const mantle = new THREE.Mesh(this.sharedGeoms[1], this.pantsMat);
    mantle.position.set(0, 1.24, 0);
    group.add(mantle);

    const head = new THREE.Mesh(this.sharedGeoms[2], skinMat);
    head.position.set(0, 1.62, 0);
    head.castShadow = this.shadowsEnabled;
    casterMeshes.push(head);
    group.add(head);

    const brow = new THREE.Mesh(this.sharedGeoms[3], this.pantsMat);
    brow.position.set(0, 1.77, 0.01);
    group.add(brow);

    const leftEye = new THREE.Mesh(this.sharedGeoms[4], this.eyeMat);
    leftEye.position.set(-0.11, 1.64, 0.24);
    group.add(leftEye);

    const rightEye = new THREE.Mesh(this.sharedGeoms[4], this.eyeMat);
    rightEye.position.set(0.11, 1.64, 0.24);
    group.add(rightEye);

    const leftArm = new THREE.Mesh(this.sharedGeoms[5], skinMat);
    leftArm.position.set(-0.38, 1.25, 0.26);
    leftArm.rotation.x = -Math.PI * 0.42;
    leftArm.castShadow = this.shadowsEnabled;
    casterMeshes.push(leftArm);
    group.add(leftArm);

    const rightArm = new THREE.Mesh(this.sharedGeoms[5], skinMat);
    rightArm.position.set(0.38, 1.25, 0.26);
    rightArm.rotation.x = -Math.PI * 0.42;
    rightArm.castShadow = this.shadowsEnabled;
    casterMeshes.push(rightArm);
    group.add(rightArm);

    const leftLeg = new THREE.Mesh(this.sharedGeoms[6], this.pantsMat);
    leftLeg.position.set(-0.14, 0.34, 0);
    leftLeg.castShadow = this.shadowsEnabled;
    casterMeshes.push(leftLeg);
    group.add(leftLeg);

    const rightLeg = new THREE.Mesh(this.sharedGeoms[6], this.pantsMat);
    rightLeg.position.set(0.14, 0.34, 0);
    rightLeg.castShadow = this.shadowsEnabled;
    casterMeshes.push(rightLeg);
    group.add(rightLeg);

    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const shadowMesh = new THREE.Mesh(this.shadowGeom, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.renderOrder = 1;
    shadowMesh.position.set(sx, sy + 0.015, sz);
    shadowMesh.visible = this.shadowsEnabled;
    this.root.add(shadowMesh);

    group.position.set(sx, sy, sz);
    this.root.add(group);

    this.mobs.push({
      group,
      skinMat,
      arms: [leftArm, rightArm],
      legs: [leftLeg, rightLeg],
      casterMeshes,
      shadowMesh,
      shadowMat,
      pos: new THREE.Vector3(sx, sy, sz),
      knockVel: new THREE.Vector3(),
      yaw: chosenAngle + Math.PI,
      hp: 16,
      hitFlash: 0,
      walkPhase: Math.random() * 6,
      windupTimer: 0,
      attackCooldown: 0.6,
      burnTick: 0,
    });
  }

  private removeMobAt(idx: number) {
    const mob = this.mobs[idx];
    this.root.remove(mob.group);
    this.root.remove(mob.shadowMesh);
    mob.skinMat.dispose();
    mob.shadowMat.dispose();
    this.mobs.splice(idx, 1);
  }

  public clearAll() {
    for (let i = this.mobs.length - 1; i >= 0; i--) {
      this.removeMobAt(i);
    }
  }

  public tryMeleeHit(
    origin: THREE.Vector3,
    dir: THREE.Vector3,
    damage: number,
    maxDist = 4.4,
  ): { hit: boolean; killed: boolean; pos: THREE.Vector3 } | null {
    let bestIdx = -1;
    let bestDist = maxDist;
    const center = new THREE.Vector3();

    for (let i = 0; i < this.mobs.length; i++) {
      const m = this.mobs[i];
      center.set(m.pos.x, m.pos.y + 1.0, m.pos.z);
      const d = rayHitsSphere(origin, dir, center, 0.85, bestDist);
      if (d !== null && d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) return null;

    const mob = this.mobs[bestIdx];
    mob.hp -= damage;
    mob.hitFlash = 0.24;
    mob.windupTimer = 0; // Interrupt attack windup on hit!
    mob.knockVel.set(dir.x * 6.5, 3.6, dir.z * 6.5);

    const hitPos = mob.pos.clone().add(new THREE.Vector3(0, 1.0, 0));
    if (mob.hp <= 0) {
      this.removeMobAt(bestIdx);
      return { hit: true, killed: true, pos: hitPos };
    }
    return { hit: true, killed: false, pos: hitPos };
  }

  public update(
    dt: number,
    world: VoxelWorld,
    playerPos: THREE.Vector3,
    isNight: boolean,
    survivalActive: boolean,
    particles: ParticlePool,
    onPlayerDamaged: (amount: number, knockDirX: number, knockDirZ: number) => void,
    onMobBurnDeath?: (pos: THREE.Vector3) => void,
  ) {
    if (!survivalActive) {
      if (this.mobs.length > 0) this.clearAll();
      return;
    }

    // Spawn Night Walkers during twilight / night
    if (isNight && this.mobs.length < 5) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnTimer = 4.5 + Math.random() * 3.5;
        this.spawnOne(world, playerPos);
      }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];

      // Despawn if player wanders very far away
      const distToPlayer = Math.hypot(playerPos.x - m.pos.x, playerPos.z - m.pos.z);
      if (distToPlayer > 46) {
        this.removeMobAt(i);
        continue;
      }

      // Burn away in daylight
      if (!isNight) {
        m.burnTick += dt;
        if (m.burnTick >= 0.45) {
          m.burnTick = 0;
          m.hp -= 3;
          m.hitFlash = 0.2;
          particles.spawnColorBurst(m.pos.x, m.pos.y + 1.3, m.pos.z, '#ff9436', 6);
          if (m.hp <= 0) {
            const deathPos = m.pos.clone().add(new THREE.Vector3(0, 0.85, 0));
            particles.spawnColorBurst(m.pos.x, m.pos.y + 1.0, m.pos.z, '#ffaa44', 14);
            this.removeMobAt(i);
            onMobBurnDeath?.(deathPos);
            continue;
          }
        }
      }

      if (m.hitFlash > 0) {
        m.hitFlash = Math.max(0, m.hitFlash - dt);
        m.skinMat.emissive.setHex(m.hitFlash > 0 ? 0xcc2222 : 0x000000);
        m.skinMat.emissiveIntensity = m.hitFlash > 0 ? 0.7 : 0;
      }

      // Knockback physics
      if (m.knockVel.lengthSq() > 0.01) {
        const kx = m.pos.x + m.knockVel.x * dt;
        const kz = m.pos.z + m.knockVel.z * dt;
        const gY = world.getMobGroundY(kx, kz, m.pos.y);
        if (Math.abs(gY - m.pos.y) <= 1.5) {
          m.pos.x = kx;
          m.pos.z = kz;
        }
        m.pos.y += m.knockVel.y * dt;
        m.knockVel.x = THREE.MathUtils.damp(m.knockVel.x, 0, 8, dt);
        m.knockVel.z = THREE.MathUtils.damp(m.knockVel.z, 0, 8, dt);
        m.knockVel.y -= 18 * dt;
        const curG = world.getMobGroundY(m.pos.x, m.pos.z, m.pos.y);
        if (m.pos.y <= curG) {
          m.pos.y = curG;
          m.knockVel.y = 0;
        }
      }

      const dx = playerPos.x - m.pos.x;
      const dz = playerPos.z - m.pos.z;
      const dy = Math.abs(playerPos.y - m.pos.y);
      const targetYaw = Math.atan2(dx, dz);
      let diff = targetYaw - m.yaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      m.yaw += diff * Math.min(1, dt * 6);

      if (m.attackCooldown > 0) m.attackCooldown = Math.max(0, m.attackCooldown - dt);

      // Visible windup telegraph when in strike range
      if (distToPlayer < 2.05 && dy < 1.9 && m.attackCooldown <= 0) {
        m.windupTimer += dt;
        // Raise arms & pulse amber warning before strike
        const t = Math.min(1, m.windupTimer / 0.38);
        m.arms[0].rotation.x = -Math.PI * (0.42 + t * 0.45);
        m.arms[1].rotation.x = -Math.PI * (0.42 + t * 0.45);
        if (m.windupTimer >= 0.38) {
          m.windupTimer = 0;
          m.attackCooldown = 1.25;
          const len = Math.max(0.01, Math.hypot(dx, dz));
          onPlayerDamaged(3, dx / len, dz / len);
        }
      } else {
        m.windupTimer = 0;
        m.arms[0].rotation.x = THREE.MathUtils.damp(m.arms[0].rotation.x, -Math.PI * 0.42, 8, dt);
        m.arms[1].rotation.x = THREE.MathUtils.damp(m.arms[1].rotation.x, -Math.PI * 0.42, 8, dt);

        if (distToPlayer > 1.45) {
          const speed = 2.65;
          const nx = m.pos.x + Math.sin(m.yaw) * speed * dt;
          const nz = m.pos.z + Math.cos(m.yaw) * speed * dt;
          const groundY = world.getMobGroundY(nx, nz, m.pos.y);
          const surf = world.getBlock(Math.floor(nx), groundY - 1, Math.floor(nz));
          if (Math.abs(groundY - m.pos.y) <= 1.25 && !isLiquidBlock(surf) && !isLeafBlock(surf)) {
            m.pos.x = nx;
            m.pos.z = nz;
            m.pos.y = THREE.MathUtils.damp(m.pos.y, groundY, 9, dt);
            m.walkPhase += dt * 8.5;
          }
        }
      }

      const legSwing = Math.sin(m.walkPhase) * 0.55;
      m.legs[0].rotation.x = legSwing;
      m.legs[1].rotation.x = -legSwing;
      m.group.position.copy(m.pos);
      m.group.rotation.y = m.yaw;

      if (this.shadowsEnabled) {
        const surfY = world.getShadowSurfaceY(m.pos.x, m.pos.y, m.pos.z, 5);
        if (surfY !== null) {
          const h = Math.max(0, m.pos.y - surfY);
          const fade = Math.max(0, 1 - h / 3.5);
          m.shadowMesh.visible = fade > 0.04;
          m.shadowMesh.position.set(m.pos.x, surfY + 0.015, m.pos.z);
          const s = 1 - Math.min(0.4, h * 0.1);
          m.shadowMesh.scale.set(s, s, 1);
          m.shadowMat.opacity = 0.5 * fade;
        } else {
          m.shadowMesh.visible = false;
        }
      } else {
        m.shadowMesh.visible = false;
      }
    }
  }

  public dispose() {
    this.clearAll();
    for (const g of this.sharedGeoms) g.dispose();
    for (const m of this.sharedMats) m.dispose();
    this.shadowGeom.dispose();
    this.shadowTex.dispose();
  }
}

/**
 * Physical 3D dropped items on the ground (from defeated mobs) with bounce physics,
 * Minecraft spin + hover bob, ground contact shadow, and magnetic player pickup.
 */
interface DroppedItemEntity {
  item: ItemType;
  count: number;
  durability?: number;
  mesh: THREE.Mesh;
  shadowMesh: THREE.Mesh;
  shadowMat: THREE.MeshBasicMaterial;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  age: number;
  pickupDelay: number;
  spinOffset: number;
  ownsGeometry: boolean;
  ownsMaterial: boolean;
}

export class DroppedItemManager {
  public readonly root = new THREE.Group();
  private readonly items: DroppedItemEntity[] = [];
  private readonly atlasTexture: THREE.Texture;
  private readonly getCustomItemGeometry: (item: ItemType) => THREE.BufferGeometry | undefined;
  private readonly spriteMaterial: THREE.MeshStandardMaterial;
  private readonly fallbackGeom: THREE.BoxGeometry;
  private readonly shadowTex: THREE.CanvasTexture;
  private readonly shadowGeom: THREE.PlaneGeometry;
  private shadowsEnabled = true;

  constructor(
    atlasTexture: THREE.Texture,
    getCustomItemGeometry: (item: ItemType) => THREE.BufferGeometry | undefined,
  ) {
    this.atlasTexture = atlasTexture;
    this.getCustomItemGeometry = getCustomItemGeometry;
    this.spriteMaterial = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.68,
      metalness: 0.08,
    });
    this.fallbackGeom = new THREE.BoxGeometry(0.24, 0.24, 0.1);
    this.shadowTex = createContactShadowTexture();
    this.shadowGeom = new THREE.PlaneGeometry(0.44, 0.44);
  }

  public setShadowsEnabled(enabled: boolean) {
    this.shadowsEnabled = enabled;
    for (const d of this.items) {
      d.mesh.castShadow = enabled;
      d.shadowMesh.visible = enabled;
    }
  }

  private createBlockDropMesh(block: BlockType): {
    mesh: THREE.Mesh;
    ownsGeometry: boolean;
    ownsMaterial: boolean;
  } {
    const def = BLOCK_DEFS[block];
    const geom = new THREE.BoxGeometry(0.28, 0.28, 0.28);
    const uvAttr = geom.attributes.uv as THREE.BufferAttribute;
    const tileW = 1 / ATLAS_COLS;
    const tileH = 1 / ATLAS_ROWS;
    const eps = 0.002;
    const frontTile = def.frontTile ?? def.tiles[1];
    const faceTiles = [
      def.tiles[1],
      def.tiles[1],
      def.tiles[0],
      def.tiles[2],
      frontTile,
      def.tiles[1],
    ];
    for (let f = 0; f < 6; f++) {
      const tile = faceTiles[f];
      const col = tile % ATLAS_COLS;
      const row = Math.floor(tile / ATLAS_COLS);
      const u0 = col * tileW + eps;
      const u1 = (col + 1) * tileW - eps;
      const v1 = 1 - row * tileH - eps;
      const v0 = 1 - (row + 1) * tileH + eps;
      const base = f * 4;
      uvAttr.setXY(base + 0, u0, v1);
      uvAttr.setXY(base + 1, u1, v1);
      uvAttr.setXY(base + 2, u0, v0);
      uvAttr.setXY(base + 3, u1, v0);
    }
    uvAttr.needsUpdate = true;

    const mat = new THREE.MeshStandardMaterial({
      map: this.atlasTexture,
      roughness: 0.84,
      metalness: 0.02,
      transparent: def.transparent || def.cutout === true,
      alphaTest: 0.45,
      opacity: def.transparent ? 0.86 : 1.0,
    });
    const mesh = new THREE.Mesh(geom, mat);
    return { mesh, ownsGeometry: true, ownsMaterial: true };
  }

  public spawnDrop(
    item: ItemType,
    count: number,
    x: number,
    y: number,
    z: number,
    initialVel?: THREE.Vector3,
    pickupDelay = 0.42,
    durability?: number,
  ) {
    const def = ITEM_DEFS[item];
    if (!def || count <= 0) return;

    let mesh: THREE.Mesh;
    let ownsGeometry = false;
    let ownsMaterial = false;

    if (def.blockType !== undefined) {
      const created = this.createBlockDropMesh(def.blockType);
      mesh = created.mesh;
      ownsGeometry = created.ownsGeometry;
      ownsMaterial = created.ownsMaterial;
    } else {
      const customGeom = this.getCustomItemGeometry(item);
      if (customGeom) {
        mesh = new THREE.Mesh(customGeom, this.spriteMaterial);
        mesh.scale.setScalar(1.35);
      } else {
        const mat = new THREE.MeshStandardMaterial({
          color: def.accentColor,
          roughness: 0.65,
          metalness: 0.08,
        });
        mesh = new THREE.Mesh(this.fallbackGeom, mat);
        ownsMaterial = true;
      }
    }

    mesh.castShadow = this.shadowsEnabled;
    mesh.receiveShadow = false;
    mesh.position.set(x, y, z);
    this.root.add(mesh);

    const shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const shadowMesh = new THREE.Mesh(this.shadowGeom, shadowMat);
    shadowMesh.rotation.x = -Math.PI / 2;
    shadowMesh.renderOrder = 1;
    shadowMesh.position.set(x, y, z);
    shadowMesh.visible = this.shadowsEnabled;
    this.root.add(shadowMesh);

    const spreadAngle = Math.random() * Math.PI * 2;
    const spreadSpeed = 1.1 + Math.random() * 1.4;
    const vel = initialVel
      ? initialVel.clone()
      : new THREE.Vector3(
          Math.cos(spreadAngle) * spreadSpeed,
          3.2 + Math.random() * 1.3,
          Math.sin(spreadAngle) * spreadSpeed,
        );

    this.items.push({
      item,
      count,
      durability,
      mesh,
      shadowMesh,
      shadowMat,
      pos: new THREE.Vector3(x, y, z),
      vel,
      age: 0,
      pickupDelay,
      spinOffset: Math.random() * Math.PI * 2,
      ownsGeometry,
      ownsMaterial,
    });
  }

  private removeAt(idx: number) {
    const d = this.items[idx];
    this.root.remove(d.mesh);
    this.root.remove(d.shadowMesh);
    if (d.ownsGeometry) d.mesh.geometry.dispose();
    if (d.ownsMaterial) (d.mesh.material as THREE.Material).dispose();
    d.shadowMat.dispose();
    this.items.splice(idx, 1);
  }

  public clearAll() {
    for (let i = this.items.length - 1; i >= 0; i--) {
      this.removeAt(i);
    }
  }

  public update(
    dt: number,
    world: VoxelWorld,
    playerPos: THREE.Vector3,
    canPickup: boolean,
    onPickup: (item: ItemType, count: number, durability?: number) => boolean,
  ) {
    for (let i = this.items.length - 1; i >= 0; i--) {
      const d = this.items[i];
      d.age += dt;
      if (d.age > 300) {
        this.removeAt(i);
        continue;
      }

      // Gravity & horizontal drag
      d.vel.y = Math.max(-18, d.vel.y - 16.5 * dt);
      const nextX = d.pos.x + d.vel.x * dt;
      const nextZ = d.pos.z + d.vel.z * dt;
      if (!isSolidBlock(world.getBlock(Math.floor(nextX), Math.floor(d.pos.y + 0.15), Math.floor(d.pos.z)))) {
        d.pos.x = nextX;
      } else {
        d.vel.x *= -0.3;
      }
      if (!isSolidBlock(world.getBlock(Math.floor(d.pos.x), Math.floor(d.pos.y + 0.15), Math.floor(nextZ)))) {
        d.pos.z = nextZ;
      } else {
        d.vel.z *= -0.3;
      }

      d.pos.y += d.vel.y * dt;
      const belowBlock = world.getBlock(
        Math.floor(d.pos.x),
        Math.floor(d.pos.y - 0.02),
        Math.floor(d.pos.z),
      );
      if (isSolidBlock(belowBlock) && d.vel.y <= 0) {
        d.pos.y = Math.floor(d.pos.y - 0.02) + 1.0;
        if (Math.abs(d.vel.y) > 1.2) {
          d.vel.y *= -0.28;
        } else {
          d.vel.y = 0;
        }
        d.vel.x *= Math.max(0, 1 - dt * 7.5);
        d.vel.z *= Math.max(0, 1 - dt * 7.5);
      } else {
        d.vel.x *= Math.max(0, 1 - dt * 1.4);
        d.vel.z *= Math.max(0, 1 - dt * 1.4);
      }

      // Magnetic player pickup after short pop delay
      if (canPickup && d.age >= d.pickupDelay) {
        const targetX = playerPos.x;
        const targetY = playerPos.y + 0.85;
        const targetZ = playerPos.z;
        const dx = targetX - d.pos.x;
        const dy = targetY - d.pos.y;
        const dz = targetZ - d.pos.z;
        const distSq = dx * dx + dy * dy + dz * dz;
        if (distSq < 2.25 * 2.25) {
          const dist = Math.sqrt(distSq);
          if (dist < 0.65) {
            if (onPickup(d.item, d.count, d.durability)) {
              this.removeAt(i);
              continue;
            }
          } else {
            const pull = Math.min(1, dt * 12);
            d.pos.x += dx * pull;
            d.pos.y += dy * pull;
            d.pos.z += dz * pull;
            d.vel.set(0, 0, 0);
          }
        }
      }

      // Classic Minecraft hover bob & continuous Y rotation
      const hoverY = 0.24 + Math.sin(d.age * 3.4 + d.spinOffset) * 0.06;
      d.mesh.position.set(d.pos.x, d.pos.y + hoverY, d.pos.z);
      d.mesh.rotation.y = d.age * 1.9 + d.spinOffset;

      if (this.shadowsEnabled) {
        const surfY = world.getShadowSurfaceY(d.pos.x, d.pos.y + 0.2, d.pos.z, 4);
        if (surfY !== null) {
          const h = Math.max(0, d.pos.y - surfY);
          const fade = Math.max(0, 1 - h / 2.5);
          d.shadowMesh.visible = fade > 0.04;
          d.shadowMesh.position.set(d.pos.x, surfY + 0.014, d.pos.z);
          const bobScale = 0.92 - Math.sin(d.age * 3.4 + d.spinOffset) * 0.08;
          d.shadowMesh.scale.set(bobScale, bobScale, 1);
          d.shadowMat.opacity = 0.42 * fade;
        } else {
          d.shadowMesh.visible = false;
        }
      } else {
        d.shadowMesh.visible = false;
      }
    }
  }

  public dispose() {
    this.clearAll();
    this.spriteMaterial.dispose();
    this.fallbackGeom.dispose();
    this.shadowGeom.dispose();
    this.shadowTex.dispose();
  }
}

/**
 * Minecraft-faithful first-person right-hand viewmodel attached to camera:
 * - Empty hand: classic blocky Minecraft forearm & tunic cuff
 * - Block: clean 45-deg isometric voxel cube in lower-right (no arm clipping behind it)
 * - Tool/Weapon (handheld): 16x16 3D voxel-extruded sprite thrusting forward & up
 * - Regular Item (generated): 16x16 3D voxel-extruded sprite (coal, raw iron, bucket, apple, etc.)
 * Includes Minecraft's equip dip-in animation and sin(sqrt(t)*PI) swing curve.
 */
type HeldDisplayMode = 'arm' | 'block' | 'handheld' | 'generated';

export class HeldBlockViewmodel {
  public readonly group = new THREE.Group();
  private readonly armGroup = new THREE.Group();
  private readonly blockMesh: THREE.Mesh;
  private readonly customSpriteMesh: THREE.Mesh;
  private readonly customSpriteDefaultGeom: THREE.BufferGeometry;
  private readonly fallbackOrbMesh: THREE.Mesh;

  private readonly customItemGeometries = new Map<number, THREE.BufferGeometry>();
  private readonly animatedItemGeometries = new Map<number, THREE.BufferGeometry[]>();
  private readonly animatedItemFrames = new Map<number, number>();
  private readonly userOverrideIds = new Set<number>();
  private currentItem: ItemType | null = null;
  private displayMode: HeldDisplayMode = 'arm';

  private swingProgress = 0; // 0 = idle, advances 0 -> 1 during a swing
  private swingActive = false;
  private equipProgress = 1; // 0 = dipped offscreen, 1 = fully raised
  private bobPhase = 0;
  private miningCycle = 0;

  constructor(atlasTexture: THREE.Texture) {
    // 1. Minecraft-proportioned bare right arm (only shown when holding nothing)
    const armSkinMat = new THREE.MeshStandardMaterial({
      color: 0xc99672,
      roughness: 0.82,
      metalness: 0.0,
    });
    const sleeveMat = new THREE.MeshStandardMaterial({
      color: 0x2c97a3,
      roughness: 0.9,
      metalness: 0.0,
    });

    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.115, 0.34, 0.115), armSkinMat);
    forearm.position.set(0, -0.02, 0);
    this.armGroup.add(forearm);

    const sleeve = new THREE.Mesh(new THREE.BoxGeometry(0.124, 0.125, 0.124), sleeveMat);
    sleeve.position.set(0, -0.145, 0);
    this.armGroup.add(sleeve);

    // Classic Minecraft bare-arm pose angling from bottom-right corner inward
    this.armGroup.position.set(0.06, -0.1, 0.06);
    this.armGroup.rotation.order = 'YXZ';
    this.armGroup.rotation.set(-0.78, -0.52, 0.42);
    this.group.add(this.armGroup);

    // 2. Minecraft first-person block cube (45-deg Y rotation, crisp atlas UVs)
    const blockGeom = new THREE.BoxGeometry(0.205, 0.205, 0.205);
    const blockMat = new THREE.MeshStandardMaterial({
      map: atlasTexture,
      roughness: 0.84,
      metalness: 0.02,
      transparent: true,
      alphaTest: 0.45,
    });
    this.blockMesh = new THREE.Mesh(blockGeom, blockMat);
    this.blockMesh.rotation.order = 'YXZ';
    this.blockMesh.rotation.set(0.04, Math.PI * 0.25, 0.0);
    this.blockMesh.position.set(0.02, -0.04, 0.0);
    this.blockMesh.visible = false;
    this.group.add(this.blockMesh);

    // 3. Minecraft 16x16 3D voxel-extruded sprite (for tools, swords, buckets, coal, iron, food)
    this.customSpriteDefaultGeom = new THREE.BufferGeometry();
    this.customSpriteMesh = new THREE.Mesh(
      this.customSpriteDefaultGeom,
      new THREE.MeshStandardMaterial({
        vertexColors: true,
        roughness: 0.72,
        metalness: 0.08,
      }),
    );
    this.customSpriteMesh.rotation.order = 'YXZ';
    this.customSpriteMesh.visible = false;
    this.group.add(this.customSpriteMesh);

    // 4. Tiny fallback before async sprite extrusion completes (~1 frame)
    this.fallbackOrbMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.11, 0.11, 0.025),
      new THREE.MeshStandardMaterial({ color: 0xc9a98a, roughness: 0.65, metalness: 0.08 }),
    );
    this.fallbackOrbMesh.rotation.order = 'YXZ';
    this.fallbackOrbMesh.rotation.set(0.04, 0.92, 0.16);
    this.fallbackOrbMesh.visible = false;
    this.group.add(this.fallbackOrbMesh);

    this.group.rotation.order = 'YXZ';
    this.group.position.set(0.32, -0.26, -0.46);
    this.setItem(null);
  }

  public setBlock(block: BlockType) {
    this.setItem(block as unknown as ItemType);
  }

  public setCustomItemGeometries(
    geoms: Record<number, THREE.BufferGeometry>,
    isUserOverride = false,
  ) {
    for (const [key, geom] of Object.entries(geoms)) {
      const id = Number(key);
      // Never let procedural fallback overwrite an already-loaded user asset PNG
      if (!isUserOverride && this.userOverrideIds.has(id)) {
        geom.dispose();
        continue;
      }
      if (isUserOverride) {
        this.userOverrideIds.add(id);
      }
      const prev = this.customItemGeometries.get(id);
      if (prev && prev !== geom) prev.dispose();
      this.customItemGeometries.set(id, geom);
    }
    this.applyItemVisuals(this.currentItem);
  }

  public getCustomItemGeometry(item: ItemType): THREE.BufferGeometry | undefined {
    const animated = this.animatedItemGeometries.get(item);
    if (animated?.length) {
      return animated[this.animatedItemFrames.get(item) ?? 0] ?? animated[0];
    }
    return this.customItemGeometries.get(item);
  }

  /** Supplies per-frame voxel geometries for animated items (e.g. the clock). */
  public setAnimatedItemGeometries(item: ItemType, geometries: THREE.BufferGeometry[]): void {
    const previous = this.animatedItemGeometries.get(item);
    if (previous) {
      for (const geom of previous) {
        if (!geometries.includes(geom)) geom.dispose();
      }
    }
    if (geometries.length > 0) {
      this.animatedItemGeometries.set(item, geometries);
    } else {
      this.animatedItemGeometries.delete(item);
    }
    if (this.currentItem === item) this.applyItemVisuals(item);
  }

  /** Selects the active frame for an animated held item. */
  public setAnimatedItemFrame(item: ItemType, frame: number): void {
    this.animatedItemFrames.set(item, frame);
    if (item === this.currentItem) this.applyItemVisuals(item);
  }

  public setItem(item: ItemType | null) {
    const changed = item !== this.currentItem;
    this.currentItem = item;
    if (changed) {
      this.equipProgress = 0.0;
    }
    this.applyItemVisuals(item);
  }

  private applyItemVisuals(item: ItemType | null) {
    if (item === null) {
      this.displayMode = 'arm';
      this.armGroup.visible = true;
      this.blockMesh.visible = false;
      this.customSpriteMesh.visible = false;
      this.fallbackOrbMesh.visible = false;
      return;
    }

    const def = ITEM_DEFS[item];

    // Block item -> Minecraft 45-deg voxel block in hand (arm hidden)
    if (def?.blockType !== undefined) {
      this.displayMode = 'block';
      this.armGroup.visible = false;
      this.blockMesh.visible = true;
      this.customSpriteMesh.visible = false;
      this.fallbackOrbMesh.visible = false;
      this.applyBlockUVs(def.blockType);
      return;
    }

    // Non-block item (tools, weapons, sticks, buckets, resources, food) -> Minecraft 16x16 3D voxel sprite
    const isHandheldTool = Boolean(
      (def?.toolKind && def.toolKind !== 'hand') || item === ItemType.Stick,
    );
    this.displayMode = isHandheldTool ? 'handheld' : 'generated';
    this.armGroup.visible = false;
    this.blockMesh.visible = false;

    const animatedGeoms = this.animatedItemGeometries.get(item);
    const frameIndex = this.animatedItemFrames.get(item) ?? 0;
    const customGeom = animatedGeoms?.length
      ? (animatedGeoms[frameIndex % animatedGeoms.length] ?? animatedGeoms[0])
      : this.customItemGeometries.get(item);
    if (customGeom) {
      this.fallbackOrbMesh.visible = false;
      this.customSpriteMesh.geometry = customGeom;
      const spriteMat = this.customSpriteMesh.material as THREE.MeshStandardMaterial;
      spriteMat.metalness = def?.toolTier === 3 ? 0.24 : def?.toolTier === 2 ? 0.1 : 0.04;
      spriteMat.roughness = def?.toolTier === 3 ? 0.45 : 0.76;

      if (isHandheldTool) {
        // Minecraft item/handheld firstperson_righthand (order = 'YXZ'):
        // Tool PNGs run handle bottom-left (-X,-Y) -> head top-right (+X,+Y) with blade/prong on upper-left.
        // rz=+0.96 stands handle upright leaning slightly forward; ry=-1.26 aims blade/prong straight
        // forward (-Z) while showing a crisp 3/4 side view to the player from the right hand.
        this.customSpriteMesh.position.set(0.0, 0.04, -0.02);
        this.customSpriteMesh.rotation.set(0.05, -1.26, 0.96);
        this.customSpriteMesh.scale.setScalar(1.06);
      } else {
        // Minecraft item/generated firstperson_righthand:
        // Upright facing the player at a gentle 3/4 angle so pixel art and 3D thickness read clearly.
        this.customSpriteMesh.position.set(0.01, -0.01, 0.01);
        this.customSpriteMesh.rotation.set(0.06, -0.45, 0.04);
        this.customSpriteMesh.scale.setScalar(0.76);
      }
      this.customSpriteMesh.visible = true;
      return;
    }

    // Brief 1-frame fallback until async voxel extrusion finishes
    this.customSpriteMesh.visible = false;
    this.fallbackOrbMesh.visible = true;
    (this.fallbackOrbMesh.material as THREE.MeshStandardMaterial).color.set(
      def?.accentColor ?? '#c9a98a',
    );
  }

  private applyBlockUVs(block: BlockType) {
    const def = BLOCK_DEFS[block];
    const uvAttr = this.blockMesh.geometry.attributes.uv as THREE.BufferAttribute;
    const tileW = 1 / ATLAS_COLS;
    const tileH = 1 / ATLAS_ROWS;
    const eps = 0.002;

    let faceTiles: number[];
    if (block === BlockType.OakDoorBottom) {
      this.blockMesh.scale.set(0.85, 1.32, 0.22);
      faceTiles = [
        TILE.OAK_PLANKS,
        TILE.OAK_PLANKS,
        TILE.OAK_PLANKS,
        TILE.OAK_PLANKS,
        TILE.OAK_DOOR_TOP,
        TILE.OAK_DOOR_BOTTOM,
      ];
    } else if (block === BlockType.BedFoot) {
      this.blockMesh.scale.set(0.92, 0.56, 1.38);
      faceTiles = [
        TILE.BED_HEAD_EAST,
        TILE.BED_HEAD_WEST,
        TILE.BED_HEAD_UP,
        TILE.BED_DOWN,
        TILE.BED_FOOT_SOUTH,
        TILE.BED_HEAD_NORTH,
      ];
    } else {
      this.blockMesh.scale.set(1, 1, 1);
      const frontTile = def.frontTile ?? def.tiles[1];
      faceTiles = [
        def.tiles[1],
        def.tiles[1],
        def.tiles[0],
        def.tiles[2],
        frontTile,
        def.tiles[1],
      ];
    }

    for (let f = 0; f < 6; f++) {
      const tile = faceTiles[f];
      const col = tile % ATLAS_COLS;
      const row = Math.floor(tile / ATLAS_COLS);
      const u0 = col * tileW + eps;
      const u1 = (col + 1) * tileW - eps;
      const v1 = 1 - row * tileH - eps;
      const v0 = 1 - (row + 1) * tileH + eps;

      const base = f * 4;
      uvAttr.setXY(base + 0, u0, v1);
      uvAttr.setXY(base + 1, u1, v1);
      uvAttr.setXY(base + 2, u0, v0);
      uvAttr.setXY(base + 3, u1, v0);
    }
    uvAttr.needsUpdate = true;

    const mat = this.blockMesh.material as THREE.MeshStandardMaterial;
    mat.opacity = def.transparent ? 0.85 : 1.0;
    mat.emissive.setHex(def.emissive ? 0xffb74d : 0x000000);
    mat.emissiveIntensity = def.emissive ? 0.45 : 0;
  }

  public triggerSwing() {
    this.swingActive = true;
    this.swingProgress = 0.0;
  }

  public update(dt: number, moveSpeedRatio: number, grounded: boolean, isMining = false) {
    // 1. Classic Minecraft walking figure-8 sway
    if (moveSpeedRatio > 0.05 && grounded) {
      this.bobPhase += dt * (7.8 + moveSpeedRatio * 4.2);
    } else {
      this.bobPhase += dt * 1.1;
    }

    const walkAmp = grounded ? 0.003 + moveSpeedRatio * 0.015 : 0.002;
    const bobX = Math.sin(this.bobPhase * 0.5) * walkAmp;
    const bobY = -Math.abs(Math.cos(this.bobPhase * 0.5)) * walkAmp * 0.9;

    // 2. Equip dip-in rise animation (when switching hotbar slots)
    if (this.equipProgress < 1) {
      this.equipProgress = Math.min(1, this.equipProgress + dt * 6.4);
    }
    const equipEase = 1 - (1 - this.equipProgress) * (1 - this.equipProgress);
    const equipDipY = -(1 - equipEase) * 0.22;

    // 3. Minecraft swing curve: f1 = sin(sqrt(p) * PI), f2 = sin(p * p * PI)
    let p = 0;
    if (this.swingActive) {
      this.swingProgress += dt * 4.2;
      if (this.swingProgress >= 1.0) {
        this.swingActive = false;
        this.swingProgress = 0;
      } else {
        p = this.swingProgress;
      }
    }

    if (isMining) {
      this.miningCycle = (this.miningCycle + dt * 3.8) % 1.0;
      p = Math.max(p, this.miningCycle);
    } else {
      this.miningCycle = 0;
    }

    const f1 = Math.sin(Math.sqrt(p) * Math.PI);
    const f2 = Math.sin(p * p * Math.PI);
    const f3 = Math.sin(p * Math.PI);

    // Base camera-space anchor tailored per Minecraft display type
    let baseX = 0.34;
    let baseY = -0.26;
    let baseZ = -0.46;

    if (this.displayMode === 'arm') {
      baseX = 0.31;
      baseY = -0.27;
      baseZ = -0.44;
    } else if (this.displayMode === 'block') {
      baseX = 0.32;
      baseY = -0.25;
      baseZ = -0.48;
    } else if (this.displayMode === 'handheld') {
      baseX = 0.33;
      baseY = -0.23;
      baseZ = -0.46;
    } else {
      baseX = 0.31;
      baseY = -0.24;
      baseZ = -0.46;
    }

    // Minecraft diagonal inward-left swing displacement & chop rotation
    const swingOffX = -0.19 * f1;
    const swingOffY = 0.075 * Math.sin(Math.sqrt(p) * Math.PI * 2);
    const swingOffZ = -0.095 * f3;

    this.group.position.set(
      baseX + bobX + swingOffX,
      baseY + bobY + equipDipY + swingOffY,
      baseZ + swingOffZ,
    );

    if (this.displayMode === 'arm') {
      this.group.rotation.set(
        -0.55 * f1,
        0.48 * f1 - 0.16 * f2,
        0.24 * f1,
      );
    } else if (this.displayMode === 'handheld') {
      this.group.rotation.set(
        -0.92 * f1,
        0.52 * f1 - 0.2 * f2,
        0.28 * f2,
      );
    } else {
      this.group.rotation.set(
        -0.68 * f1,
        0.55 * f1 - 0.22 * f2,
        0.22 * f2,
      );
    }
  }

  public dispose() {
    this.customSpriteMesh.geometry = this.customSpriteDefaultGeom;
    for (const geom of this.customItemGeometries.values()) {
      geom.dispose();
    }
    this.customItemGeometries.clear();
    for (const geometries of this.animatedItemGeometries.values()) {
      for (const geom of geometries) geom.dispose();
    }
    this.animatedItemGeometries.clear();
    this.animatedItemFrames.clear();
    this.userOverrideIds.clear();
    this.group.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        (obj.material as THREE.Material).dispose();
      }
    });
  }
}

/**
 * Drifting blocky voxel clouds high above the landscape.
 */
export class VoxelClouds {
  public readonly mesh: THREE.InstancedMesh;
  private readonly positions: Array<{ x: number; y: number; z: number; sx: number; sz: number }> = [];

  constructor(count = 44) {
    const geom = new THREE.BoxGeometry(1, 1.4, 1);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.95,
      metalness: 0.0,
      transparent: true,
      opacity: 0.88,
    });
    this.mesh = new THREE.InstancedMesh(geom, mat, count);
    this.mesh.frustumCulled = false;

    for (let i = 0; i < count; i++) {
      const x = (((Math.sin(i * 12.9898) * 43758.5453) % 1) * 180) - 90;
      const z = (((Math.sin(i * 78.233) * 19341.123) % 1) * 180) - 90;
      const sx = 6 + (i % 5) * 3.5;
      const sz = 4 + ((i * 3) % 4) * 2.8;
      const y = 41 + (i % 3) * 1.6;
      this.positions.push({ x, y, z, sx, sz });
    }
    this.syncMatrices(0, 0);
  }

  public syncMatrices(centerX: number, centerZ: number, dt = 0) {
    const span = 180;
    const half = span / 2;
    for (let i = 0; i < this.positions.length; i++) {
      const c = this.positions[i];
      c.x += dt * 1.1;
      const rx = ((((c.x - centerX + half) % span) + span) % span) - half + centerX;
      const rz = ((((c.z - centerZ + half) % span) + span) % span) - half + centerZ;
      _dummy.position.set(rx, c.y, rz);
      _dummy.rotation.set(0, 0, 0);
      _dummy.scale.set(c.sx, 1, c.sz);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  public setTint(color: THREE.Color) {
    (this.mesh.material as THREE.MeshStandardMaterial).color.copy(color);
  }

  public dispose() {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}
