export const WAREHOUSE_SHUTTER={x:10.6,z:6.44,width:.46,depth:4.72,height:3.81,seconds:2.6};
export type ShutterActor={active:boolean;x:number;z:number;feetY:number;airborne:boolean;traversing:boolean};
/** Simulation-owned time: pausing never opens a physical barrier in the background. */
export class WarehouseShutter{
 progress=0;opening=false;ready=false;
 constructor(readonly origin:{x:number;y:number;z:number}){}
 get open(){return this.progress>=1;}
 near(actor:ShutterActor|null|undefined){return !!actor?.active&&!actor.airborne&&!actor.traversing&&Math.abs(actor.feetY-this.origin.y)<.5&&Math.abs(actor.x-this.origin.x-WAREHOUSE_SHUTTER.x)<2.8&&Math.abs(actor.z-this.origin.z-WAREHOUSE_SHUTTER.z)<2.2;}
 prompt(actor:ShutterActor|null|undefined){return this.ready&&!this.open&&this.near(actor)?this.opening?"Roller Shutter Opening, Please wait":"press E Open the roller shutter":'';}
 interact(actor:ShutterActor|null|undefined){if(!this.ready||this.opening||this.open||!this.near(actor))return false;this.opening=true;return true;}
 step(dt:number){if(this.opening&&Number.isFinite(dt)&&dt>0)this.progress=Math.min(1,this.progress+Math.min(dt,.1)/WAREHOUSE_SHUTTER.seconds);}
}
