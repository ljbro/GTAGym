import {evaluationTimePolicy,taskTimeLimitEnabled,stepWithTimePolicy} from './native-eval-time-policy.ts';
import type {V2,Landmark} from './city-types.ts';
import type {RoadGraph} from './navigation.ts';
import type {DrivingWorld} from './city-world.ts';
import {Color3,MeshBuilder,PBRMaterial,type AbstractMesh,type TransformNode} from '@babylonjs/core';
import {NavigationPolicePursuit,type PoliceUnit} from './offmap-navigation-police.ts';
import {NativeFootPoliceView} from './native-foot-police-view.ts';
import {minimapPointVisible,minimapVisibleWidth} from './minimap-viewport.ts';
import {ESCAPE_MAX_SECONDS,escapeSurvivalOutcome,escapeSurvivalHint} from './native-escape-survival.ts';
import './native-task-system.css';
import {releaseOffmapPointerLock} from './offmap-mouse.ts';
import {shortNativeWalkRoute,reviewedNativeWalkRoute} from './native-walk-route.ts';
import {parseWalkDataset,type GeneratedWalkDataset,type GeneratedWalkTask} from './generated-walk-tasks.ts';
import {parseOutdoorDataset,outdoorWaterSpec,outdoorNpcRules,resolvedOutdoorNpcRules,type GeneratedOutdoorDataset,type GeneratedOutdoorTask} from './generated-outdoor-tasks.ts';
import {parseTrainingDataset,type TrainingDataset,type TrainingTask} from './training-task-schema.ts';
import {TrainingFlightMission} from './training-flight-mission.ts';
import {GeneratedWaterTargetView} from './generated-water-target-view.ts';
import {renderedWaterClearance} from './outdoor-water-clearance.ts';
import {findGardenLayout} from './native-garden-layout.ts';
import {createNativeTaskResult} from './native-task-result.ts';
import {createNativeTaskPicker} from './native-task-picker.ts';
import manualRoutes from './native-manual-routes.json';
import escapeRoutes from './native-escape-routes.json';
import vehicleEscapeData from './native-vehicle-escape-routes.json';
import convertibleEscapeData from './native-convertible-escape-routes.json';
import policeEscapeData from './native-police-escape-routes.json';
import farmEscapeData from './native-farm-escape-routes.json';
import {NativeFarmSite} from './native-farm-site.ts';
import floodEscapeData from './native-flood-escape-routes.json';
import riverChaseData from './native-river-chase-routes.json';
import semiCityData from './native-semi-city-routes.json';
import hillChaseData from './native-hill-chase-routes.json';
import rescueData from './native-rescue-routes.json';
import {NativeCompanionRescue} from './native-companion-rescue.ts';
import {removeClosedRoadLoops} from './native-route-loop-removal.ts';
import {m03n02TurnaroundRoute} from './native-c01-n06-route.ts';
import {reviewedNativeRoadRoute} from './native-road-quality.ts';
import {nativeRouteStartYaw} from './native-start-heading.ts';
import {ROADSIDE_START_TASKS,findRoadsideStart,roadsideLayoutSeed,remainingTimeText,type RoadsideStart} from './native-roadside-start.ts';
import {CAR_CHOICE_TASK,CAR_CHOICE_SECONDS,findCarChoiceParking,type CarChoiceLayout} from './native-car-choice.ts';
import {calibratedM06Route} from './native-direct-road-route.ts';
import {findShowroomPlacement} from './native-showroom-layout.ts';
import {NativeShowroomSite} from './native-showroom-site.ts';
import {createNativeRescueHud,RESCUE_INSTRUCTION} from './native-rescue-hud.ts';
import {NativeCompanionRescueView} from './native-companion-rescue-view.ts';
import {NativeRescueBridgeSite} from './native-rescue-bridge-site.ts';
import {NativeHillSite} from './native-hill-site.ts';
import {NativeFloodSite} from './native-flood-site.ts';
import {NATIVE_DRIVE_ASSIGNMENTS,NATIVE_DRIVE_VEHICLES,NATIVE_TARGET_VEHICLES} from './native-drive-vehicle-spec.ts';
import vanChaseData from './native-van-chase-routes.json';
import pickupChaseData from './native-pickup-chase-routes.json';
import motorcycleData from './native-motorcycle-routes.json';
import coastalChaseData from './native-coastal-chase-routes.json';
import waterEscapeRoutes from './native-water-escape-routes.json';
import {NativeWaterPoliceView} from './native-water-police-view.ts';
import originalManualWalks from './native-manual-walks.json';
import additionalWalks from './native-additional-walks.json';
import waterRoutes from './native-water-routes.json';
import {NativeWaterSite} from './native-water-site.ts';
import {NativeSubmarineSite} from './native-submarine-site.ts';
import {SUBMARINE_TASK} from './native-marine-facility.ts';
import boatRoutes from './native-boat-routes.json';
import {NativeBoatSite} from './native-boat-site.ts';
import drivingBoatRoutes from './native-driving-boat-routes.json';
import beachBoatRoutes from './native-beach-boat-routes.json';
import type {BoatSpec} from './native-boat-motion.ts';
import stairRoutes from './native-stair-routes.json';
import {findStairLayout} from './native-stair-layout.ts';
import {NativeStairSite} from './native-stair-site.ts';
import {nativeBends} from './native-annotation-route.ts';
import shoreRoutes from './native-shore-routes.json' with {type:'json'};
import {NativeShoreSite} from './native-shore-site.ts';
import shoreBoatRoutes from './native-shore-boat-routes.json' with {type:'json'};
import {NativeShoreBoatSite} from './native-shore-boat-site.ts';
import type {ShoreBoatSpec} from './native-shore-boat-motion.ts';
import {inRing} from './driving.ts';
import {NativeNpcObjective,npcRules,NPC_DRIVE_SPEED} from './native-npc-objective.ts';
import {NativeVehicleNpc,npcVehicleMass} from './native-vehicle-npc.ts';
import {NativeNpcView} from './native-npc-view.ts';
import {targetRiderOptions} from './native-npc-character.ts';
import {NativeFootSite} from './native-foot-site.ts';
import {NativeGarageSite} from './native-garage-site.ts';
import {findGaragePlacement} from './native-garage-layout.ts';
import {WALK_VEHICLES} from './native-walk-vehicle-layout.ts';
import {findPickupClimbLayout} from './native-pickup-climb-layout.ts';
import {NativePickupClimbSite} from './native-pickup-climb-site.ts';
import {pickupClimbPrompt} from './native-pickup-climb-prompt.ts';
import {vaultPrompt} from './native-vault-prompt.ts';
import {descentPrompt} from './native-descent-prompt.ts';
import {routeBarrier} from './native-task-barrier.ts';
import {createNativeBarrierView} from './native-task-barrier-view.ts';
import {MinimapRouteProgress,uncheckedRouteLimit,distanceToTravel} from './minimap-route-progress.ts';
import {nativeArrival} from './native-task-arrival.ts';
import {NATIVE_FLIGHT_TASK,NATIVE_FLIGHT_LAUNCH,NATIVE_FLIGHT_DESTINATION,NativeFlightMission} from './native-flight-route.ts';
import {nativeWaterTiming} from './native-water-timing.ts';
import {WATER_TRANSFER_IDS,WATER_TRANSFER_SPECS,waterTransferSpec} from './native-water-transfer.ts';
import {nativeFlightConfig} from './native-flight-catalog.ts';
import {createNativeFlightTarget} from './native-flight-task.ts';
import {CLIMB_START,CLIMB_SOURCE,NativeClimbMission} from './native-climb-site.ts';
import {NATIVE_AIR_TASKS} from './native-task-catalog.ts';
import {ordinaryOutdoorRouteMaxDuration} from './native-task-timing.ts';
import {NATIVE_INTERIORS,interiorTaskCategory,interiorCompletionRadius,findInteriorPlacement} from './native-interior-layout.ts';
import {NativeInteriorSite} from './native-interior-site.ts';
import {assetFailureMessage} from './asset-retry.ts';
import benchmarkCatalog from '../../tasks/catalog.json';
import benchmarkInstructions from '../../tasks/instructions.json';
const staticCatalog=benchmarkCatalog.filter(row=>row.kind==='shooting'||row.kind==='sniper');
const benchmarkTaskIds=new Set(benchmarkCatalog.map(row=>row.id));
import {loadStaticShootingSite} from './static-shooting-site.ts';

/**
 * Native-city task system.
 *
 * Task definitions are the measured OffMapBench turn audits. Absolute source
 * coordinates are intentionally not copied into GTA_SZ: every task gets a
 * long, deterministic path from the GTA_SZ road graph instead. The search
 * prefers reviewed count-only native-road routes. Left/right sequence is no
 * longer required (2026-10-10). Legacy generation remains for unaudited tasks;
 * its shortened/fallback routes must not be advertised as count-matched.
 */
type Turn='left'|'right';
type Movement='drive'|'walk'|'swim'|'flight'|'shooting';
type NativeEndpoint={position:V2;label:string;completionRadius:number;completionSpeed:number};
type NativeTask={id:string;title:string;objective:string;expectedTurns:readonly Turn[];seed:number;minLength:number;mode:Movement;category:string;endpoint?:NativeEndpoint;trainingWalk?:GeneratedWalkTask;trainingOutdoor?:GeneratedOutdoorTask;trainingTask?:TrainingTask};
type NativePath={points:V2[];turns:V2[];length:number;topologyFallback?:boolean;shortWalk?:boolean;turnDirections?:Turn[]};
type Options={toast:(message:string)=>void;setRoute:(destination:Landmark,preview:V2[])=>void;clearRoute:()=>void;prepareStart?:()=>void;trainingWalkDataset?:GeneratedWalkDataset;trainingOutdoorDataset?:GeneratedOutdoorDataset;trainingDataset?:TrainingDataset};
type PoliceMini={x:number;z:number;yaw:number;kind?:'foot'|'vehicle'};
type State={active:boolean;complete:boolean;failed:boolean;checkpoint:number;elapsed:number;maxDuration:number;startedAt:number;lastUi:number;path:NativePath|null;target:V2|null;targetYaw:number;targetDistance:number;police:PoliceMini[];npc?:NativeVehicleNpc['snapshot']};
const manualWalks=[...originalManualWalks,...additionalWalks];
const vehicleEscapeRoutes=[...vehicleEscapeData,...convertibleEscapeData,...policeEscapeData,...farmEscapeData,...floodEscapeData] as typeof escapeRoutes;
const allEscapeRoutes=[...escapeRoutes,...vehicleEscapeRoutes];
const vanChaseRoutes=vanChaseData as typeof escapeRoutes;
const pickupChaseRoutes=pickupChaseData as typeof escapeRoutes;
const motorcycleRoutes=motorcycleData as typeof escapeRoutes;
const coastalChaseRoutes=coastalChaseData as typeof escapeRoutes;
const riverChaseRoutes=riverChaseData as typeof escapeRoutes;
const semiCityRoutes=semiCityData;
const annotatedDrivingRoutes=[...manualRoutes,...allEscapeRoutes,...vanChaseRoutes,...pickupChaseRoutes,...motorcycleRoutes,...coastalChaseRoutes,...riverChaseRoutes,...semiCityRoutes,...hillChaseData,...rescueData];

const task=(id:string,title:string,sequence:string,seed:number,minLength:number,mode:Movement,category:string):NativeTask=>({
 id,title,expectedTurns:[...sequence].map(t=>t==='L'?'left':'right'),seed,minLength,
 mode,category,endpoint:NATIVE_ENDPOINTS[id],
 objective:id==='c07-n01'?"Walk to the side of the pickup front, Face the front of the vehicle and press Space to climb on; At the front of the vehicle, face the low roof and press Space again to climb onto it, Walk up to the window to complete. The site and height are estimated adaptations for Shenzhen.":mode==='walk'?"along GTA_SZ Native roads approximately completed: 100 meters of short-distance walking; Extract the road segment near the initial turn, Following the entire original path is not required.":`Drive along the original road; Reference Trajectory ${sequence.length} diagnostic turns, Route adaptation matches counts only, Left and right directions do not need to match. See route information for adapted turns. `,
});

// Native-city endpoint adaptations.  They keep the audited turn sequence but
// finish at landmarks that match the source action instead of an arbitrary
// downtown graph node: a car-showroom frontage for c01-n10 and the coastal
// Binhai Avenue corridor for c01-n11.
const NATIVE_ENDPOINTS:Record<string,NativeEndpoint>={
 'c01-n10':{position:[4690.44,1674.19],label:"Crash into the dealership room",completionRadius:2,completionSpeed:8},
 'c01-n11':{position:[-3757.37,-877.05],label:"Binhai Avenue Coastal Entrance",completionRadius:34,completionSpeed:4},
};

// 32 legacy outdoor tasks + 2 driving SVGs + 13 walking SVGs (c02-n08 replaces legacy).
const TASKS:NativeTask[]=[
 ...NATIVE_INTERIORS.map(s=>({id:s.id,title:s.title,objective:`${s.id==='c09-n02'?"Go to the wall behind the main cover in the warehouse, Crouch to enter cover.":s.id==='c09-n01'?"Enter the Vault, Open the safe and take the hidden cash; Pass through the warehouse, Open the roller shutter and leave the bank.":s.id==='c09-n04'?"First enter the showroom from the service bay and reach the yellow target marker, Then pass through the maintenance room back to the rear area.":s.id==='c09-n03'?"Open the warehouse roller shutter, Wait until the door is fully raised, then walk out to the endpoint.":`${s.mode==='drive'?"driving":"walking"} Reach the end of the course to finish; `} Space to jump/Driving handbrake, F Enter or Exit Vehicle, V Switch View. ${s.source.note} Sunny by default, This site task currently has no time limit. `,expectedTurns:[],seed:0,minLength:s.length,mode:s.mode as Movement,category:interiorTaskCategory(s)})),
 task('c03-n01',"Follow the white sports car through the city",'LLRRRRRRRRRLLLRRRLLLLLLRLLR',100,1000,'drive','follow'),
 task('c05-n01',"Lose the police while driving",'RLLLLLLLLLRRRRRRRLLLLLLLLLRRLLRLLLLLRRRRRLRR',174,1000,'drive','escape'),
 {...task('c01-n04',"Select a car while walking and deliver it to the dealership within the time limit",'RRLRLRRLRRLRLLRLLRLLR',211,1000,'drive','outdoor-road'),objective:"Walk to the roadside parking area, Select a vehicle, Reach the vehicle shop endpoint by driving within the time limit."},
 {...task('c01-n05',"Drive back to the residence",'LRLLLRRRRRLRR',322,1000,'drive','outdoor-road'),objective:"Drive back to the residence along the existing neighborhood roads. New route approximately 1.04 km, Matching the reference trajectory 13 diagnostic turns, Matching left and right directions is no longer required; Start and end points relocated for the native road network, No duplicate nodes, Do not return to the previous intersection. Raw calibration data and SVG Keep, Drive to the finish to complete."},
 task('c02-n01',"Go walking from the dealership to the sedan",'RRRLRLR',433,350,'walk','outdoor-foot'),
 {...task('c01-n06',"Drive to Vespucci Beach",'RRRRLLLLRRRRRR',470,1000,'drive','outdoor-road'),objective:"First move in the direction the vehicle is facing, Make a U-turn at the original road junction ahead, Then follow the oncoming lane and turn into the block, Head to the yellow destination deep along the side road, No longer return near the U-turn intersection. Total distance about 2.50 km, Keep 14 diagnostic turns, Match count only, Left and right directions do not need to match. The starting point and original calibration data are retained, Adapted endpoint relocated; Adapted for Shenzhen neighborhoods here, Not a recreation of the beach in the original video. Turning points are for navigation only, Complete by driving to the finish."},
 task('c03-n02',"Follow your companion into the garage alley",'RLLRRRRRRLRLRRLLRRLRLRRLL',507,350,'walk','follow'),
 task('c02-n02',"Move toward the adjacent detached garage",'LLLRLRRL',581,350,'walk','outdoor-foot'),
 task('c02-n03',"Run back to the sedan at the alley entrance",'RLRL',618,350,'walk','outdoor-foot'),
 task('c04-n01',"Chase the motorcycle while driving",'LRRLLRLRLRRRLLLL',655,1000,'drive','chase'),
 task('c02-n04',"Approach the fallen motorcycle",'LLLL',692,350,'walk','outdoor-foot'),
 task('c01-n07',"Ride the motorcycle to the car wash",'LLLRRLLRLRRRLLR',729,1000,'drive','outdoor-road'),
 task('c01-n08',"Drive to the house",'LRLRRLLRRRLR',766,1000,'drive','outdoor-road'),
 {...task('c02-n05',"Go around the garden to find a way into the house",'RRRL',803,92,'walk','outdoor-foot'),objective:"Start from the garden side beside the original residence, Go around the central flower bed, Return to the home entrance along the walkway on the other side. about 92 meters, Four Turns; Flower beds and hedges have collision, Reach the entrance to complete, Do not add intermediate checkpoints. Route adapted for gameplay, Original video route and SVG Keep."},
 task('c07-n01',"Climb onto the pickup rack, scale the tiled eaves and head toward the window",'LLLRLRRRLRLRRLR',840,350,'walk','stairs'),
 task('c01-n09',"The yellow SUV Drive to the Car Shop",'RLLRRLLL',914,1000,'drive','outdoor-road'),
 {...task('c01-n10',"Line up with the vehicle showroom window and drive in",'L',951,1000,'drive','outdoor-road'),objective:"Follow the route while driving to the vehicle shop, Aim for the wide display window and crash into the room to succeed; Only the center of the vehicle needs to be indoors, The Entire Vehicle Need Not Enter, Approach the counter or park. Stopping outside or entering on foot does not count as completion. The vehicle shop is a new mission showroom near the original city, Not a complete recreation of the building in the original video."},
 task('c01-n11',"Follow the original route by car to the Pacific Coast Highway entrance",'RRRRLR',988,1000,'drive','outdoor-road'),
 task('c04-n02',"Pursue the boat trailer along the existing coastal access road and highway",'',1025,1200,'drive','chase'),
 {...task('c01-n12',"riding Bagger Go to the Franklin residence",'LLRRRRLLLLRRRLRLR',1062,1000,'drive','outdoor-road'),objective:"Ride the touring motorcycle along existing connected roads to the residential destination. Reduce pointless backtracking based on playtest feedback, Preserve the start and end points and the original SVG, No more detours to meet the old diagnostic turn count. Currently Bagger Style adaptation model, not GTA Original Materials."},
 {...task('c01-n13',"Drive the van to the city alley entrance",'RRRRRRLLRLLRRRR',1099,1000,'drive','outdoor-road'),objective:"Drive the van along existing connected roads to the city alley entrance. Reselect approximately 2.51 km Route, Matching the reference 15 diagnostic turns, Left and right directions do not need to match; Start and end points use newly adapted locations, Avoid placing the endpoint near an earlier route segment. Original SVG Keep."},
 task('c04-n03',"Drive the van and chase the motorcycle to the open-air market",'RRRRLRLLRRLRLRL',1136,1000,'drive','chase'),
 task('c02-n06',"Search for a hiding place along the freight cars",'LLLRRLRRLRLRRRLLLLLRL',1210,350,'walk','outdoor-foot'),
 task('c03-n03',"Follow Xiao Cha back to the cargo compartment door",'RRRRRLLLRL',1247,350,'walk','follow'),
 task('c01-n14',"Drive the box truck out of the freight yard",'RRLLRRRLL',1284,1000,'drive','outdoor-road'),
 task('c01-n15',"Drop off your companion at the leisure center",'RRLL',1321,1000,'drive','outdoor-road'),
 task('c03-n04',"Follow Xia o Zha along the railway tracks, then switch views",'L',1358,350,'walk','follow'),
 task('c01-n16',"Return from the canyon toward the home of Michael",'LRLLLRRRLLRLL',1432,1000,'drive','outdoor-road'),
 task('c01-n17',"Drive to the gun store",'LLL',1469,1000,'drive','outdoor-road'),
 task('c01-n18',"Drive to Lifeinvader Office",'RR',1506,1000,'drive','outdoor-road'),
 ...rescueData.map(route=>({...task(route.id,route.title,'LR',0,route.path.length,'drive','chase'),objective:"Drive the red convertible to catch the truck carrying a boat."+RESCUE_INSTRUCTION+" Pick up only the companion on the left, No second stage at the stern. Lateral error at the pickup point ≤1.8 meters, Vertical ≤4 meters, Heading Deviation ≤54°, Speed Difference from the Truck ≤10m/s; Deviation no greater than 0.35 seconds of accumulated pause time, Keep progress, Reset to zero when exceeded. Failed if the truck reaches the finish first. 750 meters: manual SVG Fit to scale, Keep all 5 nodes and left—turn right, Not a video-derived distance in meters. Add a continuous viaduct with solid piers in the coastal green space in Shenzhen, Does not represent real geography or the original GTA Accurate Scene. Driving defaults to third person, V You can switch views; F Enter or Exit Vehicle, Space to brake, R Return to Start. Both the model and the pickup animation are adapted, See asset credits for licensing."})),
 ...stairRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.length,'walk','stairs'),objective:`${route.source.descriptions.general}. Follow the actual steps when walking, No need to jump step by step; Space still works for jumping. Preserve the footprint shape SVG, Building height approximately 3.2 meters, The site and dimensions are estimated adaptations for Shenzhen. Reach the endpoint on the correct floor to finish. `})),
 ...manualWalks.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,100,'walk',route.category),
  objective:`Manual SVG Keep all turns, Planar route is about 100 meters. ${Object.values(route.source.descriptions).filter(Boolean).join('; ')}. Space: Jump; Vault or climb when facing a railing or low wall; Walk toward the ladder to grab on automatically, W/S Climbing Up and Down. Height, The site and props are estimated adaptations for Shenzhen, Not a metric measurement from the video. `,
 })),
 ...manualRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,1100,'drive','outdoor-road'),
  objective:`Manual SVG Native Road Adaptation · ${route.expectedTurns.map(t=>t==='left'?"turn left":"turn right").join(' → ')}. ${route.source.descriptions.general||route.source.descriptions.end}. Use the pixel path only for turn topology, Not a metric distance from the original video. `,
 })),
 ...allEscapeRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive','escape'),
  objective:`By labor SVG Keep all ${route.expectedTurns.length} Turn directions and order, Use GTA_SZ Native roads and buildings. ${Object.values(route.source.descriptions).filter(Boolean).join('; ')} Drive to the destination without being caught in front of a police car along the way 12 meters, 90° Complete when the sector sweeps over it. Add two pursuers when no police are visible on the minimap, From ahead, Approach from the side or rear edge, each 10 seconds, one more pursuer appears, Empty minimap fallback only fills gaps and does not reset the cycle. Distance adapted to native roads, Not a video measurement in meters. `,
 })),
 ...vanChaseRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive','chase'),
  objective:`By labor SVG Keep ${route.expectedTurns.length} Secondary turn directions and order, Use GTA_SZ Native Roads. ${Object.values(route.source.descriptions).filter(Boolean).join('; ')} Use a white van for the moving target ahead GLB, Catch up with it rather than just reach the route endpoint; Failed if the target reaches the finish first. This mission does not add police to pursue the player. Road length adapted to the native environment, Not a metric measurement from the video; Transport vehicle at Generic Van(PuKkBuMXDD, CC BY 3.0)Replace, Not recreated Humane Exclusive livery. `,
 })),
 ...pickupChaseRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive','chase'),
  objective:`Drive the pickup to chase the moving ${route.id==='c04-n08'?"Red convertible target vehicle":"White Van"}, Before the target reaches the finish, close the gap to 10 meters or less for success, Otherwise failed. This mission does not spawn police to pursue the player. ${Object.values(route.source.descriptions).filter(Boolean).join('; ')} Manual SVG of ${route.expectedTurns.length} turn directions, Preserve count and order, Use roads and buildings in the main city; Route length adapted to the main city, Not a metric measurement from the video. F Enter or Exit Vehicle, V View, R Road Reset. Pickup truck: Quaternius, CC0; ${route.id==='c04-n08'?"Target vehicle: Poly by Google, CC BY 3.0; The red convertible is an adaptation of the target appearance, Original trainer vehicle model not verified.":"Van: PuKkBuMXDD, CC BY 3.0; Reuse the source directory chase Category, Not Because of the Title Content\"Following\"Change to follow; The original rural trailer park exterior has not yet been recreated."}`,
 })),
 ...riverChaseRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive','chase'),objective:`Drive a tractor truck with an open trailer along dry ground on the right side of the canal to intercept the red sedan. Before the target reaches the finish, block it with a frontal collision and keep it moving slowly or stopped, Failed: target reached the finish first; Do not spawn police. Keep the original turn left and the earlier river channel section, The final section uses a wide, gentle right turn to avoid the original terrain, Total Length ${route.path.length} meters, This length is adapted for Shenzhen and was not measured from the video. Two Sets of Underpass Routes, The water flow on the left and solid slope adapt the native riverbank; Truck/The sedan is CC0 Low-Poly Model, Not the exact vehicle model from the original video. Driving defaults to third person. `})),
 ...hillChaseData.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive','chase'),objective:`driving SUV Drive from the tunnel toward the coastal mountain road, Cross the arched bridge and close in ahead SUV. Close in while driving before the target reaches the finish 10 meters or less for success, Failed: target reached the finish first; Do not spawn police. 600 meters, adapted for a Shenzhen coastal site, Retain manual SVG All 10 nodes, 7 Secondary turns and segment length ratios, Not a metric measurement from the video. Keep native rendering, Add continuous hills to the green space near the shore, Road, Guardrails and supported bridge openings; Not real mangrove terrain or GTA V Accurate Scene. Use an existing vehicle Baller Convert model, Vehicle model in original video/Colors still differ. F Enter or Exit Vehicle, Space to brake, R Return to Start, Driving defaults to third person, V You can switch views. `})),
 ...semiCityRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive','chase'),objective:`Drive a semi-truck with an open trailer along existing Shenzhen roads to chase the red sedan, Close in while driving 10 meters or less for success, Failed: target reached the finish first; Do not spawn police. Retain manual SVG of 12 turns and their order, about 5.72 km is the length adapted to the road network, Not Video Distance Estimation. Use native roads and buildings; Stadium in the video, The tunnel and final descent into the channel have not been recreated. CC0 Simplified vehicle models, F Enter or Exit Vehicle, Space to brake, R Return to Start; Driving defaults to third person, V You can switch views. `})),
 ...coastalChaseRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive','chase'),
  objective:`driving SUV Drive along the existing Shenzhen coastal expressway to chase the moving SUV; Target using ${NPC_DRIVE_SPEED.toFixed(1)} meters/seconds of driving(of the maximum player speed 60%), Close in while driving 10 meters or less for success, Failed if the target reaches the finish first, Do not spawn police pursuing the player. Retain manual SVG Topology without diagnostic turns, Drive along the gentle curve of the original road, Follow the one-way direction, Throughout the route, distance from the original coastline 500 meters or less. ${Object.values(route.source.descriptions).filter(Boolean).join('; ')} Route length adapted to Shenzhen, Not a metric measurement from the original video; Use existing vehicle models Baller Replace, The target car model in the original mission has not been verified, See the attribution file for asset sources and restrictions. F Enter or Exit Vehicle, V View, Space to brake. `,
 })),
 ...motorcycleRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'drive',route.category),
  objective:`Actual driving ${route.id==='c05-n13'?"Green":''} Motorcycle, Includes a rider character. ${Object.values(route.source.descriptions).filter(Boolean).join('; ')}. ${route.category==='follow'?"The accomplice rides a motorcycle along the route; Must stay with your accomplice throughout at 200 meters or less, Exceeding the distance limit immediately causes failure; Success requires your accomplice to reach the finish. This mission does not spawn police.":"Without being in front of the police car along the way 12 meters, 90° The red sector sweeps over, Complete by driving to the destination."}${route.id==='c05-n14'?"Start beside the vehicle, press F Transfer; Ride along the original coastal terrain, The entire route stays this far from the coast 200 meters or less.":"Use GTA_SZ Native roads and buildings."} Keep SVG of ${route.expectedTurns.length} turn sequence; Distance adapted for native use, Not a metric measurement from the video. F Enter or Exit Vehicle, V View, Space to brake; Riding poses are adapted programmatically, Retain native vehicle physics, Do not claim realistic motorcycle balance physics. Motorcycle: Poly by Google, CC BY 3.0; The exact motorcycle model from the original mission was not recreated. `,
 })),
 ...waterEscapeRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'swim','escape'),
  objective:`By labor SVG Scale all nodes proportionally to fit ${Math.round(route.path.length)} meter waterway, Preserve segment proportions and turn order. Drive the jet ski to the finish without moving in front of the pursuers along the way 12 meters, 90° A red sector indicates success; Swimming across does not count as completion. WASD driving, Space to slow down, Once fully stopped F Board or Leave Boat, V Switch View. Press Space to rise after entering the water, Ctrl Dive. Diving does not provide immunity within the horizontal capture area. The continuous artificial waterway within the native bay is an estimated adaptation, Not an exact recreation of the original canal appearance. Sea-Doo GTI: BoatUS Foundation, CC BY 4.0. `,
 })),
 {...task(SUBMARINE_TASK.id,SUBMARINE_TASK.title,'',0,SUBMARINE_TASK.path.length,'swim','water'),objective:"Pilot the small yellow submarine down to the base of the offshore facility, and drive into the underwater pipeline from the front. The entire boat must enter deep into the pipe to complete. W/S Forward and reverse, A/D Steering, Ctrl Dive, Space to rise; Look around with the mouse, V Switch View. Original Expanded Scene, Not an exact recreation of the original video."},
 ...waterRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'swim','water'),
  objective:`${Object.values(route.source.descriptions).filter(Boolean).join('; ')}. WASD swimming, Shift Accelerate, Space to rise, Ctrl Dive, Steer with the mouse or arrow keys, V Switch View. Reach the deep water entrance at a depth of about ${route.goalDepth} meters to complete. Planar route based on SVG Fit to scale; Length, Seabed and depth are estimated, Not Video Measurement. `,
 })),
 ...shoreRoutes.map(route=>({...task(route.id,route.title,'',0,route.path.length,'swim','water'),objective:`${Object.values(route.source.descriptions).filter(Boolean).join('; ')}. WASD swimming, Automatically switch to walking through shallow water, Then walk onto land to the finish. Space: Ascend in Water, Jump while standing; Ctrl Dive; V Switch View; R Restart. Must be standing on land to finish, Approaching through water does not count as success. SVG Preserve Shape, 90 meter route and shore slope adapted to the existing coastline, The river appearance from the original video was not recreated. `})),
 ...shoreBoatRoutes.map(route=>({...task(route.id,route.title,'',0,route.path.length,'swim','water'),objective:`${Object.values(route.source.descriptions).filter(Boolean).join('; ')}. Enter the water by walking from land, Automatic swimming in deep water, Swim to the left side of the boat and press F Board the boat. Complete the boarding action to succeed, Approaching the yellow marker will not complete the task automatically. WASD Move; Shift Accelerate; Space: Land jump, Ascend in Water; Ctrl Dive; V Switch View; R Restart. Keep SVG Straight Line Shape, 90 meter route and shoreline slopes are estimated adaptations of the original coastline, Neither metric measurement from the video nor a recreation of the original river appearance. Small boat model: Zodiac, RedC130, CC BY 4.0. `})),
 ...drivingBoatRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'swim','water'),objective:`${route.source.descriptions.general||"Pilot the boat along the coast"}. Start already on the boat, WASD driving, Space to slow down, Once fully stopped, press F Enter water/Approach the boarding point, then press F Board boat, V Switch View, R Return to the starting point on the boat. Reach the endpoint on the water to complete, Arrival by swimming failed; Draw only the route at intermediate turns, Not used as a criterion. Preserve in full SVG All Nodes, 600 meters and the bay position are approximate adjustments, Not Video Measurement. ${route.craft==='yacht'?"Use a yacht as manually instructed instead of the jet ski named in the original title, The current endpoint is on the water near shore, Not Driving onto the Beach. Model: motoryacht 35, angelo raffaele catalano, CC BY 4.0.":"Model: Zodiac, RedC130, CC BY 4.0."}`})),
 ...boatRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'swim','water'),
  objective:`${Object.values(route.source.descriptions).filter(Boolean).join('; ')}. WASD swimming / Pilot a boat, Shift Faster swimming, Space to rise / Boat Slowdown, Ctrl Dive, Beside the stern platform, press F Board or Leave Boat; V Switch View. ${route.objective==='swim-to-boat'?"Swim to the stern of the yacht at the finish to complete.":route.objective==='swim-then-board'?"After swimming to the yacht at the finish, Must follow F Board the boat to succeed.":"At the starting point, you must press F Board the boat, Then continue driving to the finish, Swimming across does not count as completion."} Planar route based on SVG Keep; The dimensions and bay location are estimated adaptations. ${route.sourceConflict?"Use the yacht as manually instructed, The submarine and riverside scenes from the original title were not recreated.":''} Yacht Model: motoryacht 35, angelo raffaele catalano, CC BY 4.0. `,
 })),
 ...beachBoatRoutes.map(route=>({...task(route.id,route.title,route.expectedTurns.map(t=>t==='left'?'L':'R').join(''),0,route.path.length,'swim','water'),objective:`${route.source.descriptions.general}. Start Aboard the Boat, WASD driving, Space to slow down; Follow the green route and turn left three times to reach the shallows, Complete when the entire boat hull reaches the endpoint on land, Stopping in the water does not count. After touching the shallows, slow down to 2.5m/s, Align the boat bottom with the continuous bank slope. After coming to a stop in deep water F Board or Leave Boat; Do not enter the water from the stern in the shallows, Reverse into deep water before leaving the boat. V Switch View, R Return to the starting point on the boat. SVG Keep all nodes, 600 meters, The shore slope and propulsion onto land are estimates adapted for the game, These are not metric measurements from the original video or real vessel physics. Use the yacht as manually instructed. Model: motoryacht 35, angelo raffaele catalano, CC BY 4.0. `})),
];

// Only the submarine retains the authored facility/chicane. Ordinary water
// tasks use their original annotated navigation and open coastal scenes.
{
 const item=TASKS.find(t=>t.id===SUBMARINE_TASK.id)!;
 const bends=nativeBends(SUBMARINE_TASK.path.points.map(p=>[p[0],p[1]]as V2));
 item.minLength=bends.length;item.expectedTurns=bends.turns.map(t=>t.direction);
 item.objective="Pilot the yellow submarine around the staggered breakwaters, Dive to the bottom of the offshore facility, Drive straight into the depths of the underwater tunnel. Turns along the way are not scoring checkpoints. Facilities have physical collision; Route adapted to the original difficulty, Not an exact recreation of the original video.";
}
const toRadians=(degrees:number)=>degrees*Math.PI/180;
for(const spec of WATER_TRANSFER_SPECS){
 const item=TASKS.find(t=>t.id===spec.id)!;item.title=spec.title!;item.minLength=spec.path.length;item.expectedTurns=[];
 item.objective="Reach the docking point at the distant offshore platform before the countdown ends.";
}
function turnAt(nodes:V2[],a:number,b:number,c:number):'L'|'R'|'U'|null{
 const p=nodes[a],q=nodes[b],r=nodes[c];
 const first=Math.atan2(q[0]-p[0],q[1]-p[1]);
 const second=Math.atan2(r[0]-q[0],r[1]-q[1]);
 const delta=(second-first+Math.PI)%(Math.PI*2)-Math.PI;
 if(Math.abs(delta)<toRadians(20))return null;
 if(Math.abs(delta)>toRadians(150))return 'U';
 return delta>0?'R':'L';
}

/** Small deterministic PRNG. It keeps native routes stable between runs. */
function random(seed:number){
 let value=(seed>>>0)||1;
 return ()=>{value=(Math.imul(value,1664525)+1013904223)>>>0;return value/0x100000000;};
}

function nativePath(graph:RoadGraph,item:NativeTask):NativePath|null{
 const {nodes,edges}=graph;
 if(nodes.length<3)return null;
 const nextRandom=random(item.seed);
 const expected=item.expectedTurns.map(t=>t==='left'?'L':'R');
 for(let trial=0;trial<24000;trial++){
  const start=Math.floor(nextRandom()*nodes.length);
  if(!edges[start]?.size)continue;
  const path=[start];
  const turns:V2[]=[];
  let previous=-1;
  let sequenceIndex=0;
  let length=0;
  for(let step=0;step<520;step++){
   const current=path[path.length-1];
   let candidates=[...(edges[current]?.keys()??[])].filter(id=>id!==previous);
   const recent=new Set(path.slice(-8));
   const fresh=candidates.filter(id=>!recent.has(id));
   if(fresh.length)candidates=fresh;
   for(let i=candidates.length-1;i>0;i--){const j=Math.floor(nextRandom()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
   let selected=-1;
   let selectedTurn:null|'L'|'R'=null;
   for(const candidate of candidates){
    const detected=previous<0?null:turnAt(nodes,previous,current,candidate);
    if(detected==='U')continue;
    if(detected!==null&&(sequenceIndex>=expected.length||detected!==expected[sequenceIndex]))continue;
    selected=candidate;selectedTurn=detected;break;
   }
   if(selected<0)break;
   if(selectedTurn!==null){turns.push(nodes[current]);sequenceIndex++;}
   previous=path[path.length-1];
   path.push(selected);
   const a=nodes[path[path.length-2]],b=nodes[selected];
   length+=Math.hypot(a[0]-b[0],a[1]-b[1]);
   if(sequenceIndex===expected.length&&length>=item.minLength){
    const first=nodes[path[0]],last=nodes[path.at(-1)!];
    // A valid turn sequence that immediately folds back on itself is not a
    // useful city route. Require a meaningful end-to-end displacement so the
    // minimap shows a corridor through the city instead of a local scribble.
    if(Math.hypot(first[0]-last[0],first[1]-last[1])>=Math.max(260,item.minLength*.24))return {points:path.map(id=>nodes[id]),turns,length};
   }
  }
 }
 return null;
}

// A few measured routes contain dozens of diagnostic bends that have no
// one-to-one equivalent in the Shenzhen road graph. Keep those tasks playable
// in the native city by using a long native-road corridor and preserving every
// audited checkpoint in order. The task remains explicitly marked as a
// topology fallback instead of silently claiming a geometric match.
function nativeFallbackPath(graph:RoadGraph,item:NativeTask):NativePath|null{
 const {nodes,edges}=graph;if(nodes.length<3)return null;
 const xs=nodes.map(p=>p[0]),zs=nodes.map(p=>p[1]);const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
 const routeLength=(points:V2[])=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
 // The previous fallback performed a random walk. On a dense city graph that
 // almost always revisited the same few blocks. Instead choose a spread-out
 // start cell and connect it to a far endpoint using GTA_SZ's own shortest
 // road route. This keeps the route continuous and makes the 2-D preview
 // geographically legible even when exact OffMapBench bends are unavailable.
 for(let trial=0;trial<72;trial++){
  const cell=(item.seed*17+trial*29)%64,sx=minX+((cell%8)+.5)/8*(maxX-minX),sz=minZ+(Math.floor(cell/8)+.5)/8*(maxZ-minZ);
  const start=graph.nearest([sx,sz]);if(!edges[start]?.size)continue;const origin=nodes[start];
  let endpoint=-1,endpointScore=Infinity;
  // Scan a deterministic, well-spaced sample of the full city so targets do
  // not collapse into the same neighbourhood for adjacent task seeds.
  const stride=37,offset=(item.seed+trial*11)%stride;
  const desiredDistance=Math.max(1100,item.minLength*1.45),maximumDistance=Math.max(2400,item.minLength*2.8);
  for(let i=offset;i<nodes.length;i+=stride){if(!edges[i]?.size)continue;const p=nodes[i],d=Math.hypot(p[0]-origin[0],p[1]-origin[1]);if(d<Math.max(480,item.minLength*.8)||d>maximumDistance)continue;const score=Math.abs(d-desiredDistance);if(score<endpointScore){endpointScore=score;endpoint=i;}}
  if(endpoint<0||endpoint===start)continue;
  const points=graph.route(origin,nodes[endpoint]);if(points.length<item.expectedTurns.length+2)continue;
  const length=routeLength(points),displacement=Math.hypot(points[0][0]-points.at(-1)![0],points[0][1]-points.at(-1)![1]);
  if(length<Math.max(item.minLength,900)||displacement<Math.max(420,item.minLength*.4))continue;
  const turns=item.expectedTurns.map((_,index)=>points[Math.min(points.length-2,Math.max(1,Math.round((index+1)*(points.length-1)/(item.expectedTurns.length+1))))]);
  return {points,turns,length,topologyFallback:true};
 }
 return null;
}

function pathLength(points:V2[]):number{
 return points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
}

/** Extend the audited-turn route to a task-specific native-city endpoint. */
function attachNativeEndpoint(graph:RoadGraph,item:NativeTask,path:NativePath):NativePath{
 const endpoint=item.endpoint;if(!endpoint)return path;
 const tail=graph.route(path.points.at(-1)!,endpoint.position);
 if(tail.length<2)return path;
 const points=[...path.points.slice(0,-1),...tail];
 return {...path,points,length:pathLength(points)};
}

function samplePath(path:NativePath,distance:number){
 const points=path.points;if(points.length<2)return {point:points[0]??[0,0] as V2,yaw:0};
 let remaining=Math.max(0,Math.min(distance,path.length));
 for(let i=1;i<points.length;i++){
  const a=points[i-1],b=points[i],length=Math.hypot(b[0]-a[0],b[1]-a[1]);
  if(remaining<=length||i===points.length-1){const t=length<.001?0:remaining/length;return {point:[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t] as V2,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};}
  remaining-=length;
 }
 const a=points.at(-2)!,b=points.at(-1)!;return {point:b,yaw:Math.atan2(b[0]-a[0],b[1]-a[1])};
}

function createNativePoliceView(world:DrivingWorld){
 const prototype=world.car.clone('native-police-prototype',null,false) as TransformNode|null;
 if(!prototype)return null;
 const policePrototype=prototype;
 prototype.setEnabled(true);
 const meshes=prototype.getChildMeshes(false).filter(m=>m.getTotalVertices()>0);
 const dark=new PBRMaterial('native-police-lightbar-mount',world.scene);dark.albedoColor.copyFromFloats(.012,.018,.026);dark.metallic=.55;dark.roughness=.3;
 const red=new PBRMaterial('native-police-red-lens',world.scene),blue=new PBRMaterial('native-police-blue-lens',world.scene);
 red.albedoColor.copyFromFloats(.55,.015,.025);blue.albedoColor.copyFromFloats(.01,.09,.55);
 for(const m of [red,blue]){m.roughness=.2;m.metallic=.15;}
 for(const mesh of meshes){mesh.isPickable=false;mesh.receiveShadows=true;const material=mesh.material;if(material){const clone=material.clone(`native-police-${material.name}`);if(clone)mesh.material=clone;}const target=mesh.material;if(target instanceof PBRMaterial&&/carpaint|vehicle[_-]?body|body[_-]?paint/i.test(target.name)){target.albedoColor.copyFromFloats(.025,.045,.075);target.metallic=.56;target.roughness=.25;target.clearCoat.isEnabled=true;target.clearCoat.intensity=.55;}}
 const bar=MeshBuilder.CreateBox('native-police-lightbar-mount',{width:1.2,height:.055,depth:.28},world.scene);bar.parent=prototype;bar.position.set(0,1.345,-.12);bar.material=dark;bar.isPickable=false;
 for(const [side,material] of [[-1,red],[1,blue]] as const){const lamp=MeshBuilder.CreateBox('native-police-lightbar-lens',{width:.48,height:.14,depth:.24},world.scene);lamp.parent=policePrototype;lamp.position.set(side*.29,1.44,-.12);lamp.material=material;lamp.isPickable=false;}
 policePrototype.setEnabled(false);
 const active=new Map<string,{root:TransformNode;meshes:AbstractMesh[];spin:number}>();
 function update(units:readonly PoliceUnit[],dt:number){
  const ids=new Set(units.map(unit=>unit.id));
  for(const [id,actor] of active)if(!ids.has(id)){actor.root.dispose(false,false);active.delete(id);}
  const flash=Math.floor((world.time??0)*5)%2===0;red.emissiveColor.copyFromFloats(flash?2.2:.12,.005,.008);blue.emissiveColor.copyFromFloats(.005,.025,flash?.12:2.2);
  for(const unit of units){let actor=active.get(unit.id);if(!actor){const root=policePrototype.clone(unit.id,null,false) as TransformNode|null;if(!root)continue;root.setEnabled(true);const childMeshes=root.getChildMeshes(false);for(const mesh of childMeshes){mesh.isPickable=false;mesh.receiveShadows=true;}actor={root,meshes:childMeshes,spin:0};active.set(unit.id,actor);}actor.root.position.set(unit.position.x,unit.position.y+.115,-unit.position.z);actor.root.rotation.set(0,-unit.yaw,0);actor.spin+=unit.speed*dt/.4404;for(const mesh of actor.meshes)if(/wheel_[lr][fr]_/.test(mesh.name))mesh.rotation.x=actor.spin;}
  world.nativePoliceMeshes=[...active.values()].flatMap(actor=>actor.meshes);
 }
 function dispose(){for(const actor of active.values())actor.root.dispose(false,false);active.clear();policePrototype.dispose(false,false);world.nativePoliceMeshes=[];}
 return {update,dispose};
}

export function createNativeTaskSystem(world:DrivingWorld,graph:RoadGraph,options:Options){
 const training=options.trainingWalkDataset?parseWalkDataset(options.trainingWalkDataset):undefined;
 const outdoor=options.trainingOutdoorDataset?parseOutdoorDataset(options.trainingOutdoorDataset):undefined;
 const unified=options.trainingDataset?parseTrainingDataset(options.trainingDataset):undefined;
 if([training,outdoor,unified].filter(Boolean).length>1)throw Error('Choose one training dataset per game');
 // c09-n03 now uses its bank/warehouse interior instead of the older street adaptation.
 const tasks:NativeTask[]=[...TASKS,...NATIVE_AIR_TASKS,...staticCatalog.map(row=>({id:row.id,title:row.title,objective:row.instruction,category:row.category,mode:'shooting' as const,expectedTurns:[],seed:1234,minLength:0}))].filter(t=>benchmarkTaskIds.has(t.id)).filter((t,i,a)=>a.findIndex(other=>other.id===t.id)===i).map(t=>t.category==='chase'&&t.id!=='c04-n04'?{...t,objective:NATIVE_TARGET_VEHICLES[t.id]?.startsWith('motorcycle')?"Knock over the target motorcycle three times while driving. Wait for the target to recover after each knockdown, Separate before colliding again; Continuous ramming counts only once. The mission is failed if the target reaches the finish first.":"Drive ahead of the target vehicle and collide, And keep blocking it until it slows to a stop; Only near, Rear-end collisions or sideswipes do not complete the task. The mission is failed if the target reaches the finish first."}:t);
 for(const row of training?.tasks??[]){
  if(tasks.some(t=>t.id===row.id))throw Error('Training task cannot overwrite benchmark task '+row.id);
  tasks.push({id:row.id,title:row.title,objective:row.instruction.en,expectedTurns:[],seed:row.seed,minLength:row.length,mode:'walk',category:'outdoor-foot',trainingWalk:row});
 }
 for(const row of outdoor?.tasks??[]){
  if(tasks.some(t=>t.id===row.id))throw Error('Training task cannot overwrite benchmark task '+row.id);
  tasks.push({id:row.id,title:row.title,objective:row.instruction.en,expectedTurns:[],seed:row.seed,minLength:row.length,mode:row.vehicle==='boat'?'swim':row.vehicle,category:row.category,trainingOutdoor:row});
 }
 for(const row of unified?.tasks??[]){
  if(tasks.some(t=>t.id===row.id))throw Error('Training task cannot overwrite benchmark task '+row.id);
  const o=row.outdoor;
  tasks.push({id:row.id,title:row.title,objective:row.instruction.en,expectedTurns:[],seed:row.seed,minLength:row.resolved.length??0,mode:row.shooting?'shooting':row.flight?'flight':o?o.vehicle==='boat'?'swim':o.vehicle:'walk',category:row.category,trainingTask:row,...o?{trainingOutdoor:o}:{}});
 }
 const pathCache=new Map<string,NativePath>();
 const routeProgress=new MinimapRouteProgress();
 let turnDistances:number[]=[],previousPosition:V2=[0,0],travelEpoch=world.debugEpoch;
 const button=document.createElement('button');button.id='native-task-button';button.innerHTML="Native Task <kbd>N</kbd>";
 const panel=document.createElement('section');panel.id='native-task-panel';panel.hidden=true;panel.innerHTML=`
  <div class="native-task-card" role="dialog" aria-modal="true" aria-label="Tasks">
   <button id="native-task-close" class="native-task-close" aria-label="Close">×</button>
   <label class="native-task-select">Category<select id="native-task-category"></select></label>
   <label class="native-task-select">Task<select id="native-task-picker"></select></label>
   <section class="native-task-instruction" aria-labelledby="native-task-instruction-label">
    <div id="native-task-instruction-label">Instruction</div>
    <p id="native-task-objective" class="native-task-objective"></p>
   </section>
   <div class="native-task-actions"><button id="native-task-start" class="primary">Start task</button><button id="native-task-stop">End task</button></div>
  </div>`;
 document.body.append(button,panel);
 const climbPrompt=document.createElement('div');climbPrompt.id='climb-prompt';climbPrompt.hidden=true;climbPrompt.setAttribute('role','status');(document.querySelector('#ui')??document.body).append(climbPrompt);
 const interiorHint=document.createElement('div');interiorHint.id='native-interior-hint';interiorHint.hidden=true;interiorHint.setAttribute('role','status');(document.querySelector('#ui')??document.body).append(interiorHint);
 const rescueHud=createNativeRescueHud(document.querySelector<HTMLElement>('#ui')??document.body);
 const escapeHud=document.createElement('div');escapeHud.id='native-escape-hud';escapeHud.hidden=true;(document.querySelector('#ui')??document.body).append(escapeHud);
 const timerHud=document.createElement('div');timerHud.id='native-task-countdown';timerHud.hidden=true;
 timerHud.innerHTML='<span>TIME LEFT</span><strong></strong>';(document.querySelector('#ui')??document.body).append(timerHud);
 let roadsideStart:RoadsideStart|null=null;
 let carChoice:CarChoiceLayout|null=null;
 function updateTimerHud(){
  timerHud.hidden=!timeLimitEnabled()||!state.active||!(ROADSIDE_START_TASKS.has(current().id)||WATER_TRANSFER_IDS.has(current().id)||current().trainingTask?.timeLimit?.showCountdown)||state.maxDuration<=0||!panel.hidden||result.open;
  if(!timerHud.hidden){timerHud.querySelector('strong')!.textContent=remainingTimeText(state.maxDuration,state.elapsed);timerHud.dataset.urgent=String(state.maxDuration-state.elapsed<=10);}
 }
 function updateEscapeHud(){
  escapeHud.hidden=!state.active||current().category!=='escape'||!!world.paused||!!world.observer?.active||result.open||!panel.hidden;
  if(!escapeHud.hidden)escapeHud.textContent=escapeSurvivalHint(state.elapsed,police?.exposureSeconds??0,police?.unscannedSeconds??0);
 }
 const picker=panel.querySelector<HTMLSelectElement>('#native-task-picker')!;
 const category=panel.querySelector<HTMLSelectElement>('#native-task-category')!;
 const objective=panel.querySelector<HTMLElement>('#native-task-objective')!;
 const startButton=panel.querySelector<HTMLButtonElement>('#native-task-start')!;
 const stopButton=panel.querySelector<HTMLButtonElement>('#native-task-stop')!;
 const state:State={active:false,complete:false,failed:false,checkpoint:0,elapsed:0,maxDuration:0,startedAt:0,lastUi:0,path:null,target:null,targetYaw:0,targetDistance:0,police:[]};
 const evalTimePolicy=evaluationTimePolicy(location.search);
 const timeLimitEnabled=()=>!!current().trainingTask?.timeLimit||taskTimeLimitEnabled(current().category,evalTimePolicy,current().id);
 let police:NavigationPolicePursuit|null=null;
 let npc:NativeNpcObjective|NativeVehicleNpc|null=null,npcView:NativeNpcView|GeneratedWaterTargetView|null=null;
 let rescue:NativeCompanionRescue|null=null,rescueView:NativeCompanionRescueView|null=null;
 function clearRescue(){rescueHud.hide();rescueView?.dispose();rescueView=null;rescue=null;if(world.nativeFootSite instanceof NativeRescueBridgeSite)world.nativeFootSite.dynamicBlocked=null;}
 let policeView:ReturnType<typeof createNativePoliceView>|NativeWaterPoliceView|NativeFootPoliceView|null=null;
 let barrierView:ReturnType<typeof createNativeBarrierView>|null=null;
 let waterSite:NativeSubmarineSite|NativeWaterSite|NativeBoatSite|NativeShoreSite|NativeShoreBoatSite|null=null;
 function clearWaterSite(){if(!waterSite)return;if(world.taskVehicle===waterSite)world.taskVehicle=null;waterSite.dispose();waterSite=null;world.car.setEnabled(true);}
 function clearBarrier(){barrierView?.dispose();barrierView=null;world.nativeTaskBarriers=[];world.nativeTaskMeshes=waterSite?.meshes??world.nativeFootSite?.meshes??[];}
 function clearFootSite(){interiorHint.hidden=true;const reserved=world.nativeFootSite&&'vegetationReserved' in world.nativeFootSite;world.nativeFootSite?.dispose();world.nativeFootSite=null;world.nativeTaskMeshes=[];if(reserved)world.vegetation();}
 let flightState:NativeFlightMission|null=null,flightTarget:ReturnType<typeof createNativeFlightTarget>|null=null,flightEpoch=0;
 let climbState:NativeClimbMission|null=null,climbEpoch=0;
 let starting=false,disposed=false;
 let stateTaskId='';
 const taskPicker=createNativeTaskPicker(category,picker,tasks,()=>render());
 const result=createNativeTaskResult(tasks,{
  restart:id=>{taskPicker.select(id);void start();},
  switchTask:id=>{taskPicker.select(id);void start();},
  resume:()=>{result.close();climbState=null;options.clearRoute();world.paused=false;world.taskFlightPaused=false;world.keys.clear();world.canvas.focus();render();},
  disembark:()=>{if(!world.exitAircraft())return;result.close();flightTarget?.dispose();flightTarget=null;flightState=null;world.flightMissionText=null;options.clearRoute();render();world.canvas.focus();},
 });
 function current(){return tasks.find(item=>item.id===picker.value)??tasks[0];}
 function pauseInput(){escapeHud.hidden=true;world.paused=true;world.taskFlightPaused=true;world.keys.clear();world.drag=false;releaseOffmapPointerLock();}
 function setOpen(open:boolean){if(result.open||starting)return;if(open)options.prepareStart?.();panel.hidden=!open;world.keys.clear();if(open){pauseInput();render();picker.focus();}else{world.paused=!!world.flight?.active;world.taskFlightPaused=false;document.querySelector<HTMLCanvasElement>('#game')?.focus();}}
 function render(){
  updateTimerHud();
  const item=current();
  const instruction=item.trainingTask?.instruction.en??item.trainingOutdoor?.instruction.en??item.trainingWalk?.instruction.en??benchmarkInstructions.instructions[item.id as keyof typeof benchmarkInstructions.instructions];
  objective.textContent=typeof instruction==='string'&&instruction.trim()?instruction:'play the game';
  startButton.disabled=state.active||starting;stopButton.disabled=!state.active||starting;picker.disabled=category.disabled=state.active||starting;
 }
 function nativeLandmark(id:string,name:string,p:V2,preferExact=false):Landmark{
  const near=world.collision.nearest(p[0],p[1]);
  const arrival:V2=preferExact?p:(near?[near.x,near.z]:p);
  return {id,name,x:arrival[0],z:arrival[1],height:0,excludeRadius:0,area:"GTA_SZ Native Task",arrival,yaw:near?.yaw??0};
 }
 function nativePoliceTask(item:NativeTask,path:NativePath,start:Landmark){
  const water=waterSite instanceof NativeBoatSite&&item.category==='escape'?waterSite:null;
  const swimmer=item.trainingOutdoor?.vehicle==='swim'&&waterSite instanceof NativeWaterSite?waterSite:null;
  const height=(x:number,z:number)=>water?water.spec.waterHeight:swimmer?swimmer.spec.waterHeight:world.groundHeight(x,z);
  return {task:{id:item.id,title:item.title},player:{spawn:{position:[start.arrival[0],height(start.arrival[0],start.arrival[1]),-start.arrival[1]],yaw:-start.yaw}},goal:{position:[path.points.at(-1)![0],height(path.points.at(-1)![0],path.points.at(-1)![1]),-path.points.at(-1)![1]],tolerance:24},navigation:{path:path.points.map(p=>[p[0],height(p[0],p[1]),-p[1]]),mode:swimmer?'walk':water?'boat':item.mode,category:'escape',title:item.title,objective:item.objective,setting:'GTA_SZ native city',indoors:false}} as any;
 }
 function clearFlight(){flightTarget?.dispose();flightTarget=null;if(flightState||world.flight?.active){world.exitPhoto();world.taskFlightPaused=false;}flightState=null;world.flightMissionText=null;if(world.flightCarRemoved)world.setFlightCarRemoved(false);}
 function clearDrive(){world.cancelVehicleBoarding();world.setCarWaterEnabled?.(false);world.nativeDrivingThirdPerson=false;world.roadsideFootSpawn=null;if(world.routeVehicleMission){world.traffic?.removeMission(world.routeVehicleMission);world.traffic?.update(0,world.actor.x,world.actor.z);}world.routeVehicleMission=null;roadsideStart=null;carChoice=null;world.clearCarChoices();world.clearNativeDriveModel?.();}
 function clearStatic(){world.staticTask?.dispose();world.staticTask=null;}
 async function start(atAircraft=false){
  if(state.active||starting||disposed)return;
  options.prepareStart?.();
  starting=true;result.setBusy(true);pauseInput();render();
  const item=current();
  stateTaskId=item.id;
  state.complete=false;state.failed=false;state.elapsed=0;state.maxDuration=0;state.checkpoint=0;state.npc=undefined;
  try{
  // Every task starts in clear daylight, including restarts and aircraft/ladder branches.
  clearStatic();
  // This is a startup default; manual lighting/weather changes remain available while playing.
  if(world.raining)world.toggleRain();
  world.setLightMode('day');
  clearFlight();climbState=null;pauseInput();
  world.view=0;world.walkFirstPerson=false;world.cameraPitch=.22;
  if(item.mode==='shooting'){
   clearActors();clearWaterSite();clearFootSite();clearDrive();world.stopNativeWalk();world.cancelAutoDrive('static-task');
   state.path=null;options.clearRoute();
   const pair=item.trainingTask?.shooting;
   const row=pair?{id:item.id,sourceId:pair.pair.sourceId,kind:'shooting',config:pair.pair.config,initialAim:pair.initialAim}:staticCatalog.find(row=>row.id===item.id)!;
   world.staticTask=await loadStaticShootingSite(row,{seed:(world as any).__staticSeed??item.seed,paused:()=>world.paused,onChange:()=>tick(0)});
   if(disposed){clearStatic();return;}
   state.active=true;state.startedAt=performance.now();result.close();panel.hidden=true;world.paused=false;world.taskFlightPaused=false;world.keys.clear();render();return;
  }
  if(item.mode==='flight'){
   clearActors();clearWaterSite();clearFootSite();clearDrive();
   const config=item.trainingTask?.flight??nativeFlightConfig(item.id);
   world.disposeNativeTargetVehicle();policeView?.dispose();policeView=null;police=null;world.nativePoliceMeshes=[];state.police=[];
   if(world.observer.active)world.exitPhoto();
   if(!atAircraft){world.travel(NATIVE_FLIGHT_LAUNCH,{deferStreaming:true});if(!await world.startNativeWalk(NATIVE_FLIGHT_LAUNCH))throw Error("Ground character setup failed, Please restart.");}
   world.setFlightCarRemoved(true);
   pauseInput();const flight=world.flight;if(!flight)throw Error("Mission aircraft unavailable");await flight.load(config.model);
   if(disposed)return;
   if(!flight.park(config.spawn,config.yaw))throw Error("Ground aircraft setup failed, Please restart.");
   flightState=item.trainingTask?.flight?new TrainingFlightMission(config,item.trainingTask.maxDuration):new NativeFlightMission(item.id);state.maxDuration=flightState.maxDuration;flightTarget=createNativeFlightTarget(world,flightState);flightTarget.update(flightState,0);flightEpoch=world.debugEpoch;
   state.active=true;state.startedAt=performance.now();state.lastUi=0;state.targetYaw=config.yaw;
   updateFlightRoute();world.flightMissionText=flightState.instruction;
   result.close();panel.hidden=true;world.paused=false;world.taskFlightPaused=false;world.keys.clear();world.canvas.focus();
   options.toast(item.id.toUpperCase()+" · Set off from ground level in the urban area, Approach the aircraft door and press F Board aircraft");render();return;
  }
  if(item.id==='c07-n04'){
   clearActors();clearWaterSite();clearFootSite();clearDrive();
   const site=world.climbSite;if(!site||!world.walk)throw Error("The urban ladder climbing scene is not ready yet, Please try again.");
   world.disposeNativeTargetVehicle();policeView?.dispose();policeView=null;police=null;state.police=[];
   if(world.observer.active)world.exitPhoto();
   if(!atAircraft){world.travel(CLIMB_START,{deferStreaming:true});if(!await world.startNativeWalk(CLIMB_START))throw Error("Walking character preparation failed, Please restart.");}
   if(!await world.ensureRider())throw Error("Walking character preparation failed, Please restart.");
   if(disposed)return;
   climbState=new NativeClimbMission(site,world.walk);climbEpoch=world.debugEpoch;state.maxDuration=climbState.maxDuration;
   state.active=true;state.startedAt=performance.now();state.lastUi=0;state.target=[site.goal.x,site.goal.z];state.targetDistance=0;
   state.path={points:[[world.walk.x,world.walk.z],[site.ladder.x,site.ladder.z],[site.goal.x,site.goal.z]],turns:[],length:11};
   previousPosition=[world.walk.x,world.walk.z];travelEpoch=world.debugEpoch;routeProgress.reset();routeProgress.update(state.path.points,previousPosition);
   options.setRoute({...CLIMB_START,id:'native:climb-goal',name:"Factory Roof",arrival:state.target,x:site.goal.x,z:site.goal.z},state.path.points);
   result.close();panel.hidden=true;world.paused=false;world.taskFlightPaused=false;world.keys.clear();world.canvas.focus();
   options.toast('c07-n04 · '+climbState.instruction+" · Space to jump");render();return;
  }
  const walkSpec=manualWalks.find(route=>route.id===item.id);
  if(item.id==='c02-n05')clearFootSite();
  const garden=item.id==='c02-n05'?findGardenLayout(world.data,{blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),heightAt:world.groundHeight,roadAt:(x,z)=>world.collision.nearest(x,z)}):null;
  const generatedRoom=item.trainingTask?.interior;
  const interiorSpec=generatedRoom?{...NATIVE_INTERIORS.find(s=>s.theme==='reference')!,id:item.id,title:item.title,points:generatedRoom.layout.points,length:item.minLength}:NATIVE_INTERIORS.find(spec=>spec.id===item.id);
  let interiorSite:NativeInteriorSite|null=null;
  if(interiorSpec){
   clearActors();clearWaterSite();clearFootSite();clearDrive();
   const placement=generatedRoom?.placement??findInteriorPlacement(interiorSpec,{height:world.groundHeight,blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),roadAt:(x,z)=>world.collision.nearest(x,z),land:(x,z)=>world.data.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(h=>inRing(x,z,h)))});
   interiorSite=new NativeInteriorSite(world.scene,interiorSpec,placement,world.groundHeight,generatedRoom?.layout);world.nativeFootSite=interiorSite;
   await interiorSite.load();if(disposed){interiorSite.dispose();return;}interiorSite.attachGround(world);world.nativeTaskMeshes=interiorSite.meshes;
  }
  const manual=annotatedDrivingRoutes.find(route=>route.id===item.id);
  const generatedWater=item.trainingOutdoor&&['swim','boat'].includes(item.trainingOutdoor.vehicle)?outdoorWaterSpec(item.trainingOutdoor,world.coastal?.manifest.waterHeight??-.25):undefined;
  const boat=(item.trainingOutdoor?.vehicle==='boat'?generatedWater:(boatRoutes.find(route=>route.id===item.id)??drivingBoatRoutes.find(route=>route.id===item.id)??beachBoatRoutes.find(route=>route.id===item.id)??waterEscapeRoutes.find(route=>route.id===item.id))) as (BoatSpec&{expectedTurns:Turn[]})|undefined;
  const shoreBoat=waterTransferSpec(item.id)??shoreBoatRoutes.find(route=>route.id===item.id) as ShoreBoatSpec|undefined;
  const stairSpec=stairRoutes.find(route=>route.id===item.id);
  // Remove the previous owned site before probing this task's placement.
  if(stairSpec)clearFootSite();
  const stairs=stairSpec?findStairLayout(stairSpec,graph.nodes,{blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),heightAt:(x,z)=>world.groundHeight(x,z),roadAt:(x,z)=>world.collision.nearest(x,z)}):null;
  const shore=shoreRoutes.find(route=>route.id===item.id);
  const submarine=item.id===SUBMARINE_TASK.id;
  const water=generatedWater??(submarine?SUBMARINE_TASK:null)??shoreBoat??waterRoutes.find(route=>route.id===item.id)??boat??shore;
  let path:NativePath|null=interiorSite?{points:interiorSite.points,turns:[],length:interiorSpec!.length}:stairs?{points:stairs.points,turns:nativeBends(stairs.points).turns.map(t=>stairs.points[t.index]),length:stairs.spec.length,turnDirections:stairSpec!.expectedTurns as Turn[]}:pathCache.get(item.id)??(()=>{
   if(item.trainingWalk){const points=item.trainingWalk.points.map(p=>[...p] as V2),audit=nativeBends(points);return {points,turns:audit.turns.map(t=>points[t.index]),length:audit.length};}
   if(item.trainingOutdoor){const points=item.trainingOutdoor.points.map(p=>[...p] as V2),audit=nativeBends(points);return {points,turns:audit.turns.map(t=>points[t.index]),length:audit.length};}
   if(garden)return {points:garden.points,turns:nativeBends(garden.points).turns.map(t=>garden.points[t.index]),length:garden.length};
   if(water){const points=water.path.points.map(p=>[p[0],p[1]] as V2),bends=nativeBends(points);return {points,turns:bends.turns.map(t=>points[t.index]),length:water.path.length};}
   if(walkSpec){const points=walkSpec.path.points.map(p=>[p[0],p[1]] as V2);return {points,turns:walkSpec.path.turns.map(t=>points[t.index]),length:walkSpec.path.length,turnDirections:walkSpec.expectedTurns as Turn[]};}
   if(manual){const points=manual.path.points.map(p=>[p[0],p[1]] as V2);return {points,turns:manual.path.turns.map(t=>points[t.index]),length:manual.path.length,turnDirections:manual.expectedTurns as Turn[]};}
   const reviewed=reviewedNativeWalkRoute(item.id)??reviewedNativeRoadRoute(graph,item.id,item.expectedTurns.length);
   if(reviewed)return reviewed;
   const base=nativePath(graph,item)??nativeFallbackPath(graph,item);
   if(!base)return null;
   // Legacy paths stay intact unless a reviewed replacement exists above.
   const adjusted=item.id==='c01-n05'?{...base,...removeClosedRoadLoops(base.points)}:item.id==='c01-n06'?{...base,...m03n02TurnaroundRoute(graph,base.points)}:['c01-n12','c01-n13'].includes(item.id)?{...base,...calibratedM06Route(graph,item.id,base.points)}:base;
   return item.mode==='walk'?shortNativeWalkRoute(base.points):item.id==='c01-n10'?adjusted:attachNativeEndpoint(graph,item,adjusted);
  })();
  if(interiorSite){const points=interiorSite.navigationPoints;path={points,turns:[],length:pathLength(points)};}
  if(garden)path={points:garden.points,turns:nativeBends(garden.points).turns.map(t=>garden.points[t.index]),length:garden.length};
  if(!path||path.points.length<2)throw Error("Native road route generation failed, Restart or choose another task.");
  if(item.id===CAR_CHOICE_TASK){
   // Vehicle choice replaces reference detours, retaining origin/destination.
   const points=graph.route(path.points[0],path.points.at(-1)!);if(points.length<2)throw Error("No connected road from the parking area to the vehicle shop");
   const bends=nativeBends(points);path={points,length:bends.length,turns:bends.turns.map(t=>points[t.index]),turnDirections:bends.turns.map(t=>t.direction)};
  }
  pathCache.set(item.id,path);
  clearRescue();clearBarrier();if(!interiorSite)clearFootSite();clearWaterSite();clearDrive();
  // The old hard-coded endpoint is on a disconnected road component and was
  // silently ignored by attachNativeEndpoint. Build near the actual route end.
  const showroomPlacement=item.id==='c01-n10'?findShowroomPlacement(graph,path.points.at(-1)!,{blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),heightAt:(x,z)=>world.groundHeight(x,z),roadAt:(x,z)=>world.collision.nearest(x,z)}):null;
  if(showroomPlacement){const tail=graph.route(path.points.at(-1)!,showroomPlacement.originalGoal);if(!tail.length)throw Error("Vehicle shop access road is disconnected");const points=[...path.points.slice(0,-1),...tail,showroomPlacement.approach,showroomPlacement.door,showroomPlacement.goal];path={...path,points,length:pathLength(points)};}
  const garagePlacement=item.id==='c02-n02'?findGaragePlacement(path.points,{blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),heightAt:(x,z)=>world.groundHeight(x,z),roadAt:(x,z)=>world.collision.nearest(x,z)}):null;
  if(garagePlacement){const points=[...path.points,garagePlacement.approach,garagePlacement.door,garagePlacement.goal];path={...path,points,length:pathLength(points)};}
  const pickupLayout=item.id==='c07-n01'?findPickupClimbLayout(path.points,{blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),heightAt:(x,z)=>world.groundHeight(x,z),roadAt:(x,z)=>world.collision.nearest(x,z)}):null;
  if(pickupLayout){const points=[...path.points,pickupLayout.approach,...pickupLayout.links.flatMap(l=>[[l.from.x,l.from.z] as V2,[l.to.x,l.to.z] as V2]),pickupLayout.goal];path={...path,points,length:pathLength(points)};}
  const start=nativeLandmark(`native:${item.id}:start`,`${item.id} Start point`,item.trainingOutdoor?.playerSpawn.point??path.points[0],!!item.trainingOutdoor||!!interiorSite||!!manual||item.mode!=='drive');
  // Apply to every route, not an ID whitelist: nearest-road yaw follows the
  // source polyline ordering and can point against the actual mission route.
  start.yaw=nativeRouteStartYaw(path.points,start.yaw);
  if(item.trainingOutdoor)start.yaw=item.trainingOutdoor.playerSpawn.yaw;
  if(item.trainingTask?.resolved.heading!==undefined&&item.trainingTask?.resolved.heading!==null)start.yaw=item.trainingTask.resolved.heading*Math.PI/180;
  if(item.id===CAR_CHOICE_TASK)carChoice=findCarChoiceParking(path.points,{
   routeLength:(x,z)=>pathLength(graph.route([x,z],path!.points.at(-1)!)),
   roadAt:(x,z)=>world.collision.nearest(x,z),blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),
   walkClear:(x,z)=>!!world.walk?.clear(x,z,world.walkingSurfaceHeight(x,z)),heightAt:world.groundHeight,
  },((world as any).__staticSeed??Math.floor(Math.random()*0xffffffff))^item.seed);
  if(ROADSIDE_START_TASKS.has(item.id)){
   roadsideStart=findRoadsideStart(path.points,item.id,roadsideLayoutSeed(item.id),{
    roadAt:(x,z)=>world.collision.nearest(x,z),blocked:(x,z)=>world.collision.blocked(x,z)||world.propBlocked(x,z),
    walkClear:(x,z)=>!!world.walk?.clear(x,z,world.walkingSurfaceHeight(x,z)),heightAt:world.groundHeight,
   });
  }
  const goal=nativeLandmark(`native:${item.id}:goal`,pickupLayout?"Roof window beside the pickup":garagePlacement?"Inside the garage":item.endpoint?.label??`${item.id} Native Endpoint`,path.points.at(-1)!,!!interiorSite||!!manual||!!item.endpoint||item.mode!=='drive');
  npcView?.dispose();npcView=null;npc=null;world.disposeNativeTargetVehicle();policeView?.dispose();policeView=null;police=null;world.nativePoliceMeshes=[];state.police=[];
  world.stopNativeWalk();
  world.nativeDrivingThirdPerson=false; // Default third-person at start, not a permanent camera lock.
  world.travel(start,{deferStreaming:true});pauseInput();world.cancelAutoDrive('native-task-start');world.keys.clear();
  const drive=item.trainingOutdoor?.vehicle==='drive'?{kind:'sports-car' as const,startOnFoot:false}:NATIVE_DRIVE_ASSIGNMENTS[item.id];
  if(drive){await world.setNativeDriveModel(drive.kind);if(disposed){clearDrive();return;}
   if(drive.startOnFoot){const x=start.arrival[0]-Math.cos(start.yaw)*2,z=start.arrival[1]+Math.sin(start.yaw)*2;if(!world.walk?.clear(x,z))throw Error("SUV with no safe starting point for boarding nearby");if(!await world.startNativeWalk({...start,arrival:[x,z]}))throw Error("Character preparation for vehicle transfer failed");}
  }
  const goalLandmark=item.trainingWalk?.goalLandmark??item.trainingOutdoor?.goalLandmark;
  const footSpec=walkSpec??(item.mode==='walk'&&(WALK_VEHICLES[item.id]||garden||goalLandmark)?{id:item.id,...garden?{garden}:{},...goalLandmark?{goalLandmark}:{},path:{points:path.points,length:path.length,roof:null,building:null},requirements:{startVehicle:null,endVehicle:null,vault:false,stairs:false,warehouse:false,entrance:false,policeLine:false}}:null);
  if(footSpec&&!pickupLayout&&!interiorSite){const site=new NativeFootSite(footSpec,world);world.nativeFootSite=site;await site.loadVehicles();if(disposed){site.dispose();return;}world.nativeTaskMeshes=site.meshes;if(item.id==='c02-n15')world.vegetation();}
  if(pickupLayout){const site=new NativePickupClimbSite(world,pickupLayout,path.points);world.nativeFootSite=site;await site.load();if(disposed){site.dispose();return;}world.nativeTaskMeshes=site.meshes;}
  if(garagePlacement){const site=new NativeGarageSite(world.scene,garagePlacement);await site.load();if(disposed){site.dispose();return;}world.nativeFootSite=site;world.nativeTaskMeshes=site.meshes;}
  if(showroomPlacement){const site=new NativeShowroomSite(world.scene,showroomPlacement,world.groundHeight);world.nativeFootSite=site;site.attachGround(world);world.nativeTaskMeshes=site.meshes;}
  if(stairs){const site=new NativeStairSite(world.scene,stairs);world.nativeFootSite=site;world.nativeTaskMeshes=site.meshes;}
  const hill=hillChaseData.find(route=>route.id===item.id);
  const rescueSpec=rescueData.find(route=>route.id===item.id);
  if(rescueSpec){const site=new NativeRescueBridgeSite(world.scene,rescueSpec,world.groundHeight);world.nativeFootSite=site;site.attachGround(world);world.nativeTaskMeshes=site.meshes;world.cull();}
  if(hill){const site=new NativeHillSite(world.scene,hill,world.groundHeight);world.nativeFootSite=site;site.attachGround(world);world.nativeTaskMeshes=site.meshes;world.vegetation();world.cull();}
  const farm=farmEscapeData.find(route=>route.id===item.id);
  if(farm){const site=new NativeFarmSite(world.scene,farm,world.groundHeight);world.nativeFootSite=site;world.nativeTaskMeshes=site.meshes;world.cull();}
  const flood=[...floodEscapeData,...riverChaseData].find(route=>route.id===item.id);
  if(flood){const site=new NativeFloodSite(world.scene,flood,world.groundHeight);world.nativeFootSite=site;await site.load();if(disposed){site.dispose();return;}site.attachGround(world);world.nativeTaskMeshes=site.meshes;world.cull();}
  if(water){
   const land=(x:number,z:number)=>world.data.land.some(p=>inRing(x,z,p[0])&&!p.slice(1).some(h=>inRing(x,z,h)));
   const shoreEnv={land,heightAt:(x:number,z:number)=>world.groundHeight(x,z),blocked:(x:number,z:number)=>land(x,z)&&world.collision.blocked(x,z)||world.propBlocked(x,z)};
   const visible=generatedWater?renderedWaterClearance(world.scene.meshes,generatedWater.waterHeight,world.data.meta.extent):null;
   waterSite=submarine?new NativeSubmarineSite(world.scene,(x,z)=>!land(x,z)):shoreBoat?new NativeShoreBoatSite(world.scene,shoreBoat,world.data,shoreEnv):shore?new NativeShoreSite(world.scene,shore,shoreEnv):boat?new NativeBoatSite(world.scene,boat,world.data,true,shoreEnv,(x,z)=>visible?!visible.allows(x,z):false):new NativeWaterSite(world.scene,water,world.data,visible?.allows);
   await waterSite.load();if(disposed){clearWaterSite();return;}
   if(generatedWater&&item.trainingTask?.resolved.heading!==null&&item.trainingTask?.resolved.heading!==undefined){
    const yaw=item.trainingTask.resolved.heading*Math.PI/180;
    if(waterSite instanceof NativeBoatSite){waterSite.boat.yaw=yaw;waterSite.swimmer.yaw=yaw;waterSite.step(new Set(),0);}
    else if(waterSite instanceof NativeWaterSite){waterSite.yaw=yaw;waterSite.step(new Set(),0);}
   }
   world.taskVehicle=waterSite;world.car.setEnabled(false);world.nativeTaskMeshes=waterSite.meshes;world.cull();}
  if(interiorSite){world.nativeTaskMeshes=interiorSite.meshes;world.vegetation();world.cull();}
  if(item.mode==='walk'&&!await world.startNativeWalk(start))throw Error("Walking character preparation failed, Please restart.");
  if(item.trainingWalk){
   // Recheck against this loaded world's actual body clearance, not only the saved grid.
   let previousHeight=world.walkingSurfaceHeight(...path.points[0]);
   for(let i=1;i<path.points.length;i++){const a=path.points[i-1],b=path.points[i],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/.5));
    for(let j=0;j<=n;j++){const x=a[0]+(b[0]-a[0])*j/n,z=a[1]+(b[1]-a[1])*j/n,y=world.walkingSurfaceHeight(x,z);if(!Number.isFinite(y)||Math.abs(y-previousHeight)>.35||!world.walk?.clear(x,z,y))throw Error('Training walking route no longer passes world clearance validation');previousHeight=y;}
   }
  }
  if(roadsideStart){
   world.routeVehicleMission=item.id;
   for(const vehicle of roadsideStart.vehicles)world.traffic?.park(vehicle,item.id);
   world.roadsideFootSpawn={x:roadsideStart.foot[0],z:roadsideStart.foot[1],yaw:roadsideStart.footYaw};
   if(!await world.ensureRider()||!await world.startNativeWalk({...start,arrival:roadsideStart.foot,yaw:roadsideStart.footYaw}))throw Error("Roadside character setup failed");
   world.car.setEnabled(false);world.traffic?.update(0,world.actor.x,world.actor.z);world.cull();
  }
  if(carChoice){
   world.routeVehicleMission=item.id;await world.placeCarChoices(carChoice);
   world.roadsideFootSpawn={x:carChoice.foot[0],z:carChoice.foot[1],yaw:carChoice.footYaw};
   if(!await world.ensureRider()||!await world.startNativeWalk({...start,arrival:carChoice.foot,yaw:carChoice.footYaw}))throw Error("Parking area walking character setup failed");
   world.car.setEnabled(false);world.cull();
  }
  if(world.routeVehicleMission)await world.prepareTrafficBoarding();
  if(disposed)return;
  state.active=true;state.complete=false;state.failed=false;state.checkpoint=0;state.elapsed=0;state.maxDuration=item.trainingOutdoor?.maxDuration??(item.category==='escape'?ESCAPE_MAX_SECONDS:item.category==='water'?nativeWaterTiming(item.id).maxDurationSeconds:ordinaryOutdoorRouteMaxDuration(item.mode,interiorSite?'indoor':item.category,path.points,item.id));state.startedAt=performance.now();state.lastUi=0;state.path=path;state.target=null;state.targetYaw=0;state.targetDistance=0;state.police=[];
  previousPosition=[world.actor.x,world.actor.z];travelEpoch=world.debugEpoch;
  if(item.trainingWalk)state.maxDuration=item.trainingWalk.maxDuration;
  if(item.trainingTask)state.maxDuration=item.trainingTask.maxDuration;
  if(roadsideStart)state.maxDuration=roadsideStart.maxDuration;
  if(carChoice)state.maxDuration=CAR_CHOICE_SECONDS;
  routeProgress.reset();routeProgress.update(path.points,previousPosition);
  turnDistances=path.turns.map((_,i)=>uncheckedRouteLimit(path.points,path.turns,i));
  if(manual&&item.id==='c01-n19'){
   const thirdNodeTurn=manual.source.turns.findIndex(t=>t.sourceIndex===2);
   const barrier=routeBarrier(path.points,manual.path.turns[thirdNodeTurn].distance-22);
   world.nativeTaskBarriers=[barrier];barrierView=createNativeBarrierView(world.scene,barrier,world.groundHeight(barrier.x,barrier.z));world.nativeTaskMeshes=barrierView.meshes;
  }
  if(item.category==='escape'){
   const waterEscape=waterSite instanceof NativeBoatSite&&boat?.objective==='water-escape',swimEscape=item.trainingOutdoor?.vehicle==='swim'&&waterSite instanceof NativeWaterSite?waterSite:null;
   police=new NavigationPolicePursuit(nativePoliceTask(item,path,start),waterEscape?16:swimEscape?2.4:20,{
    mode:'minimap',
    ready:()=>!(policeView instanceof NativeFootPoliceView)||policeView.ready,
    visible:(q,p,yaw,speed)=>{
     const map=document.querySelector<HTMLCanvasElement>('#mini-map'),angle=Number(map?.dataset.perspectiveTilt);
     const tilt=Number.isFinite(angle)&&map?.dataset.perspectiveTilt?angle*Math.PI/180:.40+Math.min(1,Math.abs(speed)/28)*.25;
     return minimapPointVisible(q.x-p.x,-q.z+p.z,-yaw,minimapVisibleWidth({speed,walking:world.walk?.active??item.mode==='walk'}),tilt);
    },
    snap:q=>{if(waterEscape||swimEscape)return q;const near=world.collision.nearest(q.x,-q.z);return near&&near.d<24?{x:near.x,y:q.y,z:-near.z}:q;},
    approach:waterEscape||swimEscape?undefined:(a,b)=>graph.route([a.x,-a.z],[b.x,-b.z]).map(([x,z])=>({x,y:world.groundHeight(x,z),z:-z})),
   },item.trainingOutdoor?.actors?.pursuers?{initialUnits:item.trainingOutdoor.actors.pursuers.map(p=>({position:{x:p.point[0],y:waterEscape||swimEscape?generatedWater!.waterHeight:world.groundHeight(...p.point),z:-p.point[1]},yaw:-p.yaw,speed:p.speed})),reinforcementSpeeds:item.trainingOutdoor.actors.reinforcementSpeeds}:undefined);
   if(waterEscape){const view=new NativeWaterPoliceView(world.scene,meshes=>{world.nativePoliceMeshes=meshes;});policeView=view;await view.load();if(disposed){view.dispose();return;}}
   else if(item.mode==='walk'||swimEscape){const view=new NativeFootPoliceView(world,swimEscape?'swim':'ground');policeView=view;await view.load();if(disposed){view.dispose();return;}}
   else policeView=createNativePoliceView(world);
   options.toast(`${item.id.toUpperCase()} · ${waterEscape?"Pursuers on the Water":"Police"} Started, The sector ahead is displayed on the minimap`);
  }
  if(rescueSpec){
   rescue=new NativeCompanionRescue(path.points,(x,z,yaw)=>{const body={id:world,x,z,yaw,y:world.groundHeight(x,z),...NATIVE_DRIVE_VEHICLES['semi-tractor'],kind:'car' as const};return world.streetStaticClear(body,body);});rescueView=new NativeCompanionRescueView(world.scene,rescue,world.groundHeight);await rescueView.load();if(disposed){clearRescue();return;}
   rescueView.update(world.nativeDriveModel!.root,0);state.target=rescue.window.point;state.targetYaw=rescue.window.yaw;state.targetDistance=rescue.distance;world.nativeTaskMeshes.push(...rescueView.meshes);
   (world.nativeFootSite as NativeRescueBridgeSite).dynamicBlocked=(x,z)=>rescueView?.blocked(x,z)??false;
  }else if(item.category==='follow'||item.category==='chase'){
   const mode=item.mode==='walk'?'walk':'drive',kind=NATIVE_TARGET_VEHICLES[item.id]??'sports-car',fit=NATIVE_DRIVE_VEHICLES[kind];
   const aquatic=item.trainingOutdoor&&['swim','boat'].includes(item.trainingOutdoor.vehicle)?item.trainingOutdoor:null,rules=item.trainingOutdoor?resolvedOutdoorNpcRules(item.trainingOutdoor):npcRules(item.category,mode);
   state.npc=undefined;
   npc=mode==='walk'||aquatic?.vehicle==='swim'?new NativeNpcObjective(path.points,rules):new NativeVehicleNpc(path.points,rules,aquatic?{width:2.4,length:6.3,height:1.6,mass:1200}:{...fit,mass:npcVehicleMass(kind),motorcycle:kind.startsWith('motorcycle')},{
    height:world.groundHeight,
    clear:b=>aquatic?waterSite instanceof NativeBoatSite&&waterSite.waterAllows(b.x,b.z,4):world.streetStaticClear(b,b),
    pushClear:(a,b)=>aquatic?waterSite instanceof NativeBoatSite&&waterSite.waterAllows(b.x,b.z,4):world.streetStaticClear(a,b),
   });
   npcView=aquatic?new GeneratedWaterTargetView(world,aquatic,generatedWater!.waterHeight):new NativeNpcView(world,mode,item.trainingOutdoor?.vehicle==='drive'?'sports-car':NATIVE_TARGET_VEHICLES[item.id],item.category,targetRiderOptions(item.id));await npcView.load();if(disposed){npcView.dispose();return;}
   state.targetDistance=npc.distance;state.target=npc.pose.point;state.targetYaw=npc.pose.yaw;npcView.update(state.target,state.targetYaw,0,0);
   world.nativeTaskMeshes.push(...npcView.meshes);
  }
  // Reassert the actual spawn camera only after every async asset is ready.
  // Later C switches remain allowed; this is a startup reset, not a view lock.
  if(world.nativeDriveModel){
   world.nativeDriveModel.sync(world.state,world.groundHeight,0);
   world.cull();
   await world.nativeDriveModel.prepareForRendering();
   if(disposed)return;
  }
  world.setCarWaterEnabled?.(item.mode==='drive'&&!waterSite);
  if(item.mode==='drive'&&!world.walk?.active&&!world.taskVehicle)world.resetNativeDrivingCamera();
  if(rescueSpec||flood)world.vegetation();
  if(item.category==='escape')options.clearRoute();else options.setRoute(goal,path.points);
  result.close();panel.hidden=true;world.paused=false;world.taskFlightPaused=false;world.keys.clear();updateEscapeHud();document.querySelector<HTMLCanvasElement>('#game')?.focus();document.querySelector('.intro')?.classList.add('gone');
  options.toast(`${item.id} Native mission started · Teleported to ${item.mode==='swim'?"Water area":item.mode==='walk'?"walking":"driving"} Start point ${item.id==='c03-n01'?" · The white target sports car has been placed and started driving":''}${path.topologyFallback?" · Adapt using native road topology":''}`);render();
  }catch(error){clearStatic();clearFootSite();clearWaterSite();clearDrive();if(!disposed)finish('failure',assetFailureMessage(error));}
  finally{starting=false;result.setBusy(false);if(!disposed)render();}
 }
 function updateFlightRoute(){
  if(!flightState)return;
  const p=flightState.navigationTarget,actor=world.flight?.active?world.flight.sim.pose:world.actor;
  state.target=[p.x,p.z];state.targetDistance=flightState.distance;
  state.path={points:[[actor.x,actor.z],state.target],turns:[],length:Math.hypot(actor.x-p.x,actor.z-p.z)};
  const destination=flightState.stage==='landing'?NATIVE_FLIGHT_DESTINATION:{...NATIVE_FLIGHT_LAUNCH,id:'native:'+flightState.config.id+':goal',name:flightState.stage==='boarding'?"Ground mission aircraft":flightState.stage==='approach'?"Target plane ahead":"Airborne waypoint",x:p.x,z:p.z,arrival:state.target};
  options.setRoute(destination,state.path.points);
 }
 async function boardFlight(){
  if(!flightState||flightState.stage!=='boarding'||starting||disposed)return;
  starting=true;pauseInput();render();
  try{
   if(!await world.startNativeFlight(flightState.config.spawn,flightState.config.yaw,flightState.config.model))throw Error("Ground boarding failed, Check the runway and try again.");
   if(disposed){world.exitPhoto();return;}
   flightState.board();world.flightMissionText=flightState.instruction;updateFlightRoute();
   world.paused=true;world.taskFlightPaused=false;world.keys.clear();world.canvas.focus();options.toast(flightState.instruction);
  }catch(error){if(!disposed)finish('failure',error instanceof Error?error.message:"Boarding failed, Please restart.");}
  finally{starting=false;if(!disposed)render();}
 }
 function clearActors(){world.nativeTaskContactBody=null;escapeHud.hidden=true;flightTarget?.dispose();flightTarget=null;clearRescue();npcView?.dispose();npcView=null;npc=null;clearBarrier();state.target=null;state.targetDistance=0;state.police=[];world.disposeNativeTargetVehicle();policeView?.dispose();policeView=null;police=null;world.nativePoliceMeshes=[];options.clearRoute();}
 function finish(outcome:'success'|'failure',reason:string){
  interiorHint.hidden=true;
  if(disposed||result.open&&!starting)return;
  const item=current();state.active=false;state.complete=outcome==='success';state.failed=outcome==='failure';state.path=null;
  clearActors();world.cancelAutoDrive('native-task-result');pauseInput();panel.hidden=true;
  result.show({outcome,taskId:item.id,title:item.title,reason,elapsed:state.elapsed,canContinue:!!climbState&&!!world.walk?.active,canDisembark:!!flightState&&!!world.flight?.sim.onGround&&world.flight.sim.speed<=1.5});render();
 }
 function stop(message="Native mission ended"){
  if(!state.active||starting)return;
  const wasWater=!!waterSite,parkedFlight=flightState?.config,wasClimb=!!climbState;
  state.active=false;state.complete=false;state.failed=false;state.checkpoint=0;state.elapsed=0;state.maxDuration=0;state.path=null;
  clearActors();clearFlight();
  clearStatic();
  // Keep the aircraft available at its launch site for F boarding in free roam.
  if(parkedFlight)world.flight?.park(parkedFlight.spawn,parkedFlight.yaw);
  clearWaterSite();if(!wasClimb)world.stopNativeWalk();climbState=null;clearFootSite();clearDrive();if(wasWater)world.resetRoad();
  world.keys.clear();world.paused=!panel.hidden;world.taskFlightPaused=!panel.hidden;options.toast(message);render();
 }
 function tick(dt:number){
  const hintEnabled=state.active&&!state.complete&&!state.failed&&!world.paused&&!world.observer?.active&&!result.open&&panel.hidden&&!!world.walk?.active;
  const hintText=world.nativeFootSite instanceof NativeInteriorSite?world.nativeFootSite.encounterHint(world.walk,dt,hintEnabled):'';
  interiorHint.hidden=!hintText;interiorHint.textContent=hintText;
  updateTimerHud();
  if(world.staticTask){
   if(state.active&&!world.paused){const s=world.staticTask.snapshot();if(s.done)finish(s.hit?'success':'failure',s.reason);}
   return;
  }
  updateEscapeHud();
  if(!rescue||!state.active||world.paused||world.observer?.active||result.open||!panel.hidden)rescueHud.hide();
  const walker=world.walk,nearLadder=walker?.nearbyLadder?.(),atEntry=!!walker?.active&&Math.hypot(walker.x-CLIMB_START.x,walker.z-CLIMB_START.z)<2.5;
  const pickupText=state.active&&current().id==='c07-n01'&&world.nativeFootSite instanceof NativePickupClimbSite?pickupClimbPrompt(world.nativeFootSite.layout,walker):state.active&&current().id==='c02-n14'&&world.nativeFootSite instanceof NativeFootSite?vaultPrompt(world.nativeFootSite.links,walker):'';
  const descentText=state.active&&current().id==='c07-n05'&&world.nativeFootSite instanceof NativeFootSite?descentPrompt(walker,world.nativeFootSite.manualLadders)||vaultPrompt(world.nativeFootSite.links,walker):'';
  const text=descentText||pickupText||(walker?.ladder?"W / S Climbing Up and Down · Shift Faster climbing / Slide down":nearLadder?"Approach to grab on automatically · W / S Climbing Up and Down":atEntry&&!state.active?"E Start「Climb the ladder to the adjacent factory roof」":climbState&&state.active?climbState.instruction+" · Space to jump":'');
  climbPrompt.hidden=!text||!!world.paused||world.observer?.active||!walker?.active||result.open||!panel.hidden;
  if(climbPrompt.textContent!==text)climbPrompt.textContent=text;

  if(!state.active||state.complete||!state.path)return;
  if(climbState){
   if(world.debugEpoch!==climbEpoch){finish('failure',"World position changed during the mission, Please restart from the factory floor.");return;}
   routeProgress.update(state.path.points,[world.actor.x,world.actor.z],{paused:world.paused||world.observer.active});
   const outcome=stepWithTimePolicy(climbState,timeLimitEnabled(),()=>climbState!.step(world.walk,dt,world.paused||world.observer.active));state.elapsed=climbState.elapsed;
   state.checkpoint=climbState.stage==='rooftop'?1:climbState.stage==='complete'?2:0;
   if(outcome){finish(outcome,climbState.reason);return;}
   if(performance.now()-state.lastUi>120){state.lastUi=performance.now();render();}return;
  }
  if(flightState){
   if(world.debugEpoch!==flightEpoch){finish('failure',"World position changed during the mission, Please restart from the flight starting point.");return;}
   const flight=world.flight,previousStage=flightState.stage;
   const paused=flightState.stage==='boarding'?world.paused:world.taskFlightPaused;
   const outcome=stepWithTimePolicy(flightState,timeLimitEnabled(),()=>flightState!.step(flight?.sim??null,dt,paused,world.data.meta.extent));
   state.elapsed=flightState.elapsed;state.checkpoint=flightState.checkpoint;const target=flightState.navigationTarget;
   state.target=[target.x,target.z];state.targetDistance=flightState.distance;state.path.points[1]=state.target;
   world.flightMissionText=flightState.instruction;
   if(previousStage!==flightState.stage&&!outcome){updateFlightRoute();options.toast(flightState.instruction);}
   flightTarget?.update(flightState,paused?0:Math.max(0,Math.min(.1,dt)));
   if(outcome){finish(outcome,flightState.reason);return;}
   if(performance.now()-state.lastUi>120){state.lastUi=performance.now();render();}return;
  }
  if(world.paused||world.observer?.active){previousPosition=[world.actor.x,world.actor.z];routeProgress.update(state.path.points,previousPosition,{paused:true});travelEpoch=world.debugEpoch;return;}
  const item=current(),actor=world.actor;
  if(item.category==='escape'){if(!Number.isFinite(dt)||dt<0)return;dt=Math.max(0,Math.min(dt,.1,ESCAPE_MAX_SECONDS-state.elapsed));}
  state.elapsed+=dt;
  updateTimerHud();
  if(world.carWaterEnabled&&world.carWater.sinking){
   if(world.carWater.phase==='failed')finish('failure',"Vehicle entered deep water, The engine has taken in water and the vehicle is sinking, Mission failed.");
   return; // Never award arrival, chase or escape success during irreversible sinking.
  }
  if(world.nativeFootSite instanceof NativeInteriorSite){
   const site=world.nativeFootSite;site.stepMission(world.walk);site.update({...actor,feetY:world.walk?.feetY,yaw:world.walk?.yaw,active:world.walk?.active,airborne:world.walk?.airborne,traversing:world.walk?.traversing},dt,world.keys);
   const points=site.navigationPoints,target=points.at(-1)!;
   if(site.mission.phased&&(state.path.points.at(-1)![0]!==target[0]||state.path.points.at(-1)![1]!==target[1])){
    state.path={points,turns:[],length:pathLength(points)};state.target=target;state.checkpoint=0;turnDistances=[];
    routeProgress.reset();routeProgress.update(points,[actor.x,actor.z]);previousPosition=[actor.x,actor.z];
    options.setRoute(nativeLandmark(`native:${item.id}:stage-${site.mission.stage}`,site.mission.instruction,target,true),points);
    options.toast(site.mission.instruction);render();
   }
  }
  if(world.nativeFootSite instanceof NativeShowroomSite)world.nativeFootSite.update(actor,!world.walk?.active);
  if(world.nativeFootSite instanceof NativeFloodSite)world.nativeFootSite.update(dt);
  if(police&&item.category==='escape'){
   const water=waterSite instanceof NativeBoatSite&&waterSite.spec.objective==='water-escape'?waterSite:null;
   const swimWater=item.trainingOutdoor?.vehicle==='swim'&&waterSite instanceof NativeWaterSite?waterSite:null;
   const policeFloor=(x:number,z:number)=>water?water.spec.waterHeight:swimWater?swimWater.spec.waterHeight:item.mode==='walk'?world.walkingSurfaceHeight(x,z):world.groundHeight(x,z);
   const p={x:actor.x,y:policeFloor(actor.x,actor.z),z:-actor.z};
   police.step(dt,p,-actor.yaw,actor.speed,(q,r)=>{
    if(water)return !water.waterAllows(q.x,-q.z,r);
    if(swimWater)return ![[0,0],[r,0],[-r,0],[0,r],[0,-r]].every(([dx,dz])=>swimWater.clear(q.x+dx,-q.z+dz,0));
    const blocked=(x:number,z:number)=>world.nativeDrivingBlocked?.(x,z)??(world.collision.blocked(x,z)||world.propBlocked(x,z));
    return [[0,0],[r,0],[-r,0],[0,r],[0,-r]].some(([dx,dz])=>blocked(q.x+dx,-q.z+dz))||!!world.traffic?.cars.some(c=>Math.hypot(c.x-q.x,c.z+q.z)<3);
   },q=>policeFloor(q.x,-q.z));
   policeView?.update(police.units,dt);state.police=police.units.map(unit=>({x:unit.position.x,z:-unit.position.z,yaw:-unit.yaw,kind:unit.kind}));
  }
  if(item.category==='escape'){
   const outcome=escapeSurvivalOutcome(state.elapsed,!!police?.capturedBy,police?.unscannedSeconds??0);
   if(outcome){finish(outcome,outcome==='success'?"Consecutively 1 Minutes without being swept by any police cone, Escape Successful.":police?.capturedBy?"Remain inside the red police cone continuously 3 seconds, Caught by the police.":"Reached 3 Minute Time Limit, Unable to maintain continuity 1 minutes while avoiding police scans, Escape failed.");return;}
   previousPosition=[actor.x,actor.z];travelEpoch=world.debugEpoch;updateEscapeHud();
   if(performance.now()-state.lastUi>120){state.lastUi=performance.now();render();}return;
  }
  const position:V2=[actor.x,actor.z],radius=item.mode==='walk'?6:32;
  const movement=Math.hypot(position[0]-previousPosition[0],position[1]-previousPosition[1]);
  const maxStep=Math.max(10,Math.abs(actor.speed)*Math.min(dt,1)*3+4);
  const discontinuity=world.debugEpoch!==travelEpoch||movement>maxStep;
  if(rescue&&rescueView&&world.nativeDriveModel){
   const window=rescue.window,player={point:position,yaw:actor.yaw,speed:actor.speed,driving:!world.walk?.active,heightValid:Math.abs(world.groundHeight(...position)-world.groundHeight(...window.point))<1.2};
   const outcome=rescue.step(dt,{...player,point:previousPosition},player,discontinuity);state.target=rescue.window.point;state.targetYaw=rescue.window.yaw;state.targetDistance=rescue.distance;
   rescueView.update(world.nativeDriveModel.root,dt);
   rescueHud.update(rescue,player,true);
   if(outcome){finish(outcome,outcome==='success'?"Companion picked up, Mission Complete.":"The boat transport truck reached the destination first, Failed to pick up companion.");return;}
  }
  if(npc){
   const aquatic=item.trainingOutdoor&&['swim','boat'].includes(item.trainingOutdoor.vehicle)?item.trainingOutdoor:null;
   const targetHeight=world.walkingSurfaceHeight(npc.pose.point[0],npc.pose.point[1]);
   const valid=!discontinuity&&(aquatic?aquatic.vehicle==='boat'?waterSite instanceof NativeBoatSite&&waterSite.mode==='boat':waterSite instanceof NativeWaterSite&&Math.abs(waterSite.depth-aquatic.goalDepth)<1.6:item.mode==='walk'?!!world.walk?.active&&!world.walk.airborne&&!world.walk.traversing&&Math.abs(world.walk.feetY-targetHeight)<1.6:!world.walk?.active);
   const outcome=npc instanceof NativeVehicleNpc?npc.step(dt,previousPosition,position,valid,aquatic?undefined:{...world.playerStreetBody(world.state),speed:world.state.speed,mass:npcVehicleMass(world.nativeDriveModel?.kind??'sports-car')}):npc.step(dt,previousPosition,position,valid);
   if(npc instanceof NativeVehicleNpc&&!aquatic){
    world.nativeTaskContactBody=npc.body;
    world.state.x+=npc.correction.x;world.state.z+=npc.correction.z;world.state.speed+=npc.correction.speed;
    if(!world.walk?.active){position[0]=world.state.x;position[1]=world.state.z;}state.npc=npc.snapshot;
   }
   state.targetDistance=npc.distance;state.target=npc.pose.point;state.targetYaw=npc.pose.yaw;
   npcView?.update(state.target,state.targetYaw,npc instanceof NativeVehicleNpc?npc.speed:npc.arrived?0:npc.rules.speed,dt,npc instanceof NativeVehicleNpc?npc.knockdown:null);
   if(outcome){finish(outcome,outcome==='failure'?(item.category==='follow'?`With the Target NPC distance exceeds ${npc.rules.radius} meters, Following failed. `:"Target NPC Reach the finish first, Interception failed."):item.category==='follow'?"NPC Reached the finish, And never exceed the following distance limit.":npc instanceof NativeVehicleNpc&&npc.motorcycleInterception?"The target motorcycle has been knocked over in three separate collisions, Mission Complete.":"Intercepted the target with a collision from ahead, And slow it down to 3 m/s The Following Remain 1.5 seconds.");return;}
  }
  routeProgress.update(state.path.points,position,{corridor:radius,joinRadius:radius,maxStep,paused:discontinuity});
  // Shared with the minimap: ordered route distance plus swept checkpoint
  // proximity. A later overlapping leg cannot satisfy an unseen earlier loop.
  while(!discontinuity&&state.checkpoint<state.path.turns.length){
   const along=turnDistances[state.checkpoint],target=state.path.turns[state.checkpoint];
   if(routeProgress.distance+1e-6<along-radius||
      (routeProgress.distance<along&&distanceToTravel(target,previousPosition,position)>radius))break;
   state.checkpoint++;
  }
  const previous=previousPosition;previousPosition=position;travelEpoch=world.debugEpoch;
  const endpoint=item.endpoint,completionRadius=endpoint?.completionRadius??(interiorCompletionRadius(item.id)??(item.id==='c07-n01'?1:item.mode==='walk'?3:24)),completionSpeed=endpoint?.completionSpeed??(item.mode==='walk'?6:3);
  const readyToFinish=item.mode!=='walk'||(!world.nativeFootSite?!!world.walk?.active&&!world.walk.airborne&&!world.walk.traversing:world.nativeFootSite.canFinish(world.walk));
  const arrivalOnly=item.category==='outdoor-road'||item.category==='outdoor-foot'||item.category==='stairs'||item.category==='indoor';
  if(item.mode==='swim'&&!npc&&!rescue){
   if(waterSite&&world.taskVehicle===waterSite&&!discontinuity&&waterSite.canFinish()){finish('success',WATER_TRANSFER_IDS.has(item.id)?"Reached the offshore platform docking point within the time limit.":waterSite instanceof NativeSubmarineSite?"The submarine has entered deep into the underwater pipeline from the front, Mission Complete.":item.id==='c06-n11'?"Drove the yacht through the shallows, Get the entire hull to the endpoint on land.":waterSite instanceof NativeShoreBoatSite?"Entered the water from land, Swim to the side of the boat and press F Finish boarding.":waterSite instanceof NativeShoreSite?"Finished swimming to shore, and reach the endpoint on land by walking.":item.id==='c06-n02'?"Reached the deep-water entrance by underwater swimming, Both position and underwater depth meet the endpoint requirements.":item.id==='c06-n08'?"Swam to the stern platform of the yacht moored at the endpoint.":item.id==='c06-n10'?"Swam to the yacht at the finish and completed the task F Board the boat.":waterSite instanceof NativeBoatSite&&waterSite.spec.startAboard?"Reached the nearshore endpoint by driving the boat.":"Pressed F Board the yacht and drive it to the finish.");return;}
  }else if(world.nativeFootSite instanceof NativeShowroomSite){
   // The room itself is the goal; do not additionally require the old 2m
   // counter circle. Sweep the frame's movement so fast impacts cannot skip it.
   if(!discontinuity&&world.nativeFootSite.canDriveFinish(actor,!world.walk?.active,previous)){
    finish('success',"Drove the vehicle into the car shop room, Mission Complete.");return;
   }
  }else if(arrivalOnly){
   const heightValid=!world.vehicleInteraction&&(!world.nativeFootSite||world.nativeFootSite.canFinish(world.walk));
   const gate=world.nativeFootSite instanceof NativeInteriorSite?world.nativeFootSite.arrivalGate:undefined;
   if(nativeArrival({position,previous,goal:state.path.points.at(-1)!,radius:completionRadius,gate,mode:item.mode==='walk'?'walk':'drive',walking:!!world.walk?.active,grounded:!world.walk?.active||!world.walk.airborne&&!world.walk.traversing,heightValid,discontinuity})){
    if(item.id==='c09-n02'){finish('success',"Behind cover and pressed Q Enter cover and crouch.");return;}
    finish('success',item.id==='c07-n01'?"Climbed onto the roof using the pickup, And reach the window.":item.id==='c02-n02'?"Entered the detached garage on foot and reached the indoor endpoint.":"Reached the mission endpoint using the required movement mode.");return;
   }
  }else if(!npc&&!rescue&&readyToFinish&&!discontinuity&&state.checkpoint>=state.path.turns.length&&routeProgress.distance>=state.path.length-completionRadius&&Math.hypot(actor.x-state.path.points.at(-1)![0],actor.z-state.path.points.at(-1)![1])<completionRadius&&Math.abs(actor.speed)<completionSpeed){
   // Legacy follow/chase semantics are kept until dedicated NPC predicates
   // replace them; they must not silently inherit ordinary arrival-only rules.
   finish('success',"Reached the old mission endpoint.");return;
  }
  // Ordinary driving/walking and water tasks share this final deadline check.
  // Arrival wins on the deadline frame. Escape/flight use independent rules.
  if(timeLimitEnabled()&&state.maxDuration>0&&state.elapsed>=state.maxDuration){finish('failure',`Maximum runtime exceeded(about ${state.maxDuration.toFixed(1)} seconds), ${item.category==='water'?"On the water/Underwater":item.mode==='walk'?"On-foot Navigation":"Standard Driving"} Mission failed. `);return;}
  if(performance.now()-state.lastUi>120){state.lastUi=performance.now();render();}
 }
 button.onclick=()=>setOpen(true);panel.querySelector('#native-task-close')!.addEventListener('click',()=>setOpen(false));startButton.onclick=()=>void start();stopButton.onclick=()=>stop();picker.onchange=()=>{if(!state.active)render();};
 function interact(){
  if(disposed||starting||result.open||world.paused||world.observer.active)return false;
  if(!world.flight?.canBoard(world.walk))return false;
  if(state.active){if(flightState?.stage!=='boarding')return false;void boardFlight();}
  else {
   const p=world.flight.sim.pose;if(Math.hypot(p.x-NATIVE_FLIGHT_TASK.spawn.x,p.z-NATIVE_FLIGHT_TASK.spawn.z)>1)return false;
   if(current().mode!=='flight')taskPicker.select(NATIVE_FLIGHT_TASK.id);
   void start(true).then(()=>boardFlight());
  }
  return true;
 }
 const keyAbort=new AbortController();
 keyAbort.signal.addEventListener('abort',()=>interiorHint.remove(),{once:true});
 keyAbort.signal.addEventListener('abort',clearStatic,{once:true});
 window.addEventListener('keydown',e=>{if(result.open||starting)return;if(e.target instanceof HTMLElement&&e.target.closest('input,textarea,select,button'))return;
  if(e.code==='KeyQ'&&!e.repeat&&state.active&&!world.paused&&!world.observer?.active&&panel.hidden&&world.debugEpoch===travelEpoch&&world.nativeFootSite instanceof NativeInteriorSite&&world.nativeFootSite.mission.takeCover(world.walk)){e.preventDefault();return;}
  if(e.code==='KeyE'&&!e.repeat&&state.active&&!world.paused&&!world.observer?.active&&panel.hidden&&world.nativeFootSite instanceof NativeInteriorSite&&world.nativeFootSite.interact(world.walk)){e.preventDefault();return;}
  if(e.code==='KeyE'&&!e.repeat&&!state.active&&!world.paused&&!world.observer?.active&&world.walk?.active&&world.walk.grounded&&Math.hypot(world.walk.x-CLIMB_START.x,world.walk.z-CLIMB_START.z)<2.5){e.preventDefault();taskPicker.select('c07-n04');void start(true);return;}if(e.code==='KeyN'&&!e.repeat){e.preventDefault();setOpen(panel.hidden);}if(e.code==='Escape'&&!panel.hidden&&!e.repeat){e.preventDefault();setOpen(false);}},{signal:keyAbort.signal});
 render();
 return {tasks,get modalOpen(){return result.open||!panel.hidden;},snapshot:()=>({...state,evaluationTimePolicy:evalTimePolicy,timeLimitEnabled:timeLimitEnabled(),roadsideStart,freeEscape:state.active&&current().category==='escape',path:state.active&&current().category==='escape'?null:state.path,escapeExposure:police?.exposureSeconds??0,escapeUnscanned:police?.unscannedSeconds??0,climb:climbState?{stage:climbState.stage,elapsed:climbState.elapsed,instruction:climbState.instruction,settledFor:climbState.settledFor,outcome:climbState.outcome,goal:climbState.site.goal,source:CLIMB_SOURCE}:null,flight:flightState?{id:flightState.config.id,vehicle:flightState.config.vehicle,model:flightState.config.model,objective:flightState.config.objective,checkpoint:flightState.checkpoint,checkpointCount:flightState.config.route.length,recoveryIndex:flightState.recoveryIndex,hoveredFor:flightState.hoveredFor,navigationTarget:{...flightState.navigationTarget},npcTarget:{...flightState.npcTarget},stage:flightState.stage,instruction:flightState.instruction,target:{...flightState.target},distance:flightState.distance,elapsed:flightState.elapsed,airElapsed:flightState.airElapsed,approached:flightState.approached,stoppedFor:flightState.stoppedFor,outcome:flightState.outcome}:null,rescue:rescue?{stage:rescue.stage,boarded:rescue.boarded,transfer:rescue.transferProgress,window:rescue.window}:null,taskId:current().id,routeDistance:routeProgress.distance,completionRadius:current().endpoint?.completionRadius??(interiorCompletionRadius(current().id)??(current().id==='c07-n01'?1:current().mode!=='drive'?3:24))}),remainingRoute:()=>state.active&&current().category!=='escape'?routeProgress.remaining():[],tick,interact,open:(id?:string)=>{if(id){const item=tasks.find(task=>task.id===id);if(!item)return false;category.value=item.category;taskPicker.select(id);}setOpen(true);return true;},close:()=>setOpen(false),start,stop,dispose:()=>{disposed=true;keyAbort.abort();result.dispose();clearActors();clearFlight();clearFootSite();clearWaterSite();clearDrive();button.remove();panel.remove();climbPrompt.remove();rescueHud.dispose();escapeHud.remove();timerHud.remove();}};
}
