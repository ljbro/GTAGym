import './city-hud.css';
import {policeSectorPolygon} from './offmap-navigation-police.ts';
import type {CityData, V2} from './city-types.ts';
import {drawMinimapRoute} from './minimap-route-layers.ts';
import {minimapGoalMarker,MinimapNavigation} from './minimap-navigation.ts';
import {MINIMAP_FRAME,minimapVisibleWidth,type MinimapViewportState} from './minimap-viewport.ts';

export type CinematicHudState = {
  /** Signed vehicle speed in metres per second, matching CarState.speed. */
  speed: number;
  /** Odometer in game metres, matching CarState.distance. */
  distance: number;
  roadName: string;
  district?: string;
  flight?: boolean;
  night?: boolean;
  lightMode?: 'sunset'|'night'|'day';
  walking?:boolean;
  observer?: boolean;
  menuOpen?: boolean;
  navigation?: boolean;
};

export type CinematicMinimapState = MinimapViewportState & {
  x: number;
  z: number;
  yaw: number;
  route: readonly V2[];
  routeIsNavigation?: boolean;
  navigationPosition?: V2;
  navigationEpoch?: number;
  navigationConnect?: (a:V2,b:V2)=>V2[]|null;
  navigationRejoin?: import('./minimap-navigation.ts').RouteRejoin;
  target?: readonly number[];
  npc?: readonly number[];
  arrivalRadius?:number;
  police?: readonly {x:number;z:number;yaw:number;kind?:'foot'|'vehicle'}[];
  speed?:number;
  observer?:boolean;
  walking?:boolean;
};

type HudElements = {
  root: HTMLElement;
  speed: HTMLElement;
  gear: HTMLElement;
  odometer: HTMLElement;
  roadName: HTMLElement;
  roadEnglish: HTMLElement;
  subtitle: HTMLElement;
  district: HTMLElement | null;
  clock: HTMLElement | null;
  meter: HTMLElement;
  arc: SVGPathElement;
  needle: SVGLineElement;
  compass: HTMLElement | null;
  previousSpeed: number;
};

let hud: HudElements | null = null;
const SVG_NS = 'http://www.w3.org/2000/svg';
const MAX_DIAL_SPEED = 200;
const DIAL_START = -128;
const DIAL_SWEEP = 256;
const ROAD_ENGLISH: Record<string, string> = {
  "Binhai Boulevard": 'Binhai Blvd',
  "Shennan Boulevard": 'Shennan Blvd',
  "Shennan Middle Road": 'Shennan Middle Rd',
  "Shennan East Road": 'Shennan East Rd',
  "Houhai Avenue": 'Houhai Blvd',
  "Houhaibin Road": 'Houhaibin Rd',
  "Shahe West Road": 'Shahe West Rd',
  "Nanhai Avenue": 'Nanhai Blvd',
  "Keyuan South Road": 'Keyuan South Rd',
  "Keyuan Road": 'Keyuan Rd',
  "Haide 3rd Road": 'Haide 3rd Rd',
  "Fuhua 3rd Road": 'Fuhua 3rd Rd',
  "Yitian Road": 'Yitian Rd',
};

function writeText(element: HTMLElement | null, value: string): void {
  if (element && element.textContent !== value) element.textContent = value;
}

function setFlag(root: HTMLElement, key: string, value: boolean): void {
  const text = value ? 'true' : 'false';
  if (root.dataset[key] !== text) root.dataset[key] = text;
}

function dialPoint(angle: number, radius: number): [number, number] {
  const a = angle * Math.PI / 180;
  return [140 + Math.sin(a) * radius, 136 - Math.cos(a) * radius];
}

function dialArc(start: number, end: number, radius: number): string {
  const a = dialPoint(start, radius), b = dialPoint(end, radius);
  return `M ${a[0].toFixed(3)} ${a[1].toFixed(3)} A ${radius} ${radius} 0 ${end - start > 180 ? 1 : 0} 1 ${b[0].toFixed(3)} ${b[1].toFixed(3)}`;
}

function createDial(): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 280 270');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('cinematic-dial');
  const outline = dialArc(DIAL_START, DIAL_START + DIAL_SWEEP, 120);
  const ticks: string[] = [];
  for (let i = 0; i <= 40; i++) {
    const angle = DIAL_START + i / 40 * DIAL_SWEEP;
    const major = i % 8 === 0;
    const a = dialPoint(angle, 112), b = dialPoint(angle, major ? 102 : 108);
    ticks.push(`<line class="${major ? 'dial-tick-major' : 'dial-tick'}" x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}"/>`);
    if (major) {
      const p = dialPoint(angle, 94);
      ticks.push(`<text class="dial-label" x="${p[0]}" y="${p[1] + 2}">${i * 5}</text>`);
    }
  }
  svg.innerHTML = `
    <path class="dial-inner-ring" d="${dialArc(DIAL_START, DIAL_START + DIAL_SWEEP, 111)}"/>
    <path class="dial-track" d="${outline}"/>
    <path class="dial-progress" d="${outline}" pathLength="100" stroke-dasharray="0 100"/>
    <path class="dial-limit" d="${dialArc(118, 128, 120)}"/>
    ${ticks.join('')}
    <line class="dial-needle" x1="140" y1="11" x2="140" y2="22" transform="rotate(-128 140 136)"/>
    <circle class="dial-power-ring" cx="140" cy="231" r="16"/>
    <path class="dial-power" d="M 143.5 219 L 133 233 L 139 233 L 136.5 243 L 148 228 L 142 228 Z"/>
  `;
  return svg;
}

/** Enhance the existing UI once, after initUI has created its DOM. */
export function initializeCinematicHud(city?: CityData): void {
  const root = document.querySelector<HTMLElement>('#ui');
  if (!root || (hud?.root === root && hud.speed.isConnected)) return;
  const meter = root.querySelector<HTMLElement>('#speedometer');
  const minimap = root.querySelector<HTMLElement>('#minimap');
  const speed = root.querySelector<HTMLElement>('#speed');
  const gear = root.querySelector<HTMLElement>('#gear');
  const odometer = root.querySelector<HTMLElement>('#odometer');
  const roadName = root.querySelector<HTMLElement>('#road-name');
  const subtitle = root.querySelector<HTMLElement>('.wordmark span');
  if (!meter || !minimap || !speed || !gear || !odometer || !roadName || !subtitle) return;

  root.classList.add('cinematic-hud');
  meter.setAttribute('role', 'group');
  meter.setAttribute('aria-label', "Vehicle speed 0 kilometers per hour");
  minimap.setAttribute('role', 'img');
  minimap.setAttribute('aria-label', "Nearby roads and navigation route, Direction of travel at top");
  speed.parentElement?.classList.add('cinematic-speed-readout');
  meter.querySelector('small')?.classList.add('cinematic-speed-meta');
  const dial = createDial();
  meter.prepend(dial);

  const roadLabel = document.createElement('div');
  roadLabel.className = 'cinematic-road-label';
  const roadEnglish = document.createElement('span');
  roadEnglish.className = 'cinematic-road-english';
  roadLabel.append(roadName, roadEnglish);
  minimap.append(roadLabel);

  // The existing help remains available when pausing, leaving the road clear.
  const controls = root.querySelector<HTMLElement>('.controls');
  const pause = root.querySelector<HTMLElement>('#pause');
  if (controls && pause) pause.append(controls);
  root.querySelector('#map-button')?.setAttribute('aria-label', "City map, Keyboard shortcut M");
  root.querySelector('#journal-button')?.setAttribute('aria-label', "City life, Keyboard shortcut J");
  writeText(subtitle, "Shenzhen Bay · Free Driving");

  hud = {
    root, speed, gear, odometer, roadName, roadEnglish, subtitle, meter,
    district: root.querySelector('#district'),
    clock: root.querySelector('#clock'),
    arc: dial.querySelector<SVGPathElement>('.dial-progress')!,
    needle: dial.querySelector<SVGLineElement>('.dial-needle')!,
    compass: minimap.querySelector('.north'),
    previousSpeed: -1,
  };
  if (city) getMapCache(city);
}

/** Explicit state updates; no observer, timer, or extra render loop. */
export function updateCinematicHud(state: CinematicHudState): void {
  if (!hud?.speed.isConnected) return;
  const signedSpeed = Number.isFinite(state.speed) ? state.speed : 0;
  const speed = Math.min(999, Math.round(Math.abs(signedSpeed) * 3.6));
  writeText(hud.speed, String(speed).padStart(3, '0'));
  writeText(hud.gear, signedSpeed < -.3 ? 'R' : speed ? 'D' : 'P');
  writeText(hud.odometer, `${(Math.max(0, state.distance) / 1000).toFixed(1)} KM`);
  writeText(hud.roadName, state.roadName);
  const english = ROAD_ENGLISH[state.roadName] ?? '';
  writeText(hud.roadEnglish, english);
  if (hud.roadEnglish.hidden !== !english) hud.roadEnglish.hidden = !english;
  const district = state.district || "Shenzhen Bay";
  const areaLabel = district.split(/\s*·\s*/).filter(Boolean).at(-1) || district;
  const mode = state.flight ? "Bay Flight" : state.observer ? "Drone sightseeing" : state.navigation ? "Navigation Along the Route" : state.walking?"Walking Exploration":"Free Driving";
  writeText(hud.subtitle, `${areaLabel} · ${mode}`);
  writeText(hud.district, district);
  writeText(hud.clock, state.lightMode==='day' ? '14:20' : state.night ? '20:10' : '18:25');
  setFlag(hud.root, 'observer', !!state.observer);
  setFlag(hud.root, 'menuOpen', !!state.menuOpen);
  setFlag(hud.root, 'navigation', !!state.navigation);
  if (hud.previousSpeed !== speed) {
    const progress = Math.min(1, speed / MAX_DIAL_SPEED);
    hud.arc.style.strokeDasharray = `${(progress * 100).toFixed(2)} 100`;
    hud.needle.setAttribute('transform', `rotate(${(DIAL_START + progress * DIAL_SWEEP).toFixed(2)} 140 136)`);
    hud.meter.setAttribute('aria-label', `Vehicle speed ${speed} kilometers per hour`);
    hud.previousSpeed = speed;
  }
}

const TILE_WORLD = 512;
const TILE_PIXELS = 256;
const TILE_SCALE = TILE_PIXELS / TILE_WORLD;
const MAP_SIZE = MINIMAP_FRAME.width;
const MAP_HEIGHT = MINIMAP_FRAME.height;
const MAP_BACKING_SIZE = 480;
const MAP_BACKING_HEIGHT = 320;
const MAX_CACHED_TILES = 96;
type Bounds = [number, number, number, number];
type Segment = {a: V2; b: V2; width: number; major: boolean};
type MapPolygon = {rings: V2[][]; bounds: Bounds};
type MapCache = {
  segments: Map<string, Segment[]>;
  green: MapPolygon[];
  water: MapPolygon[];
  tiles: Map<string, HTMLCanvasElement>;
};
const mapCaches = new WeakMap<CityData, MapCache>();

function tileKey(x: number, z: number): string { return `${x},${z}`; }

function polygonBounds(rings: V2[][]): Bounds {
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of rings) for (const [x, z] of ring) {
    bounds[0] = Math.min(bounds[0], x); bounds[1] = Math.min(bounds[1], z);
    bounds[2] = Math.max(bounds[2], x); bounds[3] = Math.max(bounds[3], z);
  }
  return bounds;
}

function getMapCache(city: CityData): MapCache {
  const existing = mapCaches.get(city);
  if (existing) return existing;
  const cache: MapCache = {
    segments: new Map(), tiles: new Map(),
    green: city.green.map(p => ({rings: p.rings, bounds: polygonBounds(p.rings)})),
    water: city.water.map(p => ({rings: p.rings, bounds: polygonBounds(p.rings)})),
  };
  for (const road of city.roads) for (let i = 1; i < road.points.length; i++) {
    const segment: Segment = {
      a: road.points[i - 1], b: road.points[i], width: Math.max(2, road.width),
      major: ['trunk', 'primary', 'secondary'].includes(road.kind),
    };
    const padding = segment.width / 2 + 3;
    const xmin = Math.floor((Math.min(segment.a[0], segment.b[0]) - padding) / TILE_WORLD);
    const xmax = Math.floor((Math.max(segment.a[0], segment.b[0]) + padding) / TILE_WORLD);
    const zmin = Math.floor((Math.min(segment.a[1], segment.b[1]) - padding) / TILE_WORLD);
    const zmax = Math.floor((Math.max(segment.a[1], segment.b[1]) + padding) / TILE_WORLD);
    for (let x = xmin; x <= xmax; x++) for (let z = zmin; z <= zmax; z++) {
      const key = tileKey(x, z), cell = cache.segments.get(key);
      if (cell) cell.push(segment); else cache.segments.set(key, [segment]);
    }
  }
  mapCaches.set(city, cache);
  return cache;
}

function getMapTile(cache: MapCache, tx: number, tz: number): HTMLCanvasElement {
  const key = tileKey(tx, tz), existing = cache.tiles.get(key);
  if (existing) {
    cache.tiles.delete(key);
    cache.tiles.set(key, existing);
    return existing;
  }
  const tile = document.createElement('canvas');
  tile.width = tile.height = TILE_PIXELS;
  const ctx = tile.getContext('2d')!;
  const xmin = tx * TILE_WORLD, zmin = tz * TILE_WORLD;
  const xmax = xmin + TILE_WORLD, zmax = zmin + TILE_WORLD;
  const point = ([x, z]: V2): V2 => [(x - xmin) * TILE_SCALE, (zmax - z) * TILE_SCALE];
  const polygons = (items: MapPolygon[], fill: string): void => {
    ctx.fillStyle = fill;
    for (const {rings, bounds: b} of items) {
      if (b[2] < xmin || b[0] > xmax || b[3] < zmin || b[1] > zmax) continue;
      ctx.beginPath();
      for (const ring of rings) {
        for (let i = 0; i < ring.length; i++) {
          const p = point(ring[i]);
          if (i) ctx.lineTo(...p); else ctx.moveTo(...p);
        }
        ctx.closePath();
      }
      ctx.fill('evenodd');
    }
  };
  polygons(cache.water, 'rgba(152, 189, 202, 0.12)');
  polygons(cache.green, 'rgba(150, 164, 113, 0.18)');
  const segments = cache.segments.get(key) ?? [];
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  // Draw minor streets first, keeping major roads continuous through junctions.
  for (const major of [false, true]) {
    for (const segment of segments) {
      if (segment.major !== major) continue;
      ctx.beginPath();
      ctx.moveTo(...point(segment.a)); ctx.lineTo(...point(segment.b));
      ctx.strokeStyle = major ? 'rgba(15, 20, 22, 0.66)' : 'rgba(15, 20, 22, 0.35)';
      ctx.lineWidth = Math.max(major ? 3.2 : 1.7, segment.width * TILE_SCALE * .7) + 1.8;
      ctx.stroke();
      ctx.strokeStyle = major ? 'rgba(223, 225, 218, 0.83)' : 'rgba(175, 182, 180, 0.57)';
      ctx.lineWidth -= 1.8;
      ctx.stroke();
    }
  }
  if (cache.tiles.size >= MAX_CACHED_TILES) cache.tiles.delete(cache.tiles.keys().next().value!);
  cache.tiles.set(key, tile);
  return tile;
}

const mapNavigation=new WeakMap<HTMLCanvasElement,MinimapNavigation>();
const mapPlanes=new WeakMap<HTMLCanvasElement,{canvas:HTMLCanvasElement;tilt:number}>();
/** A perspective map plane with a stable vehicle marker; no second WebGL scene. */
export function minimapTilt(speed=0,observer=false){return observer?.12:.40+Math.min(1,Math.abs(speed)/28)*.25;}
export function drawCinematicMinimap(canvas:HTMLCanvasElement,city:CityData,state:CinematicMinimapState):void{
 canvas.dataset.mapMode='city';canvas.dataset.guidance='route';
 for(const key of ['floorPolygons','wallPolygons','doorPolygons'])delete canvas.dataset[key];
 let tracker=mapNavigation.get(canvas);if(!tracker){tracker=new MinimapNavigation();mapNavigation.set(canvas,tracker);}
 const navigation=state.routeIsNavigation?{points:state.route,along:0,connector:[]}:tracker.update(state.route,state.navigationPosition??[state.x,state.z],state.navigationEpoch??0,state.navigationConnect,state.navigationRejoin),remaining=navigation.points;
 canvas.dataset.routeConnector=JSON.stringify(navigation.connector);
 canvas.dataset.routePoints=String(remaining.length);canvas.dataset.routeVisible=String(remaining.length>1);canvas.dataset.target=state.target?JSON.stringify(state.target):'';
 canvas.dataset.routeStart=JSON.stringify(remaining[0]??null);canvas.dataset.routeAlong=String(navigation.along);
 if(canvas.width!==MAP_BACKING_SIZE||canvas.height!==MAP_BACKING_HEIGHT){canvas.width=MAP_BACKING_SIZE;canvas.height=MAP_BACKING_HEIGHT;}
 let plane=mapPlanes.get(canvas);if(!plane){const image=document.createElement('canvas');image.width=image.height=768;plane={canvas:image,tilt:minimapTilt()};mapPlanes.set(canvas,plane);}
 plane.tilt+=(minimapTilt(state.speed,state.observer)-plane.tilt)*.22;
 canvas.dataset.perspectiveTilt=(plane.tilt*180/Math.PI).toFixed(1);
 // Logical canvas width, not backing texture width: the perspective plane
 // preserves this scale at the player anchor. Route and police never set zoom.
 const visibleWidth=minimapVisibleWidth(state),mapScale=MAP_SIZE/visibleWidth;
 canvas.dataset.visibleWidth=String(visibleWidth);
 canvas.dataset.routeScale=String(mapScale);
 const source=plane.canvas.getContext('2d')!,cache=getMapCache(city),reach=920/mapScale;
 source.setTransform(.75,0,0,.75,0,0);source.fillStyle='#1b3037';source.fillRect(0,0,1024,1024);source.save();source.translate(512,740);source.rotate(-state.yaw);
 const xmin=Math.floor((state.x-reach)/TILE_WORLD),xmax=Math.floor((state.x+reach)/TILE_WORLD),zmin=Math.floor((state.z-reach)/TILE_WORLD),zmax=Math.floor((state.z+reach)/TILE_WORLD);
 for(let x=xmin;x<=xmax;x++)for(let z=zmin;z<=zmax;z++){
  const px=(x*TILE_WORLD-state.x)*mapScale,py=-((z+1)*TILE_WORLD-state.z)*mapScale;
  // Rotated tile bounds against the 1024px source plane avoid filling unused tiles.
  const dx=px+TILE_WORLD*mapScale/2,dy=py+TILE_WORLD*mapScale/2,rx=dx*Math.cos(state.yaw)+dy*Math.sin(state.yaw),ry=-dx*Math.sin(state.yaw)+dy*Math.cos(state.yaw);
  const margin=TILE_WORLD*mapScale*Math.SQRT1_2;
  if(rx< -650-margin||rx>650+margin||ry< -900-margin||ry>420+margin)continue;
  source.drawImage(getMapTile(cache,x,z),px,py,TILE_WORLD*mapScale,TILE_WORLD*mapScale);
 }
 const routeLayers=drawMinimapRoute(source,remaining,{x:state.x,z:state.z,scale:mapScale,speed:state.speed??0,walking:state.walking});
 canvas.dataset.activeRouteMetres=routeLayers.distance.toFixed(1);canvas.dataset.futureRoutePoints=String(routeLayers.future.length);
 if(state.police?.length){
  for(const unit of state.police){
   const sector=policeSectorPolygon({position:{x:unit.x,y:0,z:-unit.z},yaw:-unit.yaw,kind:unit.kind},24);
   source.beginPath();source.moveTo((sector[0].x-state.x)*mapScale,(sector[0].z+state.z)*mapScale);
   for(const p of sector.slice(1))source.lineTo((p.x-state.x)*mapScale,(p.z+state.z)*mapScale);
   source.closePath();source.fillStyle='rgba(235,54,63,.24)';source.fill();source.strokeStyle='rgba(255,92,98,.82)';source.lineWidth=1.5;source.stroke();
   const fx=Math.sin(unit.yaw),fz=Math.cos(unit.yaw),px=(unit.x-state.x)*mapScale,py=-(unit.z-state.z)*mapScale,tipX=(unit.x+fx*7-state.x)*mapScale,tipY=-(unit.z+fz*7-state.z)*mapScale,sideX=-fz*4,sideY=-fx*4;
   source.beginPath();source.moveTo(tipX,tipY);source.lineTo(px+sideX,py+sideY);source.lineTo(px-sideX,py-sideY);source.closePath();source.fillStyle='#ff4b52';source.strokeStyle='#fff0e8';source.lineWidth=1.4;source.fill();source.stroke();
  }
 }
 source.restore();
 const ctx=canvas.getContext('2d')!,backing=MAP_BACKING_SIZE/MAP_SIZE;ctx.setTransform(backing,0,0,backing,0,0);ctx.clearRect(0,0,MAP_SIZE,MAP_HEIGHT);ctx.save();ctx.beginPath();ctx.rect(0,0,MAP_SIZE,MAP_HEIGHT);ctx.clip();ctx.fillStyle='#19343e';ctx.fillRect(0,0,MAP_SIZE,MAP_HEIGHT);
 const c=Math.cos(plane.tilt),s=Math.sin(plane.tilt),project=(y:number)=>{const q=(y-MINIMAP_FRAME.playerY)/(c+(y-MINIMAP_FRAME.playerY)*s/480);return {y:q,stretch:1-q*s/480};};
 for(let y=0;y<MAP_HEIGHT;y+=2){const a=project(y),b=project(y+2);ctx.drawImage(plane.canvas,(512-MINIMAP_FRAME.playerX*a.stretch)*.75,(740+a.y)*.75,MAP_SIZE*a.stretch*.75,Math.max(.2,(b.y-a.y)*.75),0,y,MAP_SIZE,2.1);}
 const haze=ctx.createLinearGradient(0,0,0,MAP_HEIGHT*.8);haze.addColorStop(0,'rgba(48,83,99,.30)');haze.addColorStop(1,'rgba(13,31,38,0)');ctx.fillStyle=haze;ctx.fillRect(0,0,MAP_SIZE,MAP_HEIGHT);ctx.restore();
 const dot=(x:number,y:number,color:string,outline:string)=>{ctx.save();ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fillStyle=color;ctx.strokeStyle=outline;ctx.lineWidth=2;ctx.stroke();ctx.fill();ctx.restore();};
 if(state.target){
  const marker=minimapGoalMarker([state.x,state.z],state.target,state.yaw,mapScale,plane.tilt);
  canvas.dataset.goalMarker=JSON.stringify(marker);
  dot(marker.x,marker.y,'#ffda54','#493a10');
  canvas.setAttribute('aria-label',`Minimap, Purple remaining route, Green Player, Yellow finish ${marker.edge?", Yellow dot indicates direction at the rectangle edge":''}`);
 }else{delete canvas.dataset.goalMarker;canvas.setAttribute('aria-label',"Nearby roads");}
 if(state.npc){
  const marker=minimapGoalMarker([state.x,state.z],state.npc,state.yaw,mapScale,plane.tilt);
  canvas.dataset.npcMarker=JSON.stringify(marker);dot(marker.x,marker.y,'#459dff','#122f54');
  canvas.setAttribute('aria-label',`Minimap, Purple dynamic route, Green Player, Blue Target ${marker.edge?", A blue dot on the rectangle edge indicates direction":''}`);
 }else delete canvas.dataset.npcMarker;
 dot(MINIMAP_FRAME.playerX,MINIMAP_FRAME.playerY,'#69ed99','#163a32');
 delete canvas.dataset.remainingMetres;
 if(hud?.compass){hud.compass.style.left=`${50-Math.sin(state.yaw)*45}%`;hud.compass.style.top=`${50-Math.cos(state.yaw)*45}%`;}
}
