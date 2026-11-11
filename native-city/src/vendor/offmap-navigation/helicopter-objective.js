/** Aircraft-specific actions supplement destination coordinates, never the yellow route's order. */
export function helicopterObjectiveSatisfied(navigation, observation, atDestination) {
  const objective = navigation.helicopter?.objective;
  if (!objective || objective === 'navigate') return true;
  const flight = observation.flight;
  if (!flight || flight.damaged || !atDestination) return false;
  const speed = Number(observation.speed);
  if (!Number.isFinite(speed)) return false;
  if (objective === 'land')
    return (
      flight.onGround === true &&
      speed < (navigation.id === 'c08-n11' ? 0.2 : 3) &&
      (navigation.id !== 'c08-n11' || flight.passengersBoarded === true)
    );
  if (objective === 'hover') return speed < 6 && Math.abs(flight.verticalSpeedMps ?? Infinity) < 3;
  if (objective === 'pickup') return flight.cargoAttached === true && speed < 5;
  if (objective === 'deliver') {
    const point = flight.cargoPosition,
      target = navigation.helicopter.cargo?.delivery;
    return Boolean(
      flight.cargoDelivered === true &&
      point &&
      target &&
      [point.x, point.y, point.z].every(Number.isFinite) &&
      Math.hypot(point.x - target[0], point.z - target[2]) <=
        (navigation.helicopter.cargo.deliveryRadius ?? 9) &&
      Math.abs(point.y - target[1]) <= 4 &&
      speed < 5,
    );
  }
  return false;
}

export function helicopterObservation(vehicle) {
  if (!vehicle?.flight) return undefined;
  const state = vehicle.flight;
  return {
    model: state.model,
    pitch: state.pitch,
    roll: state.roll,
    yaw: vehicle.yaw,
    verticalSpeedMps: state.velocity.y,
    altitudeAgl: state.altitudeAgl,
    rotorRpm: state.rotorRpm,
    onGround: state.onGround,
    damaged: state.damaged,
    hookDeployed: state.hookDeployed,
    cargoAttached: state.cargoAttached,
    cargoDelivered: state.cargoDelivered,
    cargoPosition: state.cargoPosition ? { ...state.cargoPosition } : null,
    passengersBoarded: state.passengersBoarded,
  };
}
