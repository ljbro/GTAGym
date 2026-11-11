/** Rules shared by replay graders for the 20-step agent evaluation protocol. */
export function validateAgentTrace(actions,record={}, {maxSteps=20}={}){
 const budget=record.max_steps??20;
 if(!Number.isInteger(budget)||budget<1||budget>maxSteps)throw Error('invalid_step_budget');
 if(!Array.isArray(actions)||actions.length>budget)throw Error('step_budget_exceeded');
 if(record.model_steps!=null&&(!Number.isInteger(record.model_steps)||record.model_steps<actions.length||record.model_steps>budget))throw Error('invalid_model_step_count');
 for(const a of actions)if(!a||!['look','button'].includes(a.type))throw Error('expected_agent_environment_action');
}
