
(function(){
  const IMG='/assets/default-product.png';
  function run(){
    document.querySelectorAll('.category-card,.category-grid,.categories-grid,.shop-categories,.category-showcase').forEach(e=>e.remove());
    document.querySelectorAll('.product-card img,.product img,.product-item img').forEach(img=>{
      const s=(img.getAttribute('src')||'').trim();
      if(!s||s==='#'||s==='null'||s==='undefined'||/placeholder|no-image|blank/i.test(s)) img.src=IMG;
      img.onerror=()=>{ if(!img.src.includes(IMG)) img.src=IMG; };
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',run);else run();
})();
