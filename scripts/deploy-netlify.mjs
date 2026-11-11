import fs from 'node:fs/promises';
const token=process.env.NETLIFY_AUTH_TOKEN,site=process.env.NETLIFY_SITE_ID;
if(!token||!site)throw Error('Add NETLIFY_AUTH_TOKEN and NETLIFY_SITE_ID to GitHub Actions Secrets.');
if(!/^[a-zA-Z0-9-]+$/.test(site))throw Error('NETLIFY_SITE_ID must be a project ID, not a URL.');
const api='https://api.netlify.com/api/v1';
async function request(route,options={}){
 const response=await fetch(api+route,{...options,headers:{Authorization:'Bearer '+token,...options.headers},signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw Error('Netlify API returned HTTP '+response.status+'. Check the project ID, token and account limits.');
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
