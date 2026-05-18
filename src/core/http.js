import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { verify } from './security.js';
import { one } from './store.js';

export const routes=[];
export function route(method, pattern, handler, opts={}){ routes.push({method, pattern, handler, opts}); }
function match(pattern, url){ const a=pattern.split('/').filter(Boolean), b=url.split('/').filter(Boolean); if(a.length!==b.length) return null; const params={}; for(let i=0;i<a.length;i++){ if(a[i].startsWith(':')) params[a[i].slice(1)]=decodeURIComponent(b[i]); else if(a[i]!==b[i]) return null; } return params; }
async function body(req){ if(!['POST','PUT','PATCH','DELETE'].includes(req.method)) return {}; let data=''; for await (const c of req) data+=c; if(!data) return {}; try{return JSON.parse(data)}catch{return {raw:data}} }
const securityHeaders={'access-control-allow-origin':'*','access-control-allow-methods':'GET,POST,PATCH,PUT,DELETE,OPTIONS','access-control-allow-headers':'content-type,authorization','x-frame-options':'SAMEORIGIN','x-content-type-options':'nosniff','referrer-policy':'strict-origin-when-cross-origin','permissions-policy':'camera=(), microphone=(), geolocation=()'};
function accepts(req, enc){ return (req.headers['accept-encoding']||'').includes(enc); }
function sendMaybeCompressed(req,res,payload,status,headers){
  if(res.writableEnded || res.headersSent) return;
  const raw=Buffer.from(payload);
  if(accepts(req,'br')){ res.writeHead(status,{...headers,'content-encoding':'br','vary':'accept-encoding'}); return res.end(zlib.brotliCompressSync(raw)); }
  if(accepts(req,'gzip')){ res.writeHead(status,{...headers,'content-encoding':'gzip','vary':'accept-encoding'}); return res.end(zlib.gzipSync(raw)); }
  res.writeHead(status,headers); return res.end(raw);
}
export function json(res, data, status=200, req=null){ const payload=JSON.stringify(data,null,2); const headers={'content-type':'application/json','cache-control':status===200?'private,max-age=15,stale-while-revalidate=60':'no-store',...securityHeaders}; if(req) return sendMaybeCompressed(req,res,payload,status,headers); if(!res.writableEnded && !res.headersSent){ res.writeHead(status,headers); res.end(payload); } }
export function html(res, text, status=200, req=null){ const headers={'content-type':'text/html; charset=utf8','cache-control':'private,no-store',...securityHeaders}; if(req) return sendMaybeCompressed(req,res,text,status,headers); if(!res.writableEnded && !res.headersSent){ res.writeHead(status,headers); res.end(text); } }
function serveStatic(req,res, pathname){
 const base=path.resolve('public'); const clean=pathname==='/'?'/site/index.html':pathname; let target=path.resolve(base, clean.replace(/^\//,''));
 if(!target.startsWith(base)||!fs.existsSync(target)||fs.statSync(target).isDirectory()) return false;
 const ext=path.extname(target); const type={'.html':'text/html; charset=utf8','.css':'text/css; charset=utf8','.js':'application/javascript; charset=utf8','.json':'application/json; charset=utf8','.xml':'application/xml; charset=utf8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.avif':'image/avif'}[ext]||'application/octet-stream';
 const stat=fs.statSync(target); const hashed=/\.[a-f0-9]{10}\.(css|js|png|jpg|jpeg|webp|avif|svg)$/i.test(target);
 const headers={'content-type':type,'cache-control':hashed?'public,max-age=31536000,immutable':'public,max-age=300,stale-while-revalidate=86400','etag':`"${stat.size}-${stat.mtimeMs}"`,...securityHeaders};
 if(req.headers['if-none-match']===headers.etag){ res.writeHead(304,headers); res.end(); return true; }
 if(accepts(req,'br') && fs.existsSync(`${target}.br`)){ res.writeHead(200,{...headers,'content-encoding':'br','vary':'accept-encoding'}); fs.createReadStream(`${target}.br`).pipe(res); return true; }
 if(accepts(req,'gzip') && fs.existsSync(`${target}.gz`)){ res.writeHead(200,{...headers,'content-encoding':'gzip','vary':'accept-encoding'}); fs.createReadStream(`${target}.gz`).pipe(res); return true; }
 res.writeHead(200,headers); fs.createReadStream(target).pipe(res); return true;
}
export function createServer(){ return http.createServer(async (req,res)=>{
 const started=Date.now();
 try{
  if(req.method==='OPTIONS') return json(res,{},200,req);
  const url=new URL(req.url,`http://${req.headers.host}`);
  const hit=routes.find(r=>r.method===req.method && match(r.pattern,url.pathname));
  if(!hit){ if(serveStatic(req,res,url.pathname)) return; return json(res,{error:'Not found'},404,req); }
  const token=(req.headers.authorization||'').replace('Bearer ',''); const session=verify(token); const user=session && one('users',u=>u.id===session.uid);
  const ctx={req,res,url,params:match(hit.pattern,url.pathname),body:await body(req),user,ip:req.socket.remoteAddress,started};
  await hit.handler(ctx);
 }catch(e){
  if(!res.headersSent && !res.writableEnded) return json(res,{error:e.message, stack:process.env.NODE_ENV==='production'?undefined:e.stack},500,req);
  console.error('Request failed after response was sent:', e.message);
 }
}); }
