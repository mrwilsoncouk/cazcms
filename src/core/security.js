import crypto from 'node:crypto';
const SECRET = process.env.APP_SECRET || 'dev-secret-change-me';
export function hashPassword(password, salt=crypto.randomBytes(16).toString('hex')){ const hash=crypto.scryptSync(password, salt, 64).toString('hex'); return `${salt}:${hash}`; }
export function verifyPassword(password, stored=''){ const [salt,hash]=stored.split(':'); if(!salt||!hash) return false; return crypto.timingSafeEqual(Buffer.from(hash,'hex'), Buffer.from(hashPassword(password,salt).split(':')[1],'hex')); }
export function sign(payload, ttlMs=1000*60*60*24*7){ const body=Buffer.from(JSON.stringify({...payload, exp:Date.now()+ttlMs})).toString('base64url'); const sig=crypto.createHmac('sha256',SECRET).update(body).digest('base64url'); return `${body}.${sig}`; }
export function verify(token=''){ const [body,sig]=token.split('.'); if(!body||!sig) return null; const good=crypto.createHmac('sha256',SECRET).update(body).digest('base64url'); if(!crypto.timingSafeEqual(Buffer.from(sig),Buffer.from(good))) return null; const data=JSON.parse(Buffer.from(body,'base64url').toString()); return data.exp>Date.now()?data:null; }
export function totpSecret(){ return crypto.randomBytes(20).toString('hex'); }
export function totpCode(secret){ const window=Math.floor(Date.now()/30000); return crypto.createHmac('sha1',secret).update(String(window)).digest('hex').slice(0,6); }
export function sanitizeHtml(input=''){ return String(input).replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi,'').replace(/on\w+="[^"]*"/g,''); }
export function slugify(s=''){ return String(s).toLowerCase().trim().replace(/[^a-z0-9]+/g,'-').replace(/(^-|-$)/g,''); }
export const roles={admin:100,editor:70,author:50,subscriber:10};
export function can(user, level='subscriber'){ return !!user && (roles[user.role]||0) >= (roles[level]||0); }
