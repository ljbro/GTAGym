import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {TRAINING_ID,parseTrainingDataset,trainingDatasetPath} from '../../native-city/src/training-task-schema.ts';
import {TrainingShootingEnvironment} from '../../tasks/engines/training-shooting-engine.mjs';
import {verifyShootingPair} from '../training-shooting-pool.mjs';
import {ShootingEnvironment} from '../../tasks/engines/shooting-engine.mjs';
import {createSniperEnvironment,SCOPE_ONLY_CONTROLS} from '../../tasks/engines/photo-sniper-engine.mjs';
import {validateAgentTrace} from '../../tasks/engines/agent_trace_policy.mjs';
import {validateCompositeTrace} from '../../tasks/gui-turn.mjs';
const root=new URL('../../tasks/',import.meta.url);
export async function replayStatic(id,trace,{executionError=false,trainingDataset=null}={}){
 const catalog=JSON.parse(await fs.readFile(new URL('catalog.json',root),'utf8'));
 let row=catalog.find(r=>r.id===id&&['shooting','sniper'].includes(r.kind)),initialAim,trainingConfig;
 if(TRAINING_ID.test(id)){
  if(!trainingDataset)throw Error('Generated shooting replay requires its training dataset');
  const repository=fileURLToPath(new URL('../../',import.meta.url));
  const data=parseTrainingDataset(JSON.parse(await fs.readFile(path.join(repository,trainingDatasetPath(trainingDataset)),'utf8'))),task=data.tasks.find(t=>t.id===id);
  if(!task?.shooting)throw Error('Unknown generated shooting task');
  trainingConfig=await verifyShootingPair(repository,task.shooting.pair);initialAim=task.shooting.initialAim;
  if(JSON.stringify(trace.initial_camera)!==JSON.stringify(initialAim))throw Error('Generated initial aim does not match its saved task');
  row={kind:'shooting',sourceId:task.shooting.pair.sourceId};
 }
 if(!row)throw Error('Unknown scored image task');
 if(!initialAim&&row.kind==='shooting'&&trace.initial_camera!==undefined)throw Error('Benchmark shooting initial camera must not be overridden');
 if(executionError)return {reward:0,reason:'execution_error',sourceId:row.sourceId};
 const cfg=trainingConfig??JSON.parse(await fs.readFile(new URL(row.config,root),'utf8'));
 if(trace.sniper_controls!==undefined&&trace.sniper_controls!==SCOPE_ONLY_CONTROLS)throw Error('Unknown sniper controls version');
 const env=row.kind==='shooting'?(initialAim?new TrainingShootingEnvironment(cfg.task,cfg.gold,initialAim):new ShootingEnvironment(cfg.task,cfg.gold)):createSniperEnvironment(cfg,{scopeOnlyLook:trace.sniper_controls===SCOPE_ONLY_CONTROLS});
 if(row.kind==='sniper'){
  if(trace.task_id!==cfg.id||trace.scene_revision!==(cfg.revision??cfg.version)||!Number.isInteger(trace.random_seed))throw Error('Static trace identity/revision/seed mismatch');
  env.reset({seed:trace.random_seed});
 }else if(trace.task_id!==cfg.task.id||trace.dataset_version!==cfg.task.dataset_version)throw Error('Static trace dataset mismatch');
 const maxSteps=20;
 if(trace.action_protocol)validateCompositeTrace(trace.actions,trace,{maxSteps});
 else validateAgentTrace(trace.actions,trace,{maxSteps});
 for(const a of trace.actions)env.step(a);
 const o=env.observe(),result=o.result??env.result;return {reward:o.done?(result?.reward??0):0,reason:o.done?(cfg.render_mode==='native-clearance-atlas-v1'?result.reason:result?.hit?'hit':'miss'):'step_limit_without_shot',sourceId:row.sourceId,steps:trace.actions.length};
}
