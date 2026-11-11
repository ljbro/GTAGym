import {NativeSubmarineMotion} from '../src/native-submarine-motion.ts';
/** Deterministic state-informed reference. Ordinary controls only; not a
 * visual agent score. Kept separate from the original video-task calibration. */
const progress=new WeakMap<NativeSubmarineMotion,number>();
export function submarineExpertKeys(m:NativeSubmarineMotion){
 let index=progress.get(m)??1;const points=m.spec.path.points;
 while(index<points.length-1&&Math.hypot(m.x-points[index][0],m.z-points[index][1])<1.2)index++;
 progress.set(m,index);const p=points[index],desired=Math.atan2(p[0]-m.x,p[1]-m.z),angle=Math.atan2(Math.sin(desired-m.yaw),Math.cos(desired-m.yaw));
 const keys=Math.abs(angle)<.32?['KeyW']:[];
 if(Math.abs(angle)>.015)keys.push(angle>0?'KeyD':'KeyA');
 if(m.depth<m.spec.goalDepth-.08)keys.push('ControlLeft');
 else if(m.depth>m.spec.goalDepth+.08)keys.push('Space');
 return keys;
}
