/** Authoritative player input, movement, collision and camera-target logic. */
import { GameServer } from '../GameServer';
import { damp, clamp, Vec3 } from '../../shared/vec';
import { DOOR_THICKNESS, DOOR_THICKNESS_OFFSET, PLAYER_HALF_WIDTH, PLAYER_HEIGHT, EYE_HEIGHT, GRAVITY, JUMP_SPEED, WALK_SPEED, SPRINT_SPEED, FLY_SPEED } from '../../shared/constants';
import { BLOCK_DEFS, isBedBlock, isDoorBlock, isLiquidBlock, isSolidBlock } from '../../shared/blocks';
import { _forward, _right, _moveDir, _rayOrigin, _rayDir } from './serverScratch';

export class PlayerSystem {
  constructor(private readonly s: GameServer) {}

  toggleFlyMode() {
    if (this.s.mode === 'survival') {
      this.s.fx.toast('Flight is available in Creative Mode');
      return;
    }
    this.s.flying = !this.s.flying;
    this.s.playerVel.y = 0;
    this.s.fx.sound('playUiTick', []);
    this.s.emitHud();
  }

  collidesAt(x: number, y: number, z: number): boolean {
    const minX = Math.floor(x - PLAYER_HALF_WIDTH);
    const maxX = Math.floor(x + PLAYER_HALF_WIDTH);
    const minY = Math.floor(y);
    const maxY = Math.floor(y + PLAYER_HEIGHT - 0.01);
    const minZ = Math.floor(z - PLAYER_HALF_WIDTH);
    const maxZ = Math.floor(z + PLAYER_HALF_WIDTH);

    for (let by = minY; by <= maxY; by++) {
      for (let bz = minZ; bz <= maxZ; bz++) {
        for (let bx = minX; bx <= maxX; bx++) {
          const block = this.s.world.getBlock(bx, by, bz);
          if (!isSolidBlock(block)) continue;
          // A closed door is a thin plane, not a full cube. Its collider is
          // four texture pixels deep, centred in the block along Z.
          if (isDoorBlock(block)) {
            const doorMinZ = bz + DOOR_THICKNESS_OFFSET;
            const doorMaxZ = doorMinZ + DOOR_THICKNESS;
            if (z + PLAYER_HALF_WIDTH <= doorMinZ || z - PLAYER_HALF_WIDTH >= doorMaxZ) {
              continue;
            }
          }
          return true;
        }
      }
    }
    return false;
  }

  blockIntersectsPlayer(bx: number, by: number, bz: number): boolean {
    const pMinX = this.s.playerPos.x - PLAYER_HALF_WIDTH;
    const pMaxX = this.s.playerPos.x + PLAYER_HALF_WIDTH;
    const pMinY = this.s.playerPos.y;
    const pMaxY = this.s.playerPos.y + PLAYER_HEIGHT;
    const pMinZ = this.s.playerPos.z - PLAYER_HALF_WIDTH;
    const pMaxZ = this.s.playerPos.z + PLAYER_HALF_WIDTH;

    return (
      bx < pMaxX &&
      bx + 1 > pMinX &&
      by < pMaxY &&
      by + 1 > pMinY &&
      bz < pMaxZ &&
      bz + 1 > pMinZ
    );
  }

  updatePlayer(dt: number) {
    const keyTurnSpeed = 2.0;
    if (this.s.heldKeys.has('ArrowLeft')) this.s.yaw += keyTurnSpeed * dt;
    if (this.s.heldKeys.has('ArrowRight')) this.s.yaw -= keyTurnSpeed * dt;
    if (this.s.heldKeys.has('ArrowUp')) {
      this.s.pitch = Math.min(Math.PI / 2 - 0.04, this.s.pitch + keyTurnSpeed * 0.8 * dt);
    }
    if (this.s.heldKeys.has('ArrowDown')) {
      this.s.pitch = Math.max(-Math.PI / 2 + 0.04, this.s.pitch - keyTurnSpeed * 0.8 * dt);
    }

    _forward.set(-Math.sin(this.s.yaw), 0, -Math.cos(this.s.yaw));
    _right.set(Math.cos(this.s.yaw), 0, -Math.sin(this.s.yaw));
    _moveDir.set(0, 0, 0);

    if (this.s.heldKeys.has('KeyW')) _moveDir.add(_forward);
    if (this.s.heldKeys.has('KeyS')) _moveDir.sub(_forward);
    if (this.s.heldKeys.has('KeyD')) _moveDir.add(_right);
    if (this.s.heldKeys.has('KeyA')) _moveDir.sub(_right);

    const moving = _moveDir.lengthSq() > 0.001;
    if (moving) _moveDir.normalize();

    const canSprint = this.s.mode === 'creative' || this.s.hunger > 4;
    const sprinting =
      canSprint &&
      (this.s.heldKeys.has('ShiftLeft') || this.s.heldKeys.has('ShiftRight')) &&
      moving;

    const headBlock = this.s.world.getBlock(
      Math.floor(this.s.playerPos.x),
      Math.floor(this.s.playerPos.y + EYE_HEIGHT),
      Math.floor(this.s.playerPos.z),
    );
    const feetBlock = this.s.world.getBlock(
      Math.floor(this.s.playerPos.x),
      Math.floor(this.s.playerPos.y + 0.25),
      Math.floor(this.s.playerPos.z),
    );
    const wasUnderwater = this.s.underwater;
    this.s.underwater = isLiquidBlock(headBlock);
    const inWater = isLiquidBlock(feetBlock) || this.s.underwater;
    if (!wasUnderwater && this.s.underwater) {
      this.s.fx.sound('playStep', ['water']);
    }

    const targetFov = sprinting
      ? this.s.baseFov + 6
      : this.s.flying && moving
        ? this.s.baseFov + 4
        : this.s.baseFov;
    if (Math.abs(this.s.fov - targetFov) > 0.05) {
      this.s.fov = damp(this.s.fov, targetFov, 9, dt);
      this.s.fx.fovChanged();
    }

    const speed = this.s.flying
      ? sprinting
        ? FLY_SPEED * 1.45
        : FLY_SPEED
      : inWater
        ? WALK_SPEED * 0.62
        : sprinting
          ? SPRINT_SPEED
          : WALK_SPEED;

    const accel = this.s.grounded || this.s.flying ? 16 : 6.5;
    this.s.playerVel.x = damp(this.s.playerVel.x, _moveDir.x * speed, accel, dt);
    this.s.playerVel.z = damp(this.s.playerVel.z, _moveDir.z * speed, accel, dt);

    if (this.s.flying) {
      let targetVy = 0;
      if (this.s.heldKeys.has('Space')) targetVy += 8.5;
      if (this.s.heldKeys.has('KeyC') || this.s.heldKeys.has('ControlLeft')) targetVy -= 8.5;
      this.s.playerVel.y = damp(this.s.playerVel.y, targetVy, 12, dt);
      this.s.grounded = false;
      this.s.peakAirY = this.s.playerPos.y;
    } else if (inWater) {
      const targetWaterVy = this.s.heldKeys.has('Space') ? 4.2 : -1.8;
      this.s.playerVel.y = damp(this.s.playerVel.y, targetWaterVy, 6, dt);
      this.s.grounded = false;
      this.s.peakAirY = this.s.playerPos.y;
    } else {
      if (this.s.grounded) {
        this.s.coyoteTimer = 0.11;
        this.s.peakAirY = this.s.playerPos.y;
      } else {
        this.s.coyoteTimer = Math.max(0, this.s.coyoteTimer - dt);
        if (this.s.playerPos.y > this.s.peakAirY) this.s.peakAirY = this.s.playerPos.y;
      }

      if (this.s.jumpBufferTimer > 0) {
        this.s.jumpBufferTimer = Math.max(0, this.s.jumpBufferTimer - dt);
      }

      if (this.s.jumpBufferTimer > 0 && this.s.coyoteTimer > 0) {
        this.s.playerVel.y = JUMP_SPEED;
        this.s.grounded = false;
        this.s.coyoteTimer = 0;
        this.s.jumpBufferTimer = 0;
        if (this.s.mode === 'survival') this.s.exhaustion += 0.05;
        this.s.fx.sound('playJump', []);
      }

      this.s.playerVel.y = Math.max(-34, this.s.playerVel.y - GRAVITY * dt);
    }

    const prevX = this.s.playerPos.x;
    const prevZ = this.s.playerPos.z;
    const prevVy = this.s.playerVel.y;

    // X axis
    const nextX = this.s.playerPos.x + this.s.playerVel.x * dt;
    if (!this.s.collidesAt(nextX, this.s.playerPos.y, this.s.playerPos.z)) {
      this.s.playerPos.x = nextX;
    } else {
      this.s.playerVel.x = 0;
    }

    // Z axis
    const nextZ = this.s.playerPos.z + this.s.playerVel.z * dt;
    if (!this.s.collidesAt(this.s.playerPos.x, this.s.playerPos.y, nextZ)) {
      this.s.playerPos.z = nextZ;
    } else {
      this.s.playerVel.z = 0;
    }

    // Y axis
    const nextY = this.s.playerPos.y + this.s.playerVel.y * dt;
    const wasGrounded = this.s.grounded;
    if (!this.s.collidesAt(this.s.playerPos.x, nextY, this.s.playerPos.z)) {
      this.s.playerPos.y = nextY;
      this.s.grounded = false;
    } else {
      if (this.s.playerVel.y < 0) {
        this.s.playerPos.y = Math.floor(nextY) + 1.0001;
        this.s.grounded = true;
        if (!wasGrounded) {
          const fallDist = this.s.peakAirY - this.s.playerPos.y;
          if (this.s.mode === 'survival' && !inWater && fallDist > 3.6) {
            const fallDmg = Math.max(1, Math.floor(fallDist - 3.0));
            this.s.applyPlayerDamage(fallDmg);
          } else if (prevVy < -6.5) {
            this.s.fx.sound('playLand', [Math.min(1.6, Math.abs(prevVy) / 10)]);
            this.s.cameraShake = Math.max(
              this.s.cameraShake,
              Math.min(0.05, Math.abs(prevVy) * 0.0025),
            );
          }
          this.s.peakAirY = this.s.playerPos.y;
        }
      } else if (this.s.playerVel.y > 0) {
        this.s.playerPos.y = Math.floor(nextY + PLAYER_HEIGHT) - PLAYER_HEIGHT - 0.001;
      }
      this.s.playerVel.y = 0;
    }

    if (this.s.playerPos.y < 1.5) {
      const safeY = this.s.world.getGroundY(this.s.playerPos.x, this.s.playerPos.z);
      this.s.playerPos.y = safeY + 1;
      this.s.playerVel.y = 0;
      this.s.peakAirY = this.s.playerPos.y;
    }

    const horizDist = Math.hypot(this.s.playerPos.x - prevX, this.s.playerPos.z - prevZ);
    if (this.s.grounded && horizDist > 0.001) {
      this.s.stepDist += horizDist;
      if (this.s.stepDist >= 2.15) {
        this.s.stepDist = 0;
        const under = this.s.world.getBlock(
          Math.floor(this.s.playerPos.x),
          Math.floor(this.s.playerPos.y - 0.2),
          Math.floor(this.s.playerPos.z),
        );
        this.s.fx.sound('playStep', [BLOCK_DEFS[under]?.sound ?? 'grass']);
      }
    } else if (inWater && horizDist > 0.001) {
      this.s.stepDist += horizDist;
      if (this.s.stepDist >= 2.5) {
        this.s.stepDist = 0;
        this.s.fx.sound('playStep', ['water']);
      }
    }

    this.s.cameraShake = Math.max(0, this.s.cameraShake - dt * 0.35);
    const shakeX = this.s.cameraShake > 0 ? (Math.random() - 0.5) * this.s.cameraShake : 0;
    const shakeY = this.s.cameraShake > 0 ? (Math.random() - 0.5) * this.s.cameraShake : 0;

    this.s.setEyePos(this.s.playerPos.x + shakeX,
      this.s.playerPos.y + EYE_HEIGHT + shakeY,
      this.s.playerPos.z,);

    const speedRatio = Math.min(1, Math.hypot(this.s.playerVel.x, this.s.playerVel.z) / SPRINT_SPEED);
    const isActivelyMining =
      this.s.mode === 'survival' && this.s.miningHeld && this.s.currentTarget !== null;
    this.s.fx.viewmodelUpdate(dt, speedRatio, this.s.grounded && !this.s.flying, isActivelyMining);
    this.s.fx.shadowUpdate(
      this.s.playerPos.x,
      this.s.playerPos.z,
      this.s.yaw,
      this.s.grounded && !this.s.flying,
    );

    _rayOrigin.copy(this.s.eyePos);
    _rayDir.copy(this.s.viewDir);
    this.s.currentTarget = this.s.world.raycast(_rayOrigin, _rayDir, 6.5);

    if (this.s.currentTarget) {
      const t = this.s.currentTarget;
      this.s.fx.highlightVisible(true);
      if (isBedBlock(t.block)) {
        this.s.fx.highlightScale(1, 9 / 16, 1);
        this.s.fx.highlightPos(t.x + 0.5, t.y + 9 / 32, t.z + 0.5);
      } else {
        this.s.fx.highlightScale(1, 1, 1);
        this.s.fx.highlightPos(t.x + 0.5, t.y + 0.5, t.z + 0.5);
      }
    } else {
      this.s.fx.highlightVisible(false);
    }
  }
}
