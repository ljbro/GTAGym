// Boundary types for the unmodified, pinned JS source simulator.
export function advanceNavigationProgress(task:any,progress:any,position:any,mode:string,observation?:any):any;
export function validateNavigation(task:any):void;
export function getNavigationRouteIndex(path:readonly (readonly number[])[]):{
 totalDistance:number; cumulativeDistances:readonly number[];
 pointAt(distance:number):{position:{x:number;y:number;z:number};yaw:number;along:number;segmentIndex:number};
 project(position:any,window?:any):{position:{x:number;y:number;z:number};yaw:number;along:number;segmentIndex:number;lateral:number};
};
export function resolveVehicleProfile(kind:string,overrides?:any):any;
export function advanceVehicleMotion(vehicle:any,dt:number,input:any,profile:any,options?:any):any;
export function createHelicopterState(vehicle:any,nav:any,groundHeight?:number):any;
export function helicopterProfile(nav:any):any;
export function advanceHelicopterFlight(vehicle:any,dt:number,input:any,profile:any,environment:any):any;
export function advanceHelicopterCargo(vehicle:any,dt:number,profile:any,cargo:any,acceleration:any,groundAt?:any):void;
export function operateHelicopterHook(vehicle:any,profile:any,cargo:any):boolean;
export function helicopterObservation(vehicle:any):any;
