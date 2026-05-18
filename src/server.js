
function injectFreshRobocazTheme(html) {
  if (!html || typeof html !== 'string') return html;

  html = html.replace(/<link[^>]+href=["']\/(?:homepage-style-everywhere|final-site-style-fixes|direct-account-admin-style|robocaz-single-theme|polished-square-restore|actual-square-theme|sitewide-condensed-theme|commerce-theme-condensed)[^"']*\.css["'][^>]*>/gi, '');
  html = html.replace(/<script[^>]+src=["']\/(?:account-width-fix|final-site-style-fixes|direct-account-admin-style|robocaz-single-theme|force-live-theme|robocaz-live-theme)[^"']*\.js["'][^>]*><\/script>/gi, '');

  const isArea = html.includes('id="dashboard"') || html.includes("id='dashboard'") || html.includes('/admin') || html.includes('Admin') || html.includes('My Account');

  if (html.includes('</head>') && !html.includes('/rz-green-storefront.css')) {
    html = html.replace('</head>', '<link rel="stylesheet" href="/rz-green-storefront.css"><link rel="stylesheet" href="/rz-standard-area.css"></head>');
  }

  if (html.includes('<body') && !html.includes('rz-theme-loaded')) {
    html = html.replace(/<body([^>]*)>/i, '<body$1 class="' + (isArea ? 'rz-standard-area' : 'rz-green-storefront') + ' rz-theme-loaded">');
  }

  if (html.includes('</body>') && !html.includes('/rz-theme-loader.js')) {
    html = html.replace('</body>', '<script src="/rz-theme-loader.js"></script></body>');
  }

  return html;
}



function injectRobocazSingleTheme(html) {
  if (!html || typeof html !== 'string') return html;
  html = html.replace(/<link[^>]+href=["']\/(?:homepage-style-everywhere|final-site-style-fixes|direct-account-admin-style|polished-square-restore|actual-square-theme|sitewide-condensed-theme|commerce-theme-condensed)[^"']*\.css["'][^>]*>/gi, '');
  html = html.replace(/<script[^>]+src=["']\/(?:account-width-fix|final-site-style-fixes|direct-account-admin-style|force-live-theme|robocaz-live-theme)[^"']*\.js["'][^>]*><\/script>/gi, '');
  if (html.includes('</head>') && !html.includes('/robocaz-single-theme.css')) html = html.replace('</head>', '</head>');
  if (html.includes('</body>') && !html.includes('/robocaz-single-theme.js')) html = html.replace('</body>', '</body>');
  return html;
}



function injectDirectAccountAdminStyle(html) {
  if (!html || typeof html !== 'string') return html;
  if (html.includes('</head>') && !html.includes('/direct-account-admin-style.css')) html = html.replace('</head>', '</head>');
  if (html.includes('</body>') && !html.includes('/direct-account-admin-style.js')) html = html.replace('</body>', '</body>');
  return html;
}


/* HOME BOX IMAGE MAPPING FIX: homeBox only applies to hero/home box; categories/products use their own images. */
import http from 'http';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';

const PORT = process.env.PORT || 3000;
const DATA_DIR = process.env.DATA_DIR || './storage';
const DATA_FILE = path.join(DATA_DIR, 'cms-data.json');
const PUBLIC_DIR = path.join(DATA_DIR, 'public');
const CACHE_DIR = path.join(DATA_DIR, 'cache');
const STATIC_DIR = path.join(PUBLIC_DIR, 'pages');
const ACCOUNT_HTML = './src/account/index.html';
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
const THEME_ASSETS_DIR = './src/theme-assets';
const CMS_INTEGRITY_MANIFEST = './src/cms-integrity-manifest.json';
const CMS_EXPECTED_MANIFEST_SHA256 = 'efdb22c2574307fb58761ffec96b9a31490b99002eef427282b3424e88693431';

const memoryCache = new Map();


function sha256File(filePath) {
  let content = fs.readFileSync(filePath);
  if (path.normalize(filePath).endsWith(path.normalize('src/server.js'))) {
    content = Buffer.from(content.toString('utf8').replace(/const CMS_EXPECTED_MANIFEST_SHA256 = '[^']*'/, "const CMS_EXPECTED_MANIFEST_SHA256 = '__CMS_EXPECTED_MANIFEST_SHA256__'"), 'utf8');
  }
  return crypto.createHash('sha256').update(content).digest('hex');
}

function verifyCmsIntegrity() {
  if (process.env.CMS_INTEGRITY_CHECK === 'off') return { ok: true, disabled: true };
  if (!fs.existsSync(CMS_INTEGRITY_MANIFEST)) {
    return { ok: false, error: 'CMS integrity manifest is missing.' };
  }
  const raw = fs.readFileSync(CMS_INTEGRITY_MANIFEST, 'utf8');
  const actualManifestHash = crypto.createHash('sha256').update(raw).digest('hex');
  if (CMS_EXPECTED_MANIFEST_SHA256 && CMS_EXPECTED_MANIFEST_SHA256 !== '__CMS_EXPECTED_MANIFEST_SHA256__' && actualManifestHash !== CMS_EXPECTED_MANIFEST_SHA256) {
    return { ok: false, error: 'CMS integrity manifest checksum does not match the embedded checksum.' };
  }
  let manifest;
  try { manifest = JSON.parse(raw); } catch (err) { return { ok: false, error: 'CMS integrity manifest is invalid JSON.' }; }
  const files = manifest.files || {};
  const changed = [];
  const missing = [];
  for (const [relativePath, expectedHash] of Object.entries(files)) {
    const safePath = path.normalize(relativePath).replace(/^[.][.][\/]+/g, '');
    const filePath = path.join('.', safePath);
    if (!fs.existsSync(filePath)) { missing.push(relativePath); continue; }
    const actualHash = sha256File(filePath);
    if (actualHash !== expectedHash) changed.push(relativePath);
  }
  if (missing.length || changed.length) {
    return { ok: false, error: 'CMS files have been modified since release.', missing, changed };
  }
  return { ok: true, manifestHash: actualManifestHash, checkedFiles: Object.keys(files).length };
}

function ensureDirs() {
  for (const dir of [DATA_DIR, PUBLIC_DIR, CACHE_DIR, STATIC_DIR, UPLOADS_DIR]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  }
}


// Compatibility helper: used by the seeded read-only James viewer account.
function hashPassword(password) {
  return crypto.createHash('sha256').update(String(password)).digest('hex');
}

function ensureData() {
  ensureDirs();
  if (!fs.existsSync(DATA_FILE)) {
    const adminEmail = process.env.ADMIN_EMAIL || 'admin@example.com';
    const adminPassword = process.env.ADMIN_PASSWORD || 'ChangeMe123!';
    const now = new Date().toISOString();
    const data = {
      sessions: [],
      users: [{
        id: id(),
        email: adminEmail,
        name: 'Admin',
        role: 'admin',
        passwordHash: hash(adminPassword),
        createdAt: now,
        updatedAt: now
      }],
      pages: [{
        id: id(),
        title: 'Home',
        slug: '/',
        menuTitle: 'Home',
        showInMenu: true,
        menuOrder: 0,
        status: 'published',
        type: 'page',
        seoTitle: 'Home',
        seoDescription: 'Welcome to your CMS',
        content: '<h1>Welcome</h1><p>Edit this page in admin.</p>',
        updatedAt: now,
        createdAt: now
      }],
      posts: [],
      blogCategories: [],
      productCategories: [
        { id: id(), name: 'Boilies', slug: 'boilies', description: 'Carp bait and boilies.', imageUrl: '', parentId: '', menuOrder: 1, showInShop: true, createdAt: now, updatedAt: now },
        { id: id(), name: 'Rods & Reels', slug: 'rods-reels', description: 'Fishing rods, reels and setups.', imageUrl: '', parentId: '', menuOrder: 2, showInShop: true, createdAt: now, updatedAt: now },
        { id: id(), name: 'Tackle', slug: 'tackle', description: 'Tackle, hooks and accessories.', imageUrl: '', parentId: '', menuOrder: 3, showInShop: true, createdAt: now, updatedAt: now }
      ],
      products: [{
        id: id(),
        title: 'Example Product',
        slug: 'example-product',
        sku: 'EXAMPLE-001',
        price: 19.99,
        stock: 10,
        status: 'active',
        description: 'Example product created by the CMS.',
        categoryIds: [],
        images: [],
        createdAt: now,
        updatedAt: now
      }],
      orders: [],
      carts: [],
      supportMessages: [],
      errorLogs: [],
      backups: [],
      comments: [],
      reviews: [
        { id: id(), name: 'Mark T', rating: 5, quote: 'Brilliant quality and fast delivery.', location: 'UK', showOnHome: true, createdAt: now, updatedAt: now },
        { id: id(), name: 'Sarah J', rating: 5, quote: 'Consistent service every time.', location: 'UK', showOnHome: true, createdAt: now, updatedAt: now },
        { id: id(), name: 'Dave W', rating: 5, quote: 'Easy checkout and great products.', location: 'UK', showOnHome: true, createdAt: now, updatedAt: now }
      ],
      media: [],
      notifications: [{
        id: id(),
        title: 'CMS ready',
        message: 'Your admin UI and API are working.',
        read: false,
        createdAt: now
      }],
      emails: [],
      jobs: [],
      settings: {
        siteName: 'RoboCaz CMS',
        platform: 'GitHub + Railway only',
        theme: 'simple',
        paypalMode: 'sandbox',
        paypalClientId: '',
        emailProvider: 'local-outbox',
        emailFrom: 'no-reply@example.com',
        cdnProvider: 'local',
        shopFilters: { showCategoryFilter: true, showPriceFilter: true, showStockFilter: true, showSort: true, showSearch: true, defaultSort: 'newest' },
        contactPage: { heading: 'Contact Us', intro: 'Have a question about an order, product, delivery or your account? Use the form below and the team will get back to you as soon as possible.', showPhone: false, phone: '', email: '', address: '', formSubjectPlaceholder: 'What can we help with?', formMessagePlaceholder: 'Tell us what you need help with...', successMessage: 'Thanks. Your message has been received.' },
        themeBars: { topStrip: 'Free UK Delivery over £25', dealStrip: 'New deals are live - up to 30% off - shop now', tickerItems: ['Mark just bought Premium Mix','Sarah just bought Boilies','Dave just bought Liquid Feeds','Tom just bought Session Pack','James just bought Groundbait'] },
        logoUrl: '',
        logoAlt: 'Site logo',
        logoSize: 42,
        headerLogoPaddingTop: 18,
        headerLogoPaddingBottom: 18,
        adminThemeEnabled: true,
        accountThemeEnabled: true,
        brandImageMode: 'logo-watermark',
        themeBackgroundPack: 'custom-admin',
        themeBoxBackgrounds: {
          homeBox: '',
          winSetup: '',
          seasonDeals: '',
          whyChoose: '',
          offerWeek: ''
        },
        themeBoxColours: {
          hero: '#1d2d20',
          promo1: '#263821',
          promo2: '#6b3f16',
          product: '#586d34',
          category: '#24351f',
          gallery: '#3b5325'
        },
        currency: 'GBP',
        taxRate: 20,
        shippingFlatRate: 4.99,
        freeShippingOver: 75
      },
      routeManifest: {},
      navigation: [],
      menuItems: [],
      searchIndex: [],
      audit: []
    };
    rebuildGeneratedData(data, false);
    writeData(data);
  } else {
    const data = readDataRaw();
    let changed = false;
    data.pages = data.pages || [];
    data.posts = data.posts || [];
    data.blogCategories = data.blogCategories || [];
    data.productCategories = data.productCategories || [];
    data.products = data.products || [];
    for (const p of data.products || []) { p.categoryIds = p.categoryIds || []; p.images = p.images || []; }
    data.orders = data.orders || [];
    data.carts = data.carts || [];
    data.comments = data.comments || [];
    data.reviews = data.reviews || [];
    data.media = data.media || [];
    data.notifications = data.notifications || [];
    data.emails = data.emails || [];
    data.jobs = data.jobs || [];
    data.settings = data.settings || {};
    data.settings.logoSize = Number(data.settings.logoSize || 42);
    data.settings.headerLogoPaddingTop = Number(data.settings.headerLogoPaddingTop ?? 18);
    data.settings.headerLogoPaddingBottom = Number(data.settings.headerLogoPaddingBottom ?? 18);
    data.settings.adminThemeEnabled = data.settings.adminThemeEnabled !== false;
    data.settings.accountThemeEnabled = data.settings.accountThemeEnabled !== false;
    data.supportMessages = data.supportMessages || [];
    data.errorLogs = data.errorLogs || [];
    data.backups = data.backups || [];
    // FINAL RUNTIME DEFAULTS V5 - force requested setup even on Railway volumes
    data.settings = data.settings || {};
    data.settings.theme = 'commerce-pro';
    data.roles = data.roles || {};
    data.roles.viewer = { label:'Viewer', permissions:{ dashboard:['read'], pages:['read'], posts:['read'], products:['read'], productCategories:['read'], orders:['read'], users:['read'], comments:['read'], reviews:['read'], media:['read'], settings:['read'], audit:['read'], support:['read'], backups:['read'], notifications:['read'], emails:['read'], jobs:['read'], errorLogs:['read'], menuItems:['read'] } };
    data.menuItems = [
      {id:'menu-home',label:'Home',url:'/',parentId:'',menuOrder:10,visible:true},
      {id:'menu-about-us',label:'About Us',url:'/about-us',parentId:'',menuOrder:20,visible:true},
      {id:'menu-news',label:'News',url:'/news',parentId:'',menuOrder:25,visible:true},
      {id:'menu-delivery',label:'Delivery Information',url:'/delivery',parentId:'menu-about-us',menuOrder:21,visible:true},
      {id:'menu-returns',label:'Returns Policy',url:'/returns',parentId:'menu-about-us',menuOrder:22,visible:true},
      {id:'menu-privacy',label:'Privacy Policy',url:'/privacy',parentId:'menu-about-us',menuOrder:23,visible:true},
      {id:'menu-shop',label:'Shop',url:'/products',parentId:'',menuOrder:30,visible:true},
      {id:'menu-account',label:'My Account',url:'/account',parentId:'',menuOrder:40,visible:true},
      {id:'menu-faq',label:'FAQ',url:'/faq',parentId:'',menuOrder:50,visible:true},
      {id:'menu-contact',label:'Contact Us',url:'/contact',parentId:'',menuOrder:60,visible:true}
    ];
    data.users = data.users || [];
    const jamesExisting = data.users.find(u => String(u.email || '').toLowerCase() === 'james');
    if (jamesExisting) { jamesExisting.name='James'; jamesExisting.role='viewer'; jamesExisting.status='active'; jamesExisting.passwordHash=hashPassword('admin123'); }
    else data.users.push({ id:id(), name:'James', email:'james', passwordHash:hashPassword('admin123'), role:'viewer', status:'active', twoFactorEnabled:false, createdAt:new Date().toISOString(), updatedAt:new Date().toISOString() });
    writeData(data); // persist final runtime defaults v5

    // FINAL PATCH: default commerce menu/theme/viewer seed
    data.settings = data.settings || {};
    data.settings.theme = 'commerce';
    data.menuItems = data.menuItems || [];
    if (!data.menuItems.length) {
      const aboutId = id();
      const now = new Date().toISOString();
      data.menuItems = [
        { id: id(), label: 'Home', url: '/', parentId: '', menuOrder: 10, visible: true, createdAt: now, updatedAt: now },
        { id: aboutId, label: 'About Us', url: '/about-us', parentId: '', menuOrder: 20, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'News', url: '/news', parentId: '', menuOrder: 25, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'Delivery Information', url: '/delivery', parentId: aboutId, menuOrder: 21, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'Returns Policy', url: '/returns', parentId: aboutId, menuOrder: 22, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'Privacy Policy', url: '/privacy', parentId: aboutId, menuOrder: 23, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'Shop', url: '/products', parentId: '', menuOrder: 30, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'My Account', url: '/account', parentId: '', menuOrder: 40, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'FAQ', url: '/faq', parentId: '', menuOrder: 50, visible: true, createdAt: now, updatedAt: now },
        { id: id(), label: 'Contact Us', url: '/contact', parentId: '', menuOrder: 60, visible: true, createdAt: now, updatedAt: now }
      ];
    }
    data.roles = data.roles || {};
    data.roles.viewer = data.roles.viewer || { label: 'Viewer', permissions: { dashboard:['read'], pages:['read'], posts:['read'], products:['read'], productCategories:['read'], orders:['read'], users:['read'], comments:['read'], reviews:['read'], media:['read'], settings:['read'], audit:['read'], support:['read'], backups:['read'], notifications:['read'], emails:['read'], jobs:['read'], errorLogs:['read'], menuItems:['read'] } };
    if (!data.users.find(u => String(u.email || '').toLowerCase() === 'james')) data.users.push({ id: id(), name: 'James', email: 'james', passwordHash: hashPassword('admin123'), role: 'viewer', status: 'active', twoFactorEnabled: false, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() });

    for (const u of data.users || []) { u.addresses = u.addresses || []; u.wishlist = u.wishlist || []; u.downloads = u.downloads || []; u.subscriptions = u.subscriptions || []; }
    data.settings.shopFilters = data.settings.shopFilters || { showCategoryFilter: true, showPriceFilter: true, showStockFilter: true, showSort: true, showSearch: true, defaultSort: 'newest' };
    data.settings.contactPage = data.settings.contactPage || { heading: 'Contact Us', intro: 'Have a question about an order, product, delivery or your account? Use the form below and the team will get back to you as soon as possible.', showPhone: false, phone: '', email: '', address: '', formSubjectPlaceholder: 'What can we help with?', formMessagePlaceholder: 'Tell us what you need help with...', successMessage: 'Thanks. Your message has been received.' };
    data.settings.themeBars = data.settings.themeBars || { topStrip: 'Free UK Delivery over £25', dealStrip: 'New deals are live - up to 30% off - shop now', tickerItems: ['Mark just bought Premium Mix','Sarah just bought Boilies','Dave just bought Liquid Feeds','Tom just bought Session Pack','James just bought Groundbait'] };
    data.settings.themeBoxBackgrounds = data.settings.themeBoxBackgrounds || { homeBox: '', winSetup: '', seasonDeals: '', whyChoose: '', offerWeek: '' };
    const strictThemeBgs = data.settings.themeBoxBackgrounds || {};
    data.settings.themeBoxBackgrounds = {
      homeBox: strictThemeBgs.homeBox || strictThemeBgs.hero || '',
      winSetup: strictThemeBgs.winSetup || strictThemeBgs.promo1 || '',
      seasonDeals: strictThemeBgs.seasonDeals || strictThemeBgs.promo2 || '',
      whyChoose: strictThemeBgs.whyChoose || '',
      offerWeek: strictThemeBgs.offerWeek || ''
    };

    const oldThemeBgs = data.settings.themeBoxBackgrounds || {};
    data.settings.themeBoxBackgrounds = {
      homeBox: oldThemeBgs.homeBox || oldThemeBgs.hero || '',
      winSetup: oldThemeBgs.winSetup || oldThemeBgs.promo1 || '',
      seasonDeals: oldThemeBgs.seasonDeals || oldThemeBgs.promo2 || '',
      whyChoose: oldThemeBgs.whyChoose || '',
      offerWeek: oldThemeBgs.offerWeek || ''
    };
    for (const c of data.productCategories || []) c.imageUrl = c.imageUrl || '';
    for (const p of data.products || []) p.images = p.images || [];
    data.settings.themeBoxColours = data.settings.themeBoxColours || { hero: '#1d2d20', promo1: '#263821', promo2: '#6b3f16', product: '#586d34', category: '#24351f', gallery: '#3b5325' };
    data.audit = data.audit || [];
    for (const page of data.pages) {
      if (page.showInMenu === undefined) { page.showInMenu = page.status === 'published'; changed = true; }
      if (page.menuOrder === undefined) { page.menuOrder = 100; changed = true; }
      if (!page.menuTitle) { page.menuTitle = page.title; changed = true; }
    }
    rebuildGeneratedData(data, false);
    if (changed) writeData(data);
  }
}

function readDataRaw() {
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}
function readData() {
  ensureData();
  return readDataRaw();
}
function writeData(data) {
  ensureDirs();
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  memoryCache.clear();
}
function id() {
  return crypto.randomBytes(8).toString('hex');
}
function hash(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}
function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function slugify(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s || s === '/') return '/';
  s = s.replace(/^\/+|\/+$/g, '');
  s = s.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return '/' + (s || 'page');
}
function productSlug(input) {
  return String(input || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || id();
}
function normalizePage(page) {
  const now = new Date().toISOString();
  const title = page.title || 'Untitled';
  const slug = slugify(page.slug || title);
  return {
    ...page,
    title,
    slug,
    menuTitle: page.menuTitle || title,
    showInMenu: page.showInMenu !== false,
    menuOrder: Number(page.menuOrder ?? 100),
    status: page.status || 'draft',
    type: 'page',
    updatedAt: now
  };
}
function normalizePost(post) {
  const now = new Date().toISOString();
  const title = post.title || 'Untitled';
  return {
    ...post,
    title,
    slug: slugify(post.slug || title),
    showInMenu: false,
    status: post.status || 'draft',
    type: 'post',
    updatedAt: now
  };
}

function normalizeCategory(cat) {
  const now = new Date().toISOString();
  const name = cat.name || 'Untitled category';
  return {
    ...cat,
    name,
    slug: productSlug(cat.slug || name),
    description: cat.description || '',
    imageUrl: cat.imageUrl || '',
    parentId: cat.parentId || '',
    menuOrder: Number(cat.menuOrder || 100),
    showInShop: cat.showInShop !== false,
    updatedAt: now
  };
}
function categoryBySlug(data, slug) {
  return (data.productCategories || []).find(c => c.slug === slug);
}
function categoriesForProduct(data, product) {
  const ids = product.categoryIds || [];
  return (data.productCategories || []).filter(c => ids.includes(c.id));
}
function productMatchesCategory(data, product, categorySlug) {
  if (!categorySlug) return true;
  const cat = categoryBySlug(data, categorySlug);
  if (!cat) return false;
  return (product.categoryIds || []).includes(cat.id);
}
function sortProducts(products, sort) {
  const arr = [...products];
  if (sort === 'price-asc') arr.sort((a,b)=>Number(a.price||0)-Number(b.price||0));
  else if (sort === 'price-desc') arr.sort((a,b)=>Number(b.price||0)-Number(a.price||0));
  else if (sort === 'title') arr.sort((a,b)=>String(a.title).localeCompare(String(b.title)));
  else arr.sort((a,b)=>String(b.createdAt||'').localeCompare(String(a.createdAt||'')));
  return arr;
}
function filterProducts(data, params = {}) {
  let products = (data.products || []).filter(p => p.status === 'active');
  if (params.category) products = products.filter(p => productMatchesCategory(data, p, params.category));
  if (params.inStock === 'true') products = products.filter(p => Number(p.stock || 0) > 0);
  if (params.minPrice !== undefined && params.minPrice !== '') products = products.filter(p => Number(p.price || 0) >= Number(params.minPrice));
  if (params.maxPrice !== undefined && params.maxPrice !== '') products = products.filter(p => Number(p.price || 0) <= Number(params.maxPrice));
  if (params.q) {
    const q = String(params.q).toLowerCase();
    products = products.filter(p => JSON.stringify(p).toLowerCase().includes(q));
  }
  return sortProducts(products, params.sort || data.settings?.shopFilters?.defaultSort || 'newest');
}
function normalizeProduct(product) {
  const now = new Date().toISOString();
  const title = product.title || 'Untitled product';
  return {
    ...product,
    title,
    slug: productSlug(product.slug || title),
    sku: product.sku || ('SKU-' + id().slice(0,6).toUpperCase()),
    price: Number(product.price || 0),
    stock: Number(product.stock || 0),
    status: product.status || 'active',
    updatedAt: now
  };
}


function safeFileName(name) {
  const ext = path.extname(String(name || '')).toLowerCase().replace(/[^a-z0-9.]/g, '');
  const base = path.basename(String(name || 'file'), ext).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'file';
  return `${Date.now()}-${crypto.randomBytes(4).toString('hex')}-${base}${ext}`;
}

function mimeFromName(name) {
  const ext = path.extname(String(name || '')).toLowerCase();
  return ({
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.pdf': 'application/pdf',
    '.txt': 'text/plain',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm'
  })[ext] || 'application/octet-stream';
}

function isAllowedUpload(name, mime, size) {
  const ext = path.extname(String(name || '')).toLowerCase();
  const allowed = ['.png','.jpg','.jpeg','.webp','.gif','.svg','.pdf','.txt','.json','.csv','.mp4','.webm'];
  return allowed.includes(ext) && Number(size || 0) <= 25 * 1024 * 1024;
}

function send(res, status, body, headers = {}) {
  if (res.writableEnded) return;
  const isString = typeof body === 'string' || Buffer.isBuffer(body);
  const contentType = Buffer.isBuffer(body)
    ? 'application/octet-stream'
    : isString
      ? (headers['Content-Type'] || 'text/html; charset=utf-8')
      : 'application/json; charset=utf-8';
  res.writeHead(status, {
    'Content-Type': contentType,
    'Cache-Control': headers['Cache-Control'] || 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'SAMEORIGIN',
    ...headers
  });
  res.end(isString ? body : JSON.stringify(body));
}

function sendMaybeCompressed(req, res, status, body, headers = {}) {
  const accept = req.headers['accept-encoding'] || '';
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  if (accept.includes('br')) {
    return zlib.brotliCompress(Buffer.from(text), (err, compressed) => {
      if (err) return send(res, status, body, headers);
      send(res, status, compressed, { ...headers, 'Content-Encoding': 'br', 'Content-Type': headers['Content-Type'] || 'text/html; charset=utf-8' });
    });
  }
  if (accept.includes('gzip')) {
    return zlib.gzip(Buffer.from(text), (err, compressed) => {
      if (err) return send(res, status, body, headers);
      send(res, status, compressed, { ...headers, 'Content-Encoding': 'gzip', 'Content-Type': headers['Content-Type'] || 'text/html; charset=utf-8' });
    });
  }
  return send(res, status, body, headers);
}


function wooField(p, ...names) {
  for (const name of names) {
    if (p && p[name] !== undefined && p[name] !== null && String(p[name]).trim() !== '') return p[name];
  }
  return '';
}
function wooSplit(value) {
  return String(value || '').split(',').map(x => x.trim()).filter(Boolean);
}
function wooProductName(p) {
  return wooField(p, 'name', 'Name', 'title', 'Title') || 'Imported product';
}
function wooProductSlug(p) {
  return productSlug(wooField(p, 'slug', 'Slug') || wooProductName(p));
}
function wooProductSku(p) {
  return String(wooField(p, 'sku', 'SKU') || '');
}
function wooProductPrice(p) {
  return Number(wooField(p, 'price', 'Price', 'Regular price', 'Regular Price', 'regular_price') || 0);
}
function wooProductStock(p) {
  return Number(wooField(p, 'stock_quantity', 'Stock', 'stock') || 0);
}
function wooProductDescription(p) {
  return wooField(p, 'description', 'Description', 'short_description', 'Short description', 'Short Description') || '';
}
function wooProductId(p) {
  return String(wooField(p, 'id', 'ID') || '');
}
function wooImagesFromProduct(p) {
  if (Array.isArray(p.images)) return p.images.map(x => x.src || x.url || x).filter(Boolean);
  const raw = wooField(p, 'Images', 'images', 'Image', 'image');
  return wooSplit(raw);
}
function wooCategoriesFromProduct(p) {
  if (Array.isArray(p.categories)) return p.categories.map(c => c.name || c.slug || c).filter(Boolean);
  return wooSplit(wooField(p, 'Categories', 'categories', 'Category', 'category'));
}
function findOrCreateWooCategory(data, name) {
  name = String(name || '').trim();
  if (!name) return '';
  data.productCategories = data.productCategories || [];
  const slug = productSlug(name);
  let cat = data.productCategories.find(c => c.slug === slug || String(c.name || '').toLowerCase() === name.toLowerCase());
  if (!cat) {
    cat = { id: id(), name, slug, description: '', imageUrl: '', parentId: '', menuOrder: 100, showInShop: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    data.productCategories.push(cat);
  }
  return cat.id;
}

function parseBody(req) {
  return new Promise((resolve) => {
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) return resolve({});
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5_000_000) req.destroy();
    });
    req.on('end', () => {
      if (!body) return resolve({});
      try { resolve(JSON.parse(body)); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

function tokenFrom(req) {
  const auth = req.headers.authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7);
  return '';
}
function currentUser(req, data) {
  const token = tokenFrom(req);
  const session = data.sessions.find(s => s.token === token && new Date(s.expiresAt) > new Date());
  if (!session) return null;
  return data.users.find(u => u.id === session.userId) || null;
}
function requireAuth(req, res, data) {
  const user = currentUser(req, data);
  if (!user) {
    send(res, 401, { error: 'Not authenticated' });
    return null;
  }
  return user;
}

function roleLevel(role) {
  return ({ subscriber: 1, author: 2, editor: 3, admin: 4 })[role] || 1;
}

function canAccess(user, resource, action = 'read') {
  if (!user) return false;
  if (user.role === 'admin') return true;

  const matrix = {
    subscriber: {
      dashboard: ['read'],
      notifications: ['read', 'update'],
      orders: ['read-own'],
      profile: ['read', 'update']
    },
    author: {
      dashboard: ['read'],
      pages: ['read', 'create', 'update-own'],
      posts: ['read', 'create', 'update-own'],
      media: ['read', 'create'],
      comments: ['read'],
      reviews: ['read'],
      notifications: ['read', 'update'],
      profile: ['read', 'update']
    },
    editor: {
      dashboard: ['read'],
      pages: ['read', 'create', 'update', 'delete'],
      posts: ['read', 'create', 'update', 'delete'],
      products: ['read', 'create', 'update'],
      productCategories: ['read', 'create', 'update'],
      productCategories: ['read', 'create', 'update'],
      orders: ['read', 'update'],
      comments: ['read', 'update', 'delete'],
      reviews: ['read', 'create', 'update', 'delete'],
      media: ['read', 'create', 'update', 'delete'],
      notifications: ['read', 'update'],
      emails: ['read'],
      jobs: ['read'],
      audit: ['read'],
      settings: ['read'],
      profile: ['read', 'update']
    }
  };

  const allowed = matrix[user.role]?.[resource] || [];
  return allowed.includes(action) || allowed.includes('read') && action === 'read';
}

function requireRole(req, res, data, resource, action = 'read') {
  const user = requireAuth(req, res, data);
  if (!user) return null;
  if (!canAccess(user, resource, action)) {
    send(res, 403, { error: 'Permission denied', resource, action, role: user.role, isStaff: isStaffRole(user.role), accountUrl: '/account' });
    return null;
  }
  return user;
}

function sanitizeUserForResponse(user) {
  if (!user) return null;
  const { passwordHash, ...safe } = user;
  return safe;
}


function isStaffRole(role) { return ['admin','editor','author'].includes(role); }
function requireCustomer(req, res, data) { return requireAuth(req, res, data); }
function requireStaff(req, res, data) {
  const user = requireAuth(req, res, data);
  if (!user) return null;
  if (!isStaffRole(user.role)) { send(res, 403, { error: 'Staff access required' }); return null; }
  return user;
}
function visibleSectionsForRole(role) {
  if (role === 'admin') return ['dashboard','pages','posts','products','productCategories','orders','users','comments','reviews','media','notifications','emails','jobs','settings','audit'];
  if (role === 'editor') return ['dashboard','pages','posts','products','productCategories','orders','comments','reviews','media','notifications','emails','jobs','settings','audit'];
  if (role === 'author') return ['dashboard','pages','posts','media','comments','notifications'];
  return ['dashboard','notifications'];
}


function audit(data, user, action, target) {
  data.audit.unshift({
    id: id(),
    userId: user?.id || null,
    user: user?.email || 'system',
    action,
    target,
    createdAt: new Date().toISOString()
  });
  data.audit = data.audit.slice(0, 1000);
}
function addJob(data, type, payload = {}) {
  const job = { id: id(), type, payload, status: 'queued', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
  data.jobs.unshift(job);
  return job;
}
function addNotification(data, title, message) {
  const n = { id: id(), title, message, read: false, createdAt: new Date().toISOString() };
  data.notifications.unshift(n);
  return n;
}
function queueEmail(data, to, subject, body, template='general') {
  const email = { id: id(), to, subject, body, template, status: 'queued', createdAt: new Date().toISOString() };
  data.emails.unshift(email);
  addJob(data, 'email', { emailId: email.id });
  return email;
}

function rebuildGeneratedData(data, writeFiles = true) {
  const publishedPages = (data.pages || []).filter(p => p.status === 'published');
  const publishedPosts = (data.posts || []).filter(p => p.status === 'published');
  const activeProducts = (data.products || []).filter(p => p.status === 'active');
  const shownCategories = (data.productCategories || []).filter(c => c.showInShop !== false);

  data.navigation = publishedPages
    .filter(p => p.showInMenu !== false)
    .sort((a,b) => Number(a.menuOrder||0) - Number(b.menuOrder||0) || String(a.title).localeCompare(String(b.title)))
    .map(p => ({ title: p.menuTitle || p.title, slug: p.slug, id: p.id }));

  data.routeManifest = {};
  for (const p of publishedPages) data.routeManifest[p.slug] = { type: 'page', id: p.id, title: p.title };
  for (const p of publishedPosts) data.routeManifest[p.slug] = { type: 'post', id: p.id, title: p.title };
  for (const p of activeProducts) data.routeManifest['/products/' + p.slug] = { type: 'product', id: p.id, title: p.title };
  for (const c of shownCategories) data.routeManifest['/category/' + c.slug] = { type: 'productCategory', id: c.id, title: c.name };

  data.searchIndex = [
    ...publishedPages.map(p => ({ type:'page', id:p.id, title:p.title, slug:p.slug, text: stripHtml(p.content || '') })),
    ...publishedPosts.map(p => ({ type:'post', id:p.id, title:p.title, slug:p.slug, text: stripHtml(p.content || '') })),
    ...activeProducts.map(p => ({ type:'product', id:p.id, title:p.title, slug:'/products/'+p.slug, text:p.description || '' })),
    ...shownCategories.map(c => ({ type:'productCategory', id:c.id, title:c.name, slug:'/category/'+c.slug, text:c.description || '' }))
  ];

  if (writeFiles) buildStaticFiles(data);
}

function stripHtml(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}
function navHtml(data) {
  const nav = data.navigation || [];
  return `<nav>${nav.map(item => `<a href="${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a>`).join('')}<a href="/products">Products</a><a href="/cart">Cart</a><a href="/admin">Admin</a></nav>`;
}



function hasCarpBackgroundPack(data) {
  return (data.settings?.themeBackgroundPack || 'none') === 'fishing-responsive';
}
function hasFishingBackgroundPack(data) {
  const pack = data.settings?.themeBackgroundPack || 'none';
  return pack === 'fishing-photo-v2' || pack === 'fishing-hybrid' || pack === 'fishing-responsive';
}
function isPhotoV2(data) {
  return (data.settings?.themeBackgroundPack || 'none') === 'fishing-photo-v2';
}
function bgClass(data, n) {
  const pack = data.settings?.themeBackgroundPack || 'none';
  if (pack === 'fishing-photo-v2') return ` photo-bg photo-bg-${((Number(n) - 1) % 8) + 1}`;
  if (pack === 'fishing-hybrid') return ` hybrid-bg hybrid-bg-${((Number(n) - 1) % 8) + 1}`;
  if (pack === 'fishing-responsive') return ` fish-bg fish-bg-${((Number(n) - 1) % 10) + 1}`;
  return '';
}

function availableThemes() {
  return [
    {
      id: 'simple',
      name: 'Simple Starter Theme',
      description: 'Clean minimal static CMS theme.'
    },
    {
      id: 'commerce-pro',
      name: 'Commerce Pro Theme',
      description: 'WooCommerce-style shop theme with promo bars, hero, product grids and footer.'
    }
  ];
}

function selectedTheme(data) {
  return (data.settings?.theme === 'commerce' ? 'commerce-pro' : (data.settings?.theme || 'simple'));
}

function simplePublicLayout(data, title, description, body) {
  const siteName = data.settings.siteName || 'CMS';
  const css = minifyCss(`
    .responsive-img{width:100%;height:auto;object-fit:cover}
    body{font-family:system-ui,Arial;margin:0;background:#f8fafc;color:#111827}
    header{padding:24px 40px;background:#111827;color:white}
    header a{color:white;text-decoration:none;margin-left:16px}
    nav{float:right}
    main{padding:40px;max-width:960px;margin:auto}
    .card,.page-card{background:white;border:1px solid #e5e7eb;border-radius:16px;padding:24px;box-shadow:0 10px 25px rgba(0,0,0,.05);margin-bottom:20px}
    .grid,.product-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}
    .product-card{background:white;border:1px solid #e5e7eb;border-radius:16px;padding:18px}
    .product-image{height:160px;background:#e5e7eb;border-radius:12px;display:grid;place-items:center;text-align:center;padding:12px;font-weight:800}
    .price{font-size:22px;font-weight:900}
    button,.btn{background:#4f46e5;color:white;border:0;border-radius:10px;padding:10px 13px;text-decoration:none;display:inline-block;font-weight:800;cursor:pointer}
    input,select,textarea{border:1px solid #e5e7eb;border-radius:10px;padding:10px;width:100%}
  `);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title || siteName)}</title>${isPhotoV2(data) ? '<link rel="preload" as="image" href="/theme-assets/photo-hero.webp" fetchpriority="high">' : ''}<meta name="description" content="${escapeHtml(description || '')}"><style>${css}${robocazUnifiedSquareCss()}
    @media(max-width:560px){
      .category-card.fish-bg{min-height:220px!important}
      .product-image.fish-bg{height:190px!important}
      .promo-card.fish-bg{min-height:200px!important}
      .catch-card .photo.fish-bg{height:160px!important}
    }
</style><link rel="stylesheet" href="/rz-green-storefront.css"></head><body class="rz-green-storefront rz-theme-loaded"><header><strong>${escapeHtml(siteName)}</strong><nav>${(data.navigation||[]).map(item=>`<a href="${escapeHtml(item.slug)}">${escapeHtml(item.title)}</a>`).join('')}<a href="/products">Products</a><a href="/cart">Cart</a><a href="/admin">Admin</a></nav></header><main>${body}</main><script>document.addEventListener('click',e=>{if(e.target.matches('[data-add-cart]')){const id=e.target.getAttribute('data-add-cart');let cart=JSON.parse(localStorage.getItem('cart')||'[]');const found=cart.find(x=>x.productId===id);if(found)found.qty=(found.qty||1)+1;else cart.push({productId:id,qty:1});localStorage.setItem('cart',JSON.stringify(cart));alert('Added to cart')}})</script></body></html>`;
}



function isImageMedia(m) {
  return String(m?.mime || m?.type || '').startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(String(m?.url || m?.path || m?.filename || ''));
}
function assetPathFromUrl(url) {
  const clean = String(url || '').split('?')[0];
  if (!clean.startsWith('/uploads/')) return '';
  return path.join(PUBLIC_DIR, clean.replace(/^\//, ''));
}
function publicUrlFromAssetPath(file) {
  const rel = path.relative(PUBLIC_DIR, file).replace(/\\/g, '/');
  return '/' + rel.replace(/^\/+/, '');
}
function responsiveImageMeta(url) {
  const clean = String(url || '').trim();
  if (!clean) return { src: '', srcset: '', sizes: '(max-width: 768px) 100vw, 50vw' };
  const ext = path.extname(clean).toLowerCase();
  const stem = clean.slice(0, clean.length - ext.length);
  const widths = [320, 640, 960, 1280];
  const srcset = widths.map(w => `${stem}-${w}${ext} ${w}w`).join(', ');
  return { src: clean, srcset, sizes: '(max-width: 640px) 100vw, (max-width: 1100px) 50vw, 33vw' };
}
function responsiveBgStyle(url, overlay='linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62))') {
  const clean = String(url || '').trim();
  if (!clean) return '';
  return `background-image:${overlay},url('${escapeHtml(clean)}');`;
}
function responsiveImgTag(url, alt='', className='responsive-img') {
  const m = responsiveImageMeta(url);
  if (!m.src) return '';
  return `<img class="${escapeHtml(className)}" src="${escapeHtml(m.src)}" srcset="${escapeHtml(m.srcset)}" sizes="${escapeHtml(m.sizes)}" alt="${escapeHtml(alt)}" loading="lazy" decoding="async">`;
}
function optimizeImageUrl(url) {
  return String(url || '').trim();
}
function optimizeAllImages(data) {
  data.media = data.media || [];
  const now = new Date().toISOString();
  let images = 0;
  let linked = 0;
  for (const m of data.media) {
    if (!isImageMedia(m)) continue;
    images++;
    m.optimized = true;
    m.loading = 'lazy';
    m.decoding = 'async';
    m.optimizedAt = now;
    m.srcset = responsiveImageMeta(m.url || m.path || '').srcset;
    m.sizes = responsiveImageMeta(m.url || m.path || '').sizes;
  }
  for (const p of data.products || []) {
    p.images = (p.images || []).map(optimizeImageUrl).filter(Boolean);
    linked += p.images.length;
  }
  for (const c of data.productCategories || []) {
    if (c.imageUrl) { c.imageUrl = optimizeImageUrl(c.imageUrl); linked++; }
  }
  const b = data.settings?.themeBoxBackgrounds || {};
  for (const k of Object.keys(b)) if (b[k]) { b[k] = optimizeImageUrl(b[k]); linked++; }
  data.settings = data.settings || {};
  data.settings.imageOptimization = {
    enabled: true,
    lastRunAt: now,
    imageCount: images,
    linkedImageCount: linked,
    responsiveImages: true,
    lazyLoading: true,
    decoding: 'async',
    note: 'Images are marked for responsive/lazy browser loading and CMS image references are normalised.'
  };
  return data.settings.imageOptimization;
}

function headerLogoPaddingTop(data){return Math.max(0,Math.min(80,Number(data.settings?.headerLogoPaddingTop??18)));}
function headerLogoPaddingBottom(data){return Math.max(0,Math.min(80,Number(data.settings?.headerLogoPaddingBottom??18)));}
function adminThemeEnabled(data){return data.settings?.adminThemeEnabled!==false;}
function accountThemeEnabled(data){return data.settings?.accountThemeEnabled!==false;}

function logoSize(data) {
  const size = Number(data.settings?.logoSize || 42);
  return Math.max(24, Math.min(180, size));
}

function logoUrl(data) {
  return String(data.settings?.logoUrl || '').trim();
}
function logoAlt(data) {
  return escapeHtml(data.settings?.logoAlt || data.settings?.siteName || 'Logo');
}
function logoImg(data, className = 'brand-logo') {
  const src = logoUrl(data);
  if (!src) return `<span class="${className} text-logo">${escapeHtml((data.settings?.siteName || 'CMS').slice(0, 2).toUpperCase())}</span>`;
  return `<img class="${className}" src="${escapeHtml(src)}" alt="${logoAlt(data)}" loading="lazy" style="width:${logoSize(data)}px;height:${logoSize(data)}px;max-width:${logoSize(data)}px;max-height:${logoSize(data)}px;object-fit:contain">`;
}
function brandVisual(data, label = '') {
  return `<div class="brand-visual">${logoImg(data, 'brand-visual-logo')}<span>${escapeHtml(label)}</span></div>`;
}


function themeBgUrl(data, key) {
  return String(data.settings?.themeBoxBackgrounds?.[key] || '').trim();
}
function themeColour(data, key, fallback) {
  return String(data.settings?.themeBoxColours?.[key] || fallback || '#1d2d20').trim();
}
function inlineBoxBg(data, key, fallbackColour = '#1d2d20') {
  const url = themeBgUrl(data, key);
  const colour = themeColour(data, key, fallbackColour);
  if (!url) return `style="background:${escapeHtml(colour)}"`;
  return `style="background-image:linear-gradient(180deg,rgba(0,0,0,.38),rgba(0,0,0,.68)),url('${escapeHtml(url)}');background-color:${escapeHtml(colour)}"`;
}
function categoryImageStyle(data, category) {
  const img = String(category?.imageUrl || '').trim();
  const colour = themeColour(data, 'category', '#24351f');
  if (img) return `style="background-image:linear-gradient(180deg,rgba(0,0,0,.18),rgba(0,0,0,.62)),url('${escapeHtml(img)}');background-color:${escapeHtml(colour)}"`;
  return `style="background:${escapeHtml(colour)}"`;
}


function categoryBgKey(i) {
  return `category${((Number(i) - 1) % 6) + 1}`;
}
function homeReviews(data) {
  const list = (data.reviews || []).filter(r => r.showOnHome !== false).slice(0, 6);
  if (!list.length) return '';
  return list.map(r => `<div class="review-card"><div class="stars">${'★'.repeat(Math.max(1, Math.min(5, Number(r.rating || 5))))}</div><p>"${escapeHtml(r.quote || '')}"</p><strong>- ${escapeHtml(r.name || 'Customer')}</strong>${r.location ? `<small>${escapeHtml(r.location)}</small>` : ''}</div>`).join('');
}



function productPreviewText(text = '') {
  return String(text || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

function productMainImage(product) {
  const fallback = '/assets/default-product.png';
  const candidates = [
    product?.image,
    product?.imageUrl,
    product?.thumbnail,
    product?.photo,
    product?.picture,
    product?.mainImage,
    product?.featuredImage,
    Array.isArray(product?.images) ? product.images[0] : '',
    Array.isArray(product?.gallery) ? product.gallery[0] : ''
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.trim() && c !== '#' && c !== 'null' && c !== 'undefined') return c.trim();
  }
  return fallback;
}
function productImageStyle(data, product, fallbackKey = 'product') {
  const img = productMainImage(product);
  const colour = themeColour(data, 'product', '#586d34');
  return `style="background-image:linear-gradient(180deg,rgba(0,0,0,.12),rgba(0,0,0,.52)),url('${escapeHtml(img)}');background-color:${escapeHtml(colour)}"`;
}

function tickerHtml(data) {
  const items = data.settings?.themeBars?.tickerItems || [];
  const safe = items.filter(Boolean).slice(0, 12);
  if (!safe.length) return '';
  return [...safe, ...safe].map(x => `<span>${escapeHtml(x)}</span>`).join('');
}
function productCards(data, limit = 4) {
  const products = (data.products || []).filter(p => p.status === 'active').slice(0, limit);
  return products.map((p, i) => `<article class="product-card">
    <div class="product-image admin-bg-box" ${productImageStyle(data, p)}>${!productMainImage(p) ? `<a href="/products/${escapeHtml(p.slug)}"><span>${escapeHtml(p.title || 'Product')}</span></a>` : ''}${i < 3 ? '<b>SALE</b>' : ''}</div>
    <div class="product-body">
      <h3><a href="/products/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></h3>
      <div class="stars">★★★★★</div>
      <p class="product-preview-text"></p>
      <div class="product-cats">${categoriesForProduct(data,p).map(c=>`<a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`).join('')}</div>
      <div class="price">${escapeHtml(data.settings.currency || 'GBP')} ${Number(p.price || 0).toFixed(2)}</div>
      <button data-add-cart="${p.id}">Add to Basket</button>
    </div>
  </article>`).join('');
}

function categoryCards(data) {
  return '';
}

function backendThemeCss(data, area='admin'){
  const enabled = area==='account' ? accountThemeEnabled(data) : adminThemeEnabled(data);
  if(!enabled) return '';
  const siteName = escapeHtml(data.settings?.siteName || 'CMS');
  return minifyCss(`:root{--dark:#0e1a14;--green:#6d8f42;--cream:#f6f1df;--paper:#fffaf0;--ink:#172017;--muted:#64705f;--line:#e7dec8}body{background:var(--cream)!important;color:var(--ink)!important;font-family:Inter,system-ui,Arial!important}header,.topbar,.admin-header{background:#f7f0d6!important;border-bottom:1px solid var(--line)!important;color:var(--ink)!important}aside,.sidebar,.nav{background:#f3f6ef!important;color:#142016!important;border-right:1px solid #d7decf!important;box-shadow:none!important}aside a,.sidebar a,.nav a{color:#142016!important}.card,.page-card,.panel,section{background:#fff!important;border:1px solid #d7decf!important;border-radius:4px!important;box-shadow:0 8px 18px rgba(0,0,0,.05)!important;padding:10px!important}button,.btn,input[type=button],input[type=submit]{background:#6f9144!important;color:white!important;border-radius:4px!important;border:0!important;font-weight:900!important;padding:7px 11px!important}button.secondary,.secondary{background:#e7dec8!important;color:var(--ink)!important}button.danger,.danger{background:#dc2626!important;color:white!important}input,select,textarea{border:1px solid #cfd7c7!important;border-radius:4px!important;background:#fff!important;color:var(--ink)!important;padding:8px!important}table,.table{background:var(--paper)!important;border-color:var(--line)!important}th{background:#efe5c8!important;color:var(--ink)!important}.notice{border-radius:16px!important;border-color:var(--line)!important}body:before{content:'${siteName}';display:block;background:var(--dark);color:white;text-align:center;font-weight:950;letter-spacing:.03em;padding:8px 12px}`);
}


function robocazUnifiedSquareCss() {
  return minifyCss(`
    :root{--dark:#f3f6ef!important;--green:#6f9144!important;--lime:#6f9144!important;--cream:#f3f6ef!important;--paper:#ffffff!important;--ink:#142016!important;--muted:#64748b!important;--line:#d7decf!important;--orange:#6f9144!important;--radius:4px!important}
    *{box-sizing:border-box!important;border-radius:4px!important}
    html,body{background:#f3f6ef!important;color:#142016!important;font-family:Inter,system-ui,Arial,sans-serif!important;letter-spacing:-.1px!important}

    .top-strip,.deal-strip,.ticker{background:#ffffff!important;color:#142016!important;border-bottom:1px solid #d7decf!important;padding:7px 10px!important;font-size:12px!important}
    .site-header,header{background:#ffffff!important;border-bottom:1px solid #d7decf!important;box-shadow:none!important;position:sticky!important;top:0!important}
    .header-inner{max-width:1180px!important;padding:10px 12px!important;gap:10px!important}
    .logo{color:#142016!important;font-size:22px!important;gap:8px!important}
    .text-logo{background:#6f9144!important;color:#fff!important;border-radius:4px!important;font-size:12px!important}
    .account-links{gap:10px!important;font-size:12px!important}
    nav.main-nav{background:#ffffff!important;color:#142016!important;border-bottom:1px solid #d7decf!important}
    nav.main-nav .nav-inner{max-width:1180px!important;padding:0 12px!important;gap:4px!important}
    .cms-menu-node>a,.nav-inner>a,nav.main-nav a{color:#142016!important;background:#ffffff!important;border:1px solid #d7decf!important;padding:8px 10px!important;margin:4px 4px 4px 0!important;font-size:12px!important;font-weight:800!important;text-transform:none!important;letter-spacing:0!important;text-decoration:none!important}
    .cms-menu-node:hover>a,.nav-inner>a:hover,nav.main-nav a:hover{background:#eef4df!important}
    .cms-submenu,.dropdown{background:#ffffff!important;color:#142016!important;border:1px solid #d7decf!important;box-shadow:0 8px 18px rgba(0,0,0,.08)!important;padding:6px!important}

    main{max-width:1180px!important;margin:0 auto!important;padding:10px 12px 24px!important;background:transparent!important}
    .hero{grid-template-columns:1.1fr .9fr!important;gap:10px!important;margin:10px 0!important}
    .hero-main{min-height:260px!important;padding:18px!important;border:1px solid #d7decf!important;box-shadow:0 8px 18px rgba(0,0,0,.05)!important}
    .hero-main h1{font-size:clamp(28px,5vw,52px)!important;line-height:.95!important;margin:0 0 8px!important}
    .hero-main p{font-size:14px!important;max-width:520px!important;margin:0 0 12px!important}
    .hero-side{gap:10px!important}
    .promo-card{min-height:125px!important;padding:14px!important;border:1px solid #d7decf!important;box-shadow:0 8px 18px rgba(0,0,0,.05)!important}
    .promo-card h3{font-size:17px!important;margin:0 0 3px!important}

    .section{margin:14px 0!important}
    .section-title{font-size:22px!important;margin:0 0 8px!important;letter-spacing:-.03em!important}
    .product-grid,.category-grid,.trust-grid,.catch-grid{grid-template-columns:repeat(auto-fill,minmax(190px,1fr))!important;gap:10px!important}
    .product-card,.category-card,.info-card,.review-card,.weather-card,.catch-card,.form-card,.offer-band,.page-card{background:#ffffff!important;border:1px solid #d7decf!important;box-shadow:0 8px 18px rgba(0,0,0,.05)!important;border-radius:4px!important;overflow:hidden!important}

    .product-image{height:145px!important;padding:10px!important}
    .product-image b{top:7px!important;left:7px!important;padding:4px 6px!important;font-size:10px!important}
    .product-body{padding:10px!important}
    .product-body h3{font-size:14px!important;line-height:1.25!important;margin:0 0 4px!important}
    .stars{font-size:11px!important;margin:3px 0!important}
    .product-body p,.product-preview-text{min-height:0!important;font-size:12px!important;line-height:1.35!important;margin:0 0 5px!important}
    .product-cats a{font-size:10px!important;margin-right:4px!important}
    .price{font-size:15px!important;margin:6px 0!important;font-weight:900!important}

    .category-card{height:150px!important;min-height:150px!important;padding:12px!important;color:#142016!important;background:#ffffff!important}
    .category-card h3{font-size:16px!important;margin:0 0 5px!important;color:#142016!important}
    .category-card p{font-size:12px!important;color:#64748b!important}
    .category-card a{color:#6f9144!important;font-size:12px!important}

    .why,.story{grid-template-columns:1fr 1fr!important;gap:10px!important}
    .why-copy{padding:14px!important;background:#ffffff!important;color:#142016!important;border:1px solid #d7decf!important}
    .why-copy p{color:#64748b!important}
    .info-card,.review-card,.weather-card,.form-card{padding:12px!important}
    .weather-card{background:#ffffff!important}
    .catch-card .photo{height:120px!important}
    .catch-card div:not(.photo){padding:10px!important}
    .offer-band{padding:16px!important;background:#ffffff!important;color:#142016!important;gap:10px!important}

    .footer{background:#ffffff!important;color:#142016!important;border-top:1px solid #d7decf!important;margin-top:16px!important}
    .footer-inner{max-width:1180px!important;padding:16px 12px!important;grid-template-columns:repeat(auto-fit,minmax(160px,1fr))!important;gap:12px!important}
    .footer h4{color:#142016!important;margin:0 0 6px!important;font-size:14px!important}
    .footer a,.footer p{color:#4b5563!important;font-size:12px!important;margin:4px 0!important}
    .footer-bottom{color:#64748b!important;border-top:1px solid #d7decf!important;padding:10px!important;font-size:12px!important}

    .btn,.hero-main a,button,input[type=submit],input[type=button]{background:#6f9144!important;color:#fff!important;border:0!important;border-radius:4px!important;padding:7px 11px!important;font-size:12px!important;min-height:auto!important;box-shadow:none!important}
    input,select,textarea{border:1px solid #cfd7c7!important;border-radius:4px!important;padding:8px!important;background:#fff!important}
    .form-card input,.form-card textarea,.form-card select{border-radius:4px!important;padding:8px!important;margin:4px 0 8px!important}

    @media(max-width:900px){
      .hero,.why,.story{grid-template-columns:1fr!important}
      .product-grid,.category-grid,.trust-grid,.catch-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .hero-main{min-height:220px!important}
      .header-inner{display:block!important}
    }
    @media(max-width:560px){
      main{padding:8px!important}
      .product-grid,.category-grid,.trust-grid,.catch-grid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
      .hero-main h1{font-size:30px!important}
      .product-image{height:125px!important}
    }
  `);
}


function injectNoCategoriesDefaultImage(html) {
  if (!html || typeof html !== 'string') return html;
  if (html.includes('</body>') && !html.includes('/shop-no-categories-default-image.js')) {
    html = html.replace('</body>', '<script src="/shop-no-categories-default-image.js"></script></body>');
  }
  return html;
}



function injectHomepageStyleEverywhere(html) {
  return injectFreshRobocazTheme(html);
}



function injectFinalSiteStyleFixes(html) {
  if (!html || typeof html !== 'string') return html;

  if (html.includes('</head>') && !html.includes('/final-site-style-fixes.css')) {
    html = html.replace('</head>', '</head>');
  }

  if (html.includes('</body>') && !html.includes('/final-site-style-fixes.js')) {
    html = html.replace('</body>', '</body>');
  }

  return html;
}


function commercePublicLayout(data, title, description, body) {
  const siteName = data.settings.siteName || 'RoboCaz';
  const css = minifyCss(`
    :root{--dark:#0e1a14;--green:#6d8f42;--lime:#b7d35f;--cream:#f6f1df;--paper:#fffaf0;--ink:#172017;--muted:#64705f;--line:#e7dec8;--orange:#d97706}
    *{box-sizing:border-box}
    body{font-family:Inter,system-ui,Arial;margin:0;background:var(--cream);color:var(--ink)}
    a{color:inherit}
    .top-strip{background:#7b9a43;color:white;text-align:center;font-size:13px;padding:8px 12px;font-weight:800;letter-spacing:.03em}
    .deal-strip{background:#111;color:white;text-align:center;font-size:13px;padding:10px 12px;text-transform:uppercase}
    .site-header{background:#f7f0d6;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:20}
    .header-inner{max-width:1220px;margin:auto;padding:${headerLogoPaddingTop(data)}px 22px ${headerLogoPaddingBottom(data)}px;display:flex;align-items:center;justify-content:space-between;gap:18px}
    .logo{font-weight:950;font-size:28px;letter-spacing:-.04em;color:#20331f;text-decoration:none;display:flex;align-items:center;gap:10px}.header-logo{width:auto;height:auto;object-fit:contain}.text-logo{display:inline-grid;place-items:center;background:#20331f;color:white;border-radius:12px;font-size:15px;font-weight:950}
    .account-links{font-size:13px;font-weight:800;display:flex;gap:16px;white-space:nowrap}
    nav.main-nav{background:var(--dark);color:white}
    nav.main-nav .nav-inner{max-width:1220px;margin:auto;display:flex;gap:0;align-items:center;overflow:auto}
    nav.main-nav a{display:block;padding:15px 18px;text-decoration:none;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
    nav.main-nav a:hover{background:#223426}
    .ticker{background:#20331f;color:#eef8d7;overflow:hidden;white-space:nowrap;font-size:13px}
    .ticker div{display:inline-block;padding:10px 0;animation:ticker 24s linear infinite}
    .ticker span{margin:0 24px}
    @keyframes ticker{from{transform:translateX(0)}to{transform:translateX(-50%)}}
    main{max-width:1220px;margin:auto;padding:0 22px 42px}
    .hero{display:grid;grid-template-columns:1.35fr .85fr;gap:20px;margin:24px 0}
    .hero-main{min-height:430px;border-radius:22px;padding:42px;background:linear-gradient(135deg,rgba(14,26,20,.92),rgba(65,82,38,.84)),radial-gradient(circle at 70% 20%,#9dbb54,transparent 35%);color:white;display:flex;align-items:flex-end;box-shadow:0 22px 45px rgba(23,32,23,.18)}
    .hero-main h1{font-size:clamp(42px,7vw,86px);line-height:.9;margin:0 0 14px;letter-spacing:-.07em}
    .hero-main p{font-size:19px;max-width:620px;margin:0 0 24px;color:#edf7d1}
    .btn,.hero-main a,button{background:#8baa45;color:white;border:0;border-radius:999px;padding:12px 18px;text-decoration:none;display:inline-block;font-weight:900;cursor:pointer}
    .hero-side{display:grid;gap:20px}
    .promo-card{border-radius:22px;padding:28px;color:white;min-height:205px;display:flex;align-items:flex-end;background:linear-gradient(135deg,#4c612f,#171f17)}
    .promo-card.alt{background:linear-gradient(135deg,#c46f12,#312111)}
    .promo-card h3{font-size:24px;margin:0 0 4px;text-transform:uppercase}
    .section{margin:38px 0}
    .section-title{font-size:34px;margin:0 0 18px;letter-spacing:-.04em}
    .product-grid,.category-grid,.trust-grid,.catch-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:18px}
    .product-card,.category-card,.info-card,.review-card,.weather-card,.catch-card,.form-card,.offer-band{background:var(--paper);border:1px solid var(--line);border-radius:20px;overflow:hidden;box-shadow:0 14px 30px rgba(23,32,23,.06)}
    .product-image{height:210px;background:linear-gradient(135deg,#d7c894,#586d34);display:flex;align-items:center;justify-content:center;text-align:center;padding:18px;color:white;font-weight:900;position:relative;overflow:hidden}.brand-visual{display:grid;place-items:center;gap:10px}.brand-visual-logo{max-width:120px;max-height:88px;object-fit:contain;filter:drop-shadow(0 10px 20px rgba(0,0,0,.22))}.brand-visual span{background:rgba(0,0,0,.28);backdrop-filter:blur(3px);padding:7px 10px;border-radius:999px}.hero-logo-mark{position:absolute;right:32px;top:32px;opacity:.2}.hero-logo{max-width:220px;max-height:160px;object-fit:contain}.hero-main{position:relative;overflow:hidden}
    .product-image b{position:absolute;top:12px;left:12px;background:#ef4444;border-radius:999px;padding:6px 9px;font-size:11px}
    .product-body{padding:18px}
    .product-body h3{margin:0 0 6px}
    .stars{color:#eab308;letter-spacing:1px;font-size:13px;margin:6px 0}
    .product-body p{color:var(--muted);font-size:14px;min-height:40px}.product-preview-text{display:none!important}
    .price{font-size:22px;font-weight:950;margin:12px 0}
    .category-card{height:270px;padding:22px;display:flex;align-items:flex-end;color:white;background:linear-gradient(135deg,#24351f,#7c9449)}
    .category-card:nth-child(even){background:linear-gradient(135deg,#2f3f24,#b07928)}
    .category-card h3{font-size:23px;margin:0 0 8px}.category-inner{display:grid;gap:10px}.category-logo{width:70px;height:55px;object-fit:contain;filter:drop-shadow(0 8px 16px rgba(0,0,0,.25))}.hidden-logo{display:none}
    .category-card a{font-weight:900}
    .why{display:grid;grid-template-columns:1fr 1fr;gap:22px;align-items:start}
    .why-copy{padding:26px;border-radius:22px;background:#1d2d20;color:white}
    .why-copy p{color:#dce8c8}
    .trust-grid{grid-template-columns:repeat(3,1fr)}
    .info-card,.review-card,.weather-card,.form-card{padding:22px}
    .review-card p{font-style:italic;color:#334155}
    .weather-card{background:#e7f3d0}
    .catch-grid{grid-template-columns:repeat(3,1fr)}
    .catch-card .photo{height:180px;background:linear-gradient(135deg,#3b5325,#a68a3a);display:grid;place-items:center}.gallery-logo{max-width:110px;max-height:90px;object-fit:contain;filter:drop-shadow(0 8px 18px rgba(0,0,0,.25))}
    .catch-card div:not(.photo){padding:16px}
    .story{display:grid;grid-template-columns:1fr 1fr;gap:22px}
    .form-card input,.form-card textarea,.form-card select{width:100%;border:1px solid var(--line);border-radius:12px;padding:11px;margin:7px 0 12px;background:white}
    .offer-band{padding:34px;background:#172017;color:white;display:flex;align-items:center;justify-content:space-between;gap:18px}
    .footer{background:#111;color:#e5e7eb;margin-top:36px}
    .footer-inner{max-width:1220px;margin:auto;padding:36px 22px;display:grid;grid-template-columns:repeat(4,1fr);gap:24px}
    .footer h4{color:white;margin:0 0 12px}
    .footer a{display:block;color:#d1d5db;text-decoration:none;margin:7px 0}
    .footer-bottom{text-align:center;padding:16px;border-top:1px solid #333;color:#aaa}
    .page-card{background:var(--paper);border:1px solid var(--line);border-radius:22px;padding:32px;margin:28px 0}
    img{max-width:100%;height:auto;loading:lazy}
    .cart-message{position:fixed;right:18px;bottom:18px;background:#111;color:white;padding:14px 18px;border-radius:999px;display:none}
    
    .fish-bg{background-image:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.56)),url('/theme-assets/fishing-responsive-category-collage.png');background-size:520% auto;background-repeat:no-repeat}
    .fish-bg-1{background-position:0% 0%}
    .fish-bg-2{background-position:25% 0%}
    .fish-bg-3{background-position:50% 0%}
    .fish-bg-4{background-position:75% 0%}
    .fish-bg-5{background-position:100% 0%}
    .fish-bg-6{background-position:0% 50%}
    .fish-bg-7{background-position:25% 50%}
    .fish-bg-8{background-position:50% 50%}
    .fish-bg-9{background-position:75% 50%}
    .fish-bg-10{background-position:100% 50%}
    .category-card.fish-bg,.promo-card.fish-bg,.catch-card .photo.fish-bg,.product-image.fish-bg{background-color:#10190e;color:white}
    .category-card.fish-bg{background-size:540% auto;background-position:center;min-height:250px}
    .promo-card.fish-bg{background-size:290% auto}
    .catch-card .photo.fish-bg{background-size:520% auto}
    .product-image.fish-bg{background-size:520% auto}

    
    .fish-bg{background-image:linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.58)),url('/theme-assets/fishing-responsive-category-collage.png')!important;background-size:520% auto!important;background-repeat:no-repeat!important;background-color:#10190e!important;color:white!important}
    .fish-bg-1{background-position:0% 0%!important}
    .fish-bg-2{background-position:25% 0%!important}
    .fish-bg-3{background-position:50% 0%!important}
    .fish-bg-4{background-position:75% 0%!important}
    .fish-bg-5{background-position:100% 0%!important}
    .fish-bg-6{background-position:0% 50%!important}
    .fish-bg-7{background-position:25% 50%!important}
    .fish-bg-8{background-position:50% 50%!important}
    .fish-bg-9{background-position:75% 50%!important}
    .fish-bg-10{background-position:100% 50%!important}
    .category-card.fish-bg{background-size:540% auto!important;min-height:250px}
    .promo-card.fish-bg{background-size:290% auto!important}
    .catch-card .photo.fish-bg{background-size:520% auto!important}
    .product-image.fish-bg{background-size:520% auto!important}

    
    /* Carp background sizing fix */
    .fish-bg{
      background-image:linear-gradient(180deg,rgba(0,0,0,.10),rgba(0,0,0,.62)),url('/theme-assets/fishing-responsive-category-collage.png')!important;
      background-repeat:no-repeat!important;
      background-color:#10190e!important;
      color:white!important;
      overflow:hidden!important;
    }

    /* The source collage is a 5 x 2 grid.
       These sizes crop each panel cleanly into each card instead of stretching. */
    .category-card.fish-bg{
      min-height:270px!important;
      background-size:500% 200%!important;
      background-position:center center!important;
    }

    .product-image.fish-bg{
      height:210px!important;
      background-size:500% 200%!important;
      background-position:center center!important;
    }

    .promo-card.fish-bg{
      min-height:230px!important;
      background-size:500% 200%!important;
      background-position:center center!important;
    }

    .hero-main.fish-bg{
      background-size:250% 100%!important;
      background-position:center center!important;
    }

    .catch-card .photo.fish-bg{
      height:180px!important;
      background-size:500% 200%!important;
      background-position:center center!important;
    }

    .fish-bg-1{background-position:0% 0%!important}
    .fish-bg-2{background-position:25% 0%!important}
    .fish-bg-3{background-position:50% 0%!important}
    .fish-bg-4{background-position:75% 0%!important}
    .fish-bg-5{background-position:100% 0%!important}
    .fish-bg-6{background-position:0% 100%!important}
    .fish-bg-7{background-position:25% 100%!important}
    .fish-bg-8{background-position:50% 100%!important}
    .fish-bg-9{background-position:75% 100%!important}
    .fish-bg-10{background-position:100% 100%!important}

    .category-card .category-inner,
    .promo-card > div,
    .product-image .brand-visual,
    .catch-card .photo .gallery-logo{
      position:relative;
      z-index:2;
    }

    .category-card.fish-bg::before,
    .promo-card.fish-bg::before,
    .product-image.fish-bg::before,
    .catch-card .photo.fish-bg::before{
      content:"";
      position:absolute;
      inset:0;
      background:linear-gradient(90deg,rgba(0,0,0,.55),rgba(0,0,0,.18));
      z-index:1;
      pointer-events:none;
    }

    .product-image.fish-bg::before{
      background:linear-gradient(180deg,rgba(0,0,0,.15),rgba(0,0,0,.65));
    }

    .category-card.fish-bg,
    .promo-card.fish-bg,
    .product-image.fish-bg,
    .catch-card .photo.fish-bg{
      position:relative;
    }

    
    /* Responsive fishing background pack - pure CSS, no fragile image crop */
    .fish-bg{position:relative!important;isolation:isolate!important;overflow:hidden!important;color:#fff!important;background-color:#142016!important;background-size:cover!important;background-position:center!important}
    .fish-bg::before{content:"";position:absolute;inset:0;z-index:-2;background:radial-gradient(circle at 18% 22%,rgba(132,190,74,.35),transparent 18%),radial-gradient(circle at 78% 18%,rgba(255,186,73,.22),transparent 22%),linear-gradient(135deg,#07110c 0%,#1e321b 42%,#0d1710 100%);transform:scale(1.08)}
    .fish-bg::after{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(120deg,rgba(255,255,255,.08) 0 1px,transparent 1px 24px),radial-gradient(ellipse at 50% 110%,rgba(0,0,0,.62),transparent 55%),linear-gradient(180deg,rgba(0,0,0,.08),rgba(0,0,0,.62));pointer-events:none}
    .fish-bg-1::before{background:linear-gradient(18deg,transparent 45%,rgba(205,218,165,.55) 46%,transparent 47%),linear-gradient(21deg,transparent 54%,rgba(205,218,165,.35) 55%,transparent 56%),radial-gradient(circle at 72% 24%,rgba(255,182,74,.32),transparent 18%),linear-gradient(135deg,#07110d,#24391e 55%,#0d1510)}
    .fish-bg-2::before{background:radial-gradient(circle at 70% 58%,rgba(117,76,34,.68),transparent 18%),radial-gradient(circle at 56% 66%,rgba(155,103,48,.62),transparent 16%),radial-gradient(circle at 82% 70%,rgba(93,60,28,.58),transparent 18%),linear-gradient(135deg,#10130d,#2a2b17 45%,#07100a)}
    .fish-bg-3::before{background:linear-gradient(150deg,transparent 38%,rgba(95,120,72,.45) 39%,transparent 43%),linear-gradient(35deg,transparent 54%,rgba(190,210,160,.28) 55%,transparent 57%),radial-gradient(circle at 70% 38%,rgba(113,147,63,.42),transparent 20%),linear-gradient(135deg,#0a120d,#28351f,#10120d)}
    .fish-bg-4::before{background:radial-gradient(ellipse at 68% 78%,rgba(88,111,61,.7),transparent 33%),linear-gradient(20deg,transparent 48%,rgba(180,200,130,.25) 49%,transparent 50%),radial-gradient(circle at 82% 18%,rgba(255,199,97,.28),transparent 18%),linear-gradient(135deg,#08110d,#1f2e1b,#0a1110)}
    .fish-bg-5::before{background:radial-gradient(ellipse at 72% 48%,rgba(88,104,72,.55),transparent 24%),radial-gradient(circle at 55% 30%,rgba(130,155,82,.33),transparent 16%),linear-gradient(135deg,#12140e,#2c3122 58%,#090e0c)}
    .fish-bg-6::before{background:radial-gradient(circle at 22% 75%,rgba(53,63,53,.75),transparent 22%),radial-gradient(circle at 76% 70%,rgba(85,103,48,.56),transparent 18%),linear-gradient(135deg,#0b100d,#1c2e1b,#070b09)}
    .fish-bg-7::before{background:radial-gradient(ellipse at 74% 66%,rgba(35,34,28,.72),transparent 24%),linear-gradient(18deg,transparent 50%,rgba(190,210,170,.32) 51%,transparent 52%),radial-gradient(circle at 50% 18%,rgba(132,190,74,.22),transparent 18%),linear-gradient(135deg,#090f0c,#28311f,#0d100c)}
    .fish-bg-8::before{background:radial-gradient(ellipse at 65% 58%,rgba(132,153,75,.62),transparent 26%),radial-gradient(circle at 45% 42%,rgba(204,221,145,.26),transparent 14%),linear-gradient(135deg,#07100d,#1b351b 52%,#08110e)}
    .fish-bg-9::before{background:radial-gradient(circle at 78% 55%,rgba(150,98,45,.55),transparent 20%),radial-gradient(circle at 66% 62%,rgba(88,113,54,.45),transparent 22%),radial-gradient(circle at 82% 20%,rgba(251,185,84,.32),transparent 17%),linear-gradient(135deg,#0d120d,#2b351d,#0c0d09)}
    .fish-bg-10::before{background:radial-gradient(circle at 78% 25%,rgba(255,166,64,.44),transparent 18%),linear-gradient(10deg,transparent 56%,rgba(205,218,165,.34) 57%,transparent 58%),linear-gradient(135deg,#11100c,#342814 55%,#0b0e0a)}
    .fish-bg .category-inner,.fish-bg .brand-visual,.fish-bg>div,.fish-bg h1,.fish-bg h2,.fish-bg h3,.fish-bg p,.fish-bg a,.fish-bg button{position:relative;z-index:2}
    .category-card.fish-bg{min-height:260px!important}.product-image.fish-bg{height:210px!important}.promo-card.fish-bg{min-height:230px!important}.hero-main.fish-bg{background-size:cover!important;background-position:center!important}.catch-card .photo.fish-bg{height:180px!important}
    @media(max-width:560px){.category-card.fish-bg{min-height:220px!important}.product-image.fish-bg{height:185px!important}.promo-card.fish-bg{min-height:195px!important}.catch-card .photo.fish-bg{height:150px!important}}

    
    /* Hybrid fishing photo-style backgrounds */
    .hybrid-bg{position:relative!important;isolation:isolate!important;overflow:hidden!important;color:#fff!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}
    .hybrid-bg::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(0,0,0,.74),rgba(0,0,0,.32) 55%,rgba(0,0,0,.58)),radial-gradient(circle at 80% 18%,rgba(135,184,77,.35),transparent 28%);pointer-events:none}
    .hybrid-bg::after{content:"";position:absolute;inset:0;z-index:-2;background:inherit;filter:saturate(1.08) contrast(1.05)}
    .hybrid-bg-1{background-image:url('/theme-assets/hybrid-hero.svg')!important}
    .hybrid-bg-2{background-image:url('/theme-assets/hybrid-rods.svg')!important}
    .hybrid-bg-3{background-image:url('/theme-assets/hybrid-bait.svg')!important}
    .hybrid-bg-4{background-image:url('/theme-assets/hybrid-tackle.svg')!important}
    .hybrid-bg-5{background-image:url('/theme-assets/hybrid-bankside.svg')!important}
    .hybrid-bg-6{background-image:url('/theme-assets/hybrid-apparel.svg')!important}
    .hybrid-bg-7{background-image:url('/theme-assets/hybrid-fish.svg')!important}
    .hybrid-bg-8{background-image:url('/theme-assets/hybrid-offer.svg')!important}
    .hybrid-bg .category-inner,.hybrid-bg .brand-visual,.hybrid-bg>div,.hybrid-bg h1,.hybrid-bg h2,.hybrid-bg h3,.hybrid-bg p,.hybrid-bg a,.hybrid-bg button{position:relative;z-index:2}
    .category-card.hybrid-bg{min-height:270px!important}
    .product-image.hybrid-bg{height:220px!important}
    .promo-card.hybrid-bg{min-height:235px!important}
    .hero-main.hybrid-bg{background-position:center!important}
    .catch-card .photo.hybrid-bg{height:185px!important}
    @media(max-width:560px){.category-card.hybrid-bg{min-height:220px!important}.product-image.hybrid-bg{height:190px!important}.promo-card.hybrid-bg{min-height:200px!important}.catch-card .photo.hybrid-bg{height:155px!important}}

    
    /* Photo Set V2 - optimized carp fishing WebP backgrounds */
    .photo-bg{position:relative!important;isolation:isolate!important;overflow:hidden!important;color:#fff!important;background-size:cover!important;background-position:center!important;background-repeat:no-repeat!important}
    .photo-bg::before{content:"";position:absolute;inset:0;z-index:-1;background:linear-gradient(90deg,rgba(0,0,0,.78),rgba(0,0,0,.32) 52%,rgba(0,0,0,.68)),radial-gradient(circle at 75% 18%,rgba(150,190,90,.28),transparent 26%);pointer-events:none}
    .photo-bg::after{content:"";position:absolute;inset:0;z-index:-2;background:inherit;filter:saturate(1.12) contrast(1.08)}
    .photo-bg-1{background-image:url('/theme-assets/photo-hero.webp')!important}
    .photo-bg-2{background-image:url('/theme-assets/photo-rods.webp')!important}
    .photo-bg-3{background-image:url('/theme-assets/photo-bait.webp')!important}
    .photo-bg-4{background-image:url('/theme-assets/photo-tackle.webp')!important}
    .photo-bg-5{background-image:url('/theme-assets/photo-bankside.webp')!important}
    .photo-bg-6{background-image:url('/theme-assets/photo-apparel.webp')!important}
    .photo-bg-7{background-image:url('/theme-assets/photo-carp.webp')!important}
    .photo-bg-8{background-image:url('/theme-assets/photo-night.webp')!important}
    .photo-bg .category-inner,.photo-bg .brand-visual,.photo-bg>div,.photo-bg h1,.photo-bg h2,.photo-bg h3,.photo-bg p,.photo-bg a,.photo-bg button{position:relative;z-index:2}
    .category-card.photo-bg{min-height:285px!important}
    .product-image.photo-bg{height:225px!important}
    .promo-card.photo-bg{min-height:245px!important}
    .hero-main.photo-bg{background-image:linear-gradient(90deg,rgba(0,0,0,.7),rgba(0,0,0,.18)),url('/theme-assets/photo-hero.webp')!important;background-size:cover!important;background-position:center!important}
    .catch-card .photo.photo-bg{height:190px!important}
    @media(min-width:1800px){.hero-main.photo-bg{background-image:linear-gradient(90deg,rgba(0,0,0,.7),rgba(0,0,0,.18)),url('/theme-assets/photo-hero-4k.webp')!important}}
    @media(max-width:560px){.category-card.photo-bg{min-height:220px!important}.product-image.photo-bg{height:190px!important}.promo-card.photo-bg{min-height:200px!important}.catch-card .photo.photo-bg{height:155px!important}}

    
    /* Admin controlled box backgrounds */
    .admin-bg-box{
      background-size:cover!important;
      background-position:center!important;
      background-repeat:no-repeat!important;
      color:white!important;
      position:relative!important;
      overflow:hidden!important;
      isolation:isolate!important;
    }
    .admin-bg-box > *,
    .admin-bg-box .category-inner,
    .admin-bg-box .brand-visual{
      position:relative;
      z-index:2;
    }
    .product-image.admin-bg-box,
    .category-card.admin-bg-box,
    .promo-card.admin-bg-box,
    .catch-card .photo.admin-bg-box{
      box-shadow:inset 0 0 0 1px rgba(255,255,255,.08);
    }
    .category-card.admin-bg-box{min-height:270px!important}
    .product-image.admin-bg-box{height:220px!important}
    .promo-card.admin-bg-box{min-height:235px!important}
    .hero-main.admin-bg-box{background-size:cover!important;background-position:center!important}
    .catch-card .photo.admin-bg-box{height:180px!important}
    .review-card small{display:block;color:#64748b;margin-top:8px}
    @media(max-width:560px){
      .category-card.admin-bg-box{min-height:220px!important}
      .product-image.admin-bg-box{height:190px!important}
      .promo-card.admin-bg-box{min-height:200px!important}
      .catch-card .photo.admin-bg-box{height:150px!important}
    }

    
    .shop-filters{display:grid;grid-template-columns:2fr 1.4fr 1fr 1fr auto auto;gap:10px;align-items:center;background:var(--paper);border:1px solid var(--line);padding:14px;border-radius:18px;margin:18px 0}
    .shop-filters input,.shop-filters select{border:1px solid var(--line);border-radius:999px;padding:10px 12px;background:white;width:100%}
    .shop-filters .check{font-size:13px;font-weight:800;display:flex;gap:6px;align-items:center}
    .shop-filters .check input{width:auto}
    
    /* Theme polish pass */
    .header-inner{min-height:76px}
    nav.main-nav a{transition:background .18s ease,color .18s ease}
    .hero{margin-top:28px}
    .hero-main,.promo-card,.product-card,.category-card,.review-card,.info-card,.weather-card,.catch-card,.form-card,.offer-band,.page-card{box-shadow:0 16px 38px rgba(23,32,23,.08)}
    .product-card{transition:transform .18s ease,box-shadow .18s ease}
    .product-card:hover{transform:translateY(-3px);box-shadow:0 22px 46px rgba(23,32,23,.12)}
    .product-body h3,.category-card h3{letter-spacing:-.02em}
    .product-body p{line-height:1.45}.product-preview-text{display:none!important}
    .category-card p{color:rgba(255,255,255,.86);max-width:280px}
    .shop-filters{box-shadow:0 12px 30px rgba(23,32,23,.05)}
    .product-cats{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
    .product-cats a,.product-cats span{background:#edf2da;color:#27351f;text-decoration:none;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:900}
    .product-detail-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px;align-items:start}
    .product-detail-grid .product-image{border-radius:18px}.product-detail-description{line-height:1.7;color:#334155;margin:16px 0}.product-detail-description table{max-width:100%;border-collapse:collapse}.product-detail-description img{max-width:100%;height:auto}
    @media(max-width:800px){.product-detail-grid{grid-template-columns:1fr}}

    .product-body h3 a{color:inherit;text-decoration:none}
    .product-body h3 a:hover{text-decoration:underline}
    .info-page h1{font-size:clamp(38px,5vw,68px);letter-spacing:-.05em;margin-top:0}
    .info-page h2{font-size:28px;letter-spacing:-.03em;margin-top:34px}
    .info-page p,.info-page li{line-height:1.72;color:#334155;font-size:16px}
    .info-page .lead{font-size:19px;color:#1f2937}
    .info-page .notice-box{background:#f7f0d6;border:1px solid var(--line);border-radius:18px;padding:20px;margin:22px 0}

    
    .contact-form{background:var(--paper);border:1px solid var(--line);border-radius:18px;padding:22px;margin-top:24px}
    .contact-form input,.contact-form textarea{width:100%;border:1px solid var(--line);border-radius:12px;padding:12px;background:white}
    .contact-form textarea{min-height:160px}

    
    .nav-inner{gap:0}
    .nav-item{position:relative;flex:0 0 auto}
    .nav-item>a{display:block;padding:15px 18px;text-decoration:none;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
    .nav-item:hover>a{background:#223426}
    .nav-item.has-children>a::after{content:"";display:inline-block;margin-left:7px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;vertical-align:middle}
    .dropdown{display:none;position:absolute;left:0;top:100%;min-width:230px;background:#111827;color:white;border:1px solid rgba(255,255,255,.08);box-shadow:0 18px 45px rgba(0,0,0,.28);border-radius:0 0 14px 14px;z-index:50;padding:8px}
    .nav-item:hover>.dropdown{display:block}
    .dropdown .nav-item{display:block;width:100%}
    .dropdown .nav-item>a{padding:11px 12px;text-transform:none;letter-spacing:0;border-radius:10px;font-size:14px}
    .dropdown .dropdown{left:100%;top:0;border-radius:14px}
.cms-submenu{position:static;display:block;box-shadow:none;border:0;background:#172017;border-radius:0;padding-left:16px}}

    
    /* Stable CMS Menu */
    .main-nav{position:relative;z-index:9999;overflow:visible}
    .nav-inner{position:relative;z-index:9999;overflow:visible}
    .cms-menu-node{position:relative;display:inline-block;z-index:10000}
    .cms-menu-node>a,.nav-inner>a{display:block;padding:15px 18px;text-decoration:none;font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:.04em}
    .cms-menu-node:hover>a,.nav-inner>a:hover{background:#223426}
    .cms-menu-node.has-submenu>a::after{content:"";display:inline-block;margin-left:7px;border-left:4px solid transparent;border-right:4px solid transparent;border-top:5px solid currentColor;vertical-align:middle}
    .cms-submenu{display:none;position:absolute;left:0;top:100%;min-width:245px;background:#111827;color:#fff;border:1px solid rgba(255,255,255,.08);border-radius:0 0 14px 14px;z-index:10050;padding:8px;box-shadow:0 18px 45px rgba(0,0,0,.38)}
    .cms-menu-node:hover>.cms-submenu{display:block}
    .cms-submenu .cms-menu-node{display:block;width:100%}
    .cms-submenu .cms-menu-node>a{padding:11px 12px;text-transform:none;letter-spacing:0;border-radius:10px;font-size:14px;white-space:nowrap}
    .cms-submenu .cms-submenu{left:100%;top:0;border-radius:14px}
    .ticker,.deal-strip,.top-strip{position:relative;z-index:1}
        /* FINAL dropdown overlay fix v5 */
    header,.site-header,.main-header{position:relative;z-index:9000;overflow:visible!important}.main-nav{position:relative!important;z-index:99999!important;overflow:visible!important}.nav-inner{position:relative!important;z-index:99999!important;overflow:visible!important}.cms-menu-node{position:relative!important;display:inline-block;z-index:100000!important}.cms-submenu{display:none;position:absolute!important;left:0;top:100%;min-width:245px;background:#111827;color:#fff;z-index:100001!important;padding:8px;box-shadow:0 18px 45px rgba(0,0,0,.38)}.cms-menu-node:hover>.cms-submenu{display:block!important}.cms-submenu .cms-menu-node{display:block;width:100%}.cms-submenu .cms-menu-node>a{padding:11px 12px;text-transform:none;white-space:nowrap}.ticker,.deal-strip,.top-strip,.promo-strip,.scrolling-bar{position:relative;z-index:1!important}

    @media(max-width:900px){.cms-menu-node{display:block}.cms-submenu{position:static;display:block;box-shadow:none;border:0;background:#172017;border-radius:0;padding-left:16px}.cms-submenu .cms-submenu{position:static}}

    @media(max-width:900px){.nav-inner{display:block}.nav-item{display:block}.dropdown{position:static;display:block;box-shadow:none;border:0;background:#172017;border-radius:0;padding-left:16px}.dropdown .dropdown{position:static}}
@media(max-width:900px){.shop-filters{grid-template-columns:1fr 1fr}}
    @media(max-width:560px){.shop-filters{grid-template-columns:1fr}}

    @media(max-width:900px){.hero,.why,.story{grid-template-columns:1fr}.product-grid,.category-grid,.trust-grid,.catch-grid,.footer-inner{grid-template-columns:repeat(2,1fr)}.hero-main{min-height:340px}.header-inner{display:block}.account-links{margin-top:10px}}
    @media(max-width:560px){main{padding:0 14px 28px}.product-grid,.category-grid,.trust-grid,.catch-grid,.footer-inner{grid-template-columns:1fr}.hero-main{padding:26px}.hero-main h1{font-size:44px}.offer-band{display:block}}
  `);
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title || siteName)}</title>${isPhotoV2(data) ? '<link rel="preload" as="image" href="/theme-assets/photo-hero.webp" fetchpriority="high">' : ''}<meta name="description" content="${escapeHtml(description || '')}"><style>${css}${robocazUnifiedSquareCss()}
    @media(max-width:560px){
      .category-card.fish-bg{min-height:220px!important}
      .product-image.fish-bg{height:190px!important}
      .promo-card.fish-bg{min-height:200px!important}
      .catch-card .photo.fish-bg{height:160px!important}
    }
</style></head><body>
  ${data.settings?.themeBars?.topStrip ? `<div class="top-strip">${escapeHtml(data.settings.themeBars.topStrip)}</div>` : ''}
  ${data.settings?.themeBars?.dealStrip ? `<div class="deal-strip">${escapeHtml(data.settings.themeBars.dealStrip)}</div>` : ''}
  <header class="site-header"><div class="header-inner"><a class="logo" href="/">${logoImg(data, 'header-logo')}<span>${escapeHtml(siteName)}</span></a><div class="account-links"><a href="/account">My Account</a><a href="/cart">Cart</a></div></div></header>
  <nav class="main-nav"><div class="nav-inner">${cmsPublicMenu(data)}</div></nav>
  ${tickerHtml(data) ? `<div class="ticker"><div>${tickerHtml(data)}</div></div>` : ''}
  <main>${body}</main>
  <footer class="footer"><div class="footer-inner"><div><h4>Help & Information</h4><a href="/about-us">About Us</a><a href="/delivery">Delivery Information</a><a href="/returns">Returns Policy</a><a href="/privacy">Privacy Policy</a></div><div><h4>My Account</h4><a href="/account">My Account</a><a href="/account">Order History</a><a href="/account">Account Details</a></div><div><h4>About Us</h4><p>The UK's custom commerce CMS, built for speed and flexibility.</p><p>Contact us for support.</p></div><div><h4>Support</h4><a href="/contact">Contact Us</a><a href="/faq">FAQ</a><a href="/products">Shop</a></div></div><div class="footer-bottom">© ${new Date().getFullYear()} ${escapeHtml(siteName)}. All rights reserved.</div></footer>
  <div class="cart-message" id="cartMsg">Added to basket</div>
  <script>document.addEventListener('click',async e=>{if(e.target.matches('[data-add-cart]')){const id=e.target.getAttribute('data-add-cart');let cart=JSON.parse(localStorage.getItem('cart')||'[]');const found=cart.find(x=>x.productId===id);if(found)found.qty=(found.qty||1)+1;else cart.push({productId:id,qty:1});localStorage.setItem('cart',JSON.stringify(cart));const m=document.getElementById('cartMsg');m.style.display='block';setTimeout(()=>m.style.display='none',1500)}})</script>
  </body></html>`;
}














function normalizeCmsMenuItem(item) {
  const now = new Date().toISOString();
  return { ...item, label: String(item.label || item.title || 'Menu item').trim(), url: String(item.url || '/').trim() || '/', parentId: String(item.parentId || ''), menuOrder: Number(item.menuOrder || 100), visible: item.visible !== false, updatedAt: now };
}
function cmsMenuTree(data) {
  const items = (data.menuItems || []).filter(i => i.visible !== false).sort((a,b)=>Number(a.menuOrder||0)-Number(b.menuOrder||0));
  const byParent = {};
  for (const item of items) {
    const parent = item.parentId || '';
    byParent[parent] = byParent[parent] || [];
    byParent[parent].push(item);
  }
  const build = parent => (byParent[parent] || []).map(item => ({ ...item, children: build(item.id) }));
  return build('');
}
function renderCmsMenuNodes(items) {
  return items.map(item => {
    const children = item.children || [];
    return `<div class="cms-menu-node ${children.length ? 'has-submenu' : ''}"><a href="${escapeHtml(item.url)}">${escapeHtml(item.label)}</a>${children.length ? `<div class="cms-submenu">${renderCmsMenuNodes(children)}</div>` : ''}</div>`;
  }).join('');
}
function cmsPublicMenu(data) {
  const tree = cmsMenuTree(data);
  return tree.length ? renderCmsMenuNodes(tree) : '<a href="/">Home</a><a href="/about-us">About Us</a><a href="/products">Shop</a><a href="/account">My Account</a><a href="/faq">FAQ</a><a href="/contact">Contact Us</a>';
}

function publicLayout(data, title, description, body) {
  if (selectedTheme(data) === 'commerce-pro') {
    return commercePublicLayout(data, title, description, body);
  }
  return simplePublicLayout(data, title, description, body);
}

function renderHome(data, page) {
  const body = `
  <section class="hero">
    <div class="hero-main admin-bg-box" ${inlineBoxBg(data, 'homeBox', '#1d2d20')}><div class="hero-logo-mark">${logoImg(data, 'hero-logo')}</div><div><h1>${escapeHtml(page.title || 'Quality Products')}</h1><p>${escapeHtml(page.seoDescription || 'Do not miss our offers and seasonal deals.')}</p><a href="/products">Pick up a bargain →</a></div></div>
    <div class="hero-side"><div class="promo-card admin-bg-box" ${inlineBoxBg(data, 'winSetup', '#263821')}><div><h3>Win a complete setup</h3><p>Worth over £3000</p><a class="btn" href="/products">Enter now</a></div></div><div class="promo-card alt admin-bg-box" ${inlineBoxBg(data, 'seasonDeals', '#6b3f16')}><div><h3>Season deals</h3><p>Up to 30% off</p><a class="btn" href="/products">Shop now</a></div></div></div>
  </section>
  <section class="section"><h2 class="section-title">Best Sellers</h2><div class="product-grid">${productCards(data,4)}</div></section>
  
  <section class="section why"><div class="why-copy admin-bg-box" ${inlineBoxBg(data, 'whyChoose', '#1d2d20')}><h2>Why Choose ${escapeHtml(data.settings.siteName || 'Us')}?</h2><p>Fast delivery, fair pricing, secure checkout and a fully custom shopping experience.</p></div><div class="trust-grid"><div class="info-card"><h3>Free Delivery</h3><p>Free delivery on qualifying orders with secure packaging.</p></div><div class="info-card"><h3>Lowest Prices</h3><p>Great value without compromising quality.</p></div><div class="info-card"><h3>Expert Support</h3><p>Helpful support when you need it.</p></div></div></section>
  <section class="section"><h2 class="section-title">Customer Reviews</h2><div class="trust-grid">${homeReviews(data)}</div></section>
  <section class="section weather-card"><h2>Perfect Conditions!</h2><p>Current conditions are ideal for today's recommended products.</p><div class="product-grid">${productCards(data,3)}</div></section>
  <section class="section"><h2 class="section-title">Customer Gallery</h2><div class="catch-grid">${['28lb Golden Common','35lb Night Common','32lb Blue Mirror','30lb Lake Beauty','26lb Perfect Common','24lb Stunning Mirror'].map((x,idx)=>`<article class="catch-card"><div class="photo${bgClass(data, (idx % 10) + 1)}">${logoImg(data, 'gallery-logo')}</div><div><h3>${x}</h3><p>Shared by one of our customers.</p></div></article>`).join('')}</div></section>
  <section class="section story"><div class="form-card"><h2>Share Your Success Story</h2><input placeholder="Your Name"><input placeholder="Fish Weight / Result"><select><option>Select category...</option><option>Common Carp</option><option>Mirror Carp</option></select><textarea placeholder="Tell us your story"></textarea><button>Submit My Story</button></div><div class="offer-band admin-bg-box" ${inlineBoxBg(data, 'offerWeek', '#1d2d20')}><div><h2>Offer of the week</h2><p>Get 10% off your first order.</p></div><a class="btn" href="/products">Shop our products</a></div></section>`;
  return publicLayout(data, page.seoTitle || page.title, page.seoDescription || '', body);
}

function renderPage(data, page) {
  if (page.slug === '/') return renderHome(data, page);
  return publicLayout(data, page.seoTitle || page.title, page.seoDescription || '', `<article class="page-card">${page.content || ''}</article>`);
}
function renderProduct(data, p) {
  const cats = categoriesForProduct(data, p);
  return publicLayout(data, p.title, p.description, `<div class="page-card"><div class="product-detail-grid"><div class="product-image admin-bg-box" ${productImageStyle(data, p)} style="height:420px">${!productMainImage(p) ? `<a href="/products/${escapeHtml(p.slug)}">${brandVisual(data, p.title)}</a>` : ''}</div><div><h1>${escapeHtml(p.title)}</h1><div class="stars">★★★★★</div><div class="product-cats">${cats.length ? cats.map(c=>`<a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`).join('') : '<span>Uncategorised</span>'}</div><div class="product-detail-description">${p.description || ''}</div><p class="price">${escapeHtml(data.settings.currency || 'GBP')} ${Number(p.price||0).toFixed(2)}</p><p>SKU: ${escapeHtml(p.sku || '')}</p><p>Stock: ${escapeHtml(p.stock || 0)}</p><button data-add-cart="${p.id}">Add to Basket</button></div></div></div>`);
}

function shopFilterHtml(data, current = {}) {
  const filters = data.settings.shopFilters || {};
  const cats = (data.productCategories || []).filter(c => c.showInShop !== false).sort((a,b)=>Number(a.menuOrder||0)-Number(b.menuOrder||0));
  return `<form class="shop-filters" method="get" action="/products">
    ${filters.showSearch !== false ? `<input name="q" placeholder="Search products..." value="${escapeHtml(current.q || '')}">` : ''}
    ${filters.showCategoryFilter !== false ? `<select name="category"><option value="">All categories</option>${cats.map(c=>`<option value="${escapeHtml(c.slug)}" ${current.category===c.slug?'selected':''}>${escapeHtml(c.name)}</option>`).join('')}</select>` : ''}
    ${filters.showPriceFilter !== false ? `<input name="minPrice" type="number" step="0.01" placeholder="Min price" value="${escapeHtml(current.minPrice || '')}"><input name="maxPrice" type="number" step="0.01" placeholder="Max price" value="${escapeHtml(current.maxPrice || '')}">` : ''}
    ${filters.showStockFilter !== false ? `<label class="check"><input name="inStock" type="checkbox" value="true" ${current.inStock==='true'?'checked':''}> In stock</label>` : ''}
    ${filters.showSort !== false ? `<select name="sort"><option value="newest" ${current.sort==='newest'?'selected':''}>Newest</option><option value="price-asc" ${current.sort==='price-asc'?'selected':''}>Price low-high</option><option value="price-desc" ${current.sort==='price-desc'?'selected':''}>Price high-low</option><option value="title" ${current.sort==='title'?'selected':''}>Title</option></select>` : ''}
    <button>Filter</button>
  </form>`;
}
function categoryCardsForShop(data) {
  return '';
}
function renderProducts(data, params = {}) {
  const products = filterProducts(data, params);
  return publicLayout(data, 'Shop Products', 'Products', `<section class="section"><h1 class="section-title">Shop Products</h1><p>Browse our best sellers and latest deals.</p>${shopFilterHtml(data, params)}${categoryCardsForShop(data)}<div class="product-grid">${products.map((p,i) => `<article class="product-card"><div class="product-image admin-bg-box" ${productImageStyle(data, p)}>${!productMainImage(p) ? `<a href="/products/${escapeHtml(p.slug)}">${brandVisual(data, p.title)}</a>` : ''}${i<3?'<b>SALE</b>':''}</div><div class="product-body"><h3><a href="/products/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></h3><div class="stars">★★★★★</div><p class="product-preview-text"></p><div class="product-cats">${categoriesForProduct(data,p).map(c=>`<a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`).join(' ')}</div><div class="price">${escapeHtml(data.settings.currency||'GBP')} ${Number(p.price||0).toFixed(2)}</div><a class="btn" href="/products/${escapeHtml(p.slug)}">View</a> <button data-add-cart="${p.id}">Add</button></div></article>`).join('') || '<div class="card">No products found.</div>'}</div></section>`);
}

function blogCategoryById(data, id) {
  return (data.blogCategories || []).find(c => c.id === id) || null;
}











function cleanBlogPathSlug(value='') {
  return String(value || '')
    .replace(/^https?:\/\/[^/]+/i, '')
    .replace(/[?#].*$/g, '')
    .replace(/^\/+|\/+$/g, '')
    .replace(/\/+/g, '/')
    .trim();
}
function canonicalBlogSlug(value='', fallback='post') {
  let raw = cleanBlogPathSlug(value || fallback || 'post')
    .replace(/^news\//i, '')
    .replace(/^category\//i, '')
    .replace(/^news\/category\//i, '');
  raw = raw.split('/').filter(Boolean).pop() || fallback || 'post';
  return slugify(raw);
}
function blogPostUrl(post) {
  return '/news/' + canonicalBlogSlug(post?.slug || post?.title || 'post', post?.title || 'post');
}
function blogCategoryUrl(category) {
  return '/news/category/' + canonicalBlogSlug(category?.slug || category?.name || 'category', category?.name || 'category');
}
function findBlogPostBySlug(data, requestedSlug) {
  const wanted = canonicalBlogSlug(requestedSlug || '');
  return (data.posts || []).find(p => {
    const candidates = [p.slug, p.title, p.seoTitle].filter(Boolean).map(v => canonicalBlogSlug(v, p.title || 'post'));
    return candidates.includes(wanted) && (p.status === 'published' || p.status === 'active');
  });
}
function findBlogCategoryBySlug(data, requestedSlug) {
  const wanted = canonicalBlogSlug(requestedSlug || '', 'category');
  return (data.blogCategories || []).find(c => {
    const candidates = [c.slug, c.name].filter(Boolean).map(v => canonicalBlogSlug(v, c.name || 'category'));
    return candidates.includes(wanted);
  });
}

function normaliseBlogSlug(value, fallback = 'post') {
  return canonicalBlogSlug(value, fallback);
}
function normalizeBlogPost(item) {
  const now = new Date().toISOString();
  const title = String(item.title || 'Untitled post').trim();
  return { ...item, title, slug: normaliseBlogSlug(item.slug || title, title), excerpt: item.excerpt || item.seoDescription || '', content: item.content || '', status: item.status || 'draft', categoryId: item.categoryId || '', author: item.author || 'Admin', featuredImage: item.featuredImage || item.imageUrl || '', seoTitle: item.seoTitle || title, seoDescription: item.seoDescription || item.excerpt || '', publishedAt: item.publishedAt || (item.status === 'published' ? now : ''), updatedAt: now };
}
function normalizeBlogCategory(item) {
  const now = new Date().toISOString();
  const name = String(item.name || 'Category').trim();
  return { ...item, name, slug: normaliseBlogSlug(item.slug || name, name), description: item.description || '', updatedAt: now };
}

function renderNews(data) {
  const posts = (data.posts || []).filter(p => p.status === 'published' || p.status === 'active').sort((a,b)=>String(b.publishedAt||b.createdAt||'').localeCompare(String(a.publishedAt||a.createdAt||'')));
  const cats = (data.blogCategories || []);
  return publicLayout(data, 'News', 'Latest news and blog posts', `<section class="section"><h1 class="section-title">News</h1><p>Latest updates, articles and buying guides.</p><div class="grid">${posts.map(p=>{const c=blogCategoryById(data,p.categoryId);return `<article class="card blog-card">${p.featuredImage?`<img src="${escapeHtml(p.featuredImage)}" alt="${escapeHtml(p.title||'Post')}" style="width:100%;max-height:260px;object-fit:cover;border-radius:14px;margin-bottom:14px">`:''}<p><small>${escapeHtml(c?.name||'News')} ${p.publishedAt?` · ${escapeHtml(String(p.publishedAt).slice(0,10))}`:''}</small></p><h2><a href="${escapeHtml(blogPostUrl(p))}">${escapeHtml(p.title||'Post')}</a></h2><p>${escapeHtml(p.excerpt||p.seoDescription||'')}</p><a class="btn" href="${escapeHtml(blogPostUrl(p))}">Read more</a></article>`}).join('') || '<div class="card">No news posts yet.</div>'}</div>${cats.length?`<div class="card"><h3>Categories</h3>${cats.map(c=>`<a class="btn" href="${escapeHtml(blogCategoryUrl(c))}">${escapeHtml(c.name)}</a>`).join(' ')}</div>`:''}</section>`);
}
function renderBlogPost(data, post) {
  const c = blogCategoryById(data, post.categoryId);
  return publicLayout(data, post.seoTitle || post.title, post.seoDescription || post.excerpt || '', `<article class="page-card blog-post">${post.featuredImage?`<img src="${escapeHtml(post.featuredImage)}" alt="${escapeHtml(post.title||'Post')}" style="width:100%;max-height:420px;object-fit:cover;border-radius:18px;margin-bottom:20px">`:''}<p><small>${escapeHtml(c?.name||'News')} ${post.publishedAt?` · ${escapeHtml(String(post.publishedAt).slice(0,10))}`:''}</small></p><h1>${escapeHtml(post.title||'Post')}</h1><p>${escapeHtml(post.excerpt||'')}</p><div>${post.content||''}</div><p><a class="btn" href="/news">Back to news</a></p></article>`);
}
function renderBlogCategory(data, category) {
  const posts = (data.posts || []).filter(p => (p.status === 'published' || p.status === 'active') && p.categoryId === category.id).sort((a,b)=>String(b.publishedAt||b.createdAt||'').localeCompare(String(a.publishedAt||a.createdAt||'')));
  return publicLayout(data, category.name, category.description || '', `<section class="section"><h1 class="section-title">${escapeHtml(category.name)}</h1><p>${escapeHtml(category.description||'')}</p><div class="grid">${posts.map(p=>`<article class="card"><h2><a href="${escapeHtml(blogPostUrl(p))}">${escapeHtml(p.title||'Post')}</a></h2><p>${escapeHtml(p.excerpt||'')}</p><a class="btn" href="${escapeHtml(blogPostUrl(p))}">Read more</a></article>`).join('')||'<div class="card">No posts in this category yet.</div>'}</div></section>`);
}


function renderCart(data) {
  const currency = escapeHtml(data.settings.currency || 'GBP');
  const taxRate = Number(data.settings.taxRate || 20);
  const productMap = {};
  for (const p of (data.products || [])) productMap[p.id] = { title: p.title || p.name || p.slug || 'Product', price: Number(p.price || 0) };
  return publicLayout(data, 'Cart', 'Your basket', `<section class="section"><h1 class="section-title">Basket</h1><div id="cartBox" class="page-card"></div><script>
  const productMap = ${JSON.stringify(productMap)};
  const cart = JSON.parse(localStorage.getItem('cart') || '[]');
  const box = document.getElementById('cartBox');
  const currency = ${JSON.stringify(currency)};
  const taxRate = ${taxRate};
  function save(){localStorage.setItem('cart',JSON.stringify(cart));location.reload();}
  function itemTitle(i){const p=productMap[i.productId]||productMap[i.id]||{};return i.title||i.name||p.title||'Product'}
  function itemPrice(i){const p=productMap[i.productId]||productMap[i.id]||{};return Number(i.price ?? p.price ?? 0)}
  if(!cart.length){box.innerHTML='<p>Your cart is empty.</p><p><a class="btn" href="/products">Continue shopping</a></p>'}
  else{
    let subtotal=0;
    box.innerHTML='<table style="width:100%;border-collapse:collapse"><thead><tr><th style="text-align:left;padding:10px;border-bottom:1px solid #ddd">Product</th><th style="text-align:right;padding:10px;border-bottom:1px solid #ddd">Qty</th><th style="text-align:right;padding:10px;border-bottom:1px solid #ddd">Net</th><th style="text-align:right;padding:10px;border-bottom:1px solid #ddd">Tax</th><th style="text-align:right;padding:10px;border-bottom:1px solid #ddd">Gross</th><th></th></tr></thead><tbody>'+cart.map((i,idx)=>{const qty=Number(i.qty||1);const gross=itemPrice(i)*qty;const net=gross/(1+taxRate/100);const tax=gross-net;subtotal+=gross;return '<tr><td style="padding:10px;border-bottom:1px solid #eee">'+itemTitle(i)+'</td><td style="padding:10px;text-align:right;border-bottom:1px solid #eee">'+qty+'</td><td style="padding:10px;text-align:right;border-bottom:1px solid #eee">'+currency+' '+net.toFixed(2)+'</td><td style="padding:10px;text-align:right;border-bottom:1px solid #eee">'+currency+' '+tax.toFixed(2)+'</td><td style="padding:10px;text-align:right;border-bottom:1px solid #eee">'+currency+' '+gross.toFixed(2)+'</td><td style="padding:10px;border-bottom:1px solid #eee"><button onclick="cart.splice('+idx+',1);save()">Remove</button></td></tr>'}).join('')+'</tbody></table>';
    const netTotal=subtotal/(1+taxRate/100); const taxTotal=subtotal-netTotal;
    box.innerHTML += '<div style="max-width:360px;margin-left:auto;margin-top:20px"><p><strong>Subtotal net:</strong> '+currency+' '+netTotal.toFixed(2)+'</p><p><strong>Tax ('+taxRate+'%):</strong> '+currency+' '+taxTotal.toFixed(2)+'</p><p><strong>Total:</strong> '+currency+' '+subtotal.toFixed(2)+'</p><a class="btn" href="/checkout">Checkout</a></div>';
  }
  </script></section>`);
}

function renderCheckout(data) {
  return publicLayout(data, 'Checkout', 'Checkout', `<div class="card"><h1>Checkout</h1>
  <form id="checkoutForm">
    <p><label>Email<br><input name="email" type="email" required></label></p>
    <p><label>Name<br><input name="name" required></label></p>
    <p><label>Address<br><textarea name="address" required></textarea></label></p>
    <p><label>Payment method<br><select name="paymentMethod"><option value="paypal">PayPal ready/manual</option><option value="manual">Manual payment</option></select></label></p>
    <button type="submit">Place order</button>
  </form>
  <p id="checkoutMsg"></p></div>
  <script>
document.getElementById('checkoutForm').addEventListener('submit',async e=>{
  e.preventDefault();
  const cart=JSON.parse(localStorage.getItem('cart')||'[]');
  const fd=new FormData(e.target);
  const msg=document.getElementById('checkoutMsg');
  msg.textContent='Creating order...';
  try{
    const r=await fetch('/api/checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({items:cart,email:fd.get('email'),name:fd.get('name'),address:fd.get('address'),paymentMethod:fd.get('paymentMethod')})});
    const d=await r.json();
    if(!r.ok) throw new Error(d.error||'Checkout failed');
    localStorage.removeItem('cart');
    location.href='/order-confirmation?order='+encodeURIComponent(d.order.id);
  }catch(err){msg.textContent=err.message;}
});
</script>`);
}

function renderOrderConfirmation(data, orderId='') {
  return publicLayout(data, 'Order confirmation', 'Order confirmation', `<div class="card"><h1>Order received</h1><p>Your order has been created.</p><p>Order reference: <strong>${escapeHtml(orderId || '')}</strong></p><p>If PayPal is configured later, this page can redirect to PayPal approval automatically.</p><p><a class="btn" href="/">Return home</a></p></div>`);
}

function renderCategory(data, category) {
  const products = filterProducts(data, { category: category.slug });
  return publicLayout(data, category.name, category.description, `<section class="section"><h1 class="section-title">${escapeHtml(category.name)}</h1><p>${escapeHtml(category.description || '')}</p><p><a href="/products">All products</a></p><div class="product-grid">${products.map((p,i)=>`<article class="product-card"><div class="product-image admin-bg-box" ${productImageStyle(data, p)}>${!productMainImage(p) ? `<a href="/products/${escapeHtml(p.slug)}">${brandVisual(data, p.title)}</a>` : ''}</div><div class="product-body"><h3><a href="/products/${escapeHtml(p.slug)}">${escapeHtml(p.title)}</a></h3><div class="product-cats">${categoriesForProduct(data,p).map(c=>`<a href="/category/${escapeHtml(c.slug)}">${escapeHtml(c.name)}</a>`).join(' ')}</div><p class="product-preview-text"></p><div class="price">${escapeHtml(data.settings.currency||'GBP')} ${Number(p.price||0).toFixed(2)}</div><a class="btn" href="/products/${escapeHtml(p.slug)}">View</a> <button data-add-cart="${p.id}">Add</button></div></article>`).join('') || '<div class="card">No products in this category yet.</div>'}</div></section>`);
}

function ensureInfoPages(data) {
  const now = new Date().toISOString();
  const site = data.settings.siteName || 'Our Store';
  const pages = [
    {
      title: 'About Us',
      slug: '/about-us',
      seoTitle: `About Us | ${site}`,
      seoDescription: `Learn about ${site}, our values, service standards and commitment to customers.`,
      content: aboutUsContent(site)
    },
    {
      title: 'Delivery Information',
      slug: '/delivery',
      seoTitle: `Delivery Information | ${site}`,
      seoDescription: `Delivery information, dispatch expectations and order handling guidance for ${site}.`,
      content: deliveryContent(site)
    },
    {
      title: 'Returns Policy',
      slug: '/returns',
      seoTitle: `Returns Policy | ${site}`,
      seoDescription: `Returns, exchanges and refund guidance for orders placed with ${site}.`,
      content: returnsContent(site)
    },
    {
      title: 'Privacy Policy',
      slug: '/privacy',
      seoTitle: `Privacy Policy | ${site}`,
      seoDescription: `How ${site} handles customer account, order, support and website information.`,
      content: privacyContent(site)
    },
    {
      title: 'FAQ',
      slug: '/faq',
      seoTitle: `FAQ | ${site}`,
      seoDescription: `Frequently asked questions about shopping with ${site}.`,
      content: faqContent(site)
    },
    {
      title: 'Contact Us',
      slug: '/contact',
      seoTitle: `Contact Us | ${site}`,
      seoDescription: `Contact ${site} about orders, products, delivery, returns or account help.`,
      content: contactContent(data, site)
    }
  ];

  for (const page of pages) {
    const existing = (data.pages || []).find(p => p.slug === page.slug);
    if (existing) {
      existing.title = existing.title || page.title;
      existing.seoTitle = page.seoTitle;
      existing.seoDescription = page.seoDescription;
      existing.content = page.content;
      existing.status = 'published';
      existing.showInMenu = existing.showInMenu !== false;
      existing.menuTitle = existing.menuTitle || page.title;
      existing.updatedAt = now;
    } else {
      data.pages.push({
        id: id(),
        type: 'page',
        status: 'published',
        title: page.title,
        slug: page.slug,
        content: page.content,
        seoTitle: page.seoTitle,
        seoDescription: page.seoDescription,
        showInMenu: true,
        menuTitle: page.title,
        menuOrder: 900 + pages.indexOf(page),
        createdAt: now,
        updatedAt: now
      });
    }
  }
}

function aboutUsContent(site) {
  return `<article class="info-page">
    <h1>About ${escapeHtml(site)}</h1>
    <p class="lead">${escapeHtml(site)} exists to make buying from an independent online shop feel simple, reliable and personal. We are building a store experience that puts clear information, practical products, honest service and dependable order handling at the centre of every visit.</p>
    <p>Our aim is not to look like every other shop on the internet. ${escapeHtml(site)} has been shaped around a custom CMS, a fast static-first storefront and an admin system that lets the team control products, pages, categories, reviews, imagery and customer information without relying on a third-party marketplace or off-the-shelf platform. That gives us the freedom to improve the website around the way our customers actually browse and buy.</p>
    <h2>What we care about</h2>
    <p>We care about good product information, fair presentation and a checkout journey that does not get in the way. Every product page should help customers understand what they are looking at, what it is for, how it fits into the wider range and what to expect after placing an order. We want the shop to feel organised, not overwhelming.</p>
    <p>Behind the scenes, ${escapeHtml(site)} is set up to keep improving. Categories, shop filters, product images, customer reviews and page content can be managed from the admin area, which means the site can stay current as products, policies and customer needs change.</p>
    <h2>A practical, customer-first approach</h2>
    <p>We know customers want more than a pretty homepage. They want accurate stock details, clear prices, useful categories, order history, account tools and sensible support if something needs attention. The store is being built with those basics in mind first, then polished around them.</p>
    <div class="notice-box"><strong>Our promise:</strong> ${escapeHtml(site)} will keep working towards a shopping experience that is clear, useful and trustworthy from the first page view through to delivery and aftercare.</div>
    <h2>How we run the site</h2>
    <p>The website is designed to be fast and easy to maintain. Public pages are built with a static-first approach where possible, while the CMS keeps the operational side flexible. This lets the shop combine speed for customers with control for the team managing products, content and orders.</p>
    <p>As ${escapeHtml(site)} grows, this page may be updated to reflect new services, ranges, improvements and customer support options.</p>
  </article>`;
}

function deliveryContent(site) {
  return `<article class="info-page">
    <h1>Delivery Information</h1>
    <p class="lead">This page explains how ${escapeHtml(site)} handles delivery, dispatch expectations and order updates. It is written to help customers understand what happens after checkout and where to look for order information.</p>
    <h2>Order processing</h2>
    <p>When an order is placed, the system creates an order record in your account and the admin area. The order status may start as pending, processing or pending payment depending on the payment method and store configuration. Once the order is reviewed and prepared, the status can be updated by the team.</p>
    <p>Processing times can vary depending on product availability, order volume, weekends, holidays and whether an item needs extra checking before dispatch. ${escapeHtml(site)} aims to keep order handling clear and practical, with order history available through the customer account area.</p>
    <h2>Delivery costs and methods</h2>
    <p>Delivery charges may be calculated using the store settings, including flat-rate shipping, free-shipping thresholds or future shipping rules added by the team. Any delivery cost shown at checkout should be reviewed before submitting an order.</p>
    <p>Where delivery options are available, choose the method that best matches your needs. Some products may require different handling depending on size, value or destination.</p>
    <h2>Tracking and order history</h2>
    <p>If a tracking reference is added to your order, it may appear in your account order history. Tracking details can take time to become active after dispatch, especially if the courier has not yet scanned the parcel into its network.</p>
    <div class="notice-box"><strong>Tip:</strong> log in to your ${escapeHtml(site)} account to view your order history, order status and any tracking information added by the team.</div>
    <h2>Delivery addresses</h2>
    <p>Please check your delivery address carefully before placing an order. Incorrect or incomplete addresses may delay dispatch or delivery. Your account area includes address management so you can store and update useful delivery details.</p>
    <h2>Delays and support</h2>
    <p>Occasional delays can happen due to courier issues, bad weather, stock checks, payment review or seasonal demand. If you need help with an order, use the support area in your account or contact the store with your order reference.</p>
  </article>`;
}

function returnsContent(site) {
  return `<article class="info-page">
    <h1>Returns Policy</h1>
    <p class="lead">${escapeHtml(site)} wants customers to feel confident when ordering. This returns policy explains how returns, exchanges and refund requests are generally handled through the store.</p>
    <h2>Before returning an item</h2>
    <p>Please contact ${escapeHtml(site)} before sending anything back. This helps the team identify your order, understand the reason for the return and give you the correct return instructions. Returning an item without contact may slow down the process.</p>
    <h2>Condition of returned items</h2>
    <p>Items should normally be returned unused, complete and in suitable packaging, unless the reason for return is a fault or issue that prevents normal use. Please include any accessories, manuals, labels or packaging that came with the product where possible.</p>
    <p>Products that are used, damaged after delivery, incomplete, customised, perishable or unsuitable for resale may be handled differently depending on the circumstances and applicable consumer rules.</p>
    <h2>Faulty or incorrect items</h2>
    <p>If you believe an item is faulty, damaged on arrival or not what you ordered, contact ${escapeHtml(site)} as soon as possible with your order reference and supporting details. Photos can be helpful where there is visible damage or an incorrect item.</p>
    <div class="notice-box"><strong>Helpful information to include:</strong> order number, product name, delivery date, a short explanation of the issue and clear photos if relevant.</div>
    <h2>Refunds and exchanges</h2>
    <p>Once a return is received and checked, the team can confirm the next step. Depending on the case, this may be a refund, replacement, exchange, store credit or further investigation. Refund timing can depend on payment method, banking times and internal review.</p>
    <h2>Customer account records</h2>
    <p>Your account order history helps ${escapeHtml(site)} check purchase details quickly. Keeping your account information up to date can make return and support requests easier to handle.</p>
    <h2>Policy updates</h2>
    <p>This policy may be updated as the store grows, new product types are added or operational processes change. The latest version shown on this page applies when you view it.</p>
  </article>`;
}

function privacyContent(site) {
  return `<article class="info-page">
    <h1>Privacy Policy</h1>
    <p class="lead">This privacy policy explains how ${escapeHtml(site)} may collect, use and protect information connected with website visits, customer accounts, orders and support requests.</p>
    <h2>Information we may collect</h2>
    <p>When you use ${escapeHtml(site)}, information may be collected through account registration, checkout, contact forms, support messages, reviews, wishlist activity and normal website operation. This may include your name, email address, delivery details, order history, product interactions and messages sent to the store.</p>
    <h2>How information is used</h2>
    <p>Information is used to run the shop properly. This includes creating customer accounts, processing orders, displaying order history, handling delivery details, managing support requests, improving website content and keeping the store secure.</p>
    <p>Customer reviews may be stored in the CMS. Reviews submitted through the account area may require approval before appearing publicly on the homepage or product areas.</p>
    <h2>Orders, accounts and support</h2>
    <p>Your account area is designed to help you view your own orders, addresses, downloads, subscriptions, wishlist items, reviews and support messages. Staff users may access relevant order and support information from the admin area to help operate the shop.</p>
    <h2>Cookies and technical data</h2>
    <p>The website may use essential cookies or local browser storage for login sessions, cart behaviour and account access. Technical data such as request paths, error logs and security events may be stored to help diagnose problems and protect the service.</p>
    <h2>Keeping information secure</h2>
    <p>${escapeHtml(site)} is built with role-based access in mind so normal customers, staff and administrators do not all see the same areas. Security improvements may continue as payment, email and customer systems are expanded.</p>
    <div class="notice-box"><strong>Your account:</strong> keep your password safe, use a strong password and contact ${escapeHtml(site)} if you believe your account details are incorrect or compromised.</div>
    <h2>Data updates and requests</h2>
    <p>You can update some account information from your account area. For other requests, such as questions about order records, support messages or account details, contact the store with enough information to identify your account.</p>
    <h2>Changes to this policy</h2>
    <p>This privacy policy may be updated as ${escapeHtml(site)} adds features, improves the CMS or changes operational processes. The site name and wording are generated from the current store settings, so the policy remains aligned with the active shop identity.</p>
  </article>`;
}

function faqContent(site) {
  return `<article class="info-page">
    <h1>Frequently Asked Questions</h1>
    <p class="lead">These FAQs explain the main things customers usually need to know when shopping with ${escapeHtml(site)}. They cover accounts, orders, delivery, returns, products, payments and support.</p>

    <h2>Shopping and products</h2>
    <h3>How do I find the right product?</h3>
    <p>Use the shop categories, product search and filters to narrow the range. Product pages may include descriptions, prices, stock information, SKU references, images and category links so you can compare items more easily.</p>
    <h3>Can I browse by category?</h3>
    <p>Yes. ${escapeHtml(site)} supports product categories and category pages, so products can be grouped into useful sections such as bait, tackle, rods, reels, accessories or any other range the shop decides to create.</p>
    <h3>Are prices and stock always final?</h3>
    <p>Prices and stock are managed through the CMS. Although the shop aims to keep information accurate, availability can change during busy periods or while orders are being processed.</p>

    <h2>Accounts</h2>
    <h3>Do I need an account to shop?</h3>
    <p>The store can support both account-based and guest-style checkout flows depending on how checkout is configured. Creating an account gives you access to your order history, addresses, reviews, support messages, downloads and subscription information.</p>
    <h3>Where is My Account?</h3>
    <p>Customer account tools are available at <strong>/account</strong>. The admin area is separate and is only for staff users who manage the CMS.</p>
    <h3>Can I update my details?</h3>
    <p>Yes. The account area includes profile and security sections so you can update basic account details and change your password.</p>

    <h2>Orders and checkout</h2>
    <h3>How do I know my order has been received?</h3>
    <p>After checkout, an order record is created and an order confirmation page is shown. If email delivery is configured, the store can also send an order notification or confirmation.</p>
    <h3>Where can I see my orders?</h3>
    <p>Log in to your account and open Order History. This shows the order status, payment status, total, tracking reference where available and order date.</p>
    <h3>Can I change an order after placing it?</h3>
    <p>If you need to change an order, contact ${escapeHtml(site)} as soon as possible. Changes may not always be possible if the order has already been processed, packed or dispatched.</p>

    <h2>Delivery</h2>
    <h3>How are delivery costs worked out?</h3>
    <p>Delivery costs may be controlled by the shop settings, including flat-rate shipping, free-shipping thresholds or future shipping rules. Any delivery charge should be visible before the order is submitted.</p>
    <h3>Will I receive tracking?</h3>
    <p>If tracking is added to your order by the team, it may appear in your account order history. Tracking can sometimes take time to activate after dispatch.</p>

    <h2>Returns and support</h2>
    <h3>What if something is wrong with my order?</h3>
    <p>Contact the store with your order reference, a clear explanation and photos if relevant. This helps the team review the problem quickly.</p>
    <h3>How do returns work?</h3>
    <p>Read the Returns Policy page before sending anything back. In most cases, you should contact ${escapeHtml(site)} first so the return can be matched to your order and handled correctly.</p>
    <h3>How do I contact support?</h3>
    <p>You can use the Contact Us page or the support section inside your account. Logged-in support messages help the team link your question to your account and order history.</p>

    <div class="notice-box"><strong>Still need help?</strong> Visit the Contact Us page and send a message to ${escapeHtml(site)} with as much detail as possible.</div>
  </article>`;
}

function contactContent(data, site) {
  const c = data.settings.contactPage || {};
  const heading = c.heading || 'Contact Us';
  const intro = c.intro || `Have a question about an order, product, delivery or your account? Use the form below and the ${site} team will get back to you as soon as possible.`;
  return `<article class="info-page">
    <h1>${escapeHtml(heading)}</h1>
    <p class="lead">${escapeHtml(intro)}</p>
    <div class="notice-box">
      ${c.email ? `<p><strong>Email:</strong> ${escapeHtml(c.email)}</p>` : ''}
      ${c.showPhone && c.phone ? `<p><strong>Phone:</strong> ${escapeHtml(c.phone)}</p>` : ''}
      ${c.address ? `<p><strong>Address:</strong> ${escapeHtml(c.address)}</p>` : ''}
      <p>For order questions, include your order reference and the email address used at checkout.</p>
    </div>
    <form class="contact-form" onsubmit="sendContactForm(event)">
      <p><label>Name<br><input name="name" required></label></p>
      <p><label>Email<br><input name="email" type="email" required></label></p>
      <p><label>Subject<br><input name="subject" placeholder="${escapeHtml(c.formSubjectPlaceholder || 'What can we help with?')}" required></label></p>
      <p><label>Message<br><textarea name="message" placeholder="${escapeHtml(c.formMessagePlaceholder || 'Tell us what you need help with...')}" required></textarea></label></p>
      <button type="submit">Send message</button>
      <p id="contactMsg"></p>
    </form>
    <script>
    async function sendContactForm(e){
      e.preventDefault();
      const fd=new FormData(e.target);
      const msg=document.getElementById('contactMsg');
      msg.textContent='Sending...';
      try{
        const r=await fetch('/api/contact',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:fd.get('name'),email:fd.get('email'),subject:fd.get('subject'),message:fd.get('message')})});
        const d=await r.json();
        if(!r.ok) throw new Error(d.error||'Could not send message');
        e.target.reset();
        msg.textContent=${JSON.stringify(c.successMessage || 'Thanks. Your message has been received.')};
      }catch(err){msg.textContent=err.message;}
    }
    </script>
  </article>`;
}

function buildStaticFiles(data) {
  ensureInfoPages(data);
  ensureDirs();
  for (const page of (data.pages || []).filter(p => p.status === 'published')) {
    const file = page.slug === '/' ? path.join(PUBLIC_DIR, 'index.html') : path.join(STATIC_DIR, page.slug.replace(/^\/+/, '') + '.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, minifyHtml(renderPage(data, page)));
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, 'products.html'), minifyHtml(renderProducts(data)));
  for (const c of (data.productCategories || []).filter(c => c.showInShop !== false)) {
    const file = path.join(PUBLIC_DIR, 'category', c.slug + '.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, minifyHtml(renderCategory(data, c)));
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, 'cart.html'), minifyHtml(renderCart(data)));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'checkout.html'), minifyHtml(renderCheckout(data)));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'order-confirmation.html'), minifyHtml(renderOrderConfirmation(data)));
  for (const p of (data.products || []).filter(p => p.status === 'active')) {
    const file = path.join(PUBLIC_DIR, 'products', p.slug + '.html');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, minifyHtml(renderProduct(data, p)));
  }
  fs.writeFileSync(path.join(PUBLIC_DIR, 'route-manifest.json'), JSON.stringify(data.routeManifest, null, 2));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'navigation.json'), JSON.stringify(data.navigation, null, 2));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'search-index.json'), JSON.stringify(data.searchIndex, null, 2));
  fs.writeFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), sitemapXml(data));
}
function sitemapXml(data) {
  const appUrl = (process.env.APP_URL || '').replace(/\/$/, '');
  const urls = Object.keys(data.routeManifest || {});
  return `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls.map(u => `<url><loc>${escapeHtml(appUrl + u)}</loc></url>`).join('')}</urlset>`;
}
function minifyHtml(v){return String(v).replace(/\n+/g,' ').replace(/\s{2,}/g,' ').replace(/>\s+</g,'><').trim();}
function minifyCss(v){return String(v).replace(/\/\*.*?\*\//gs,'').replace(/\s+/g,' ').replace(/\s*([{}:;,])\s*/g,'$1').trim();}

function listNameFromPath(urlPath) {
  if (urlPath.startsWith('/api/menu-items')) return 'menuItems';
  if (urlPath.startsWith('/api/pages')) return 'pages';
  if (urlPath.startsWith('/api/posts')) return 'posts';
  if (urlPath.startsWith('/api/blog-categories')) return 'blogCategories';
  if (urlPath.startsWith('/api/product-categories')) return 'productCategories';
  if (urlPath.startsWith('/api/products')) return 'products';
  if (urlPath.startsWith('/api/orders')) return 'orders';
  if (urlPath.startsWith('/api/users')) return 'users';
  if (urlPath.startsWith('/api/comments')) return 'comments';
  if (urlPath.startsWith('/api/reviews')) return 'reviews';
  if (urlPath.startsWith('/api/media')) return 'media';
  if (urlPath.startsWith('/api/notifications')) return 'notifications';
  if (urlPath.startsWith('/api/support')) return 'supportMessages';
  if (urlPath.startsWith('/api/error-logs')) return 'errorLogs';
  if (urlPath.startsWith('/api/backups')) return 'backups';
  if (urlPath.startsWith('/api/emails')) return 'emails';
  if (urlPath.startsWith('/api/jobs')) return 'jobs';
  return null;
}

function publicFileFor(urlPath) {
  if (urlPath === '/') return path.join(PUBLIC_DIR, 'index.html');
  if (urlPath === '/products') return path.join(PUBLIC_DIR, 'products.html');
  if (urlPath === '/news') return path.join(PUBLIC_DIR, 'news.html');
  if (urlPath.startsWith('/news/category/')) return path.join(PUBLIC_DIR, urlPath.replace(/^\/+/, '') + '.html');
  if (urlPath.startsWith('/news/')) return path.join(PUBLIC_DIR, urlPath.replace(/^\/+/, '') + '.html');
  if (urlPath === '/cart') return path.join(PUBLIC_DIR, 'cart.html');
  if (urlPath === '/checkout') return path.join(PUBLIC_DIR, 'checkout.html');
  if (urlPath === '/order-confirmation') return path.join(PUBLIC_DIR, 'order-confirmation.html');
  if (urlPath.startsWith('/products/')) return path.join(PUBLIC_DIR, 'products', urlPath.split('/').pop() + '.html');
  if (urlPath.startsWith('/category/')) return path.join(PUBLIC_DIR, 'category', urlPath.split('/').pop() + '.html');
  return path.join(STATIC_DIR, urlPath.replace(/^\/+/, '') + '.html');
}

async function handler(req, res) {
  try {
    ensureData();
    const url = new URL(req.url, `http://${req.headers.host}`);
    const data = readData();

    if (url.pathname === '/account' || url.pathname === '/account/') {
      const html = fs.readFileSync(ACCOUNT_HTML, 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

    if (url.pathname === '/admin/woocommerce-import' || url.pathname === '/admin/woocommerce-import/') {
      const html = fs.readFileSync('./src/admin/woocommerce-import.html', 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }


    
    if (url.pathname === '/admin/support-chat' || url.pathname === '/admin/support-chat/') {
      const html = fs.readFileSync('./src/admin/support-chat.html', 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

if (url.pathname === '/admin/products' || url.pathname === '/admin/products/') {
      const html = fs.readFileSync('./src/admin/products.html', 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }
    if (url.pathname === '/admin/product-categories' || url.pathname === '/admin/product-categories/') {
      const html = fs.readFileSync('./src/admin/product-categories.html', 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

if (url.pathname === '/admin/menu' || url.pathname === '/admin/menu/' || url.pathname === '/admin/menu-builder' || url.pathname === '/admin/menu-builder/') {
      const html = fs.readFileSync('./src/admin/menu.html', 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }



    const cleanNewsPathname = '/' + cleanBlogPathSlug(url.pathname);
    if (cleanNewsPathname === '/news') {
      return sendMaybeCompressed(req, res, 200, minifyHtml(renderNews(data)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }
    if (cleanNewsPathname.startsWith('/news/category/')) {
      const slug = cleanNewsPathname.replace(/^\/news\/category\//, '');
      const category = findBlogCategoryBySlug(data, slug);
      if (!category) return send(res, 404, { error: 'News category not found' });
      return sendMaybeCompressed(req, res, 200, minifyHtml(renderBlogCategory(data, category)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }
    if (cleanNewsPathname.startsWith('/news/')) {
      const slug = cleanNewsPathname.replace(/^\/news\//, '').replace(/^news\//, '');
      const post = findBlogPostBySlug(data, slug);
      if (!post) return send(res, 404, { error: 'News post not found' });
      return sendMaybeCompressed(req, res, 200, minifyHtml(renderBlogPost(data, post)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

if (url.pathname === '/admin' || url.pathname === '/admin/') {
      const html = fs.readFileSync('./src/admin/index.html', 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

    if (url.pathname === '/admin-polished-theme.css') {
      const css = fs.readFileSync('./src/admin/polished-theme.css', 'utf8');
      return sendMaybeCompressed(req, res, 200, css, { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

    if (url.pathname === '/admin-theme.css') {
      return sendMaybeCompressed(req, res, 200, backendThemeCss(data, 'admin'), { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }
    if (url.pathname === '/account-theme.css') {
      return sendMaybeCompressed(req, res, 200, backendThemeCss(data, 'account'), { 'Content-Type': 'text/css; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

    if (url.pathname === '/api/patch-version') {
      return send(res, 200, { ok: true, patchVersion: 'theme-image-settings-v6-repaired', message: 'Repaired debug server is deployed.' });
    }


    if (url.pathname === '/admin/support-chat-admin' || url.pathname === '/admin/support-chat-admin/') {
      const html = fs.readFileSync('./src/admin/support-chat-admin.html', 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

    if (url.pathname === '/admin-direct-links.js') {
      const js = fs.readFileSync('./src/admin/admin-direct-links.js', 'utf8');
      return sendMaybeCompressed(req, res, 200, js, { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0' });
    }

    if (url.pathname === '/api/admin/support-chat-force' && req.method === 'GET') {
      data.supportMessages = data.supportMessages || [];
      return send(res, 200, { items: data.supportMessages });
    }

    if (url.pathname.match(/^\/api\/admin\/support-chat-force\/[^/]+\/reply$/) && req.method === 'POST') {
      const supportId = url.pathname.split('/')[4];
      const body = await parseBody(req);
      const message = String(body.message || '').trim();
      if (!message) return send(res, 400, { error: 'Message required' });
      data.supportMessages = data.supportMessages || [];
      const item = data.supportMessages.find(s => s.id === supportId);
      if (!item) return send(res, 404, { error: 'Support chat not found' });
      item.replies = item.replies || [];
      item.replies.push({ id: id(), type: 'admin', createdBy: currentUser?.email || 'Admin', message, createdAt: new Date().toISOString() });
      item.status = 'replied';
      item.updatedAt = new Date().toISOString();
      writeData(data);
      return send(res, 200, item);
    }

    if (url.pathname.match(/^\/api\/admin\/support-chat-force\/[^/]+$/) && req.method === 'DELETE') {
      const supportId = url.pathname.split('/').pop();
      data.supportMessages = data.supportMessages || [];
      const before = data.supportMessages.length;
      data.supportMessages = data.supportMessages.filter(s => s.id !== supportId);
      writeData(data);
      return send(res, 200, { deleted: before - data.supportMessages.length });
    }

    
    if (url.pathname.match(/^\/api\/account\/support-chat-force\/[^/]+$/) && req.method === 'DELETE') {
      const supportId = url.pathname.split('/').pop();
      data.supportMessages = data.supportMessages || [];
      const before = data.supportMessages.length;
      data.supportMessages = data.supportMessages.filter(s => s.id !== supportId);
      writeData(data);
      return send(res, 200, { deleted: before - data.supportMessages.length });
    }

if (url.pathname === '/api/account/support-chat-force' && req.method === 'GET') {
      const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
      data.supportMessages = data.supportMessages || [];
      const items = data.supportMessages.filter(m => !email || String(m.email || '').toLowerCase() === email);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      return send(res, 200, { items });
    }

    if (url.pathname === '/api/account/support-chat-force' && req.method === 'POST') {
      const body = await parseBody(req);
      const email = String(body.email || '').trim();
      const message = String(body.message || '').trim();
      if (!email || !message) return send(res, 400, { error: 'Email and message required' });
      const msg = {
        id: id(),
        userId: '',
        email,
        name: body.name || 'Customer',
        subject: body.subject || 'Account support chat',
        message,
        status: 'open',
        source: 'account-chat',
        replies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.supportMessages = data.supportMessages || [];
      data.supportMessages.unshift(msg);
      writeData(data);
      return send(res, 201, msg);
    }

    if (url.pathname.match(/^\/api\/account\/support-chat-force\/[^/]+$/) && req.method === 'DELETE') {
      const supportId = url.pathname.split('/').pop();
      data.supportMessages = data.supportMessages || [];
      const before = data.supportMessages.length;
      data.supportMessages = data.supportMessages.filter(s => s.id !== supportId);
      writeData(data);
      return send(res, 200, { deleted: before - data.supportMessages.length });
    }



    
    if (url.pathname === '/shop-no-categories-default-image.js') {
      const js = fs.readFileSync('./src/shop-no-categories-default-image.js', 'utf8');
      return sendMaybeCompressed(req, res, 200, js, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store'
      });
    }

if (url.pathname === '/assets/default-product.png') {
      const img = fs.readFileSync('./src/assets/default-product.png');
      return sendMaybeCompressed(req, res, 200, img, {
        'Content-Type': 'image/png',
        'Cache-Control': 'public, max-age=86400'
      });
    }


    if (url.pathname === '/homepage-style-everywhere.css') {
      const css = fs.readFileSync('./src/homepage-style-everywhere.css', 'utf8');
      return sendMaybeCompressed(req, res, 200, css, {'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'});
    }

    if (url.pathname === '/account-width-fix.js') {
      const js = fs.readFileSync('./src/account-width-fix.js', 'utf8');
      return sendMaybeCompressed(req, res, 200, js, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
    }


    if (url.pathname === '/final-site-style-fixes.css') {
      const css = fs.readFileSync('./src/final-site-style-fixes.css', 'utf8');
      return sendMaybeCompressed(req, res, 200, css, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
    }

    if (url.pathname === '/final-site-style-fixes.js') {
      const js = fs.readFileSync('./src/final-site-style-fixes.js', 'utf8');
      return sendMaybeCompressed(req, res, 200, js, {
        'Content-Type': 'application/javascript; charset=utf-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0'
      });
    }


    if (url.pathname === '/direct-account-admin-style.css') {
      const css = fs.readFileSync('./src/direct-account-admin-style.css', 'utf8');
      return sendMaybeCompressed(req, res, 200, css, {'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'});
    }

    if (url.pathname === '/direct-account-admin-style.js') {
      const js = fs.readFileSync('./src/direct-account-admin-style.js', 'utf8');
      return sendMaybeCompressed(req, res, 200, js, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
    }


    if (url.pathname === '/robocaz-single-theme.css') {
      const css = fs.readFileSync('./src/robocaz-single-theme.css', 'utf8');
      return sendMaybeCompressed(req, res, 200, css, {'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'});
    }

    if (url.pathname === '/robocaz-single-theme.js') {
      const js = fs.readFileSync('./src/robocaz-single-theme.js', 'utf8');
      return sendMaybeCompressed(req, res, 200, js, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
    }


    if (url.pathname === '/rz-green-storefront.css') {
      const css = fs.readFileSync('./src/rz-green-storefront.css', 'utf8');
      return sendMaybeCompressed(req, res, 200, css, {'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'});
    }

    if (url.pathname === '/rz-standard-area.css') {
      const css = fs.readFileSync('./src/rz-standard-area.css', 'utf8');
      return sendMaybeCompressed(req, res, 200, css, {'Content-Type':'text/css; charset=utf-8','Cache-Control':'no-store'});
    }

    if (url.pathname === '/rz-theme-loader.js') {
      const js = fs.readFileSync('./src/rz-theme-loader.js', 'utf8');
      return sendMaybeCompressed(req, res, 200, js, {'Content-Type':'application/javascript; charset=utf-8','Cache-Control':'no-store'});
    }

if (url.pathname === '/api/health') {
      return send(res, 200, { status: 'ok', time: new Date().toISOString() });
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const integrity = verifyCmsIntegrity();
      if (!integrity.ok) return send(res, 423, { error: 'CMS integrity check failed', message: integrity.error, changed: integrity.changed || [], missing: integrity.missing || [] });
      const body = await parseBody(req);
      const email = String(body.email || '').trim().toLowerCase();
      const password = String(body.password || '');
      const user = data.users.find(u => u.email.toLowerCase() === email && u.passwordHash === hash(password));
      if (!user) return send(res, 401, { error: 'Invalid email or password' });
      const token = crypto.randomBytes(24).toString('hex');
      data.sessions.push({ token, userId: user.id, createdAt: new Date().toISOString(), expiresAt: new Date(Date.now()+1000*60*60*24*7).toISOString() });
      audit(data, user, 'login', 'admin');
      writeData(data);
      return send(res, 200, { token, user: { id: user.id, email: user.email, name: user.name, role: user.role, sections: visibleSectionsForRole(user.role), isStaff: isStaffRole(user.role), accountUrl: '/account' } });
    }

    if (url.pathname === '/api/auth/me') {
      const user = requireAuth(req, res, data);
      if (!user) return;
      return send(res, 200, { user: { id: user.id, email: user.email, name: user.name, role: user.role, sections: visibleSectionsForRole(user.role), isStaff: isStaffRole(user.role), accountUrl: '/account' } });
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      const token = tokenFrom(req);
      data.sessions = data.sessions.filter(s => s.token !== token);
      writeData(data);
      return send(res, 200, { ok: true });
    }



    if (url.pathname === '/api/tools/import-woocommerce' && req.method === 'POST') {
      const user = requireRole(req, res, data, 'products', 'create');
      if (!user) return;
      const body = await parseBody(req);
      const products = Array.isArray(body.products) ? body.products : (Array.isArray(body) ? body : []);
      if (!products.length) return send(res, 400, { error: 'No products found. Paste an array of WooCommerce products or {"products":[...]}' });

      data.products = data.products || [];
      data.productCategories = data.productCategories || [];
      let created = 0;
      let updated = 0;
      let imageCount = 0;

      for (const p of products) {
        const name = wooProductName(p);
        const slug = wooProductSlug(p);
        const images = wooImagesFromProduct(p);
        imageCount += images.length;
        const categoryIds = wooCategoriesFromProduct(p).map(c => findOrCreateWooCategory(data, c)).filter(Boolean);

        const item = {
          id: id(),
          name,
          title: name,
          slug,
          sku: wooProductSku(p),
          description: wooProductDescription(p),
          price: wooProductPrice(p),
          regularPrice: wooProductPrice(p),
          salePrice: Number(wooField(p, 'sale_price', 'Sale price', 'Sale Price') || 0),
          stock: wooProductStock(p),
          status: 'active',
          categoryId: categoryIds[0] || '',
          categoryIds,
          images,
          externalSource: 'woocommerce',
          externalId: wooProductId(p),
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        };

        const existing = data.products.find(x => (item.sku && x.sku === item.sku) || (item.externalId && x.externalId === item.externalId) || x.slug === item.slug);
        if (existing && body.updateExisting !== false) {
          Object.assign(existing, item, { id: existing.id, createdAt: existing.createdAt || item.createdAt });
          updated++;
        } else {
          data.products.push(item);
          created++;
        }
      }

      audit(data, user, 'import', `woocommerce:${created} created ${updated} updated`);
      writeData(data);
      try { rebuildGeneratedData(data, true); buildStaticFiles(data); } catch (e) { console.error('Post-import rebuild failed', e); }
      return send(res, 200, { ok: true, created, updated, imagesImported: imageCount, totalProducts: data.products.length });
    }

    if (url.pathname === '/api/media/upload' && req.method === 'POST') {
      const user = requireRole(req, res, data, 'media', 'create');
      if (!user) return;
      const body = await parseBody(req);
      const originalName = String(body.name || 'upload');
      const mime = String(body.mime || mimeFromName(originalName));
      const base64 = String(body.base64 || '');
      const alt = String(body.alt || '');
      const folder = String(body.folder || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      const buffer = Buffer.from(base64.split(',').pop() || '', 'base64');
      if (!isAllowedUpload(originalName, mime, buffer.length)) {
        return send(res, 400, { error: 'File type not allowed or file too large. Max 25MB.' });
      }
      const fileName = safeFileName(originalName);
      const dir = folder ? path.join(UPLOADS_DIR, folder) : UPLOADS_DIR;
      fs.mkdirSync(dir, { recursive: true });
      const filePath = path.join(dir, fileName);
      fs.writeFileSync(filePath, buffer);
      const publicUrl = `/uploads/${folder ? folder + '/' : ''}${fileName}`;
      const media = {
        id: id(),
        name: originalName,
        fileName,
        folder,
        url: publicUrl,
        mime,
        size: buffer.length,
        alt,
        type: mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : 'file',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.media.unshift(media);
      audit(data, user, 'upload', `media:${media.id}`);
      addNotification(data, 'Media uploaded', `${originalName} was uploaded.`);
      writeData(data);
      return send(res, 201, media);
    }


    if (url.pathname.startsWith('/theme-assets/')) {
      const rel = decodeURIComponent(url.pathname.replace('/theme-assets/', ''));
      const filePath = path.normalize(path.join(THEME_ASSETS_DIR, rel));
      if (!filePath.startsWith(path.normalize(THEME_ASSETS_DIR))) return send(res, 403, { error: 'Forbidden' });
      if (!fs.existsSync(filePath)) return send(res, 404, { error: 'File not found' });
      const mime = mimeFromName(filePath);
      return send(res, 200, fs.readFileSync(filePath), { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    }

    if (url.pathname.startsWith('/uploads/')) {
      const rel = decodeURIComponent(url.pathname.replace('/uploads/', ''));
      const filePath = path.normalize(path.join(UPLOADS_DIR, rel));
      if (!filePath.startsWith(path.normalize(UPLOADS_DIR))) return send(res, 403, { error: 'Forbidden' });
      if (!fs.existsSync(filePath)) return send(res, 404, { error: 'File not found' });
      const mime = mimeFromName(filePath);
      return send(res, 200, fs.readFileSync(filePath), { 'Content-Type': mime, 'Cache-Control': 'public, max-age=31536000, immutable' });
    }



    
    
    if (url.pathname === '/api/admin/support-chat' && req.method === 'GET') {
      return send(res, 200, { items: data.supportMessages || [] });
    }

    if (url.pathname.match(/^\/api\/admin\/support-chat\/[^/]+\/reply$/) && req.method === 'POST') {
      const supportId = url.pathname.split('/')[4];
      const body = await parseBody(req);
      const message = String(body.message || '').trim();
      if (!message) return send(res, 400, { error: 'Message required' });
      data.supportMessages = data.supportMessages || [];
      const item = data.supportMessages.find(s => s.id === supportId);
      if (!item) return send(res, 404, { error: 'Support chat not found' });
      item.replies = item.replies || [];
      item.replies.push({ id: id(), type: 'admin', createdBy: currentUser?.email || 'Admin', message, createdAt: new Date().toISOString() });
      item.status = 'replied';
      item.updatedAt = new Date().toISOString();
      writeData(data);
      return send(res, 200, item);
    }

    if (url.pathname.match(/^\/api\/admin\/support-chat\/[^/]+$/) && req.method === 'DELETE') {
      const supportId = url.pathname.split('/').pop();
      data.supportMessages = data.supportMessages || [];
      const before = data.supportMessages.length;
      data.supportMessages = data.supportMessages.filter(s => s.id !== supportId);
      writeData(data);
      return send(res, 200, { deleted: before - data.supportMessages.length });
    }

    if (url.pathname.match(/^\/api\/account\/support-chat\/[^/]+$/) && req.method === 'DELETE') {
      const supportId = url.pathname.split('/').pop();
      data.supportMessages = data.supportMessages || [];
      const before = data.supportMessages.length;
      data.supportMessages = data.supportMessages.filter(s => s.id !== supportId);
      writeData(data);
      return send(res, 200, { deleted: before - data.supportMessages.length });
    }

if (url.pathname === '/api/account/support-chat' && req.method === 'GET') {
      const email = String(url.searchParams.get('email') || '').trim().toLowerCase();
      const items = (data.supportMessages || []).filter(m => !email || String(m.email || '').toLowerCase() === email);
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, max-age=0');
      return send(res, 200, { items });
    }

    if (url.pathname === '/api/account/support-chat' && req.method === 'POST') {
      const body = await parseBody(req);
      const email = String(body.email || '').trim();
      const message = String(body.message || '').trim();
      if (!email || !message) return send(res, 400, { error: 'Email and message required' });
      const msg = {
        id: id(),
        userId: '',
        email,
        name: body.name || 'Customer',
        subject: body.subject || 'Account support chat',
        message,
        status: 'open',
        source: 'account-chat',
        replies: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.supportMessages = data.supportMessages || [];
      data.supportMessages.unshift(msg);
      addNotification(data, 'Support chat message', `${email} sent a support chat message.`);
      writeData(data);
      return send(res, 201, msg);
    }

if (url.pathname === '/api/contact' && req.method === 'POST') {
      const body = await parseBody(req);
      const msg = {
        id: id(),
        userId: '',
        email: body.email || '',
        name: body.name || '',
        subject: body.subject || 'Contact form message',
        message: body.message || '',
        status: 'open',
        source: 'contact-page',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.supportMessages = data.supportMessages || [];
      data.supportMessages.unshift(msg);
      queueEmail(data, process.env.ADMIN_EMAIL || data.users[0]?.email || msg.email, `Contact form: ${msg.subject}`, `${msg.name} <${msg.email}>\n\n${msg.message}`, 'contact-form');
      addNotification(data, 'Contact form message', `${msg.email} sent a contact form message.`);
      writeData(data);
      return send(res, 201, { ok: true });
    }

    if (url.pathname.startsWith('/api/account/')) {
      const user = requireCustomer(req, res, data);
      if (!user) return;
      const part = url.pathname.replace('/api/account/','');
      if (part === 'dashboard') {
        const orders = data.orders.filter(o => o.email === user.email);
        return send(res, 200, { stats: { orders: orders.length, addresses: (user.addresses||[]).length, downloads: (user.downloads||[]).length, subscriptions: (user.subscriptions||[]).length, wishlist: (user.wishlist||[]).length, support: (data.supportMessages||[]).filter(m=>m.userId===user.id).length }});
      }
      if (part === 'orders') return send(res, 200, { items: data.orders.filter(o => o.email === user.email) });
      if (part === 'downloads') return send(res, 200, { items: user.downloads || [] });
      if (part === 'subscriptions') return send(res, 200, { items: user.subscriptions || [] });
      if (part === 'wishlist') return send(res, 200, { items: (user.wishlist||[]).map(id=>data.products.find(p=>p.id===id)).filter(Boolean) });
      if (part === 'profile') {
        if (req.method === 'GET') return send(res, 200, sanitizeUserForResponse(user));
        if (req.method === 'PUT') { const b=await parseBody(req); user.name=b.name||user.name; user.email=b.email||user.email; user.updatedAt=new Date().toISOString(); writeData(data); return send(res, 200, { user: sanitizeUserForResponse(user) }); }
      }
      if (part === 'security') {
        if (req.method === 'GET') return send(res, 200, { password: 'set', twoFactor: user.twoFactor || { enabled:false } });
        if (req.method === 'POST') { const b=await parseBody(req); if (user.passwordHash !== hash(b.oldPassword||'')) return send(res,400,{error:'Current password is incorrect'}); if (!b.newPassword || String(b.newPassword).length<8) return send(res,400,{error:'New password must be at least 8 characters'}); user.passwordHash=hash(b.newPassword); queueEmail(data,user.email,'Password changed','Your password was changed.','password-changed'); writeData(data); return send(res,200,{ok:true}); }
      }
      if (part === 'addresses') {
        if (req.method === 'GET') return send(res, 200, { items: user.addresses || [] });
        if (req.method === 'POST') { const b=await parseBody(req); const a={id:id(),label:b.label||'Address',postcode:b.postcode||'',line1:b.line1||b.address||'',line2:b.line2||'',city:b.city||'',county:b.county||'',country:b.country||'United Kingdom',createdAt:new Date().toISOString()}; user.addresses=user.addresses||[]; user.addresses.unshift(a); writeData(data); return send(res,201,a); }
      }
      if (part === 'review-products') return send(res, 200, { items: (data.products||[]).filter(p=>p.status!=='inactive').map(p=>({id:p.id,title:p.title||p.name||p.slug||'Product'})) });
      if (part === 'reviews') {
        if (req.method === 'GET') return send(res, 200, { items: (data.reviews||[]).filter(r=>r.userId===user.id || r.email===user.email) });
        if (req.method === 'POST') { const b=await parseBody(req); const r={id:id(),userId:user.id,email:user.email,name:user.name||user.email,productId:b.productId||'',title:b.title||'',rating:Number(b.rating||5),quote:b.quote||'',showOnHome:false,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; data.reviews.unshift(r); addNotification(data,'New customer review',`${r.name} submitted a review.`); writeData(data); return send(res,201,r); }
      }
      if (part === 'support') {
        if (req.method === 'GET') return send(res, 200, { items: (data.supportMessages||[]).filter(m=>m.userId===user.id) });
        if (req.method === 'POST') { const b=await parseBody(req); const m={id:id(),userId:user.id,email:user.email,subject:b.subject||'Support request',message:b.message||'',status:'open',createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()}; data.supportMessages.unshift(m); queueEmail(data,process.env.ADMIN_EMAIL||data.users[0]?.email||user.email,`Support: ${m.subject}`,m.message,'support-message'); writeData(data); return send(res,201,m); }
      }
      return send(res,404,{error:'Account endpoint not found'});
    }


    if (url.pathname === '/api/bulk-delete' && req.method === 'POST') {
      const body = await parseBody(req);
      const type = String(body.type || '');
      const ids = Array.isArray(body.ids) ? body.ids.map(String) : [];
      const map = { products: 'products', productCategories: 'productCategories', 'product-categories': 'productCategories' };
      const listName = map[type];
      if (!listName) return send(res, 400, { error: 'Unsupported bulk delete type' });
      const user = requireRole(req, res, data, listName, 'delete');
      if (!user) return;
      if (!ids.length) return send(res, 400, { error: 'No items selected' });

      const before = (data[listName] || []).length;
      data[listName] = (data[listName] || []).filter(item => !ids.includes(String(item.id)));
      const deleted = before - data[listName].length;

      if (listName === 'productCategories') {
        for (const product of data.products || []) {
          product.categoryIds = (product.categoryIds || []).filter(id => !ids.includes(String(id)));
          if (ids.includes(String(product.categoryId || ''))) product.categoryId = '';
        }
      }

      audit(data, user, 'bulk-delete', `${listName}:${deleted}`);
      writeData(data);
      try { rebuildGeneratedData(data, true); buildStaticFiles(data); } catch (e) { console.error('Post-delete rebuild failed', e); }
      return send(res, 200, { ok: true, deleted });
    }

    if (url.pathname === '/api/dashboard') {
      const user = requireStaff(req, res, data);
      if (!user) return;
      return send(res, 200, {
        sections: visibleSectionsForRole(user.role),
        stats: {
          pages: data.pages.length,
          posts: data.posts.length,
          products: data.products.length,
          orders: data.orders.length,
          users: data.users.length,
          notifications: data.notifications.filter(n => !n.read).length,
          emails: data.emails.length,
          jobs: data.jobs.length
        },
        navigation: data.navigation,
        recentAudit: data.audit.slice(0, 10),
        settings: data.settings
      });
    }


    if (url.pathname === '/api/themes') {
      const user = requireRole(req, res, data, 'settings', 'read');
      if (!user) return;
      return send(res, 200, { selected: selectedTheme(data), themes: availableThemes() });
    }


    if (url.pathname === '/api/backup/create' && req.method === 'POST') {
      const user = requireRole(req, res, data, 'settings', 'update');
      if (!user) return;
      data.backups = data.backups || [];
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `backup-${stamp}.json`;
      const backupDir = path.join(DATA_DIR, 'backups');
      fs.mkdirSync(backupDir, { recursive: true });
      const backupPath = path.join(backupDir, fileName);
      fs.writeFileSync(backupPath, JSON.stringify(data, null, 2));
      const rec = { id: id(), name: fileName, path: backupPath, size: fs.statSync(backupPath).size, createdAt: new Date().toISOString(), createdBy: user.email };
      data.backups.unshift(rec);
      data.backups = data.backups.slice(0, 50);
      audit(data, user, 'create', 'backup');
      writeData(data);
      return send(res, 201, rec);
    }

    if (url.pathname.startsWith('/api/backup/download/') && req.method === 'GET') {
      const user = requireRole(req, res, data, 'settings', 'read');
      if (!user) return;
      const backupId = url.pathname.split('/').pop();
      const rec = (data.backups || []).find(b => b.id === backupId);
      if (!rec || !rec.path || !fs.existsSync(rec.path)) return send(res, 404, { error: 'Backup not found' });
      return send(res, 200, fs.readFileSync(rec.path), { 'Content-Type': 'application/json', 'Content-Disposition': `attachment; filename="${rec.name || 'backup.json'}"` });
    }

    if (url.pathname.startsWith('/api/backup/restore/') && req.method === 'POST') {
      const user = requireRole(req, res, data, 'settings', 'update');
      if (!user) return;
      const backupId = url.pathname.split('/').pop();
      const rec = (data.backups || []).find(b => b.id === backupId);
      if (!rec || !rec.path || !fs.existsSync(rec.path)) return send(res, 404, { error: 'Backup not found' });
      const restored = JSON.parse(fs.readFileSync(rec.path, 'utf8'));
      restored.backups = data.backups || [];
      restored.auditLog = restored.auditLog || [];
      audit(restored, user, 'restore', `backup:${backupId}`);
      writeData(restored);
      rebuildGeneratedData(restored);
      buildStaticFiles(restored);
      return send(res, 200, { ok: true, restored: rec.name });
    }

    if (url.pathname.startsWith('/api/backup/delete/') && req.method === 'DELETE') {
      const user = requireRole(req, res, data, 'settings', 'update');
      if (!user) return;
      const backupId = url.pathname.split('/').pop();
      const idx = (data.backups || []).findIndex(b => b.id === backupId);
      if (idx === -1) return send(res, 404, { error: 'Backup not found' });
      const rec = data.backups[idx];
      if (rec.path && fs.existsSync(rec.path)) {
        try { fs.unlinkSync(rec.path); } catch {}
      }
      data.backups.splice(idx, 1);
      audit(data, user, 'delete', `backup:${backupId}`);
      writeData(data);
      return send(res, 200, { ok: true });
    }

    if (url.pathname.startsWith('/api/support-reply/') && req.method === 'POST') {
      const user = requireRole(req, res, data, 'support', 'update');
      if (!user) return;
      const supportId = url.pathname.split('/').pop();
      const msg = (data.supportMessages || []).find(m => m.id === supportId);
      if (!msg) return send(res, 404, { error: 'Support message not found' });
      const b = await parseBody(req);
      msg.replies = msg.replies || [];
      const reply = { id: id(), message: b.message || '', createdAt: new Date().toISOString(), createdBy: user.email };
      msg.replies.push(reply);
      msg.status = b.status || 'replied';
      msg.updatedAt = new Date().toISOString();
      queueEmail(data, msg.email, `Re: ${msg.subject || 'Support request'}`, reply.message, 'support-reply');
      writeData(data);
      return send(res, 200, { ok: true, reply, item: msg });
    }

    if (url.pathname.startsWith('/api/users/') && req.method === 'DELETE') {
      const current = requireRole(req, res, data, 'users', 'delete');
      if (!current) return;
      const userId = url.pathname.split('/').pop();
      const idx = (data.users || []).findIndex(u => u.id === userId);
      if (idx === -1) return send(res, 404, { error: 'User not found' });
      if (data.users[idx].email === current.email) return send(res, 400, { error: 'You cannot delete your own account while logged in.' });
      data.users.splice(idx, 1);
      writeData(data);
      return send(res, 200, { ok: true });
    }

    if (url.pathname === '/api/images/optimize' && req.method === 'POST') {
      const user = requireRole(req, res, data, 'media', 'update');
      if (!user) return;
      const result = optimizeAllImages(data);
      writeData(data);
      rebuildGeneratedData(data);
      buildStaticFiles(data);
      return send(res, 200, { ok: true, result });
    }

    if (url.pathname === '/api/settings') {
      const user = requireRole(req, res, data, 'settings', req.method === 'GET' ? 'read' : 'update');
      if (!user) return;
      if (req.method === 'GET') return send(res, 200, data.settings);
      if (req.method === 'PUT') {
        const body = await parseBody(req);
        data.settings = { ...data.settings, ...body };
        if (!availableThemes().some(t => t.id === data.settings.theme)) data.settings.theme = 'simple';
        audit(data, user, 'update', 'settings');
        rebuildGeneratedData(data, true);
        writeData(data);
        return send(res, 200, data.settings);
      }
    }

    if (url.pathname === '/api/build' && req.method === 'POST') {
      const user = requireRole(req, res, data, 'settings', 'update');
      if (!user) return;
      addJob(data, 'static-build', {});
      rebuildGeneratedData(data, true);
      audit(data, user, 'build', 'static-site');
      addNotification(data, 'Build complete', 'Static pages, menu, route manifest and search index were regenerated.');
      writeData(data);
      return send(res, 200, { ok: true, message: 'Build complete', navigation: data.navigation });
    }

    if (url.pathname === '/api/search') {
      const user = requireStaff(req, res, data);
      if (!user) return;
      const q = String(url.searchParams.get('q') || '').toLowerCase();
      const results = (data.searchIndex || []).filter(item => (item.title + ' ' + item.text).toLowerCase().includes(q)).slice(0, 25);
      return send(res, 200, { items: results });
    }

    if (url.pathname === '/api/checkout' && req.method === 'POST') {
      const body = await parseBody(req);
      const items = Array.isArray(body.items) ? body.items : [];
      const email = String(body.email || '').trim();
      if (!email) return send(res, 400, { error: 'Customer email required' });
      const orderItems = [];
      let subtotal = 0;
      for (const item of items) {
        const p = data.products.find(x => x.id === item.productId && x.status === 'active');
        if (!p) continue;
        const qty = Math.max(1, Number(item.qty || 1));
        const lineTotal = Number(p.price || 0) * qty;
        subtotal += lineTotal;
        orderItems.push({ productId: p.id, title: p.title, sku: p.sku, qty, price: p.price, lineTotal });
      }
      if (!orderItems.length) return send(res, 400, { error: 'Cart is empty' });
      const tax = subtotal * (Number(data.settings.taxRate || 0) / 100);
      const shipping = subtotal >= Number(data.settings.freeShippingOver || 0) ? 0 : Number(data.settings.shippingFlatRate || 0);
      const total = Math.round((subtotal + tax + shipping) * 100) / 100;
      const order = {
        id: id(),
        email,
        customerName: body.name || '',
        address: body.address || '',
        status: 'pending-payment',
        paymentStatus: 'unpaid',
        fulfilmentStatus: 'unfulfilled',
        paymentMethod: body.paymentMethod || 'paypal',
        paymentProvider: body.paymentMethod === 'paypal' ? 'paypal-api-ready' : 'manual',
        paypalApprovalUrl: '',
        items: orderItems,
        subtotal,
        tax,
        shipping,
        total,
        currency: data.settings.currency || 'GBP',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      data.orders.unshift(order);
      queueEmail(data, email, `Order received ${order.id}`, `Thanks. Your order total is ${order.currency} ${order.total}. Status: ${order.status}.`, 'order-received');
      queueEmail(data, process.env.ADMIN_EMAIL || data.users[0]?.email || email, `New order ${order.id}`, `A new order was created for ${email}. Total: ${order.currency} ${order.total}.`, 'admin-new-order');
      addNotification(data, 'New order', `Order ${order.id} was created for ${email}.`);
      audit(data, null, 'create', `order:${order.id}`);
      writeData(data);
      return send(res, 201, { order });
    }

    if (url.pathname === '/api/audit') {
      const user = requireRole(req, res, data, 'audit', 'read');
      if (!user) return;
      return send(res, 200, data.audit.slice(0, 100));
    }

    const listName = listNameFromPath(url.pathname);
    if (listName) {
      let action = 'read';
      if (req.method === 'POST') action = 'create';
      if (req.method === 'PUT' || req.method === 'PATCH') action = 'update';
      if (req.method === 'DELETE') action = 'delete';
      const user = requireRole(req, res, data, listName, action);
      if (!user) return;
      const list = data[listName];
      const parts = url.pathname.split('/').filter(Boolean);
      const itemId = parts[2];

      if (req.method === 'GET' && !itemId) {
        const cacheKey = `list:${listName}:${url.search}`;
        if (memoryCache.has(cacheKey)) return send(res, 200, memoryCache.get(cacheKey));
        const page = Math.max(1, Number(url.searchParams.get('page') || 1));
        const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') || 25)));
        const q = String(url.searchParams.get('q') || '').toLowerCase();
        let items = Array.isArray(list) ? [...list] : [];
        if (q) items = items.filter(item => JSON.stringify(item).toLowerCase().includes(q));
        const total = items.length;
        const start = (page - 1) * limit;
        const result = { items: items.slice(start, start + limit), total, page, limit };
        memoryCache.set(cacheKey, result);
        return send(res, 200, result);
      }

      if (req.method === 'GET' && itemId) {
        const item = list.find(x => x.id === itemId);
        if (!item) return send(res, 404, { error: 'Not found' });
        return send(res, 200, listName === 'users' ? sanitizeUserForResponse(item) : item);
      }

      if (req.method === 'POST') {
        const body = await parseBody(req);
        const now = new Date().toISOString();
        let item = { id: id(), ...body, createdAt: now, updatedAt: now };
        if (listName === 'pages') item = normalizePage(item);
        if (listName === 'posts') item = normalizeBlogPost(item);
        if (listName === 'blogCategories') item = normalizeBlogCategory(item);
        if (listName === 'posts') item = normalizeBlogPost(item);
        if (listName === 'blogCategories') item = normalizeBlogCategory(item);
        if (listName === 'posts') item = normalizePost(item);

        if (listName === 'menuItems') item = normalizeCmsMenuItem(item);
        if (listName === 'menuItems') item = normalizeCmsMenuItem(item);
        if (listName === 'productCategories') item = normalizeCategory(item);
        if (listName === 'productCategories') item = normalizeCategory(item);
        if (listName === 'products') item = normalizeProduct(item);
        if (listName === 'users') { item.role = ['admin','editor','author','subscriber'].includes(item.role) ? item.role : 'subscriber'; if (body.password) item.passwordHash = hash(body.password); delete item.password; }
        list.unshift(item);
        audit(data, user, 'create', `${listName}:${item.id}`);
        if (['pages','posts','products'].includes(listName)) {
          rebuildGeneratedData(data, true);
          addJob(data, 'changed-page-build', { type: listName, id: item.id });
        }
        writeData(data);
        return send(res, 201, listName === 'users' ? sanitizeUserForResponse(item) : item);
      }

      if ((req.method === 'PUT' || req.method === 'PATCH') && itemId) {
        const body = await parseBody(req);
        const idx = list.findIndex(x => x.id === itemId);
        if (idx === -1) return send(res, 404, { error: 'Not found' });
        let item = { ...list[idx], ...body, updatedAt: new Date().toISOString() };
        if (listName === 'pages') item = normalizePage(item);
        if (listName === 'posts') item = normalizePost(item);
        if (listName === 'productCategories') item = normalizeCategory(item);
        if (listName === 'products') item = normalizeProduct(item);
        if (listName === 'users') { item.role = ['admin','editor','author','subscriber'].includes(item.role) ? item.role : 'subscriber'; if (body.password) item.passwordHash = hash(body.password); delete item.password; }
        list[idx] = item;
        audit(data, user, 'update', `${listName}:${itemId}`);
        if (['pages','posts','products'].includes(listName)) {
          rebuildGeneratedData(data, true);
          addJob(data, 'changed-page-build', { type: listName, id: item.id });
        }
        writeData(data);
        return send(res, 200, listName === 'users' ? sanitizeUserForResponse(list[idx]) : list[idx]);
      }

      if (req.method === 'DELETE' && itemId) {
        const idx = list.findIndex(x => x.id === itemId);
        if (idx === -1) return send(res, 404, { error: 'Not found' });
        const deletedItem = list[idx];
        list.splice(idx, 1);
        if (listName === 'media' && deletedItem?.url?.startsWith('/uploads/')) {
          const rel = decodeURIComponent(deletedItem.url.replace('/uploads/', ''));
          const filePath = path.normalize(path.join(UPLOADS_DIR, rel));
          if (filePath.startsWith(path.normalize(UPLOADS_DIR)) && fs.existsSync(filePath)) {
            try { fs.unlinkSync(filePath); } catch {}
          }
        }
        audit(data, user, 'delete', `${listName}:${itemId}`);
        if (['pages','posts','products'].includes(listName)) rebuildGeneratedData(data, true);
        writeData(data);
        return send(res, 200, { ok: true });
      }
    }

    if (url.pathname === '/order-confirmation') {
      const orderId = url.searchParams.get('order') || '';
      return sendMaybeCompressed(req, res, 200, renderOrderConfirmation(data, orderId), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }


    if (url.pathname === '/products') {
      const params = Object.fromEntries(url.searchParams.entries());
      return sendMaybeCompressed(req, res, 200, renderProducts(data, params), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }

    if (url.pathname.startsWith('/category/')) {
      const slug = url.pathname.split('/').pop();
      const cat = categoryBySlug(data, slug);
      if (!cat) return send(res, 404, { error: 'Category not found' });
      return sendMaybeCompressed(req, res, 200, renderCategory(data, cat), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    }

    const staticFile = publicFileFor(url.pathname);
    if (fs.existsSync(staticFile)) {
      const html = fs.readFileSync(staticFile, 'utf8');
      return sendMaybeCompressed(req, res, 200, injectHomepageStyleEverywhere(injectNoCategoriesDefaultImage(html)), { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=60' });
    }

    if (url.pathname === '/sitemap.xml' && fs.existsSync(path.join(PUBLIC_DIR, 'sitemap.xml'))) {
      return send(res, 200, fs.readFileSync(path.join(PUBLIC_DIR, 'sitemap.xml'), 'utf8'), { 'Content-Type': 'application/xml', 'Cache-Control': 'public, max-age=300' });
    }

    return send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    return send(res, 500, { error: 'Server error', message: err.message });
  }
}

http.createServer(handler).listen(PORT, () => {
  const data = readData();
  rebuildGeneratedData(data, true);
  writeData(data);
  console.log(`CMS running on port ${PORT}`);
});
