// Aircraft attitude uses physical numpad keys only, not arrow-key aliases.
// https://docs.fivem.net/docs/game-references/controls/
export const FLIGHT_ENGINE_START_SECONDS=2;
export function flightControls(keys:ReadonlySet<string>){
 const held=(...codes:string[])=>Number(codes.some(code=>keys.has(code)));
 return {
  throttle:!!held('KeyW'),brake:!!held('KeyS'),
  pitch:held('Numpad5')-held('Numpad8'),
  roll:held('Numpad6')-held('Numpad4'),
  yaw:held('KeyD')-held('KeyA'),
 };
}
export const planeControls="W/S Throttle/Slow down · A/D Rudder · Numeric Keypad 5/8 Look up/Look down · 4/6 Roll · G Landing gear · F Exit aircraft";
export const helicopterControls="W/S Ascend/Descend · A/D Steering · Numeric Keypad 8/5 Lean forward/Lean back · 4/6 Roll · F Exit aircraft";
