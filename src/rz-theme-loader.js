
(function(){
  function applyAreaClasses(){
    var path=location.pathname;
    var isArea=/\/admin|\/account|\/login|\/auth/i.test(path) || document.getElementById('dashboard');
    document.body.classList.toggle('rz-standard-area', !!isArea);
    document.body.classList.toggle('rz-green-storefront', !isArea);

    document.querySelectorAll('.shop-categories,.category-grid,.category-card,.category-showcase,.category-section,.collection-grid,.collection-card').forEach(function(el){
      if(!el.closest('.filters,.shop-filters,.product-filters,#filters')) el.remove();
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',applyAreaClasses);
  else applyAreaClasses();
})();
