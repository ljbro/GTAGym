const G = 9.81;
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const axis = (n) => clamp(Number(n) || 0, -1, 1);

/** Native control axes and handling differences, integrated with a browser flight solver.
 * RAGE's coefficients are not SI units. This explicitly reduced solver does not
 * claim binary equivalence to RAGE; native inputs, scale and vehicle identity are retained.
 * Pinned source coefficients and conversion limits are recorded beside the models.
 */
export const HELICOPTER_PROFILES = Object.freeze({
  frogger: Object.freeze({
    id: 'frogger',
    massKg: 7000,
    topSpeedKmh: 227.72,
    thrust: 0.56,
    pitchResponse: 1.58,
    rollResponse: 1.68,
    yawResponse: 1.3,
    sensitivity: 0.24,
    drag: 0.04,
    rotorRadius: 5.3,
    bodyRadius: 1.05,
    height: 3.44,
    length: 12.5,
    gearRetractable: false,
    hookLength: 0,
  }),
  frogger2: Object.freeze({
    id: 'frogger2',
    massKg: 7000,
    topSpeedKmh: 227.72,
    thrust: 0.56,
    pitchResponse: 1.58,
    rollResponse: 1.68,
    yawResponse: 1.3,
    sensitivity: 0.24,
    drag: 0.04,
    rotorRadius: 5.3,
    bodyRadius: 1.05,
    height: 3.44,
    length: 12.5,
    gearRetractable: false,
    hookLength: 0,
  }),
  cargobob: Object.freeze({
    id: 'cargobob',
    massKg: 15000,
    topSpeedKmh: 160.13,
    thrust: 0.51,
    pitchResponse: 1.3,
    rollResponse: 1.3,
    yawResponse: 1.25,
    sensitivity: 0.18,
    drag: 0.05,
    rotorRadius: 6.6,
    bodyRadius: 1.6,
    height: 5.28,
    length: 21.9,
    gearRetractable: false,
    hookLength: 10,
  }),
  skylift: Object.freeze({
    id: 'skylift',
    massKg: 10000,
    topSpeedKmh: 185.07,
    thrust: 0.48,
    pitchResponse: 1.5,
    rollResponse: 1.2,
    yawResponse: 1.05,
    sensitivity: 0.18,
    drag: 0.05,
    rotorRadius: 12.4,
    bodyRadius: 1.7,
    height: 9.96,
    length: 29.81,
    gearRetractable: false,
    hookLength: 7,
  }),
  cargobob2: Object.freeze({
    id: 'cargobob2',
    massKg: 15000,
    topSpeedKmh: 160.13,
    thrust: 0.51,
    pitchResponse: 1.3,
    rollResponse: 1.3,
    yawResponse: 1.25,
    sensitivity: 0.18,
    drag: 0.05,
    rotorRadius: 6.6,
    bodyRadius: 1.6,
    height: 5.28,
    length: 21.9,
    gearRetractable: false,
    hookLength: 6,
  }),
});

export function isHelicopterNavigation(navigation) {
  return navigation?.mode === 'fly' && navigation.vehicleType === 'helicopter';
}

export function helicopterProfile(navigation) {
  const id = navigation?.vehicleModel ?? 'frogger';
  if (!HELICOPTER_PROFILES[id]) throw new Error(`Unknown helicopter model: ${id}`);
  return HELICOPTER_PROFILES[id];
}

export function createHelicopterState(vehicle, navigation, groundHeight = 0) {
  const initial = navigation.helicopter?.initial ?? {};
  const speed = Number(initial.speedMps ?? vehicle.speed) || 0;
  return {
    model: navigation.vehicleModel ?? 'frogger',
    pitch: initial.pitch ?? 0,
    roll: initial.roll ?? 0,
    pitchRate: 0,
    rollRate: 0,
    yawRate: 0,
    velocity: {
      x: -Math.sin(vehicle.yaw) * speed,
      y: initial.verticalSpeedMps ?? 0,
      z: -Math.cos(vehicle.yaw) * speed,
    },
    rotorRpm: initial.rotorRpm ?? (vehicle.position.y > groundHeight + 0.3 ? 1 : 0.72),
    rotorAngle: 0,
    onGround: vehicle.position.y <= groundHeight + 0.06,
    groundHeight,
    altitudeAgl: Math.max(0, vehicle.position.y - groundHeight),
    gearDown: true,
    damaged: false,
    collective: 0,
    hookDeployed: Boolean(navigation.helicopter?.cargo?.initiallyAttached),
    cargoAttached: Boolean(navigation.helicopter?.cargo?.initiallyAttached),
    cargoDelivered: false,
    cargoPosition: null,
    cargoSwing: { x: 0, z: 0, vx: 0, vz: 0 },
    passengersBoarded: navigation.id === 'c08-n12',
    boardingSeconds: 0,
    cargoVelocity: { x: 0, y: 0, z: 0 },
    cargoAttachmentProgress: navigation.helicopter?.cargo?.initiallyAttached ? 1 : 0,
    cargoUnloading: false,
    cargoYaw: vehicle.yaw,
  };
}

/** One deterministic substep. Pose and momentum persist when the controls are released. */
export function advanceHelicopterFlight(vehicle, dt, input, profile, environment) {
  const state = vehicle.flight;
  const controls = input.flight ?? {};
  const collective = state.damaged ? -1 : axis(controls.collective);
  state.collective = collective;
  const rpmTarget = state.damaged ? 0 : vehicle.occupied ? 1 : 0;
  state.rotorRpm += (rpmTarget - state.rotorRpm) * Math.min(1, dt * (rpmTarget ? 0.65 : 0.22));
  state.rotorAngle = (state.rotorAngle + state.rotorRpm * dt * 34) % (Math.PI * 2);
  const loadRatio = state.cargoAttached ? (environment.cargo?.massKg ?? 1800) / profile.massKg : 0;
  const authority = (state.rotorRpm * state.rotorRpm) / (1 + loadRatio * 0.35);
  const maxTilt = 0.66;
  // Spring/damping models the assisted helicopter stick, with separate yaw pedals.
  for (const [name, response] of [
    ['pitch', profile.pitchResponse],
    ['roll', profile.rollResponse],
  ]) {
    const target = axis(controls[name]) * maxTilt;
    const rate = `${name}Rate`;
    state[rate] += ((target - state[name]) * response * 7 * authority - state[rate] * 4.8) * dt;
    state[name] = clamp(state[name] + state[rate] * dt, -0.9, 0.9);
  }
  state.yawRate +=
    (-axis(controls.yaw) * profile.yawResponse * 0.65 * authority - state.yawRate) * Math.min(1, dt * 2.2);
  vehicle.yaw = Math.atan2(
    Math.sin(vehicle.yaw + state.yawRate * dt),
    Math.cos(vehicle.yaw + state.yawRate * dt),
  );
  const p = state.pitch,
    r = state.roll,
    yaw = vehicle.yaw;
  const normal = {
    x: Math.cos(yaw) * Math.sin(r) - Math.sin(yaw) * Math.sin(p) * Math.cos(r),
    y: Math.cos(p) * Math.cos(r),
    z: -Math.sin(yaw) * Math.sin(r) - Math.cos(yaw) * Math.sin(p) * Math.cos(r),
  };
  // Neutral collective supports level flight. Banking trades vertical lift for acceleration.
  const lift = (G * state.rotorRpm ** 2 * (1 + collective * profile.thrust * 1.65)) / (1 + loadRatio * 0.25);
  const velocity = state.velocity;
  const maxSpeed = profile.topSpeedKmh / 3.6;
  const speed = Math.hypot(velocity.x, velocity.z);
  const drag = (G * Math.tan(0.57)) / (maxSpeed * maxSpeed);
  const ax = normal.x * lift - velocity.x * (0.024 + speed * drag);
  const az = normal.z * lift - velocity.z * (0.024 + speed * drag);
  velocity.x += ax * dt;
  velocity.y += (normal.y * lift - G - velocity.y * (0.24 + Math.abs(velocity.y) * 0.012)) * dt;
  velocity.z += az * dt;
  // Match measured model-specific level-flight ceilings; do not normalize route length or time.
  const horizontal = Math.hypot(velocity.x, velocity.z);
  if (horizontal > maxSpeed) {
    velocity.x *= maxSpeed / horizontal;
    velocity.z *= maxSpeed / horizontal;
  }
  const before = vehicle.position;
  const next = {
    x: before.x + velocity.x * dt,
    y: before.y + velocity.y * dt,
    z: before.z + velocity.z * dt,
  };
  const floor = environment.groundAt(next, Math.max(before.y, next.y) + 0.4);
  const ground = Number.isFinite(floor) ? floor : -500;
  state.groundHeight = ground;
  state.onGround = next.y <= ground + 0.025 && velocity.y <= 0;
  let collision = false;
  if (state.onGround) {
    const hardLanding = velocity.y < -6 || horizontal > 15 || Math.abs(p) > 0.5 || Math.abs(r) > 0.5;
    collision = hardLanding && !state.damaged;
    state.damaged ||= hardLanding;
    next.y = ground;
    velocity.y = 0;
    velocity.x *= Math.exp(-dt * 3.5);
    velocity.z *= Math.exp(-dt * 3.5);
    state.pitch *= Math.exp(-dt * 3);
    state.roll *= Math.exp(-dt * 3);
  }
  if (environment.blocked?.(next, state, profile)) {
    collision ||= !state.damaged;
    state.damaged = true;
    velocity.x *= -0.15;
    velocity.z *= -0.15;
    velocity.y = Math.min(velocity.y, 0);
    // Reject the solid penetration while preserving the pilot's independent camera angle.
  } else vehicle.position = next;
  state.altitudeAgl = Math.max(0, vehicle.position.y - ground);
  vehicle.speed = Math.hypot(velocity.x, velocity.z);
  return {
    collision,
    distance: Math.hypot(
      vehicle.position.x - before.x,
      vehicle.position.y - before.y,
      vehicle.position.z - before.z,
    ),
    acceleration: { x: ax, z: az },
  };
}

/** Hook release is an edge action. A payload cannot attach from across the map. */
export function operateHelicopterHook(vehicle, profile, cargo) {
  const state = vehicle.flight;
  if (!profile.hookLength || !cargo) return false;
  if (state.cargoAttached) {
    const at = state.cargoPosition;
    const target = cargo.delivery;
    const headingError =
      cargo.deliveryYaw === undefined
        ? 0
        : Math.abs(
            Math.atan2(Math.sin(vehicle.yaw - cargo.deliveryYaw), Math.cos(vehicle.yaw - cargo.deliveryYaw)),
          );
    const validHeight =
      cargo.attachment === 'magnet'
        ? at && at.y >= cargo.deliveryHeightRange[0] && at.y <= cargo.deliveryHeightRange[1]
        : at && Math.abs(at.y - target[1]) <= 4;
    state.cargoDelivered = Boolean(
      at &&
      target &&
      Math.hypot(at.x - target[0], at.z - target[2]) <= (cargo.deliveryRadius ?? 14) &&
      validHeight &&
      (headingError < Math.PI / 9 || headingError > (Math.PI * 8) / 9) &&
      vehicle.speed < (cargo.attachment === 'magnet' ? 3 : 5),
    );
    // The native Skylift mission only enables magnet release in the aligned
    // unloading volume. An early press must keep the load attached.
    if (cargo.attachment === 'magnet' && !state.cargoDelivered) return false;
    state.cargoAttached = false;
    state.hookDeployed = false;
    if (state.cargoDelivered && cargo.attachment === 'magnet') {
      state.cargoDelivered = false;
      state.cargoUnloading = true;
      state.cargoAttachmentProgress = 0;
      state.cargoUnloadFrom = { ...at };
    }
    state.cargoVelocity = { ...state.velocity };
    return true;
  }
  if (cargo.attachment === 'magnet') {
    const point = state.cargoPosition ?? { x: cargo.pickup[0], y: cargo.pickup[1], z: cargo.pickup[2] };
    if (
      Math.hypot(vehicle.position.x - point.x, vehicle.position.z - point.z) > 6.4 ||
      Math.abs(vehicle.position.y - point.y) > 9 ||
      vehicle.speed > 4
    )
      return false;
    state.cargoAttached = state.hookDeployed = true;
    state.cargoAttachFrom = { ...point };
    state.cargoAttachmentProgress = 0;
    return true;
  }
  state.hookDeployed = !state.hookDeployed;
  return true;
}

/** Damped pendulum plus ground-limited pickup. Horizontal acceleration swings the suspended load. */
export function advanceHelicopterCargo(vehicle, dt, profile, cargo, acceleration, groundAt) {
  const state = vehicle.flight;
  if (!cargo || !profile.hookLength || state.cargoDelivered) return;
  const length = profile.hookLength;
  const swing = state.cargoSwing;
  if (state.cargoUnloading) {
    state.cargoAttachmentProgress = Math.min(1, state.cargoAttachmentProgress + dt * 2);
    const f = state.cargoAttachmentProgress;
    state.cargoPosition = Object.fromEntries(
      ['x', 'y', 'z'].map((axis, i) => [axis, state.cargoUnloadFrom[axis] * (1 - f) + cargo.delivery[i] * f]),
    );
    state.cargoYaw = cargo.deliveryYaw;
    state.cargoDelivered = f >= 1;
    return;
  }
  if (cargo.attachment === 'magnet' && state.cargoAttached) {
    const [x, y, z] = cargo.attachmentOffset;
    const roll = state.roll,
      pitch = state.pitch,
      yaw = vehicle.yaw;
    const rx = Math.cos(roll) * x + Math.sin(roll) * y;
    const ry = -Math.sin(roll) * x + Math.cos(roll) * y;
    const py = Math.cos(pitch) * ry + Math.sin(pitch) * z;
    const pz = -Math.sin(pitch) * ry + Math.cos(pitch) * z;
    const target = {
      x: vehicle.position.x + Math.cos(yaw) * rx + Math.sin(yaw) * pz,
      y: vehicle.position.y + py,
      z: vehicle.position.z - Math.sin(yaw) * rx + Math.cos(yaw) * pz,
    };
    state.cargoAttachmentProgress = Math.min(1, state.cargoAttachmentProgress + dt * 2);
    const f = state.cargoAttachmentProgress;
    state.cargoPosition = state.cargoAttachFrom
      ? Object.fromEntries(
          ['x', 'y', 'z'].map((axis) => [axis, state.cargoAttachFrom[axis] * (1 - f) + target[axis] * f]),
        )
      : target;
    state.cargoYaw = vehicle.yaw;
    return;
  }
  if (!state.cargoAttached && state.hookDeployed && cargo.pickup && cargo.attachment !== 'magnet') {
    const { x, y, z } = state.cargoPosition ?? { x: cargo.pickup[0], y: cargo.pickup[1], z: cargo.pickup[2] };
    if (
      Math.hypot(vehicle.position.x - x, vehicle.position.z - z) < (cargo.pickupRadius ?? 5) &&
      Math.abs(vehicle.position.y - length - y) < 3 &&
      vehicle.speed < 4 &&
      Math.abs(state.velocity.y) < 2.5
    ) {
      state.cargoAttached = true;
      state.cargoVelocity = { x: 0, y: 0, z: 0 };
    }
  }
  if (state.cargoAttached) {
    state.cargoYaw = vehicle.yaw;
    for (const a of ['x', 'z']) {
      swing[`v${a}`] += ((-G / length) * swing[a] - swing[`v${a}`] * 0.65 - acceleration[a]) * dt;
      swing[a] = clamp(swing[a] + swing[`v${a}`] * dt, -length * 0.7, length * 0.7);
    }
    state.cargoPosition = {
      x: vehicle.position.x + swing.x,
      y:
        vehicle.position.y -
        Math.sqrt(Math.max(length * length * 0.1, length * length - swing.x ** 2 - swing.z ** 2)),
      z: vehicle.position.z + swing.z,
    };
  } else if (!state.cargoPosition && cargo.pickup) {
    const [x, y, z] = cargo.pickup;
    state.cargoPosition = { x, y, z };
  } else if (state.cargoPosition) {
    // Released cargo falls instead of remaining suspended in the air.
    const point = state.cargoPosition;
    point.x += state.cargoVelocity.x * dt;
    point.z += state.cargoVelocity.z * dt;
    const atPickup =
      Math.hypot(point.x - cargo.pickup[0], point.z - cargo.pickup[2]) < (cargo.pickupRadius ?? 6);
    const floor = atPickup ? cargo.pickup[1] : (groundAt?.(point, point.y + 1) ?? cargo.delivery?.[1] ?? 0);
    state.cargoVelocity.y -= G * dt;
    point.y = Math.max(floor, point.y + state.cargoVelocity.y * dt);
    if (point.y <= floor) state.cargoVelocity = { x: 0, y: 0, z: 0 };
  }
}
