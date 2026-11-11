// Test pilot only: emits the same keys a player can press. It never writes
// aircraft position/velocity or task state, and is not bundled into the game.
export function flightTestControls(aircraft,stage,target,arrival,context={}){
 const p=aircraft.pose,v=aircraft.velocity,speed=aircraft.speed,keys=[];
 const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
 const angle=n=>Math.atan2(Math.sin(n),Math.cos(n));
 if(stage==='boarding'||stage==='complete')return keys;
 if(aircraft.kind==='helicopter'){
  if(aircraft.onGround)return stage==='takeoff'?['KeyW']:['KeyS'];
  const aim=stage==='takeoff'?{...context.spawn,y:25}:stage==='landing'?context.landingPoint:target;
  const dx=aim.x-p.x,dz=aim.z-p.z,distance=Math.hypot(dx,dz),horizontal=Math.hypot(v.x,v.z);
  const limit=Math.min(24,Math.sqrt(distance*3.0)),desiredX=distance>.01?dx/distance*limit:0,desiredZ=distance>.01?dz/distance*limit:0;
  const ax=(desiredX-v.x)*1.1+v.x*(.15+horizontal*.004),az=(desiredZ-v.z)*1.1+v.z*(.15+horizontal*.004);
  const sn=Math.sin(p.yaw),cs=Math.cos(p.yaw);
  const desiredPitch=clamp(-Math.atan2(ax*sn+az*cs,9.81),-.5,.5),desiredRoll=clamp(Math.atan2(ax*cs-az*sn,9.81),-.5,.5);
  if(desiredPitch-p.pitch<-.005)keys.push('Numpad8');else if(desiredPitch-p.pitch>.005)keys.push('Numpad5');
  if(desiredRoll-p.roll>.005)keys.push('Numpad6');else if(desiredRoll-p.roll<-.005)keys.push('Numpad4');
  if(distance>50){const error=angle(Math.atan2(dx,dz)-p.yaw);if(error>.02)keys.push('KeyD');else if(error<-.02)keys.push('KeyA');}
  let desiredClimb=clamp((aim.y-p.y)*.6,-4,7);
  if(stage==='landing')desiredClimb=distance>28?clamp((145-p.y)*.5,-3,5):p.y-aim.y>12?-3:-1;
  const needed=(9.81+v.y*.4+(desiredClimb-v.y)*1.8)/(Math.cos(p.pitch)*Math.cos(p.roll)*Math.max(.2,aircraft.rotorRpm**2));
  if(needed>11)keys.push('KeyW');else if(needed<8.9)keys.push('KeyS');return keys;
 }
 if(!aircraft.onGround&&((stage==='landing'&&!aircraft.gearTargetDown)||(stage!=='landing'&&p.y>30&&aircraft.gearTargetDown)))keys.push('KeyG');


 if(aircraft.onGround){
  if(stage!=='takeoff')return ['KeyS'];
  keys.push('KeyW');if(speed>33&&p.pitch<.14)keys.push('Numpad5');
  return keys;
 }
 const navigation=context.id&&context.id!=='c08-n07';
 let aim=target,altitude=navigation?target.y:85,desiredSpeed=navigation?45:65,slope=0;
 if(stage==='landing'){
  desiredSpeed=43;
  const sn=Math.sin(arrival.yaw),cs=Math.cos(arrival.yaw),along=(p.x-arrival.x)*sn+(p.z-arrival.z)*cs;
  const lead=Math.min(180,along+200);
  aim={x:arrival.x+sn*lead,z:arrival.z+cs*lead};
  const distance=-165-along;
  const relative=distance>100?(distance-100)*.13+3.5:Math.max(-.5,distance*.035);
  altitude=arrival.y+2.25+Math.min(81.75,relative);
  if(relative<81.75)slope=distance>100?-.13:-.035;
 }
 const course=Math.atan2(v.x,v.z);
 if(navigation&&stage!=='landing'){
  const pilot=context.pilot??(context.pilot={}),key=stage+':'+target.x+':'+target.z;
  if(pilot.key!==key){pilot.key=key;pilot.escape=null;}
  const distance=Math.hypot(target.x-p.x,target.z-p.z),error=angle(Math.atan2(target.x-p.x,target.z-p.z)-course);
  if(pilot.escape&&distance>450)pilot.escape=null;
  if(!pilot.escape&&distance<220&&Math.abs(error)>1.2)pilot.escape={x:p.x+Math.sin(course)*550,z:p.z+Math.cos(course)*550};
  if(pilot.escape)aim=pilot.escape;
 }
 const heading=Math.atan2(aim.x-p.x,aim.z-p.z);
 const bank=navigation&&stage!=='landing'?.82:.4;
 const desiredRoll=clamp(angle(heading-course)*1.6,-bank,bank);
 if(desiredRoll-p.roll>.012)keys.push('Numpad6');else if(desiredRoll-p.roll<-.012)keys.push('Numpad4');
 const horizontal=Math.max(10,Math.hypot(v.x,v.z));
 const desiredClimb=clamp((altitude-p.y)*.5+slope*horizontal,-6,7);
 const liftCoefficient=9.81/(.012*Math.max(speed*speed,30*30)*Math.max(.7,Math.cos(p.roll)));
 const trim=(liftCoefficient-.28)/4.2;
 const desiredPitch=clamp(Math.atan2(desiredClimb,horizontal)+trim+(desiredClimb-v.y)*.025,-.18,.26);
 if(desiredPitch-p.pitch>.006)keys.push('Numpad5');else if(desiredPitch-p.pitch<-.006)keys.push('Numpad8');
 if(speed<desiredSpeed)keys.push('KeyW');
 else if(stage==='landing'&&speed>desiredSpeed+6)keys.push('KeyS');
 return keys;
}
