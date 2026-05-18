function injectFreshRobocazTheme(html) {
  if (!html || typeof html !== 'string') return html;

  // BUGFIX: If PP Theme layers are detected, bypass the default storefront injector 
  // to ensure custom overrides are not smothered by forced files.
  if (html.includes('class="pp-theme"') || html.includes('pp-theme-enabled') || html.includes('pp-theme')) {
    if (html.includes('</body>') && !html.includes('/rz-theme-loader.js')) {
      html = html.replace('</body>', '<script src="/rz-theme-loader.js"></script></body>');
    }
    return html;
  }

  // Strip conflicting legacy stylesheets and custom injection points
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
  return injectFreshRobocazTheme(html);
}

export { injectFreshRobocazTheme, injectRobocazSingleTheme };