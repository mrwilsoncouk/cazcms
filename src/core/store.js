import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const DATA_DIR = process.env.DATA_DIR || './data';
export const tables = ['users','teams','sessions','content','revisions','taxonomies','media','comments','plugins','themes','audit','products','productVariants','inventory','carts','orders','coupons','subscriptions','forms','formSubmissions','notifications','experiments','sites','tenants','translations','memberships','shipments','invoices','affiliates','webhooks','backups','imports','exports','settings','outbox','licenses','reviews','wishlists','priceRules','jobs','migrations','payments','taxRules','shippingZones','pageBlocks','schemaFields','redirects','accessRules','files','emailTemplates','oauthClients','ssoProviders','pluginPermissions','cdnAssets','searchIndexes','graphqlSchemas','frameworkRoutes','pageBuilderLayouts','pluginMarketplace','pluginUpdateChannels','pluginSandboxes','deliveryChannels','accessibilityAudits','paymentGateways','crmConnectors','fraudRules','emailProviders','emailEvents','paypalTransactions','paypalWebhooks','notificationPreferences','notificationEvents','pushSubscriptions','cdnProviders','cdnPurgeJobs','cdnOrigins','cdnRules','queryIndexes','buildCache','performanceBudgets'];

export const id = (prefix='id') => `${prefix}_${crypto.randomBytes(10).toString('hex')}`;
export const now = () => new Date().toISOString();
function file(table){ return path.join(DATA_DIR, `${table}.json`); }
export function ensure(){ fs.mkdirSync(DATA_DIR,{recursive:true}); fs.mkdirSync(path.join(DATA_DIR,'backups'),{recursive:true}); for(const t of tables){ if(!fs.existsSync(file(t))) fs.writeFileSync(file(t),'[]'); }}
ensure();
export function read(table){ ensure(); return JSON.parse(fs.readFileSync(file(table),'utf8') || '[]'); }
export function write(table, rows){ ensure(); fs.writeFileSync(file(table), JSON.stringify(rows,null,2)); return rows; }
export function insert(table, row){ const rows=read(table); const rec={id:id(table.slice(0,4)), createdAt:now(), updatedAt:now(), ...row}; rows.push(rec); write(table,rows); return rec; }
export function update(table, recId, patch){ const rows=read(table); const i=rows.findIndex(r=>r.id===recId); if(i<0) return null; rows[i]={...rows[i],...patch,updatedAt:now()}; write(table,rows); return rows[i]; }
export function upsert(table, pred, row){ const old=read(table).find(pred); return old ? update(table, old.id, row) : insert(table,row); }
export function remove(table, recId){ const rows=read(table); const out=rows.filter(r=>r.id!==recId); write(table,out); return rows.length!==out.length; }
export function find(table, fn=()=>true){ return read(table).filter(fn); }
export function one(table, fn=()=>true){ return read(table).find(fn) || null; }
export function audit(actor, action, target, details={}){ return insert('audit',{actor:actor||'system', action, target, details, ip:details.ip||null}); }
export function backup(label='manual'){ const stamp=now().replace(/[:.]/g,'-'); const dir=path.join(DATA_DIR,'backups',stamp); fs.mkdirSync(dir,{recursive:true}); for(const t of tables){ if(fs.existsSync(file(t))) fs.copyFileSync(file(t),path.join(dir,`${t}.json`)); } const rec=insert('backups',{label, stamp, path:dir, status:'complete'}); return rec; }
export function restore(stamp){ const dir=path.join(DATA_DIR,'backups',stamp); if(!fs.existsSync(dir)) throw new Error('Backup not found'); for(const f of fs.readdirSync(dir)){ if(f.endsWith('.json')) fs.copyFileSync(path.join(dir,f),path.join(DATA_DIR,f)); } return true; }
export function exportAll(){ const data={}; for(const t of tables) data[t]=read(t); return data; }
export function importAll(data){ for(const [t,rows] of Object.entries(data)){ if(tables.includes(t) && Array.isArray(rows)) write(t, rows); } return true; }
