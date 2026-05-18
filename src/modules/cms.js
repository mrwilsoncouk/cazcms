import fs from 'node:fs';
import path from 'node:path';
import { route, json } from '../core/http.js';
import { insert, update, find, one, remove, audit } from '../core/store.js';
import { paginate } from '../core/pagination.js';
import { can, slugify, sanitizeHtml } from '../core/security.js';
function requireUser(ctx){ if(!ctx.user) throw new Error('Login required'); return ctx.user; }
function requireRole(ctx, role='author'){ const u=requireUser(ctx); if(!can(u,role)) throw new Error('Forbidden'); return u; }
function publicContent(r){ return ['published','scheduled'].includes(r.status); }
function contentPatch(body){ const title=body.title; const slug=body.slug||slugify(title||body.name||'item'); return {...body,title,slug,html:sanitizeHtml(body.html||body.body||''),status:body.status||'draft',seo:body.seo||{},fields:body.fields||{},blocks:body.blocks||[],locale:body.locale||'en',type:body.type||'page',publishAt:body.publishAt||null,unpublishAt:body.unpublishAt||null}; }
export function mountCms(){
 route('GET','/api/content',({url,res,user})=>{ const status=url.searchParams.get('status'); const q=(url.searchParams.get('q')||'').toLowerCase(); let rows=find('content',r=>(user||publicContent(r)) && (!status||r.status===status)); if(q) rows=rows.filter(r=>JSON.stringify(r).toLowerCase().includes(q)); return json(res,paginate(url, rows)); });
 route('POST','/api/content',(ctx)=>{ const u=requireRole(ctx,'author'); const rec=insert('content',{...contentPatch(ctx.body),authorId:u.id}); insert('revisions',{contentId:rec.id,snapshot:rec,authorId:u.id,message:'initial'}); audit(u.id,'create','content',{id:rec.id}); return json(ctx.res,rec,201); });
 route('GET','/api/content/:id',({params,res,user})=>{ const r=one('content',x=>x.id===params.id||x.slug===params.id); if(!r || (!user && !publicContent(r))) return json(res,{error:'Not found'},404); return json(res,r); });
 route('PATCH','/api/content/:id',(ctx)=>{ const u=requireRole(ctx,'author'); const old=one('content',r=>r.id===ctx.params.id); if(!old) return json(ctx.res,{error:'Not found'},404); insert('revisions',{contentId:old.id,snapshot:old,authorId:u.id,message:ctx.body.message||'update'}); const rec=update('content',old.id,contentPatch({...old,...ctx.body})); audit(u.id,'update','content',{id:old.id}); return json(ctx.res,rec); });
 route('DELETE','/api/content/:id',(ctx)=>{ const u=requireRole(ctx,'editor'); remove('content',ctx.params.id); audit(u.id,'delete','content',{id:ctx.params.id}); return json(ctx.res,{ok:true}); });
 route('POST','/api/content/:id/autosave',(ctx)=>{ const u=requireRole(ctx,'author'); const draft=insert('revisions',{contentId:ctx.params.id,snapshot:ctx.body,authorId:u.id,message:'autosave',autosave:true}); return json(ctx.res,draft,201); });
 route('GET','/api/content/:id/revisions',(ctx)=>{ requireRole(ctx,'author'); return json(ctx.res,paginate(ctx.url, find('revisions',r=>r.contentId===ctx.params.id))); });
 route('POST','/api/content/:id/rollback',(ctx)=>{ const u=requireRole(ctx,'editor'); const rev=one('revisions',r=>r.id===ctx.body.revisionId&&r.contentId===ctx.params.id); if(!rev) return json(ctx.res,{error:'Revision not found'},404); const rec=update('content',ctx.params.id,rev.snapshot); audit(u.id,'rollback','content',{id:ctx.params.id,revisionId:rev.id}); return json(ctx.res,rec); });
 route('GET','/api/preview/:id',(ctx)=>{ requireRole(ctx,'author'); const rec=one('content',r=>r.id===ctx.params.id||r.slug===ctx.params.id); return json(ctx.res,{preview:true,content:rec}); });
 route('POST','/api/taxonomies',(ctx)=>{ requireRole(ctx,'editor'); return json(ctx.res,insert('taxonomies',ctx.body),201); });
 route('GET','/api/taxonomies',({res})=>json(res,find('taxonomies')));
 route('POST','/api/schema-fields',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,insert('schemaFields',ctx.body),201); });
 route('GET','/api/schema-fields',(ctx)=>{ requireRole(ctx,'author'); return json(ctx.res,paginate(ctx.url, find('schemaFields'))); });
 route('POST','/api/media',(ctx)=>{ const u=requireRole(ctx,'author'); const rec=insert('media',{filename:ctx.body.filename,mime:ctx.body.mime||'application/octet-stream',alt:ctx.body.alt||'',caption:ctx.body.caption||'',data:ctx.body.data||'',variants:[{name:'original'}],optimized:true,authorId:u.id}); audit(u.id,'upload','media',{id:rec.id}); return json(ctx.res,rec,201); });
 route('GET','/api/media',(ctx)=>{ requireRole(ctx,'author'); return json(ctx.res,paginate(ctx.url, find('media'))); });
 route('POST','/api/media/:id/transform',(ctx)=>{ requireRole(ctx,'author'); const m=one('media',x=>x.id===ctx.params.id); const variant={name:ctx.body.name||'variant',width:ctx.body.width,height:ctx.body.height,format:ctx.body.format||'webp',note:'local transform metadata; add sharp for real pixels'}; const out=update('media',m.id,{variants:[...(m.variants||[]),variant]}); return json(ctx.res,out); });
 route('POST','/api/comments',(ctx)=>{ const rec=insert('comments',{...ctx.body,status:'pending',spamScore:0}); return json(ctx.res,rec,201); });
 route('PATCH','/api/comments/:id',(ctx)=>{ requireRole(ctx,'editor'); return json(ctx.res,update('comments',ctx.params.id,ctx.body)); });
 route('GET','/api/search',({url,res,user})=>{ const q=(url.searchParams.get('q')||'').toLowerCase(); const rows=find('content',r=>(user||publicContent(r))&&JSON.stringify(r).toLowerCase().includes(q)); return json(res,{query:q,results:rows}); });
 route('GET','/api/sitemap',({res})=>json(res,find('content',publicContent).map(r=>({loc:`/${r.slug}`,updatedAt:r.updatedAt}))));
 route('POST','/api/page-blocks',(ctx)=>{ requireRole(ctx,'author'); return json(ctx.res,insert('pageBlocks',ctx.body),201); });
 route('GET','/api/page-blocks',(ctx)=>{ requireRole(ctx,'author'); return json(ctx.res,find('pageBlocks')); });
}
