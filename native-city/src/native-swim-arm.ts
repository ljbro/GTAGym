import {Quaternion,Vector3} from '@babylonjs/core';

/** Keep the exported sleeve away from fully locked or folded elbow poses. */
export function swimArmTarget(origin:Vector3,target:Vector3,upper:number,lower:number){
 const delta=target.subtract(origin),distance=delta.length();if(distance<1e-8)return origin.add(new Vector3(0,-(upper+lower)*.8,0));
 const reach=(degrees:number)=>Math.sqrt(upper*upper+lower*lower+2*upper*lower*Math.cos(degrees*Math.PI/180));
 return origin.add(delta.scale(Math.max(reach(100),Math.min(reach(15),distance))/distance));
}

/** A segment direction alone leaves bone roll unconstrained. Use the elbow
 * plane as the second axis so upper arm and forearm share one hinge plane. */
export function swimBoneFrame(axis:Vector3,normal:Vector3){
 const y=axis.normalizeToNew(),z=normal.subtract(y.scale(Vector3.Dot(normal,y))).normalize();
 if(z.lengthSquared()<1e-8)throw Error('Degenerate swimming hinge frame');
 const x=Vector3.Cross(y,z).normalize();
 return Quaternion.RotationQuaternionFromAxis(x,y,Vector3.Cross(x,y).normalize());
}
