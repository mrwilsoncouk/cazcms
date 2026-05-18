#!/usr/bin/env node
import { insert, one, find } from '../src/core/store.js';
import { hashPassword } from '../src/core/security.js';
const adminEmail=process.env.ADMIN_EMAIL||'admin@example.com';
const adminPassword=process.env.ADMIN_PASSWORD||'ChangeMe123!';
if(!one('users',u=>u.email===adminEmail)) {
  insert('users',{email:adminEmail,name:'Admin',role:'admin',passwordHash:hashPassword(adminPassword),verified:true,profile:{bio:'Default admin'},teams:[],twoFactor:{enabled:false},permissions:['*']});
  console.log(`Created admin user ${adminEmail}`);
} else console.log(`Admin user ${adminEmail} already exists`);
if(find('themes').length===0) insert('themes',{name:'Default Static Theme',handle:'default',enabled:true,tokens:{color:'#111111',accent:'#4f46e5',font:'system-ui'},layouts:{header:'Default Header',footer:'Default Footer'},templates:{post:'post.html',page:'page.html',product:'product.html'},components:['hero','richText','products','form','gallery']});
if(find('plugins').length===0) insert('plugins',{name:'Core Checkout Hooks',handle:'core-checkout',enabled:true,version:'1.0.0',permissions:['checkout:extend'],hooks:['checkout.before','checkout.after'],compatibility:'>=2'});
console.log('Seed complete.');
