#!/usr/bin/env node
import fs from 'node:fs';
import { backup, exportAll, importAll, find, insert } from '../src/core/store.js';
import { hashPassword } from '../src/core/security.js';
const [cmd,...args]=process.argv.slice(2);
if(cmd==='backup') console.log(JSON.stringify(backup(args[0]||'cli'),null,2));
else if(cmd==='export') console.log(JSON.stringify(exportAll(),null,2));
else if(cmd==='import'){ const data=JSON.parse(fs.readFileSync(args[0],'utf8')); importAll(data); console.log('imported'); }
else if(cmd==='user:add'){ const [email,password,role='admin']=args; console.log(JSON.stringify(insert('users',{email,name:email,role,passwordHash:hashPassword(password),verified:true,profile:{},permissions:role==='admin'?['*']:[]}),null,2)); }
else if(cmd==='stats') console.log(JSON.stringify({content:find('content').length,products:find('products').length,orders:find('orders').length},null,2));
else console.log('Usage: node cli/cms.js backup|export|import <file>|user:add <email> <password> [role]|stats');
