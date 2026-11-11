const names=['SUPABASE_ACCESS_TOKEN','SUPABASE_PROJECT_REF','SUPABASE_DB_PASSWORD'];
const missing=names.filter(name=>!process.env[name]);
if(missing.length)throw Error('Add GitHub Actions Secrets: '+missing.join(', '));
if(!/^[a-z0-9]+$/.test(process.env.SUPABASE_PROJECT_REF))throw Error('SUPABASE_PROJECT_REF must be the project reference, not a URL.');
console.log('Required database deployment secrets are present.');
