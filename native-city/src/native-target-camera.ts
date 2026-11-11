import type {StreetBody} from './ambient-collision.ts';
type Point={x:number;y:number;z:number};
/** Lift the third-person boom above a close target; never hide its body. */
export function targetCameraPosition(eye:Point,focus:Point,body:StreetBody):Point{
 // Babylon Vector3 exposes x/y/z through prototype accessors, not own fields.
 const p={x:eye.x,y:eye.y,z:eye.z},c=Math.cos(body.yaw),s=Math.sin(body.yaw);
 const obstructed=()=>{for(let i=1;i<=32;i++){
  const t=i/32,x=focus.x+(p.x-focus.x)*t-body.x,z=focus.z+(p.z-focus.z)*t-body.z,y=focus.y+(p.y-focus.y)*t;
  if(y>body.y-.2&&y<body.y+body.height+.4&&Math.abs(x*c-z*s)<body.width/2+.25&&Math.abs(x*s+z*c)<body.length/2+.25)return true;
 }return false;};
 for(let i=0;i<24&&obstructed();i++)p.y+=.4;
 return p;
}
