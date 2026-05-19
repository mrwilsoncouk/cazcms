(function() {
  // Enforce premium corporate styling across all administrative contexts
  localStorage.setItem('cms_active_theme', 'pp');
  document.documentElement.classList.add('pp-theme-active');
  
  function injectThemeClasses() {
    if (document.body && !document.body.classList.contains('pp-theme')) {
      document.body.classList.add('pp-theme');
    }
  }

  injectThemeClasses();
  window.addEventListener('DOMContentLoaded', injectThemeClasses);
  window.addEventListener('load', injectThemeClasses);

  // Link the custom cloud-compiled CSS engine safely
  if (!document.getElementById('pp-universal-theme-styles')) {
    const link = document.createElement('link');
    link.id = 'pp-universal-theme-styles';
    link.rel = 'stylesheet';
    link.href = '/pp-universal.css';
    
    const targetHead = document.head || document.getElementsByTagName('head')[0];
    if (targetHead) {
      targetHead.insertBefore(link, targetHead.firstChild);
    }
  }
})();
