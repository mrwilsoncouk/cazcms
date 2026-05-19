#!/usr/bin/env node
import { insert, one, find } from '../src/core/store.js';
import { hashPassword } from '../src/core/security.js';

const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';

if (!one('users', u => u.email === adminEmail)) {
  insert('users', {
    email: adminEmail,
    name: 'Admin',
    role: 'admin',
    passwordHash: hashPassword(adminPassword),
    verified: true,
    profile: { bio: 'Default admin' },
    teams: [],
    twoFactor: { enabled: false },
    permissions: ['*']
  });
  console.log(`Created admin user ${adminEmail}`);
} else {
  console.log(`Admin user ${adminEmail} already exists`);
}

// Ensure the standard fallback theme remains available
if (find('themes', t => t.handle === 'default').length === 0) {
  insert('themes', {
    name: 'Default Static Theme',
    handle: 'default',
    enabled: false,
    tokens: { color: '#111111', accent: '#4f46e5', font: 'system-ui' },
    layouts: { header: 'Default Header', footer: 'Default Footer' },
    templates: { post: 'post.html', page: 'page.html', product: 'product.html' },
    components: ['hero', 'richText', 'products', 'form', 'gallery']
  });
}

// Inject or overwrite the Premium PP Theme Option to make it visible inside Settings panel selections
const existingPP = one('themes', t => t.handle === 'pp');
if (!existingPP) {
  insert('themes', {
    name: 'PP Premium Corporate Theme',
    handle: 'pp',
    enabled: true, // Auto-enable this as the primary building block theme
    tokens: {
      color: '#121e15',
      accent: '#2f9e44',
      bg_main: '#f4f8f5',
      panel: '#ffffff',
      font: 'Inter, system-ui, -apple-system, sans-serif'
    },
    layouts: { header: 'PP Corporate Nav', footer: 'PP Corporate Footer' },
    templates: { post: 'post.html', page: 'page.html', product: 'product.html' }
  });
  console.log('PP Premium Corporate Theme injected successfully into seed configs.');
}

if (find('plugins').length === 0) {
  insert('plugins', {
    name: 'Core Checkout Hooks',
    handle: 'core-checkout',
    enabled: true,
    version: '1.0.0',
    permissions: ['checkout:extend'],
    hooks: ['checkout.before', 'checkout.after'],
    compatibility: '>=2'
  });
}

console.log('Seed complete.');
