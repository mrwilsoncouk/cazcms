import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { find, one, insert, update } from './core/store.js';
import { buildSearchIndex, buildRouteManifest, buildPrecomputedNavigation, compressStaticFiles, checkPerformanceBudget } from './modules/performance.js';

// --- PRODUCTION CLOUD SEEDING OVERRIDE ---
// Automatically registers the 'pp' theme inside the store if it doesn't exist yet
const targetTheme = one('themes', t => t.handle === 'pp');
if (!targetTheme) {
    insert('themes', {
        name: 'PP Premium Corporate Theme',
        handle: 'pp',
        enabled: true,
        tokens: {
            color: '#121e15',
            accent: '#2f9e44',
            bg_main: '#f4f8f5',
            panel: '#ffffff',
            font: 'Inter, system-ui, sans-serif'
        },
        layouts: { header: 'PP Corporate Nav', footer: 'PP Corporate Footer' },
        templates: { post: 'post.html', page: 'page.html', product: 'product.html' }
    });
} else if (!targetTheme.enabled) {
    update('themes', targetTheme.id, { enabled: true });
}

const OUT = 'public/site';
const ASSETS = path.join(OUT, 'assets');
fs.mkdirSync(OUT, { recursive: true });
fs.mkdirSync(ASSETS, { recursive: true });

const esc = (s = '') => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const minHtml = s => String(s).replace(/>\s+</g, '><').replace(/\s{2,}/g, ' ').trim();
const minCss = s => String(s).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\s+/g, ' ').replace(/\s*([{}:;,>])\s*/g, '$1').trim();
const hash = s => crypto.createHash('sha1').update(s).digest('hex').slice(0, 10);

function writeStaticFileAtomic(targetFilePath, fileContent) {
    const resolvedPath = path.resolve(targetFilePath);
    const directory = path.dirname(resolvedPath);
    if (!fs.existsSync(directory)) {
        fs.mkdirSync(directory, { recursive: true });
    }
    const tempFilePath = path.join(directory, `.tmp_${path.basename(resolvedPath)}`);
    try {
        fs.writeFileSync(tempFilePath, fileContent, 'utf8');
        fs.renameSync(tempFilePath, resolvedPath);
    } catch (error) {
        if (fs.existsSync(tempFilePath)) {
            try { fs.unlinkSync(tempFilePath); } catch (_) {}
        }
        throw error;
    }
}

function writeHashed(name, content) {
    const ext = path.extname(name);
    const base = path.basename(name, ext);
    const file = `${base}.${hash(content)}${ext}`;
    const destination = path.join(ASSETS, file);
    writeStaticFileAtomic(destination, content);
    return `/site/assets/${file}`;
}

const site = one('settings', s => s.key === 'site')?.value || { name: 'CMS' };
const now = new Date();

let content = find('content', c => (c.status === 'published' || (c.status === 'scheduled' && (!c.publishAt || new Date(c.publishAt) <= now))) && (!c.unpublishAt || new Date(c.unpublishAt) > now));
let products = find('products', p => (p.status || 'published') === 'published');
const theme = one('themes', t => t.enabled) || {};

const criticalCss = minCss(`body{font-family:${theme.tokens?.font || 'system-ui'};margin:0;color:#111;background:#fff}header,footer{padding:24px;background:#f4f4f5}.wrap{max-width:1100px;margin:auto;padding:24px}.card{border:1px solid #ddd;border-radius:12px;padding:16px;margin:12px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px}img{max-width:100%;height:auto}`);
const deferredCss = minCss(`.lazy-widget{content-visibility:auto;contain-intrinsic-size:300px}.muted{color:#555}.price{font-weight:700}.breadcrumbs{font-size:14px;margin:8px 0}.skip-link{position:absolute;left:-999px}.skip-link:focus{left:12px;top:12px;background:#fff;padding:8px}`);
const cssHref = writeHashed('site.css', deferredCss);
const jsHref = writeHashed('islands.js', `document.addEventListener('click',async e=>{const a=e.target.closest('[data-load-comments]');if(a){const id=a.dataset.loadComments;const box=document.querySelector('[data-comments-for="'+id+'"]');if(box&&!box.dataset.loaded){box.textContent='Loading comments...';const r=await fetch('/api/comments?contentId='+encodeURIComponent(id)).catch(()=>null);box.textContent=r?'Comments loaded.':'Comments unavailable.';box.dataset.loaded='1';}}});`);

function mediaTag(m, cls = '') {
    if (!m) return '';
    const src = m.url || m.data || '';
    const alt = esc(m.alt || '');
    return `<img class="${esc(cls)}" src="${esc(src)}" alt="${alt}" loading="lazy" decoding="async" width="${m.width || 800}" height="${m.height || 450}">`;
}

function page(title, body, seo = {}, crumbs = []) {
    const breadcrumbHtml = crumbs.length ? `<nav class="breadcrumbs">${crumbs.map(c => c.href ? `<a href="${esc(c.href)}">${esc(c.label)}</a>` : esc(c.label)).join(' / ')}</nav>` : '';
    return minHtml(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(seo.title || title)}</title><meta name="description" content="${esc(seo.description ||'')}"><style>${criticalCss}</style><link rel="preload" href="${cssHref}" as="style"><link rel="stylesheet" href="${cssHref}" media="print" onload="this.media='all'"><noscript><link rel="stylesheet" href="${cssHref}"></noscript><script defer src="${jsHref}"></script></head><body><a class="skip-link" href="#main">Skip to content</a><header><strong>${esc(site.name)}</strong><nav><a href="/site/index.html">Home</a> <a href="/site/products.html">Shop</a></nav></header><main id="main" class="wrap">${breadcrumbHtml}${body}</main><footer>Static build from headless Railway CMS</footer></body></html>`);
}

function contentHtml(c) {
    const blocks = (c.blocks || []).map(b => {
        if (b.type === 'image') return mediaTag(b.media || b, 'block-image');
        if (b.type === 'products') return `<section class="lazy-widget">${products.slice(0, 4).map(productCard).join('')}</section>`;
        return `<section class="block block-${esc(b.type || 'text')}">${b.html || esc(b.text || '')}</section>`;
    }).join('');
    const comments = `<section class="lazy-widget"><button data-load-comments="${esc(c.id)}">Load comments</button><div data-comments-for="${esc(c.id)}"></div></section>`;
    return `<article><h1>${esc(c.title)}</h1>${c.html || ''}${blocks}${comments}</article>`;
}

function productCard(p) { 
    return `<div class="card"><h2><a href="/site/products/${esc(p.slug || p.sku || p.id)}.html">${esc(p.name)}</a></h2><p>${esc(p.description || '')}</p><strong class="price">${esc(p.currency || site.currency || 'GBP')} ${p.salePrice || p.price || 0}</strong></div>`; 
}

const index = `<h1>${esc(site.name)}</h1>${content.slice(0, 50).map(c => `<article class="card"><h2><a href="/site/${esc(c.slug)}.html">${esc(c.title)}</a></h2><p>${esc(c.seo?.description || '')}</p></article>`).join('')}`;
writeStaticFileAtomic(path.join(OUT, 'index.html'), page(site.name, index, { description: site.description || '' }, [{ label: 'Home' }]));

for (const c of content) { 
    writeStaticFileAtomic(path.join(OUT, `${c.slug}.html`), page(c.title, contentHtml(c), c.seo, [{ label: 'Home', href: '/site/index.html' }, { label: c.title }]));
}

fs.mkdirSync(path.join(OUT, 'products'), { recursive: true });
writeStaticFileAtomic(path.join(OUT, 'products.html'), page('Products', `<h1>Products</h1><div class="grid">${products.map(productCard).join('')}</div>`, { description: 'Product catalogue' }, [{ label: 'Home', href: '/site/index.html' }, { label: 'Products' }]));

for (const p of products) {
    const related = products.filter(x => x.id !== p.id).slice(0, 4);
    writeStaticFileAtomic(path.join(OUT, 'products', `${p.slug || p.sku || p.id}.html`), page(p.name, `<article><h1>${esc(p.name)}</h1><p>${esc(p.description || '')}</p><p class="price">${esc(p.currency || site.currency || 'GBP')} ${p.salePrice || p.price || 0}</p><section class="lazy-widget"><h2>Related products</h2><div class="grid">${related.map(productCard).join('')}</div></section></article>`, p.seo || {}, [{ label: 'Home', href: '/site/index.html' }, { label: 'Products', href: '/site/products.html' }, { label: p.name }]));
}

const sitemapUrls = [...content.map(c => `/site/${c.slug}.html`), '/site/products.html', ...products.map(p => `/site/products/${p.slug || p.sku || p.id}.html`)];
writeStaticFileAtomic(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0"?><urlset>${sitemapUrls.map(loc => `<url><loc>${loc}</loc><lastmod>${new Date().toISOString()}</lastmod></url>`).join('')}</urlset>`);

const manifest = buildRouteManifest();
buildPrecomputedNavigation();
const search = buildSearchIndex();
const compression = compressStaticFiles(OUT);
const budget = checkPerformanceBudget(OUT);

insert('jobs', { type: 'static-build', status: 'complete', result: { pages: content.length, products: products.length, routes: manifest.length, search, compression, budget: budget.passed } });
console.log(`Static performance build complete: ${content.length} pages, ${products.length} products, ${manifest.length} routes, ${compression.count} compressed assets.`);
