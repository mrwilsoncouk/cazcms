(function(){
  function applyAreaClasses(){
    var path = location.pathname;
    
    // Establish admin area presence based on path or dashboard element bindings
    var isArea = /\/admin|\/account|\/login|\/auth/i.test(path) || 
                 document.getElementById('dashboard') || 
                 document.querySelector('.topbar') || 
                 document.getElementById('pp-theme-switcher');

    // If the PP theme configuration is active, prevent standard style sheets from hijacking layout
    if (localStorage.getItem('pp-theme-enabled') === '1' || document.body.classList.contains('pp-theme')) {
      document.body.classList.add('pp-theme');
      document.body.classList.remove('rz-standard-area', 'rz-green-storefront');
      return;
    }

    document.body.classList.toggle('rz-standard-area', !!isArea);
    document.body.classList.toggle('rz-green-storefront', !isArea);

    // BUGFIX: Prevent destructive .remove() calls from clearing critical CMS showcases.
    // Instead of deleting nodes from the document fragment, we apply an invisible toggle 
    // only if they are entirely outside designated search filter layout rows.
    document.querySelectorAll('.shop-categories,.category-grid,.category-card,.category-showcase,.category-section,.collection-grid,.collection-card').forEach(function(el){
      if(!el.closest('.filters,.shop-filters,.product-filters,#filters')) {
         el.style.display = 'none'; 
      }
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyAreaClasses);
  } else {
    applyAreaClasses();
  }
})();