import { route, json } from '../core/http.js';
import { insert, update, find, one, remove, audit } from '../core/store.js';
import { hashPassword, verifyPassword, sign, totpSecret, totpCode, can } from '../core/security.js';

function requireUser(ctx){ if(!ctx.user) throw new Error('Login required'); return ctx.user; }
function requireRole(ctx, role='admin'){ const u=requireUser(ctx); if(!can(u,role)) throw new Error('Forbidden'); return u; }

export function mountAuth(){
 route('POST','/api/auth/register',({body,res,ip})=>{ if(one('users',u=>u.email===body.email)) return json(res,{error:'Email exists'},409); const user=insert('users',{email:body.email,name:body.name||body.email,role:body.role||'subscriber',passwordHash:hashPassword(body.password||'ChangeMe123!'),verified:false,profile:{},teams:[],twoFactor:{enabled:false},permissions:[]}); audit(user.id,'register','user',{ip}); return json(res,{user:{...user,passwordHash:undefined}, token:sign({uid:user.id})},201); });
 route('POST','/api/auth/login',({body,res,ip})=>{ const user=one('users',u=>u.email===body.email); if(!user || !verifyPassword(body.password||'',user.passwordHash)) return json(res,{error:'Invalid credentials'},401); if(user.twoFactor?.enabled && body.code!==totpCode(user.twoFactor.secret)) return json(res,{error:'2FA code required'},401); audit(user.id,'login','session',{ip}); return json(res,{token:sign({uid:user.id}),user:{...user,passwordHash:undefined}}); });
 route('GET','/api/auth/me',(ctx)=>{ const u=requireUser(ctx); return json(ctx.res,{user:{...u,passwordHash:undefined}}); });
 route('POST','/api/auth/logout',(ctx)=>{ requireUser(ctx); audit(ctx.user.id,'logout','session',{}); return json(ctx.res,{ok:true}); });
 route('POST','/api/auth/password-reset/request',({body,res})=>{ const user=one('users',u=>u.email===body.email); if(user){ const token=sign({uid:user.id,kind:'reset'},1000*60*30); insert('outbox',{type:'password-reset',to:user.email,subject:'Password reset',body:`Reset token: ${token}`,status:'queued'}); } return json(res,{ok:true,message:'If the account exists, a local outbox reset message was queued.'}); });
 route('POST','/api/auth/password-reset/confirm',({body,res})=>{ const user=one('users',u=>u.email===body.email); if(!user) return json(res,{error:'Invalid request'},400); update('users',user.id,{passwordHash:hashPassword(body.password)}); audit(user.id,'password-reset','user',{}); return json(res,{ok:true}); });
 route('POST','/api/auth/email/verify',({body,res})=>{ const user=one('users',u=>u.email===body.email); if(!user) return json(res,{error:'Not found'},404); update('users',user.id,{verified:true}); return json(res,{ok:true}); });
 route('POST','/api/auth/2fa/setup',(ctx)=>{ const user=requireUser(ctx); const secret=totpSecret(); update('users',user.id,{twoFactor:{enabled:false,secret}}); return json(ctx.res,{secret,currentCodeForLocalTesting:totpCode(secret)}); });
 route('POST','/api/auth/2fa/enable',(ctx)=>{ const user=requireUser(ctx); if(ctx.body.code!==totpCode(user.twoFactor?.secret)) return json(ctx.res,{error:'Invalid 2FA code'},400); update('users',user.id,{twoFactor:{...user.twoFactor,enabled:true}}); return json(ctx.res,{ok:true}); });
 route('GET','/api/users',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,find('users').map(u=>({...u,passwordHash:undefined}))); });
 route('GET','/api/users/:id',(ctx)=>{ requireUser(ctx); const u=one('users',x=>x.id===ctx.params.id); return json(ctx.res,{...u,passwordHash:undefined}); });
 route('PATCH','/api/users/:id',(ctx)=>{ const user=requireUser(ctx); if(user.id!==ctx.params.id && !can(user,'admin')) throw new Error('Forbidden'); const patch={name:ctx.body.name,profile:ctx.body.profile,role:can(user,'admin')?ctx.body.role:undefined,permissions:can(user,'admin')?ctx.body.permissions:undefined}; const out=update('users',ctx.params.id,Object.fromEntries(Object.entries(patch).filter(([,v])=>v!==undefined))); audit(user.id,'update','user',{id:ctx.params.id}); return json(ctx.res,{...out,passwordHash:undefined}); });
 route('POST','/api/teams',(ctx)=>{ const u=requireRole(ctx,'editor'); const team=insert('teams',{name:ctx.body.name,members:ctx.body.members||[],roles:ctx.body.roles||{}}); audit(u.id,'create','team',{id:team.id}); return json(ctx.res,team,201); });
 route('GET','/api/teams',(ctx)=>{ requireUser(ctx); return json(ctx.res,find('teams')); });
 route('PATCH','/api/teams/:id',(ctx)=>{ const u=requireRole(ctx,'editor'); const team=update('teams',ctx.params.id,ctx.body); audit(u.id,'update','team',{id:ctx.params.id}); return json(ctx.res,team); });
 route('DELETE','/api/teams/:id',(ctx)=>{ const u=requireRole(ctx,'admin'); remove('teams',ctx.params.id); audit(u.id,'delete','team',{id:ctx.params.id}); return json(ctx.res,{ok:true}); });
 route('POST','/api/sso/providers',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,insert('ssoProviders',{...ctx.body,status:'configured-local-adapter'}),201); });
 route('GET','/api/sso/providers',(ctx)=>{ requireRole(ctx,'admin'); return json(ctx.res,find('ssoProviders')); });
}
