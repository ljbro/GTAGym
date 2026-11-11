/** User-authorized gameplay adaptation. Heights and animation timing are estimates,
 * not measured GTA motion. Never edits source paths, scoring, elapsed time or traces.
 * All positions (including blocked() arguments) are SOURCE coordinates; yaw uses
 * the core convention forward=(-sin(yaw), 0, -cos(yaw)). No Babylon dependency.
 */
export type TraversalPoint = {x: number; y: number; z: number};
export type TraversalDescriptor = {
  id: string;
  entryDistanceMetres: number;
  exitDistanceMetres: number;
  estimatedTopY: number;
  grabRadiusMetres: number;
  durationSeconds: number;
  clearanceMetres?: number;
  maxFacingAngleRadians?: number;
  bodyRadiusMetres?: number;
};
export type TraversalMotionPhase = 'approach' | 'rise' | 'cross' | 'lower';
export type TraversalPhase = 'idle' | TraversalMotionPhase | 'blocked' | 'complete';
export type TraversalState = {
  /** Native-world ledge for the pickup's two-stage mantle, not legacy source space. */
  mantleContact?:{point:TraversalPoint;progress:number;weight:number;ascending?:boolean};
  vaultContact?:{point:TraversalPoint;progress:number;weight:number};
  /** Native world-space ladder contacts, independent of legacy source coordinates. */
  ladderContacts?:{leftHand:TraversalPoint;rightHand:TraversalPoint;leftFoot:TraversalPoint;rightFoot:TraversalPoint;weight:number};
  descriptorId: string | null;
  active: boolean;
  phase: TraversalPhase;
  motionPhase: TraversalMotionPhase | null;
  progress: number;
  phaseProgress: number;
  sourcePosition: TraversalPoint;
  physicalPosition: TraversalPoint;
  bodyOffsetY: number;
  bodyYaw: number;
  completed: boolean;
  suppressCompletion: boolean;
  blocked: boolean;
  blockReason: string | null;
  sourceDistanceMetres: number | null;
  estimatedTopY: number | null;
  estimatedObstacleSourcePosition: TraversalPoint | null;
};
export type TraversalStep = {
  keys: ReadonlySet<string>;
  dt: number;
  sourcePosition: TraversalPoint;
  bodyYaw: number;
  paused?: boolean;
  finished?: boolean;
  blocked: (physicalSourceFeet: TraversalPoint, radius: number) => boolean;
};
type Descriptor = Required<TraversalDescriptor>;
type Event = {type: 'started' | 'blocked' | 'resumed' | 'completed'; descriptorId: string; progress: number; phase: TraversalPhase; sourcePosition: TraversalPoint};
type Action = {
  descriptor: Descriptor;
  start: TraversalPoint;
  entry: TraversalPoint;
  exit: TraversalPoint;
  yaw: number;
  topY: number;
  elapsed: number;
  approachEnd: number;
  riseEnd: number;
  crossEnd: number;
};
const EPS = 1e-9;
const MAX_STEP_SECONDS = 1 / 120;
const SWEEP_STEP_METRES = .04;
const clamp = (n: number, a: number, b: number) => Math.max(a, Math.min(b, n));
const distance = (a: TraversalPoint, b: TraversalPoint) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
const lerp = (a: TraversalPoint, b: TraversalPoint, t: number): TraversalPoint => ({x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t, z: a.z + (b.z - a.z) * t});
const validPoint = (p: TraversalPoint) => p && [p.x, p.y, p.z].every(Number.isFinite);
const heading = (a: TraversalPoint, b: TraversalPoint) => Math.atan2(a.x - b.x, a.z - b.z);
const cloneState = (s: TraversalState): TraversalState => ({...s, sourcePosition: {...s.sourcePosition}, physicalPosition: {...s.physicalPosition}, estimatedObstacleSourcePosition: s.estimatedObstacleSourcePosition ? {...s.estimatedObstacleSourcePosition} : null});

export class NavigationTraversal {
  private readonly points: TraversalPoint[];
  private readonly cumulative: number[] = [0];
  private readonly descriptors: Descriptor[];
  private action: Action | null = null;
  private spaceDown = false;
  private events: Event[] = [];
  private current: TraversalState;

  constructor(sourcePath: ReadonlyArray<readonly [number, number, number]>, descriptors: ReadonlyArray<TraversalDescriptor> = []) {
    if (sourcePath.length < 2) throw new RangeError('Traversal requires at least two source path points');
    this.points = sourcePath.map(p => ({x: p[0], y: p[1], z: p[2]}));
    if (this.points.some(p => !validPoint(p))) throw new TypeError('Source path coordinates must be finite');
    for (let i = 1; i < this.points.length; i++) this.cumulative.push(this.cumulative[i - 1] + distance(this.points[i - 1], this.points[i]));
    const total = this.cumulative.at(-1)!;
    if (total <= EPS) throw new RangeError('Traversal source path must have positive length');
    const ids = new Set<string>();
    this.descriptors = descriptors.map(value => {
      const d: Descriptor = {...value, clearanceMetres: value.clearanceMetres ?? .3, maxFacingAngleRadians: value.maxFacingAngleRadians ?? Math.PI / 3, bodyRadiusMetres: value.bodyRadiusMetres ?? .35};
      if (!d.id || ids.has(d.id)) throw new RangeError('Traversal descriptor IDs must be nonempty and unique');
      ids.add(d.id);
      if (![d.entryDistanceMetres, d.exitDistanceMetres, d.estimatedTopY, d.grabRadiusMetres, d.durationSeconds, d.clearanceMetres, d.maxFacingAngleRadians, d.bodyRadiusMetres].every(Number.isFinite)) throw new TypeError('Traversal descriptor numbers must be finite');
      if (d.entryDistanceMetres < 0 || d.exitDistanceMetres > total || d.exitDistanceMetres <= d.entryDistanceMetres || d.durationSeconds <= 0 || d.grabRadiusMetres <= 0 || d.clearanceMetres < 0 || d.bodyRadiusMetres <= 0 || d.maxFacingAngleRadians <= 0 || d.maxFacingAngleRadians > Math.PI) throw new RangeError('Invalid traversal distances, duration, radius, clearance or facing angle');
      const entry = this.sample(d.entryDistanceMetres), exit = this.sample(d.exitDistanceMetres);
      if (Math.hypot(exit.x - entry.x, exit.z - entry.z) <= EPS) throw new RangeError('Traversal requires a horizontal entry-to-exit direction');
      // A measured/inferred source foot can already sit above a wall or pillar
      // top (including collision margin). Keep the honest obstacle height;
      // start() takes the maximum of that top+clearance and source foot heights.
      return d;
    });
    this.current = this.idle(this.points[0], 0);
  }

  get state(): TraversalState { return cloneState(this.current); }

  /** Call during core early-return paths (pause/finish) to consume held keys. */
  syncKeys(keys: ReadonlySet<string>) { this.spaceDown = keys.has('Space'); }
  /** Explicit key-release notification; does not cancel or lower an active action. */
  releaseKeys() { this.spaceDown = false; }

  reset(sourcePosition: TraversalPoint = this.points[0], bodyYaw = 0) {
    if (!validPoint(sourcePosition) || !Number.isFinite(bodyYaw)) throw new TypeError('Reset position/yaw must be finite');
    this.action = null; this.spaceDown = false; this.events = []; this.current = this.idle(sourcePosition, bodyYaw);
  }

  snapshot() {
    return {
      schemaVersion: 1,
      adaptation: 'user-authorized-space-triggered-traversal-v1',
      measurementStatus: 'estimated-obstacle-height-and-animation; not measured motion',
      guidance: 'Space-triggered swept approach to route entry, then original-path crossing with physical vertical body offset; not unassisted original-game motion',
      completionPolicy: 'Core retains original goal/source coordinates but must suppress completion until safely landed',
      descriptors: this.descriptors.map(d => ({...d})),
      state: this.state,
      events: this.events.map(event => ({...event, sourcePosition: {...event.sourcePosition}})),
    };
  }

  step(input: TraversalStep): TraversalState {
    if (!Number.isFinite(input.dt) || input.dt < 0) throw new RangeError('Traversal dt must be finite and nonnegative');
    if (!validPoint(input.sourcePosition) || !Number.isFinite(input.bodyYaw)) throw new TypeError('Traversal position/yaw must be finite');
    const risingEdge = input.keys.has('Space') && !this.spaceDown;
    this.syncKeys(input.keys);
    this.current.completed = false;
    if (input.paused || input.finished) return this.state;
    if (!this.action) {
      this.current = this.idle(input.sourcePosition, input.bodyYaw);
      if (risingEdge && input.dt > 0) this.start(input);
    }
    if (!this.action || input.dt === 0) return this.state;
    const action = this.action, stop = Math.min(action.descriptor.durationSeconds, action.elapsed + input.dt);
    while (action.elapsed < stop - EPS) {
      const next = this.nextTime(action, stop), candidate = this.pose(action, next);
      // Sweep both vertical lift/lowering and every path segment; no obstacle ID
      // is exempted, including the gate being climbed and unrelated ceilings.
      if (!this.clearSweep(this.current.physicalPosition, candidate.physicalPosition, action.descriptor.bodyRadiusMetres, input.blocked)) {
        if (!this.current.blocked) this.record('blocked', action.descriptor.id);
        this.current = {...this.current, phase: 'blocked', motionPhase: candidate.motionPhase, active: true, blocked: true, completed: false, suppressCompletion: true, blockReason: candidate.motionPhase === 'lower' ? 'landing-obstructed' : 'physical-sweep-obstructed'};
        return this.state;
      }
      if (this.current.blocked) this.record('resumed', action.descriptor.id);
      action.elapsed = next; this.current = candidate;
    }
    if (action.elapsed >= action.descriptor.durationSeconds - EPS) {
      this.current = {...this.current, active: false, phase: 'complete', motionPhase: null, progress: 1, phaseProgress: 1, completed: true, suppressCompletion: false, bodyOffsetY: 0, sourcePosition: {...action.exit}, physicalPosition: {...action.exit}, sourceDistanceMetres: action.descriptor.exitDistanceMetres};
      this.record('completed', action.descriptor.id); this.action = null;
    }
    return this.state;
  }

  private idle(position: TraversalPoint, yaw: number): TraversalState {
    return {descriptorId: null, active: false, phase: 'idle', motionPhase: null, progress: 0, phaseProgress: 0, sourcePosition: {...position}, physicalPosition: {...position}, bodyOffsetY: 0, bodyYaw: yaw, completed: false, suppressCompletion: false, blocked: false, blockReason: null, sourceDistanceMetres: null, estimatedTopY: null, estimatedObstacleSourcePosition: null};
  }

  private sample(along: number): TraversalPoint {
    if (along <= 0) return {...this.points[0]};
    for (let i = 1; i < this.points.length; i++) {
      if (this.cumulative[i] + EPS < along || this.cumulative[i] - this.cumulative[i - 1] <= EPS) continue;
      return lerp(this.points[i - 1], this.points[i], clamp((along - this.cumulative[i - 1]) / (this.cumulative[i] - this.cumulative[i - 1]), 0, 1));
    }
    return {...this.points.at(-1)!};
  }

  private start(input: TraversalStep) {
    for (const d of this.descriptors) {
      const entry = this.sample(d.entryDistanceMetres), exit = this.sample(d.exitDistanceMetres), yaw = heading(entry, exit);
      if (distance(input.sourcePosition, entry) > d.grabRadiusMetres) continue;
      const angle = Math.abs(Math.atan2(Math.sin(input.bodyYaw - yaw), Math.cos(input.bodyYaw - yaw)));
      if (angle > d.maxFacingAngleRadians) continue;
      // Capture is a short, disclosed animation-guided approach BEFORE ascent.
      // It must be clear at ground level: never snap or first lift through a gate.
      if (!this.clearSweep(input.sourcePosition, entry, d.bodyRadiusMetres, input.blocked)) continue;
      const approach = distance(input.sourcePosition, entry) > EPS ? Math.min(.35, d.durationSeconds * .15) : 0;
      const remaining = d.durationSeconds - approach;
      let topY = Math.max(d.estimatedTopY + d.clearanceMetres, entry.y, exit.y);
      for (let i = 0; i < this.points.length; i++) if (this.cumulative[i] >= d.entryDistanceMetres && this.cumulative[i] <= d.exitDistanceMetres) topY = Math.max(topY, this.points[i].y);
      this.action = {descriptor: d, start: {...input.sourcePosition}, entry, exit, yaw, topY, elapsed: 0, approachEnd: approach, riseEnd: approach + remaining * .3, crossEnd: approach + remaining * .7};
      this.current = this.pose(this.action, 0); this.record('started', d.id); return;
    }
  }

  private pose(a: Action, time: number): TraversalState {
    const d = a.descriptor;
    let phase: TraversalMotionPhase, progress: number, source: TraversalPoint, physicalY: number, along: number | null;
    if (a.approachEnd > 0 && time < a.approachEnd - EPS) {
      phase = 'approach'; progress = time / a.approachEnd; source = lerp(a.start, a.entry, progress); physicalY = source.y; along = null;
    } else if (time <= a.riseEnd + EPS) {
      phase = 'rise'; progress = clamp((time - a.approachEnd) / (a.riseEnd - a.approachEnd), 0, 1); source = {...a.entry}; physicalY = source.y + (a.topY - source.y) * progress; along = d.entryDistanceMetres;
    } else if (time <= a.crossEnd + EPS) {
      phase = 'cross'; progress = clamp((time - a.riseEnd) / (a.crossEnd - a.riseEnd), 0, 1); along = d.entryDistanceMetres + (d.exitDistanceMetres - d.entryDistanceMetres) * progress; source = this.sample(along); physicalY = a.topY;
    } else {
      phase = 'lower'; progress = clamp((time - a.crossEnd) / (d.durationSeconds - a.crossEnd), 0, 1); source = {...a.exit}; physicalY = a.topY + (source.y - a.topY) * progress; along = d.exitDistanceMetres;
    }
    let yaw = a.yaw;
    if (phase === 'approach' && Math.hypot(a.entry.x - a.start.x, a.entry.z - a.start.z) > EPS) yaw = heading(a.start, a.entry);
    else if (phase === 'cross' && along !== null) {
      const before = this.sample(Math.max(d.entryDistanceMetres, along - .01)), after = this.sample(Math.min(d.exitDistanceMetres, along + .01));
      if (Math.hypot(after.x - before.x, after.z - before.z) > EPS) yaw = heading(before, after);
    }
    return {descriptorId: d.id, active: true, phase, motionPhase: phase, progress: time / d.durationSeconds, phaseProgress: progress, sourcePosition: source, physicalPosition: {...source, y: physicalY}, bodyOffsetY: physicalY - source.y, bodyYaw: yaw, completed: false, suppressCompletion: true, blocked: false, blockReason: null, sourceDistanceMetres: along, estimatedTopY: d.estimatedTopY, estimatedObstacleSourcePosition: {...this.sample((d.entryDistanceMetres + d.exitDistanceMetres) / 2), y: d.estimatedTopY}};
  }

  private nextTime(a: Action, stop: number): number {
    let next = Math.min(stop, a.elapsed + MAX_STEP_SECONDS);
    for (const boundary of [a.approachEnd, a.riseEnd, a.crossEnd, a.descriptor.durationSeconds]) if (boundary > a.elapsed + EPS) next = Math.min(next, boundary);
    // Stop precisely at each original vertex; sweeping a chord around a corner
    // would shortcut both the source polyline and any obstacle at that corner.
    for (const along of this.cumulative) {
      if (along <= a.descriptor.entryDistanceMetres || along >= a.descriptor.exitDistanceMetres) continue;
      const time = a.riseEnd + (along - a.descriptor.entryDistanceMetres) / (a.descriptor.exitDistanceMetres - a.descriptor.entryDistanceMetres) * (a.crossEnd - a.riseEnd);
      if (time > a.elapsed + EPS) next = Math.min(next, time);
    }
    return next;
  }

  private clearSweep(from: TraversalPoint, to: TraversalPoint, radius: number, blocked: TraversalStep['blocked']): boolean {
    const steps = Math.max(1, Math.ceil(distance(from, to) / SWEEP_STEP_METRES));
    for (let i = 0; i <= steps; i++) if (blocked(lerp(from, to, i / steps), radius)) return false;
    return true;
  }

  private record(type: Event['type'], descriptorId: string) {
    this.events.push({type, descriptorId, progress: this.current.progress, phase: this.current.phase, sourcePosition: {...this.current.sourcePosition}});
  }
}
