import fs from 'node:fs/promises';
const token=process.env.NETLIFY_AUTH_TOKEN,site=process.env.NETLIFY_SITE_ID;
if(!token||!site)throw Error('Add NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID to GitHub Actions Secrets.');
if(!/^[a-zA-Z0-9-]+$/.test(site))throw Error('NETLIFY_SITE_ID must be a project ID, not a URL.');
const api='https://api.netlify.com/api/v1';
function deployFailureHint(body) {
 if (/deploy\s*limit|limit.{0,40}deploy|too many deploy|maximum (?:number of )?deploy/i.test(body)) return 'Netlify reports a deployment limit. Check the project deploy limits.';
 if (/credit|quota|billing|usage limit|payment|bandwidth/i.test(body)) return 'Netlify reports a usage or billing limit. Check Usage & billing for the team.';
 if (/paus|suspend|disabled|locked|locked_deploy/i.test(body)) return 'Netlify reports that the project, team or deployment is paused or locked.';
 if (/not authorized|unauthorized|permission|access denied|forbidden|token|must be (?:an? )?owner/i.test(body)) return 'Netlify reports an access restriction. Check token permissions for this project.';
 return 'Check the project settings, token permissions and team usage in Netlify.';
}
async function request(route,options={}){
 const authorization = {Authorization:'Bearer '+token};
 const response=await fetch(api+route,{...options,headers:{...authorization,...options.headers},signal:AbortSignal.timeout(120000)});
 if (!response.ok) {
  // Classify the response without writing any provider-supplied values to public CI logs.
  const body = await response.text().catch(() => '');
  const retryAfter = response.headers.get('retry-after');
  const retryHint = /^\d{1,5}$/.test(retryAfter ?? '') ? ` Retry after ${retryAfter} seconds.` : '';
  let accessHint = '';
  if (response.status === 403 && options.method === 'POST') {
   const project = await fetch(`${api}/sites/${site}`, {headers: authorization, signal: AbortSignal.timeout(10000)}).catch(() => null);
   if (project) accessHint = ` Project lookup returned HTTP ${project.status}.`;
  }
  throw Error(`Netlify API returned HTTP ${response.status}. ${deployFailureHint(body)}${accessHint}${retryHint}`);
 }
 return response.json();
}
let deployment=await request('/sites/'+site+'/deploys',{method:'POST',headers:{'Content-Type':'application/zip'},body:await fs.readFile(new URL('../site.zip',import.meta.url))});
if(!deployment.id)throw Error('Netlify did not return a deployment ID.');
for(let i=0;i<120;i++){
 if(deployment.state==='ready'){const url=deployment.ssl_url||deployment.url||deployment.deploy_ssl_url;if(!url)throw Error('Deployment ready but no URL returned.');console.log('Published: '+url);if(process.env.GITHUB_STEP_SUMMARY)await fs.appendFile(process.env.GITHUB_STEP_SUMMARY,'Published: '+url+'\n');process.exit(0);}
 if(deployment.state==='error')throw Error('Netlify deployment failed. Inspect the deployment in the Netlify dashboard.');
 await new Promise(r=>setTimeout(r,3000));deployment=await request('/deploys/'+encodeURIComponent(deployment.id));
}
throw Error('Deployment is still pending. Check the existing deployment in Netlify before retrying.');
