import { HELICOPTER_PROFILES } from './helicopter-flight.js';

const G = 9.81;
const clamp = (value, low, high) => Math.max(low, Math.min(high, value));

/**
 * Source handling values: unmodified game data mirrored at the pinned revision below.
 * Top speeds: Broughy1322's distance/time measurements, consulted 2026-09-06.
 * https://gtacars.net/gta5/topspeed documents fully upgraded, level-road testing.
 * These are representative vehicle profiles, not identification of each video's vehicle.
 * Force/brake coefficients are not SI accelerations: the reduced browser model below
 * uses an explicit twofold aggregate gearing gain, drag taper and conservative grip.
 * It does not reproduce RAGE gear changes, tire slip, wheelies, suspension or aerodynamics.
 */
export const GTA_HANDLING_SOURCE =
  'https://github.com/zfbx/GTA5-Handling-Meta/tree/6f962010f6a6449c32d5fc0fcb9975c94b683f2d/handlings';

function roadProfile(id, topSpeedKmh, handling, extra = {}) {
  return Object.freeze({
    id,
    mode: 'drive',
    topSpeedKmh,
    maxSpeedMps: topSpeedKmh / 3.6,
    reverseSpeedMps: 8,
    accelerationMps2: handling.driveForce * G * 2,
    brakeMps2: Math.min(12, handling.brakeForce * G),
    coastMps2: 0.45,
    dragPerMetre: handling.drag * 0.0001,
    steeringLockRadians: (handling.steeringLockDegrees * Math.PI) / 180,
    steeringResponse: 6,
    wheelbaseMetres: 3,
    lateralAccelerationMps2: handling.traction * G * 0.6,
    yawRateLimit: 1.5,
    verticalSpeedMps: 0,
    handling: Object.freeze(handling),
    source: `https://gtacars.net/gta5/${id}`,
    ...extra,
  });
}

function marineAirProfile(id, mode, topSpeedKmh, extra) {
  return Object.freeze({
    id,
    mode,
    topSpeedKmh,
    maxSpeedMps: topSpeedKmh / 3.6,
    reverseSpeedMps: 6,
    accelerationMps2: 4,
    brakeMps2: 4,
    coastMps2: 0.6,
    dragPerMetre: 0.0005,
    steeringResponse: 4,
    yawRateLimit: 0.8,
    verticalSpeedMps: 0,
    source: `https://gtacars.net/gta5/${id}`,
    ...extra,
  });
}

export const VEHICLE_PROFILES = Object.freeze({
  rancherxl2: roadProfile(
    'rancherxl2',
    155.7,
    { driveForce: 0.18, brakeForce: 0.8, steeringLockDegrees: 35, traction: 1.95, drag: 8.5 },
    {
      handlingSource: 'https://gtacars.net/gta5/rancherxl2',
      source: 'https://gtacars.net/gta5/rancherxl',
      limitation:
        'Native Rancher XL handling coefficients; speed ceiling uses the tested upgraded road variant with shared handling. Snow tire slip and exact recording speeds are not recovered.',
    },
  ),
  oracle2: roadProfile(
    'oracle2',
    185.88,
    { driveForce: 0.27, brakeForce: 0.9, steeringLockDegrees: 40, traction: 2.25, drag: 8 },
    { handlingSource: 'https://gtacars.net/gta5/oracle2' },
  ),
  rapidgt2: roadProfile(
    'rapidgt2',
    193.93,
    {
      driveForce: 0.36,
      brakeForce: 1,
      steeringLockDegrees: 43,
      traction: 2.45,
      drag: 10,
    },
    { handlingSource: 'https://gtacars.net/gta5/rapidgt2' },
  ),
  buffalo2: roadProfile(
    'buffalo2',
    181.86,
    {
      driveForce: 0.29,
      brakeForce: 0.9,
      steeringLockDegrees: 40,
      traction: 2.45,
      drag: 8.9,
    },
    { handlingSource: 'https://gtacars.net/gta5/buffalo2' },
  ),
  bjxl: roadProfile(
    'bjxl',
    156.91,
    { driveForce: 0.19, brakeForce: 0.8, steeringLockDegrees: 38, traction: 2.05, drag: 8.5 },
    { handlingSource: 'https://gtacars.net/gta5/bjxl' },
  ),
  speedo: roadProfile(
    'speedo',
    162.95,
    { driveForce: 0.18, brakeForce: 0.6, steeringLockDegrees: 35, traction: 1.8, drag: 6 },
    { handlingSource: 'https://gtacars.net/gta5/speedo' },
  ),
  bodhi2: roadProfile(
    'bodhi2',
    160.13,
    { driveForce: 0.215, brakeForce: 1.1, steeringLockDegrees: 38, traction: 2.25, drag: 11 },
    { handlingSource: 'https://gtacars.net/gta5/bodhi2' },
  ),
  sentinel2: roadProfile(
    'sentinel2',
    181.05,
    { driveForce: 0.21, brakeForce: 0.9, steeringLockDegrees: 40, traction: 2.45, drag: 5.5 },
    { handlingSource: 'https://gtacars.net/gta5/sentinel2' },
  ),
  baller: roadProfile(
    'baller',
    160.93,
    {
      driveForce: 0.21,
      brakeForce: 0.6,
      steeringLockDegrees: 35,
      traction: 1.9,
      drag: 8,
    },
    {
      // Distance between the original GLB wheel_lf and wheel_lr skeleton pivots.
      wheelbaseMetres: 3.046972,
    },
  ),
  bati: roadProfile(
    'bati',
    217.26,
    {
      driveForce: 0.3,
      brakeForce: 1.4,
      steeringLockDegrees: 45,
      traction: 2.32,
      drag: 8,
    },
    { wheelbaseMetres: 1.43, reverseSpeedMps: 2, steeringResponse: 8 },
  ),
  bagger: roadProfile(
    'bagger',
    157.72,
    { driveForce: 0.21, brakeForce: 1.2, steeringLockDegrees: 35, traction: 1.65, drag: 9 },
    {
      wheelbaseMetres: 1.5,
      reverseSpeedMps: 2,
      steeringResponse: 8,
      handlingSource: 'https://gtacars.net/gta5/bagger',
    },
  ),
  scorcher: roadProfile(
    'scorcher',
    61.15,
    {
      driveForce: 0.17,
      brakeForce: 2.8,
      steeringLockDegrees: 50,
      traction: 2.05,
      drag: 60,
    },
    {
      accelerationMps2: 0.17 * G,
      brakeMps2: 5,
      reverseSpeedMps: 1.5,
      wheelbaseMetres: 1.1,
      coastMps2: 0.2,
      steeringResponse: 8,
    },
  ),
  bus: roadProfile(
    'bus',
    106.22,
    {
      driveForce: 0.12,
      brakeForce: 0.35,
      steeringLockDegrees: 35,
      traction: 1.45,
      drag: 10,
    },
    { wheelbaseMetres: 6.2, reverseSpeedMps: 5, steeringResponse: 3.5 },
  ),
  dinghy: marineAirProfile('dinghy', 'boat', 115.07, {
    // Marine drive force uses a different native solver; this is an SI approximation.
    accelerationMps2: 4,
    yawRateLimit: 0.85,
  }),
  submersible: marineAirProfile('submersible', 'boat', 31.78, {
    accelerationMps2: 1.2,
    brakeMps2: 1.6,
    reverseSpeedMps: 3,
    verticalSpeedMps: 1.5,
    yawRateLimit: 0.5,
  }),
  frogger: marineAirProfile('frogger', 'fly', 227.72, {
    accelerationMps2: 0.56 * G,
    brakeMps2: 4.5,
    verticalSpeedMps: 9,
    yawRateLimit: 0.7,
  }),
  velum: marineAirProfile('velum', 'fly', 224.91, {
    accelerationMps2: 0.57 * G,
    brakeMps2: 3,
    verticalSpeedMps: 9,
    yawRateLimit: 0.45,
    reverseSpeedMps: 0,
  }),
  parachute: marineAirProfile('parachute', 'fly', 54, {
    accelerationMps2: 2,
    brakeMps2: 3,
    reverseSpeedMps: 0,
    verticalSpeedMps: 5,
    yawRateLimit: 0.75,
    source: null,
    limitation: 'Navigation glide approximation; no measured original parachute dynamics or lift solver.',
  }),
  ...Object.fromEntries(
    Object.values(HELICOPTER_PROFILES).map((profile) => [
      profile.id,
      marineAirProfile(profile.id, 'fly', profile.topSpeedKmh, {
        accelerationMps2: profile.thrust * G,
        brakeMps2: 4.5,
        verticalSpeedMps: 12,
        yawRateLimit: profile.yawResponse * 0.65,
        helicopter: profile,
      }),
    ]),
  ),
});

const aliases = {
  car: 'baller',
  drive: 'baller',
  motorcycle: 'bati',
  bike: 'scorcher',
  bicycle: 'scorcher',
  boat: 'dinghy',
  jetski: 'dinghy',
  submarine: 'submersible',
  helicopter: 'frogger',
  plane: 'velum',
  'cargo-plane': 'velum',
  fly: 'velum',
};

/** All overrides use SI units; unknown fields and invalid values fail rather than silently changing units. */
export function resolveVehicleProfile(kind = 'car', overrides = {}) {
  const id = aliases[kind] ?? kind;
  const base = VEHICLE_PROFILES[id] ?? VEHICLE_PROFILES.baller;
  const allowed = {
    maxSpeedMps: [0.5, 100],
    reverseSpeedMps: [0, 15],
    accelerationMps2: [0.1, 20],
    brakeMps2: [0.1, 20],
    coastMps2: [0, 5],
    dragPerMetre: [0, 0.05],
    steeringLockRadians: [0.05, 1.3],
    steeringResponse: [0.5, 20],
    wheelbaseMetres: [0.5, 15],
    lateralAccelerationMps2: [1, 25],
    yawRateLimit: [0.1, 2.5],
    verticalSpeedMps: [0, 25],
  };
  for (const [key, value] of Object.entries(overrides)) {
    const bounds = allowed[key];
    if (!bounds || !Number.isFinite(value) || value < bounds[0] || value > bounds[1])
      throw new RangeError(`Invalid vehicle physics ${key}`);
  }
  return Object.freeze({
    ...base,
    ...overrides,
    topSpeedKmh: (overrides.maxSpeedMps ?? base.maxSpeedMps) * 3.6,
  });
}

/** Advance actual m/s velocity and yaw; caller moves/collides at the resulting speed using the same dt. */
export function advanceVehicleMotion(vehicle, dt, input, profile, { precision = false } = {}) {
  const throttle = clamp(Number(input.forward) || 0, -1, 1);
  const steering = clamp(Number(input.right) || 0, -1, 1);
  const absoluteSpeed = Math.abs(vehicle.speed);
  const opposing = throttle !== 0 && throttle * vehicle.speed < 0;
  if (input.brake || opposing) {
    const braking = profile.brakeMps2 * (input.brake ? 1 : Math.abs(throttle));
    vehicle.speed = Math.sign(vehicle.speed) * Math.max(0, absoluteSpeed - braking * dt);
  } else if (throttle) {
    const limit = throttle > 0 ? profile.maxSpeedMps : profile.reverseSpeedMps;
    const fraction = limit ? absoluteSpeed / limit : 1;
    const acceleration = profile.accelerationMps2 * Math.max(0, 1 - fraction * fraction);
    vehicle.speed += throttle * acceleration * dt;
  } else {
    const resistance = profile.coastMps2 + profile.dragPerMetre * absoluteSpeed * absoluteSpeed;
    vehicle.speed = Math.sign(vehicle.speed) * Math.max(0, absoluteSpeed - resistance * dt);
  }
  vehicle.speed = clamp(vehicle.speed, -profile.reverseSpeedMps, profile.maxSpeedMps);
  vehicle.steering +=
    (steering - vehicle.steering) * (1 - Math.exp(-dt * profile.steeringResponse * (precision ? 1.5 : 1)));
  let yawRate;
  if (profile.mode === 'drive') {
    const requested =
      (vehicle.speed / profile.wheelbaseMetres) * Math.tan(vehicle.steering * profile.steeringLockRadians);
    const tractionLimit =
      (profile.lateralAccelerationMps2 * (precision ? 1.15 : 1)) / Math.max(Math.abs(vehicle.speed), 0.1);
    yawRate = clamp(
      requested,
      -Math.min(profile.yawRateLimit, tractionLimit),
      Math.min(profile.yawRateLimit, tractionLimit),
    );
  } else {
    // Existing simplified air/marine controls retain stationary turning; this is not an aircraft flight model.
    yawRate =
      (vehicle.steering * profile.yawRateLimit) / (1 + (Math.abs(vehicle.speed) / profile.maxSpeedMps) * 0.5);
  }
  vehicle.yaw -= yawRate * dt;
  return vehicle;
}
