/** Bounded recovery for transient failures at the Notebook reverse proxy. */
export function assetRetryDelay(url:string,status:number,retryIndex:number,pageUrl:string):number {
 if(!Number.isInteger(retryIndex)||retryIndex<0||retryIndex>=4)return -1;
 if(![0,408,429,502,503,504].includes(status))return -1;
 const base=new URL('.',pageUrl),target=new URL(url,pageUrl);
 if(target.origin!==base.origin||!target.pathname.startsWith(base.pathname))return -1;
 if(!/^(?:assets|city|characters|tasks)\//.test(target.pathname.slice(base.pathname.length)))return -1;
 return 1000*2**retryIndex;
}

export function assetFailureMessage(error:unknown):string {
 const message=error instanceof Error?error.message:String(error);
 return /Error status:\s*(?:0|408|429|502|503|504)\b/.test(message)
  ? "Scene asset download interrupted, Still not restored after automatic retry. Please check your network or log in to the platform again, Then Click「Restart」; If it still failed, Please refresh the page. \n"+message
  :message;
}
