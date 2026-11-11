const point = (value) => (Array.isArray(value) ? { x: value[0], y: value[1], z: value[2] } : value);

/** The destination volume is independent of GPS and recorded-route checkpoints. */
export function navigationArrivalVolume(task) {
  const tolerance = task.goal?.tolerance;
  return {
    position: point(task.goal?.position ?? task.navigation.path.at(-1)),
    radius:
      (typeof tolerance === 'object' ? (tolerance?.horizontalRadius ?? tolerance?.radius) : tolerance) ??
      task.goal?.radius ??
      task.goalTolerance ??
      task.navigation.arrivalRadiusMetres ??
      task.navigation.checkpointRadius ??
      1.5,
    height:
      (typeof tolerance === 'object' ? tolerance?.verticalRange : undefined) ??
      task.goal?.verticalTolerance ??
      task.navigation.verticalTolerance ??
      0.8,
  };
}

export function insideNavigationDestination(volume, position) {
  const p = point(position);
  return (
    p &&
    [p.x, p.y, p.z].every(Number.isFinite) &&
    Math.hypot(p.x - volume.position.x, p.z - volume.position.z) <= volume.radius + 1e-9 &&
    Math.abs(p.y - volume.position.y) <= volume.height + 1e-9
  );
}
