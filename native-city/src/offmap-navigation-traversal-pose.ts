import {Matrix, Quaternion, TransformNode, Vector3, type Scene} from '@babylonjs/core';
import type {TraversalState} from './offmap-navigation-traversal.ts';
import type {VehiclePoseFrame} from './vehicle-interaction.ts';
import {sampleGroundRotation,usesPickupClimbAnimation,type GroundAnimationAsset} from './native-ground-animation.ts';
export type LocomotionPose={kind:'jump'|'ladder'|'crouch'|'vehicle';position:{x:number;y:number;z:number};verticalSpeed:number;climbHeight:number;weight:number;sliding?:boolean;seated?:number;vehicleFrame?:VehiclePoseFrame};

/** Estimated procedural pose, not an original GTA animation or measured motion.
 * IK follows actual joint child axes (including Franklin elbow-rebind-v1), never
 * guessed left/right Euler signs. Hand targets are expressive, not exact bar IK.
 */
export type TraversalPoseSample = {
  weight: number;
  handHeight: number;
  handForward: number;
  leftKneeLift: number;
  rightKneeLift: number;
  torsoLeanRadians: number;
};
const smooth = (v: number) => { const t = Math.max(0, Math.min(1, v)); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
export function traversalPoseSample(state: TraversalState | null): TraversalPoseSample {
  const idle = {weight: 0, handHeight: .78, handForward: .48, leftKneeLift: 0, rightKneeLift: 0, torsoLeanRadians: 0};
  if (!state?.active) return idle;
  if(state.vaultContact){
    const q=state.vaultContact.progress,weight=smooth(q/.12)*(1-smooth((q-.78)/.22));
    const tuck=smooth(q/.3)*(1-smooth((q-.65)/.35));
    return {weight,handHeight:-.3,handForward:.35,leftKneeLift:.98*tuck,rightKneeLift:.90*tuck,torsoLeanRadians:.90*tuck};
  }
  if(state.mantleContact){
    const q=state.mantleContact.progress,weight=smooth(q/.14)*(1-smooth((q-.80)/.20));
    const tuck=smooth((q-.14)/.32)*(1-smooth((q-.75)/.25));
    return {weight,handHeight:.12,handForward:.42,leftKneeLift:.52*tuck,rightKneeLift:.30*tuck,torsoLeanRadians:.22+.26*tuck};
  }
  if(state.descriptorId==='jump')return {...idle,weight:Math.sin(Math.PI*state.progress),handHeight:.05,handForward:.35,leftKneeLift:.38,rightKneeLift:.3,torsoLeanRadians:.16};
  if(state.descriptorId?.startsWith('ladder:')){
    const stride=Math.sin(state.progress*Math.PI*12),weight=Math.min(1,state.progress*12,(1-state.progress)*12);
    return {weight:state.ladderContacts?.weight??weight,handHeight:.7,handForward:.4,leftKneeLift:.4+.2*stride,rightKneeLift:.4-.2*stride,torsoLeanRadians:.08};
  }
  const phase = state.phase === 'blocked' ? state.motionPhase : state.phase, p = smooth(state.phaseProgress);
  if (phase === 'rise') return {weight: p, handHeight: .78, handForward: .48, leftKneeLift: .75 * p, rightKneeLift: .65 * p, torsoLeanRadians: 1.25 * p};
  if (phase === 'cross') {
    const arch = Math.sin(Math.PI * Math.max(0, Math.min(1, state.phaseProgress))) ** 2;
    return {weight: 1, handHeight: mix(.78, -.22, p), handForward: mix(.48, .70, p), leftKneeLift: mix(.75, .65, p) + .12 * arch, rightKneeLift: .65 + .20 * arch, torsoLeanRadians: 1.25 + .12 * arch};
  }
  if (phase === 'lower') return {weight: 1 - p, handHeight: -.22, handForward: .70, leftKneeLift: .65 * (1 - p), rightKneeLift: .65 * (1 - p), torsoLeanRadians: 1.25 * (1 - p)};
  return idle;
}

/** Pole-constrained joint location; reachable target clamping avoids NaN poses. */
export function traversalElbow(root: Vector3, target: Vector3, upper: number, lower: number, pole: Vector3): Vector3 {
  const delta = target.subtract(root), length = delta.length();
  if (!(upper > 0 && lower > 0 && Number.isFinite(upper + lower)) || length < 1e-8) return root.clone();
  const direction = delta.scale(1 / length), reach = Math.max(Math.abs(upper - lower) + 1e-6, Math.min(upper + lower - 1e-6, length));
  let bend = pole.subtract(direction.scale(Vector3.Dot(pole, direction)));
  if (bend.lengthSquared() < 1e-8) bend = Vector3.Cross(direction, Math.abs(direction.y) < .9 ? Vector3.Up() : Vector3.Right());
  bend.normalize();
  const along = (upper * upper - lower * lower + reach * reach) / (2 * reach), height = Math.sqrt(Math.max(0, upper * upper - along * along));
  return root.add(direction.scale(along)).add(bend.scale(height));
}

type Chain = {upper: TransformNode; lower: TransformNode; end: TransformNode; side: -1 | 1};
type SavedRotation = {node: TransformNode; quaternion: Quaternion | null; rotation: Vector3};
const position = (node: TransformNode) => {node.computeWorldMatrix(true); return node.getAbsolutePosition().clone();};
const nameOf = (node: TransformNode) => node.name.toLowerCase().split(':').at(-1)!;

export function createTraversalPoseOverride(scene: Scene, transformNodes: readonly TransformNode[],authoredGround?:GroundAnimationAsset) {
  const byName = new Map(transformNodes.map(node => [nameOf(node), node]));
  const missing: string[] = [];
  const joint = (name: string) => {const node = byName.get(name); if (!node) missing.push(name); return node;};
  const arms: Chain[] = [], legs: Chain[] = [];
  for (const [suffix, side] of [['l', 1], ['r', -1]] as const) {
    const upper = joint(`upperarm_${suffix}`), lower = joint(`lowerarm_${suffix}`), hand = joint(`hand_${suffix}`);
    const thigh = joint(`thigh_${suffix}`), calf = joint(`calf_${suffix}`), foot = joint(`foot_${suffix}`);
    if (upper && lower && hand) arms.push({upper, lower, end: hand, side});
    if (thigh && calf && foot) legs.push({upper: thigh, lower: calf, end: foot, side});
  }
  const root = joint('root'), pelvis = joint('pelvis'), leftToe = joint('ball_l'), rightToe = joint('ball_r'), spine = joint('spine_01'), spineChild = joint('spine_02'), head = joint('head');
  const frame = root?.parent instanceof TransformNode ? root.parent : root;
  const ready = missing.length === 0 && !!frame && arms.length === 2 && legs.length === 2;
  // Derive forward from the actual bind feet, inside the imported rig frame.
  // The glTF loader's handedness parent and player yaw are applied afterwards.
  let localForward = new Vector3(0, 0, 1), localLeft = new Vector3(1, 0, 0);
  if (ready) {
    frame!.computeWorldMatrix(true);
    const inverse = Matrix.Invert(frame!.getWorldMatrix());
    const toLocal = (v: Vector3) => Vector3.TransformCoordinates(v, inverse);
    const feet = legs.map(leg => toLocal(position(leg.end)));
    localForward = toLocal(position(leftToe!)).subtract(feet[0]).add(toLocal(position(rightToe!)).subtract(feet[1]));
    localForward.y = 0;
    if (localForward.lengthSquared() < 1e-8) missing.push('nondegenerate-foot-forward-axis'); else localForward.normalize();
    localLeft = toLocal(position(arms[0].upper)).subtract(toLocal(position(arms[1].upper))); localLeft.y = 0; localLeft.normalize();
  }
  let state: TraversalState | null = null, locomotion:LocomotionPose|null=null, saved: SavedRotation[] = [], frames = 0, disposed = false;
  let savedFramePosition: Vector3 | null = null, visualRootOffsetY = 0, maxGripErrorMetres = 0, gripInfluence = 0;
  function restore() {
    for (const value of saved) {
      value.node.rotation.copyFrom(value.rotation);
      value.node.rotationQuaternion = value.quaternion?.clone() ?? null;
      value.node.computeWorldMatrix(true);
    }
    saved = [];
    if (savedFramePosition && frame) {frame.position.copyFrom(savedFramePosition); frame.computeWorldMatrix(true); savedFramePosition = null;}
    visualRootOffsetY = 0;
    gripInfluence = 0;
  }
  function save(node: TransformNode) {
    if (!saved.some(value => value.node === node)) saved.push({node, quaternion: node.rotationQuaternion?.clone() ?? null, rotation: node.rotation.clone()});
  }
  function aim(node: TransformNode, child: TransformNode, target: Vector3, weight: number) {
    const origin = position(node), parent = node.parent instanceof TransformNode ? node.parent : null;
    parent?.computeWorldMatrix(true);
    const inverse = parent ? Matrix.Invert(parent.getWorldMatrix()) : Matrix.Identity();
    const desired = Vector3.TransformNormal(target.subtract(origin), inverse).normalize();
    const old = node.rotationQuaternion?.clone() ?? Quaternion.FromEulerVector(node.rotation);
    const rotation = Matrix.Identity(); old.toRotationMatrix(rotation);
    const axis = Vector3.TransformNormal(child.position, rotation).normalize();
    if (axis.lengthSquared() < 1e-8 || desired.lengthSquared() < 1e-8) return;
    const delta = Quaternion.Identity(); Quaternion.FromUnitVectorsToRef(axis, desired, delta);
    save(node); node.rotationQuaternion = Quaternion.Slerp(old, delta.multiply(old), weight).normalize(); node.computeWorldMatrix(true);
  }
  function solve(chain: Chain, target: Vector3, pole: Vector3, weight: number) {
    const origin = position(chain.upper), elbow = position(chain.lower), end = position(chain.end);
    const upperLength = Vector3.Distance(origin, elbow), lowerLength = Vector3.Distance(elbow, end);
    const desiredJoint = traversalElbow(origin, target, upperLength, lowerLength, pole);
    aim(chain.upper, chain.lower, desiredJoint, weight);
    aim(chain.lower, chain.end, target, weight);
  }
  function apply() {
    if (disposed || !ready || missing.length) return;
    if(locomotion){
      frame!.computeWorldMatrix(true);const matrix=frame!.getWorldMatrix(),p=locomotion;
      const up=Vector3.TransformNormal(Vector3.Up(),matrix).normalize(),forward=Vector3.TransformNormal(localForward,matrix).normalize(),left=Vector3.TransformNormal(localLeft,matrix).normalize();
      const anchor=Vector3.FromArray([p.position.x,p.position.y,p.position.z]);
      if(p.kind==='vehicle'&&p.vehicleFrame){
        const contact=p.vehicleFrame;
        const footClearance=Math.max(.04,Math.min(.16,Math.min(...legs.map(leg=>position(leg.end).y))-anchor.y));
        savedFramePosition=frame!.position.clone();visualRootOffsetY=-contact.sink*p.weight;
        const parent=frame!.parent instanceof TransformNode?frame!.parent:null;parent?.computeWorldMatrix(true);
        frame!.position.addInPlace(Vector3.TransformNormal(up.scale(visualRootOffsetY),parent?Matrix.Invert(parent.getWorldMatrix()):Matrix.Identity()));frame!.computeWorldMatrix(true);
        if(spine&&spineChild){const o=position(spine),length=Vector3.Distance(o,position(spineChild));aim(spine,spineChild,o.add(up.scale(length*Math.cos(contact.lean))).add(forward.scale(length*Math.sin(contact.lean))),p.weight);}
        const point=(p:{x:number;y:number;z:number})=>new Vector3(p.x,p.y,p.z);
        const reachable=(chain:Chain,target:Vector3)=>{
          const origin=position(chain.upper),delta=target.subtract(origin),length=Vector3.Distance(origin,position(chain.lower))+Vector3.Distance(position(chain.lower),position(chain.end));
          return origin.add(delta.scale(Math.min(1,length*.98/Math.max(.001,delta.length()))));
        };
        legs.forEach((leg,i)=>{
          const target=point(leg.side===1?contact.leftFoot:contact.rightFoot).add(up.scale(footClearance));
          solve(leg,reachable(leg,target),forward.add(left.scale(leg.side*.12)),p.weight);
          const toe=i===0?leftToe!:rightToe!,end=position(leg.end);
          aim(leg.end,toe,end.add(new Vector3(Math.sin(contact.footYaw),0,Math.cos(contact.footYaw)).scale(.2)),p.weight);
        });
        for(const arm of arms){
          const target=point(arm.side===1?contact.leftHand:contact.rightHand);
          solve(arm,reachable(arm,target),forward.scale(.25).add(left.scale(arm.side*.35)).subtract(up.scale(.65)),p.weight);
        }
        frames++;return;
      }
      if(p.kind==='vehicle'){
        const fold=p.seated??0,feet=legs.map(leg=>position(leg.end));
        savedFramePosition=frame!.position.clone();visualRootOffsetY=-.24*fold*p.weight;
        const parent=frame!.parent instanceof TransformNode?frame!.parent:null;parent?.computeWorldMatrix(true);
        frame!.position.addInPlace(Vector3.TransformNormal(up.scale(visualRootOffsetY),parent?Matrix.Invert(parent.getWorldMatrix()):Matrix.Identity()));frame!.computeWorldMatrix(true);
        if(spine&&spineChild){const o=position(spine),length=Vector3.Distance(o,position(spineChild));aim(spine,spineChild,o.add(up.scale(length)).add(forward.scale(length*(.12+.55*fold))),p.weight);}
        legs.forEach((leg,i)=>solve(leg,feet[i].add(up.scale(i===0?.18*fold:0)).add(forward.scale(i===0?.18*fold:0)),forward.add(left.scale(leg.side*.12)),p.weight));
        for(const arm of arms)solve(arm,anchor.add(up.scale(1.02-.22*fold)).add(forward.scale(.40)).add(left.scale(arm.side*.22)),left.scale(arm.side).subtract(up.scale(.45)),p.weight);
        frames++;return;
      }
      if(p.kind==='crouch'){
        const feet=legs.map((leg,i)=>({point:position(leg.end),direction:position(i===0?leftToe!:rightToe!).subtract(position(leg.end))}));
        savedFramePosition=frame!.position.clone();visualRootOffsetY=-.65*p.weight;
        const parent=frame!.parent instanceof TransformNode?frame!.parent:null;parent?.computeWorldMatrix(true);
        frame!.position.addInPlace(Vector3.TransformNormal(up.scale(visualRootOffsetY),parent?Matrix.Invert(parent.getWorldMatrix()):Matrix.Identity()));frame!.computeWorldMatrix(true);
        if(spine&&spineChild){const o=position(spine),length=Vector3.Distance(o,position(spineChild));aim(spine,spineChild,o.add(up.scale(length)).add(forward.scale(length*.25)),p.weight);}
        legs.forEach((leg,i)=>{solve(leg,feet[i].point,forward.add(left.scale(leg.side*.12)),1);aim(leg.end,i===0?leftToe!:rightToe!,feet[i].point.add(feet[i].direction),1);});
        for(const arm of arms)solve(arm,anchor.add(up.scale(.72)).add(forward.scale(.30)).add(left.scale(arm.side*.24)),left.scale(arm.side).subtract(up),p.weight);
        frames++;return;
      }
      const climbing=p.kind==='ladder',cycle=p.climbHeight/.56*Math.PI*2;
      for(const leg of legs){
        const wave=p.sliding?0:Math.sin(cycle+(leg.side===1?0:Math.PI));
        const lift=climbing?.12+.12*wave:.18+Math.max(0,p.verticalSpeed)*.022;
        const target=anchor.add(left.scale(leg.side*.16)).add(forward.scale(climbing?.32:.10)).add(up.scale(lift));
        solve(leg,target,forward.add(left.scale(leg.side*.10)),p.weight);
      }
      for(const arm of arms){
        const wave=p.sliding?0:Math.sin(cycle+(arm.side===1?Math.PI:0));
        const target=climbing?anchor.add(left.scale(arm.side*.31)).add(forward.scale(.40)).add(up.scale(1.47+.14*wave)):
          position(arm.upper).add(left.scale(arm.side*.19)).add(forward.scale(.30)).subtract(up.scale(.22));
        solve(arm,target,left.scale(arm.side).subtract(up.scale(.3)),p.weight);
      }
      frames++;return;
    }
    if(!state)return;
    const sample = traversalPoseSample(state); if (sample.weight <= 1e-8) return;
    const ladder=state.ladderContacts,mantle=state.mantleContact,vault=state.vaultContact,ledge=mantle??vault;
    const worldPoint=(p:{x:number;y:number;z:number})=>new Vector3(p.x,p.y,p.z);
    frame!.computeWorldMatrix(true); const matrix = frame!.getWorldMatrix();
    const up = Vector3.TransformNormal(Vector3.Up(), matrix).normalize();
    const forward = Vector3.TransformNormal(localForward, matrix).normalize();
    const left = Vector3.TransformNormal(localLeft, matrix).normalize();
    // The actor/root anchor stays at physical feet. Only the visual imported rig
    // is shifted after leg IK, otherwise flexing knees above an already lifted
    // root would leave the feet floating another half metre above the gate.
    const physicalAnchor = position(frame!);
    if(ladder){
      // A small knee bend supplies reach for the planted lower foot instead of
      // asking a straight leg to reach below the actor's neutral sole height.
      // Apply BEFORE solving world contacts, never shift solved feet afterwards.
      savedFramePosition=frame!.position.clone();visualRootOffsetY=-.12*sample.weight;
      const parent=frame!.parent instanceof TransformNode?frame!.parent:null;parent?.computeWorldMatrix(true);
      frame!.position.addInPlace(Vector3.TransformNormal(up.scale(visualRootOffsetY),parent?Matrix.Invert(parent.getWorldMatrix()):Matrix.Identity()));frame!.computeWorldMatrix(true);
    }
    const footNodes = [...legs.map(leg => leg.end), leftToe!, rightToe!];
    const originalFootHeight = Math.min(...footNodes.map(node => Vector3.Dot(position(node).subtract(physicalAnchor), up)));
    const authored=!!authoredGround&&usesPickupClimbAnimation(state);
    if(authored){
      // Only c07-n01's hood and roof ascents. The tested physical corridor
      // remains authoritative; the clip contributes rotations, never root motion.
      const progress=state.mantleContact!.progress;
      authoredGround!.bones.forEach((name,i)=>{
        const node=byName.get(name);if(!node)return;save(node);
        const base=node.rotationQuaternion??Quaternion.FromEulerVector(node.rotation);
        node.rotationQuaternion=Quaternion.Slerp(base,sampleGroundRotation(authoredGround!.clips.ClimbUp_1m,progress,i),sample.weight).normalize();
      });
    }
    if (!authored && spine && spineChild) {
      const origin = position(spine), length = Vector3.Distance(origin, position(spineChild));
      aim(spine, spineChild, origin.add(up.scale(Math.cos(sample.torsoLeanRadians) * length)).add(forward.scale(Math.sin(sample.torsoLeanRadians) * length)), sample.weight);
    }
    for (const leg of authored?[]:legs) {
      const hip = position(leg.upper), knee = position(leg.lower), foot = position(leg.end), length = Vector3.Distance(hip, knee) + Vector3.Distance(knee, foot);
      const lift = leg.side === 1 ? sample.leftKneeLift : sample.rightKneeLift;
      // A crouch still has feet BELOW hips. The old 1-1.5*lift crossed
      // zero, inverted the legs and forced the pelvis through the barrier when
      // sole alignment lowered the rig. Keep a >= .55 leg-length vertical span.
      const drop = vault?Math.max(.18,1-.82*lift):Math.max(.55, 1 - .52 * lift);
      const target = ladder?worldPoint(leg.side===1?ladder.leftFoot:ladder.rightFoot):hip.subtract(up.scale(length * drop)).add(forward.scale(length * .15 * lift));
      // Both feet sweep to the same side of the supporting hand. This is a
      // side vault, unlike a mantle's upward, forward-facing step onto a ledge.
      if(vault)target.addInPlace(left.scale(-length*.65*Math.sin(Math.PI*vault.progress)**2));
      solve(leg, target, forward.subtract(up.scale(.2)).add(left.scale(leg.side * .08)), sample.weight);
    }
    const lowestFoot = Math.min(...footNodes.map(node => Vector3.Dot(position(node).subtract(physicalAnchor), up)));
    // Blend the original animation's sole offset, not the correction itself:
    // multiplying the correction by weight leaves partially tucked feet afloat.
    // Ladder contacts already live on world-space rungs. Ground-style sole
    // alignment would drag the whole actor down and destroy those contacts.
    if(!ladder){
      visualRootOffsetY = -lowestFoot + originalFootHeight * (1 - sample.weight);
      savedFramePosition = frame!.position.clone();
      const parent = frame!.parent instanceof TransformNode ? frame!.parent : null;
      parent?.computeWorldMatrix(true);
      const translation = Vector3.TransformNormal(up.scale(visualRootOffsetY), parent ? Matrix.Invert(parent.getWorldMatrix()) : Matrix.Identity());
      frame!.position.addInPlace(translation); frame!.computeWorldMatrix(true);
    }
    const obstacle = state.estimatedObstacleSourcePosition;
    const dx = obstacle ? obstacle.x - state.physicalPosition.x : 0, dz = obstacle ? obstacle.z - state.physicalPosition.z : 0;
    const sourceForward = -Math.sin(state.bodyYaw) * dx - Math.cos(state.bodyYaw) * dz;
    const sourceLeft = -Math.cos(state.bodyYaw) * dx + Math.sin(state.bodyYaw) * dz;
    const top = state.estimatedTopY ?? state.physicalPosition.y;
    const bar = physicalAnchor.add(up.scale(top - state.physicalPosition.y)).add(forward.scale(sourceForward)).add(left.scale(sourceLeft));
    maxGripErrorMetres = 0;
    gripInfluence = 0;
    for (const arm of arms) {
      const shoulder = position(arm.upper), elbow = position(arm.lower), hand = position(arm.end), length = Vector3.Distance(shoulder, elbow) + Vector3.Distance(elbow, hand);
      // Both hands seek the estimated physical gate top, not an arbitrary point
      // above the already elevated head. A too-distant bar remains visibly
      // reach-limited; stats expose residual error instead of stretching bones.
      const gripTarget = ladder?worldPoint(arm.side===1?ladder.leftHand:ladder.rightHand):ledge?worldPoint(ledge.point).add(left.scale(arm.side*.20)):bar.add(left.scale(arm.side * .18));
      // Release continuously before an unreachable grip straightens the arm.
      // A bent, forward/downward brace is an estimated non-contact gesture.
      // Never lower the pelvis or stretch a segment to manufacture hand contact.
      const reach = Vector3.Distance(shoulder, gripTarget) / length;
      const contact = ladder?1:ledge?ledge.weight*(vault&&arm.side===-1?.15:1)*(1-smooth((reach-1.12)/.24)):obstacle ? 1 - smooth((reach - .82) / .20) : 0;
      const brace = shoulder.add(forward.scale(length * .40)).subtract(up.scale(length * .55));
      const target = ladder?gripTarget:obstacle||ledge ? Vector3.Lerp(brace, gripTarget, contact) : shoulder.add(up.scale(length * sample.handHeight)).add(forward.scale(length * sample.handForward));
      if(vault&&arm.side===-1)target.addInPlace(left.scale(-.22*Math.sin(Math.PI*vault.progress)));
      const elbowPole=ledge?up.scale(-1).add(left.scale(arm.side*.35)):forward.add(left.scale(arm.side * .65)).subtract(up.scale(.3));
      // Preserve the authored arm swing. A small, reach-limited ledge correction
      // only helps during actual grip; do not replace the new clip with old IK.
      solve(arm, target, elbowPole, authored?sample.weight*contact*.35:sample.weight);
      gripInfluence = Math.max(gripInfluence, contact * sample.weight);
      maxGripErrorMetres = Math.max(maxGripErrorMetres, Vector3.Distance(position(arm.end), obstacle||ladder||ledge ? gripTarget : target));
    }
    frames++;
  }
  const before = scene.onBeforeAnimationsObservable.add(restore);
  const after = scene.onAfterAnimationsObservable.add(apply);
  return {
    setLocomotion(value:LocomotionPose|null){if(disposed)return;locomotion=value?{...value,position:{...value.position}}:null;if(!locomotion)restore();},
    set(value: TraversalState | null) {
      if (disposed) return;
      state = value ? {...value, sourcePosition: {...value.sourcePosition}, physicalPosition: {...value.physicalPosition}, estimatedObstacleSourcePosition: value.estimatedObstacleSourcePosition ? {...value.estimatedObstacleSourcePosition} : null} : null;
      if (!state?.active || state.phase === 'approach') restore();
    },
    stats() {
      const headWorld = head ? position(head) : null;
      const matrix = frame?.computeWorldMatrix(true);
      const up = matrix ? Vector3.TransformNormal(Vector3.Up(), matrix).normalize() : Vector3.Up();
      const forward = matrix ? Vector3.TransformNormal(localForward, matrix).normalize() : localForward;
      const eye = headWorld?.add(up.scale(.10)).add(forward.scale(.08));
      const pelvisWorld = pelvis ? position(pelvis) : null;
      const lowestSoleY = ready ? Math.min(...[...legs.map(leg => leg.end), leftToe!, rightToe!].map(node => position(node).y)) : null;
      const lowestKneeY = legs.length ? Math.min(...legs.map(leg => position(leg.lower).y)) : null;
      // SOURCE top converted by the physical-feet anchor's vertical offset.
      const physicalFeetY = frame ? position(frame).y - visualRootOffsetY : null;
      const estimatedTopWorldY = state?.estimatedTopY != null && physicalFeetY != null ? physicalFeetY + state.estimatedTopY - state.physicalPosition.y : null;
      return {ready: ready && missing.length === 0, active: !!locomotion || !!state?.active && traversalPoseSample(state).weight > 0, phase: locomotion?.kind ?? state?.phase ?? 'idle', appliedFrames: frames, missingJoints: [...missing], visualRootOffsetY, maxGripErrorMetres, gripInfluence,
        pelvisWorld: pelvisWorld ? {x: pelvisWorld.x, y: pelvisWorld.y, z: pelvisWorld.z} : null,
        lowestKneeY, lowestSoleY, physicalFeetY, estimatedTopWorldY,
        estimatedJointClearance: estimatedTopWorldY == null ? null : {pelvis: pelvisWorld ? pelvisWorld.y - estimatedTopWorldY : null, knee: lowestKneeY == null ? null : lowestKneeY - estimatedTopWorldY, sole: lowestSoleY == null ? null : lowestSoleY - estimatedTopWorldY},
        headWorld: headWorld ? {x: headWorld.x, y: headWorld.y, z: headWorld.z} : null,
        eyeWorld: eye ? {x: eye.x, y: eye.y, z: eye.z} : null,
        eyeEstimate: 'head-joint + 0.10m rig-up + 0.08m rig-forward; estimated camera attachment',
        animationSource: authoredGround&&usesPickupClimbAnimation(state)?'quaternius-ClimbUp_1m':'procedural',
        method: authoredGround&&usesPickupClimbAnimation(state)?'CC0 ClimbUp_1m retargeted to Franklin; existing c07-n01 physical corridor and reach-limited contact correction; no animation root motion':'estimated-two-bone-IK-from-child-axes; reach-limited grip/release; joint clearance is not skinned-mesh collision; not native climb animation or exact hand contact', forwardInRig: localForward.asArray()};
    },
    dispose() {if (disposed) return; disposed = true; restore(); state = null; scene.onBeforeAnimationsObservable.remove(before); scene.onAfterAnimationsObservable.remove(after);},
  };
}
