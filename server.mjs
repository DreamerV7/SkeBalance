import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('./dist/',import.meta.url));
const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.csv':'text/csv; charset=utf-8','.wasm':'application/wasm'};
const server=http.createServer(async(req,res)=>{try{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/, '')||'index.html';const p=path.resolve(root,relative);if(!p.startsWith(root)){res.writeHead(403).end();return;}const body=await fs.readFile(p);res.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}).end(body);}catch{res.writeHead(404).end('Not found');}});
server.listen(Number(process.env.PORT||4173),'127.0.0.1',()=>console.log('СкеБаланс: http://127.0.0.1:'+server.address().port));
