
(function(){
  function makeFixedAdminLinks(){
    if(document.getElementById('fixed-admin-links')) return;
    var box=document.createElement('div');
    box.id='fixed-admin-links';
    box.style.cssText='position:fixed;right:18px;bottom:18px;z-index:999999;display:grid;gap:8px';
    function a(text,href){
      var el=document.createElement('a');
      el.textContent=text;
      el.href=href;
      el.style.cssText='background:#6f9144;color:#fff;padding:11px 14px;border-radius:999px;font-weight:900;text-decoration:none;box-shadow:0 10px 22px rgba(0,0,0,.18);font-family:Arial,sans-serif';
      return el;
    }
    box.appendChild(a('Products','/admin/products'));
    box.appendChild(a('Categories','/admin/product-categories'));
    box.appendChild(a('Support Chat','/admin/support-chat-admin'));
    document.body.appendChild(box);
  }

  document.addEventListener('click',function(e){
    var btn=e.target.closest('button,a');
    if(!btn) return;
    var view=btn.getAttribute('data-view')||'';
    var text=(btn.textContent||'').trim().toLowerCase();
    if(view==='products'||text==='products'){e.preventDefault();e.stopImmediatePropagation();location.href='/admin/products';}
    if(view==='productCategories'||text==='product categories'){e.preventDefault();e.stopImmediatePropagation();location.href='/admin/product-categories';}
    if(view==='support'||text==='support'||text==='support chat'){e.preventDefault();e.stopImmediatePropagation();location.href='/admin/support-chat-admin';}
  },true);

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',makeFixedAdminLinks);
  else makeFixedAdminLinks();
})();
