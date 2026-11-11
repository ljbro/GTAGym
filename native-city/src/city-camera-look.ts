type LookTarget={look:(dx:number,dy:number)=>void};
type LookWorld={paused:boolean;taskFlightPaused:boolean;observer:{active:boolean};flight:(LookTarget&{active:boolean})|null;taskVehicle:{look?:(dx:number,dy:number)=>void}|null;walk:(LookTarget&{active:boolean})|null;cameraYaw:number;cameraPitch:number;viewReturn:number};
// GTA-like adaptation values, not measured GTA V engine constants.
export const DRIVING_LOOK={returnDelay:2,returnRate:3,neutralPitch:.22} as const;
type CameraKeyWorld={paused:boolean;taskFlightPaused:boolean;observer:{active:boolean};flight:{active:boolean;cameraView:number}|null;taskVehicle:{toggleView?:()=>void}|null;walk:{active:boolean}|null;walkFirstPerson:boolean;keys:Set<string>;toggleDrivingView:()=>void;onMessage?:((message:string)=>void)|null};
export function handleCityCameraKey(world:CameraKeyWorld,code:string,repeat=false){
 if(code!=='KeyV'&&code!=='KeyC')return false;
 if(world.flight?.active?world.taskFlightPaused:world.paused)return true;
 if(world.observer.active&&!world.flight?.active)return true;
 if(code==='KeyC'){world.keys.add(code);return true;}
 if(repeat)return true;
 if(world.flight?.active)world.flight.cameraView=(world.flight.cameraView+1)%2;
 else if(world.taskVehicle)world.taskVehicle.toggleView?.();
 else if(world.walk?.active){world.walkFirstPerson=!world.walkFirstPerson;world.onMessage?.(world.walkFirstPerson?"walking · First person":"walking · Third person");}
 else world.toggleDrivingView();
 return true;
}
export function updateDrivingCameraLook(world:Pick<LookWorld,'paused'|'cameraYaw'|'cameraPitch'|'viewReturn'>&{drag:boolean},dt:number,yaw:number,speed:number,behind=false){
 if(world.paused||world.drag||behind||dt<=0)return;
 const oldDelay=world.viewReturn;world.viewReturn=Math.max(0,oldDelay-dt);
 if(world.viewReturn>0||Math.abs(speed)<.5)return;
 const activeTime=Math.max(0,dt-Math.max(0,oldDelay)),amount=1-Math.exp(-activeTime*DRIVING_LOOK.returnRate);
 const angle=yaw-world.cameraYaw;world.cameraYaw+=Math.atan2(Math.sin(angle),Math.cos(angle))*amount;
 world.cameraPitch+=(DRIVING_LOOK.neutralPitch-world.cameraPitch)*amount;
}
/** One mouse delta goes to exactly one active controller, never vehicle steering. */
export function applyCityCameraLook(world:LookWorld,dx:number,dy:number){
 if(!Number.isFinite(dx)||!Number.isFinite(dy))return;
 if(world.flight?.active){if(!world.taskFlightPaused)world.flight.look(dx,dy);return;}
 if(world.paused||world.observer.active)return;
 if(world.taskVehicle?.look){world.taskVehicle.look(dx,dy);return;}
 if(world.walk?.active){world.walk.look(dx,dy);return;}
 world.cameraYaw+=dx*.005;
 world.cameraPitch=Math.max(-.55,Math.min(1.15,world.cameraPitch+dy*.002));
 // Do not fight the player's mouse with the automatic chase-camera recenter.
 if(dx||dy)world.viewReturn=DRIVING_LOOK.returnDelay;
}
export function cockpitLookDirection(yaw:number,pitch:number){
 const p=pitch-.22;
 return {x:Math.sin(yaw)*Math.cos(p)*8,y:-Math.sin(p)*8,z:Math.cos(yaw)*Math.cos(p)*8};
}
