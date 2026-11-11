export type NativeDriveKind='sports-car'|'traffic-sedan'|'baller'|'baller-yellow'|'van'|'pickup'|'convertible'|'motorcycle'|'motorcycle-green'|'motorcycle-bagger'|'police-car'|'atv'|'box-truck'|'semi-tractor'|'sedan-red';
const BALLER_FIT={file:'baller.glb',length:4.9893,width:2.2061,height:1.8702,heading:Math.PI,wheelRadius:.42,seat:[-.48,1.35,.24]} as const;
export const NATIVE_DRIVE_VEHICLES={
 'sports-car':{file:'/city/car.glb',length:4.9,width:2.1,height:1.45,heading:0,wheelRadius:.34,seat:[-.45,1.1,.2],credit:'Existing GTA_SZ red GT sports car'},
 'traffic-sedan':{file:'',length:4.9,width:2.1,height:1.65,heading:0,wheelRadius:.34,seat:[-.45,1.15,.3],credit:'GTA_SZ ambient traffic model; same geometry and paint retained on takeover'},
 'sedan-red':{file:'sedan-red.glb',length:4.7,width:2.012595,height:1.310186,heading:0,wheelRadius:.31,seat:[-.45,1.03,.25],credit:"Car · Quaternius · CC0 1.0; Red sedan color scheme adaptation"},
 'semi-tractor':{file:'semi-tractor.glb',length:8.12917451666542,width:2.628,height:4.1264462,heading:0,wheelRadius:.52,seat:[-.55,2.2,1.85],credit:"Basic Semi-truck with spikes · WilliWam · CC0 1.0; Remove Spikes, Add axles and a fifth-wheel coupling, Approximate Phantom Recreate"},
 'box-truck':{file:'box-truck-native.glb',length:4.946585778365279,width:2.55,height:2.714416,heading:0,wheelRadius:.4127,seat:[-.50,1.9,1.5],credit:"Truck · Quaternius · CC0 1.0; Compact two-axle box truck, Non-semitrailer Truck"},
 atv:{file:'atv.glb',length:1.99,width:1.5,height:1.40654,heading:0,wheelRadius:.37,seat:[0,1.85,-.23],credit:"Quad Bike · 3D Assets · CC0 1.0; Author annotation AI Generate, Quad bike support"},
 baller:{...BALLER_FIT,credit:"Existing GTA V Baller Convert assets; For sources and limitations, see assets/task-vehicles/baller.provenance.json, Do not claim an open source license"},
 'baller-yellow':{...BALLER_FIT,credit:"Existing GTA V Baller Yellow SUV Color Matching, Not the original video BJXL Same model; For sources and limitations, see assets/task-vehicles/baller.provenance.json, Do not claim an open source license"},
 van:{file:'van.glb',length:5.4,width:2.25,height:2.5,heading:0,wheelRadius:.38,seat:[-.52,1.8,1.3],credit:'Generic Van · PuKkBuMXDD · CC BY 3.0'},
 pickup:{file:'pickup.glb',length:5.3,width:2.3656,height:1.8912,heading:0,wheelRadius:.4,seat:[-.48,1.45,.55],credit:'Pickup Truck · Quaternius · CC0 1.0'},
 convertible:{file:'convertible.glb',length:4.7,width:2.0004,height:1.4161,heading:0,wheelRadius:.33,seat:[-.45,1.12,-.15],credit:'Convertible · Poly by Google · CC BY 3.0'},
 'police-car':{file:'police-car.glb',length:4.8,width:2.2873,height:1.5939,heading:0,wheelRadius:.3542,seat:[-.46,1.14,.14],credit:"Police Car · Quaternius · CC0 1.0; Transparent vehicle window compatibility"},
 motorcycle:{file:'motorcycle.glb',length:2.2,width:.74,height:1.1593,heading:0,wheelRadius:.32,seat:[0,1.55,-.13],credit:'Motorcycle · Poly by Google · CC BY 3.0'},
 'motorcycle-bagger':{file:'motorcycle.glb',length:2.2,width:1.04,height:1.35,heading:0,wheelRadius:.32,seat:[0,1.55,-.13],credit:"Bagger Touring motorcycle style adaptation: Poly by Google Motorcycle(CC BY 3.0)Add hard cases on both sides, Windshield and rear backrest; not GTA Original version Bagger Model"},
 'motorcycle-green':{file:'motorcycle-green.glb',length:2.2,width:.74,height:1.1593,heading:0,wheelRadius:.32,seat:[0,1.55,-.13],credit:"Motorcycle · Poly by Google · CC BY 3.0; Green color scheme adaptation"},
} as const;
/** Full visible footprint, not the sports car's old single nose point. */
export function nativeDriveFootprintClear(x:number,z:number,yaw:number,kind:NativeDriveKind,blocked:(x:number,z:number)=>boolean){
 const fit=NATIVE_DRIVE_VEHICLES[kind],c=Math.cos(yaw),s=Math.sin(yaw);
 for(const u of [-fit.width/2,0,fit.width/2])for(const v of [-fit.length/2,-fit.length/4,0,fit.length/4,fit.length/2])if(blocked(x+c*u+s*v,z-s*u+c*v))return false;
 return true;
}
export const NATIVE_DRIVE_ASSIGNMENTS:Record<string,{kind:NativeDriveKind;startOnFoot?:boolean;night?:boolean}>={
 'c01-n01':{kind:'baller'},
 'c01-n02':{kind:'baller'},
 'c01-n03':{kind:'motorcycle'},
 'c01-n07':{kind:'motorcycle'},
 'c01-n12':{kind:'motorcycle-bagger'},
 'c01-n13':{kind:'van'},
 'c04-n03':{kind:'van'},
 'c01-n14':{kind:'van'},
 'c01-n15':{kind:'van'},
 'c01-n09':{kind:'baller-yellow'},
 'c01-n10':{kind:'baller-yellow'},
 'c04-n04':{kind:'convertible'},
 'c04-n11':{kind:'baller'},
 'c04-n12':{kind:'semi-tractor'},
 'c04-n10':{kind:'semi-tractor'},
 'c05-n12':{kind:'box-truck'},
 'c05-n11':{kind:'atv'},
 'c05-n06':{kind:'baller',startOnFoot:true},
 'c05-n07':{kind:'van'},
 'c05-n08':{kind:'baller',night:true},
 'c04-n08':{kind:'pickup'},
 'c04-n09':{kind:'pickup'},
 'c03-n06':{kind:'motorcycle'},
 'c05-n13':{kind:'motorcycle-green'},
 'c05-n14':{kind:'motorcycle',startOnFoot:true},
 'c04-n13':{kind:'baller'},
 'c05-n09':{kind:'convertible'},
 'c05-n10':{kind:'police-car'},
};
export const NATIVE_TARGET_VEHICLES:Record<string,NativeDriveKind>={
 'c04-n01':'motorcycle',
 'c04-n03':'motorcycle',
 'c04-n11':'baller',
 'c04-n12':'sedan-red',
 'c04-n10':'sedan-red',
 'c04-n05':'van','c04-n06':'van','c04-n07':'van',
 'c04-n08':'convertible','c04-n09':'van',
 'c03-n06':'motorcycle',
 'c04-n13':'baller',
};
