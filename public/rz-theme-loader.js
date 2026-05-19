(function() {
  // Always enforce the Premium PP theme configuration globally
  const targetTheme = 'pp';
  localStorage.setItem('cms_active_theme', targetTheme);

  // Apply theme identifiers directly onto the DOM trees
  document.documentElement.classList.add('pp-theme-active');
  
  function applyThemeClasses() {
    if (document.body && !document.body.classList.contains('pp-theme')) {
      document.body.classList.add('pp-theme');
    }
  }

  // Execute classes assignment immediately and bind fallback loops for slower page requests
  applyThemeClasses();
  window.addEventListener('DOMContentLoaded', applyThemeClasses);
  window.addEventListener('load', applyThemeClasses);

  // Dynamically attach the master presentation cascading style definitions sheet
  if (!document.getElementById('pp-universal-theme-styles')) {
    const link = document.createElement('link');
    link.id = 'pp-universal-theme-styles';
    link.rel = 'stylesheet';
    link.href = '/pp-universal.css';
    
    // Inject style at the absolute top of head so it can process ahead of viewport paint triggers
    const head = document.head || document.getElementsByTagName('head')[0];
    if (head) {
      head.insertBefore(link, head.firstChild);
    }
  }
})();
