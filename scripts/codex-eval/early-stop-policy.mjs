import {readFileSync} from 'node:fs';

const contract=JSON.parse(readFileSync(new URL('./early-stop-policy.json',import.meta.url),'utf8'));
export const EARLY_STOP_POLICY=contract.policy;
export const EARLY_STOP_FEEDBACK=contract.feedback;
