import {FileToolsOptions} from '@babylonjs/core/Misc/fileTools';
import {appUrl} from './app-url';
import {assetRetryDelay} from './asset-retry';

/** Install before loading the city; Babylon retries only downloads, never scene construction. */
export function installAssetNetwork(){
 const originalFetch=window.fetch.bind(window);
 window.fetch=(input,init)=>{
  const source=input instanceof Request?input.url:String(input),target=appUrl(source);
  return originalFetch(target===source?input:input instanceof Request?new Request(target,input):target,init);
 };
 const preprocess=FileToolsOptions.PreprocessUrl,scriptPreprocess=FileToolsOptions.ScriptPreprocessUrl;
 FileToolsOptions.PreprocessUrl=url=>appUrl(preprocess(url));
 FileToolsOptions.ScriptPreprocessUrl=url=>appUrl(scriptPreprocess(url));
 const fallback=FileToolsOptions.DefaultRetryStrategy;
 FileToolsOptions.DefaultRetryStrategy=(url,request,index)=>{
  const resolved=appUrl(url),base=new URL('.',location.href),target=new URL(resolved,location.href);
  if(target.origin===base.origin&&target.pathname.startsWith(base.pathname)&&/^(?:assets|city|characters|tasks)\//.test(target.pathname.slice(base.pathname.length)))
   return assetRetryDelay(resolved,request.status,index,location.href);
  return fallback?.(url,request,index)??-1;
 };
}
