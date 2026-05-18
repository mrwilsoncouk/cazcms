import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { route, json } from '../core/http.js';
import { find, insert, update, one, write, read, audit } from '../core/store.js';

const CACHE_TTL = Number(process.env.API_CACHE_TTL_MS || 30000);
const memoryCache = new Map();
export function cacheGet(key){
  const item = memoryCache.get(key);
  if(!item || item.expires < Date.now()){ memoryCache.delete(key); return null; }
  return item.value;
}
export function cacheSet(key, value, ttl=CACHE_TTL){ memoryCache.set(key,{value,expires:Date.now()+ttl}); return value; }
export function cacheClear(prefix=''){
  for(const key of [...memoryCache.keys()]) if(!prefix || key.startsWith(prefix)) memoryCache.delete(key);
  return true;
}
function tokens(text=''){
  return String(text).toLowerCase().replace(/<[^>]+>/g,' ').replace(/[^a-z0-9]+/g,' ').split(' ').filter(Boolean);
}
export function buildSearchIndex(){
  const docs = [...find('content'), ...find('products')];
  const index = {};
  for(const doc of docs){
    const haystack = [doc.title, doc.name, doc.slug, doc.html, doc.description, JSON.stringify(doc.fields||{}), JSON.stringify(doc.seo||{})].join(' ');
    for(const t of new Set(tokens(haystack))){
      if(!index[t]) index[t]=[];
      index[t].push({id:doc.id, type:doc.type || (doc.sku?'product':'content'), slug:doc.slug, title:doc.title||doc.name});
    }
  }
  write('searchIndexes',[{id:'local-search', createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), engine:'internal', tokens:index, documents:docs.length}]);
  return {documents:docs.length,tokens:Object.keys(index).length};
}
export function buildRouteManifest(){
  const routes = [];
  for(const c of find('content', c => c.slug)) routes.push({path:`/${c.slug}`, id:c.id, type:c.type||'page', status:c.status, updatedAt:c.updatedAt});
  for(const p of find('products', p => p.slug || p.sku)) routes.push({path:`/products/${p.slug || p.sku}`, id:p.id, type:'product', status:p.status||'published', updatedAt:p.updatedAt});
  write('frameworkRoutes', routes);
  fs.mkdirSync('public/site', {recursive:true});
  fs.writeFileSync('public/site/routes.manifest.json', JSON.stringify(routes,null,2));
  return routes;
}
export function buildPrecomputedNavigation(){
  const content = find('content', c=>['published','scheduled'].includes(c.status));
  const tax = find('taxonomies');
  const products = find('products', p=>p.status==='published');
  const menus = {
    main: content.filter(c=>c.type==='page').slice(0,50).map(c=>({label:c.title,path:`/${c.slug}`})),
    categories: tax.map(t=>({label:t.name||t.slug,path:`/category/${t.slug||t.id}`, count: content.filter(c=>(c.categories||[]).includes(t.id)||c.categoryId===t.id).length})),
    relatedProducts: Object.fromEntries(products.map(p=>[p.id, products.filter(x=>x.id!==p.id).slice(0,4).map(x=>({id:x.id,name:x.name,slug:x.slug||x.sku}))]))
  };
  fs.mkdirSync('public/site', {recursive:true});
  fs.writeFileSync('public/site/navigation.precomputed.json', JSON.stringify(menus,null,2));
  insert('jobs',{type:'precompute-navigation',status:'complete',result:{pages:content.length,categories:tax.length,products:products.length}});
  return menus;
}
export function compressStaticFiles(dir='public/site'){
  let count=0;
  if(!fs.existsSync(dir)) return {count};
  const walk = d => {
    for(const name of fs.readdirSync(d)){
      const file=path.join(d,name); const stat=fs.statSync(file);
      if(stat.isDirectory()) walk(file);
      else if(/\.(html|css|js|json|svg|xml)$/i.test(file)){
        const buf=fs.readFileSync(file);
        fs.writeFileSync(`${file}.gz`, zlib.gzipSync(buf,{level:9}));
        fs.writeFileSync(`${file}.br`, zlib.brotliCompressSync(buf));
        count++;
      }
    }
  };
  walk(dir);
  return {count};
}
export function checkPerformanceBudget(dir='public/site'){
  const budget = {
    maxJsBytes:Number(process.env.PERF_MAX_JS_BYTES || 180000),
    maxImageBytes:Number(process.env.PERF_MAX_IMAGE_BYTES || 450000),
    maxPageBytes:Number(process.env.PERF_MAX_PAGE_BYTES || 250000),
    maxApiMs:Number(process.env.PERF_MAX_API_MS || 300)
  };
  const failures=[];
  if(fs.existsSync(dir)){
    const walk=d=>{ for(const name of fs.readdirSync(d)){ const file=path.join(d,name); const stat=fs.statSync(file); if(stat.isDirectory()) walk(file); else {
      if(file.endsWith('.js') && stat.size > budget.maxJsBytes) failures.push({file,size:stat.size,limit:budget.maxJsBytes,type:'js'});
      if(/\.(png|jpg|jpeg|webp|avif)$/i.test(file) && stat.size > budget.maxImageBytes) failures.push({file,size:stat.size,limit:budget.maxImageBytes,type:'image'});
      if(file.endsWith('.html') && stat.size > budget.maxPageBytes) failures.push({file,size:stat.size,limit:budget.maxPageBytes,type:'page'});
    } } };
    walk(dir);
  }
  write('accessibilityAudits',[...read('accessibilityAudits'), {id:`perf_${Date.now()}`, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString(), type:'performance-budget', budget, failures, passed:failures.length===0}]);
  return {budget, failures, passed:failures.length===0};
}
function requireAdmin(ctx){ if(!ctx.user || !['admin','editor'].includes(ctx.user.role)) throw new Error('Forbidden'); return ctx.user; }
export function mountPerformance(){
  route('GET','/api/performance/cache',({res})=>json(res,{entries:memoryCache.size,ttl:CACHE_TTL}));
  route('POST','/api/performance/cache/clear',(ctx)=>{ requireAdmin(ctx); cacheClear(ctx.body.prefix||''); return json(ctx.res,{ok:true}); });
  route('POST','/api/performance/search-index',(ctx)=>{ const u=requireAdmin(ctx); const result=buildSearchIndex(); audit(u.id,'build','search-index',result); return json(ctx.res,result); });
  route('POST','/api/performance/route-manifest',(ctx)=>{ const u=requireAdmin(ctx); const routes=buildRouteManifest(); audit(u.id,'build','route-manifest',{count:routes.length}); return json(ctx.res,{count:routes.length,routes}); });
  route('POST','/api/performance/precompute',(ctx)=>{ const u=requireAdmin(ctx); const menus=buildPrecomputedNavigation(); audit(u.id,'build','precomputed-navigation',{}); return json(ctx.res,menus); });
  route('POST','/api/performance/compress',(ctx)=>{ requireAdmin(ctx); return json(ctx.res,compressStaticFiles(ctx.body.dir||'public/site')); });
  route('GET','/api/performance/budget',({res})=>json(res,checkPerformanceBudget()));
  route('GET','/api/performance/search',({url,res})=>{
    const q=(url.searchParams.get('q')||'').toLowerCase();
    const idx=one('searchIndexes',x=>x.id==='local-search');
    if(!idx) return json(res,{query:q,results:[],note:'Run POST /api/performance/search-index first'});
    const seen=new Map();
    for(const t of tokens(q)) for(const item of (idx.tokens?.[t]||[])) seen.set(item.id,{...item,score:(seen.get(item.id)?.score||0)+1});
    return json(res,{query:q,results:[...seen.values()].sort((a,b)=>b.score-a.score)});
  });
}
