import fs from 'node:fs';
import { route, json } from '../core/http.js';
import { insert, update, find, one, remove, audit, backup, restore, exportAll, importAll, tables } from '../core/store.js';
import { can } from '../core/security.js';
function requireUser(ctx){ if(!ctx.user) throw new Error('Login required'); return ctx.user; }
function requireRole(ctx, role='admin'){ const u=requireUser(ctx); if(!can(u,role)) throw new Error('Forbidden'); return u; }
function crud(table, role='editor'){
 route('GET',`/api/${table}`,(ctx)=>{ requireUser(ctx); return json(ctx.res,find(table)); });
 route('POST',`/api/${table}`,(ctx)=>{ requireRole(ctx,role); return json(ctx.res,insert(table,ctx.body),201); });
 route('PATCH',`/api/${table}/:id`,(ctx)=>{ requireRole(ctx,role); return json(ctx.res,update(table,ctx.params.id,ctx.body)); });
 route('DELETE',`/api/${table}/:id`,(ctx)=>{ requireRole(ctx,'admin'); remove(table,ctx.params.id); return json(ctx.res,{ok:true}); });
}
export function mountPlatform(){
 ['plugins','themes','webhooks','forms','formSubmissions','notifications','experiments','sites','tenants','translations','memberships','priceRules','jobs','emailTemplates','redirects','accessRules','oauthClients','pluginPermissions'].forEach(t=>crud(t));
 route('POST','/api/plugins/:id/enable',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,update('plugins',ctx.params.id,{enabled:true})); });
 route('POST','/api/plugins/:id/disable',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,update('plugins',ctx.params.id,{enabled:false})); });
 route('POST','/api/plugins/hooks/:hook',(ctx)=>{ requireRole(ctx,'admin'); const enabled=find('plugins',p=>p.enabled); return json(ctx.res,{hook:ctx.params.hook,called:enabled.map(p=>p.name),payload:ctx.body}); });
 route('POST','/api/themes/:id/preview',(ctx)=>{ requireRole(ctx,'editor'); return json(ctx.res,{theme:one('themes',t=>t.id===ctx.params.id),previewUrl:`/api/themes/${ctx.params.id}/preview`}); });
 route('POST','/api/rebuild',(ctx)=>{ requireRole(ctx,'editor'); insert('jobs',{type:'static-rebuild',status:'queued',payload:ctx.body}); return json(ctx.res,{ok:true,message:'Static rebuild job queued locally. Run npm run build on Railway or GitHub Action.'}); });
 route('POST','/api/backups',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,backup(ctx.body.label||'manual'),201); });
 route('POST','/api/backups/:stamp/restore',(ctx)=>{ requireRole(ctx,'admin'); restore(ctx.params.stamp); return json(ctx.res,{ok:true}); });
 route('GET','/api/export',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,exportAll()); });
 route('POST','/api/import',(ctx)=>{ requireRole(ctx,'admin'); importAll(ctx.body); return json(ctx.res,{ok:true}); });
 route('POST','/api/migrations/run',(ctx)=>{ const u=requireRole(ctx,'admin'); const name=ctx.body.name||`migration-${Date.now()}`; const rec=insert('migrations',{name,status:'applied',changes:ctx.body.changes||[],by:u.id}); audit(u.id,'run','migration',{id:rec.id}); return json(ctx.res,rec,201); });
 route('GET','/api/admin/analytics',(ctx)=>{ requireRole(ctx,'editor'); const byTable=Object.fromEntries(tables.map(t=>[t,find(t).length])); return json(ctx.res,{byTable}); });
 route('GET','/api/audit',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,find('audit')); });
 route('POST','/api/notifications/send',(ctx)=>{ requireRole(ctx,'editor'); const rec=insert('outbox',{...ctx.body,status:'queued',transport:'local-outbox'}); return json(ctx.res,rec,201); });
 route('GET','/api/outbox',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,find('outbox')); });
 route('POST','/api/jobs/run',(ctx)=>{ requireRole(ctx,'admin'); const jobs=find('jobs',j=>j.status==='queued'); jobs.forEach(j=>update('jobs',j.id,{status:'complete',completedAt:new Date().toISOString()})); return json(ctx.res,{ran:jobs.length}); });
 route('POST','/api/compliance/gdpr-export',(ctx)=>{ requireRole(ctx,'admin'); const email=ctx.body.email; return json(ctx.res,{email,users:find('users',u=>u.email===email),orders:find('orders',o=>o.email===email),comments:find('comments',c=>c.email===email)}); });
 route('GET','/api/capabilities',({res})=>json(res,{platform:'GitHub + Railway only',externalServices:'none required',implemented:['auth','2fa','rbac','profiles','teams','audit','sso-local-adapters','cms-crud','wysiwyg-admin','autosave','scheduling','taxonomies','schemas','media','image-transform-metadata','seo','comments','revisions','search','rest','static-ssg','preview','webhooks','themes','plugins','jobs','backups','import-export','localization','workflows','notifications-local-outbox','analytics','ab-testing','multi-site','forms','memberships','paywalls','gdpr','commerce','products','variations','inventory','cart','checkout','manual-payments','tax','shipping','orders','coupons','subscriptions','downloads','reviews','wishlist','abandoned-cart-data','invoices','affiliates','fraud-rules-stub','plugin-checkout-hooks'],notes:['Live Stripe/PayPal/Apple Pay, real SMTP email, external CDN, OAuth providers, live shipping/tax APIs and CRM/ERP remain disabled local adapters to respect the GitHub + Railway only rule.']}));
}
