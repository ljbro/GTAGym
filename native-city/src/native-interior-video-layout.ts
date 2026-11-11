/** Video review 2026-10-09. Inferred architecture, NOT newly measured GTA metres.
 * Original navigation samples remain in native-interior-tasks.json unchanged. */
export const WORKSHOP_YAW=Math.PI/6;
export function workshopPoint(u:number,v:number):[number,number]{
 return [-1+Math.cos(WORKSHOP_YAW)*u+Math.sin(WORKSHOP_YAW)*v,-2.8-Math.sin(WORKSHOP_YAW)*u+Math.cos(WORKSHOP_YAW)*v];
}
export function workshopLocal(x:number,z:number):[number,number]{
 const dx=x+1,dz=z+2.8;return [dx*Math.cos(WORKSHOP_YAW)-dz*Math.sin(WORKSHOP_YAW),dx*Math.sin(WORKSHOP_YAW)+dz*Math.cos(WORKSHOP_YAW)];
}
// The 47–55 s clip enters the shop, crosses its stock room and STARTS up
// stairs. It does not reach an upper floor. Dimensions/heights are estimates.
export const STORE_LAYOUT={front:-6.7,partition:6.2,rearDoor:9.85,minX:-7.5,maxX:7.5};
// Extended playable aisles; original 47–55 s measured route remains untouched.
export const STORE_ROUTE=[[0,-9],[0,-5],[4.6,-5],[4.6,-.3],[-4.6,-.3],[-4.6,3.8],[.95,3.8],[.95,7.2],[-2.5,7.2],[-2.5,8.9],[1.05,8.9],[1.05,10.9]];
export const STORE_FURNITURE=[
 {name:'shelf-aisle-a',x:-2.2,z:-2.5,w:10.6,d:1,h:1.9},
 {name:'shelf-aisle-b',x:2.2,z:1.8,w:10.6,d:1,h:1.9},
 {name:'checkout',x:6,z:4.6,w:2,d:2.1,h:1.05},
 {name:'shelf-stock-west',x:-6.6,z:8,w:1.3,d:2.4,h:2.2},
 {name:'shelf-stock-east',x:6.6,z:8,w:1.3,d:2.4,h:2.2},
 {name:'stock-cart',x:.95,z:7.95,w:2.4,d:.6,h:1.1},
];
export const STORE_STAIRS={minX:0,maxX:2.1,startZ:10.1,tread:.35,rise:.16,count:12,endZ:14.3,landingEnd:15.7};
export function storeStepHeight(x:number,z:number){
 const s=STORE_STAIRS;if(x<s.minX||x>s.maxX||z<s.startZ||z>s.landingEnd)return 0;
 // World-to-local subtraction at kilometre-scale coordinates may put an exact
 // tread boundary a few trillionths below its intended step.
 return Math.min(s.count,Math.floor((z-s.startZ+1e-6)/s.tread)+1)*s.rise;
}
