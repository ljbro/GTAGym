import type {FlightSimulation,FlightPoint} from '../src/city-flight-simulation.ts';
import type {FlightRunway} from '../src/city-flight-ground.ts';
export function flightTestControls(aircraft:FlightSimulation,stage:string,target:FlightPoint,arrival:FlightRunway,context?:Record<string,unknown>):string[];
