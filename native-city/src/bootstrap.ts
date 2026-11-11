import {installAssetNetwork} from './asset-network';

// Legacy city modules use repository-root URLs. Keep their data unchanged, but
// route both JSON fetches and Babylon GLB/texture/decoder loads through the
// entry page directory, rather than the Notebook platform's domain root.
installAssetNetwork();

void import('./main').catch(error=>{
 console.error('Native city startup failed',error);
 const notice=document.createElement('p');
 notice.setAttribute('role','alert');
 notice.style.cssText='position:fixed;inset:20px;z-index:99999;background:#172225;color:white;padding:24px;white-space:pre-wrap';
 notice.textContent="City page startup failed, Please refresh and try again. \n"+String(error);
 document.body.append(notice);
});
