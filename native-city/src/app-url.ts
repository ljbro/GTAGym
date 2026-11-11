/** Resolve repository URLs relative to the entry page, including Notebook proxies. */
export function appUrl(value:string,pageUrl=location.href):string {
 const base=new URL('.',pageUrl),url=new URL(value,pageUrl);
 if(url.origin!==base.origin||!/^\/(?:city|assets|characters|tasks|licenses)\//.test(url.pathname))return value;
 return new URL('.'+url.pathname+url.search+url.hash,base).href;
}
