import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function publicConfig(env){
 const url=(env.SUPABASE_URL||'').trim(),key=(env.SUPABASE_PUBLISHABLE_KEY||'').trim();
 if(!url&&!key)return {supabaseUrl:'',supabasePublishableKey:''};
 if(!url||!key)throw Error('Set both SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY.');
 let parsed;try{parsed=new URL(url);}catch{throw Error('SUPABASE_URL must be a valid HTTPS URL.');}
 if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.search||parsed.hash||parsed.pathname!=='/')throw Error('SUPABASE_URL must be an HTTPS project origin without credentials.');
 if(!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key))throw Error('Use a publishable key starting with sb_publishable_. Secret and service_role keys must never be bundled.');
 return {supabaseUrl:parsed.origin,supabasePublishableKey:key};
}
export async function build(env=process.env){const config=publicConfig(env);if(process.argv.includes('--require-account')&&!config.supabaseUrl)throw Error('Account deployment requires SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY in GitHub Actions Secrets.');const dest=fileURLToPath(new URL('../dist/config.js',import.meta.url));await fs.writeFile(dest,'// Browser-public configuration generated at build time.\nwindow.SKEBALANCE_CONFIG = '+JSON.stringify(config)+';\n');console.log(config.supabaseUrl?'Build complete: account connection configured.':'Build complete: local calculator mode; account connection not configured.');}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))await build();
