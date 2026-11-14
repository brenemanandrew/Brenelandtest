// "Back to Breneland" on each of Andrew's tools (public/js/tools-menu.js): a small link to /?tools, which brings his
// tools menu straight back (anyone else lands on the start screen as usual). A classic script at the end of a tool page:
//   <script src="/js/tools-back.js" data-into="#top"></script>   the link goes first in that element
//   <script src="/js/tools-back.js"></script>                    a small chip in the top-left corner (a page with no bar)
(function () {
  'use strict';
  var me = document.currentScript;
  var into = me && me.getAttribute('data-into');
  function add() {
    if (document.querySelector('.to-breneland')) return;
    var css = document.createElement('style');
    css.textContent = '.to-breneland{display:inline-flex;align-items:center;gap:4px;flex:0 0 auto;white-space:nowrap;text-decoration:none;color:#2b2340;' +
      'font:600 13px "Fredoka",system-ui,sans-serif;line-height:1.1;background:#fff;border:2.5px solid #2b2340;border-radius:999px;' +
      'box-shadow:0 2px 0 #2b2340;padding:5px 11px;margin:0 6px 0 0;touch-action:manipulation}' +
      '.to-breneland:active{transform:translateY(2px);box-shadow:none}' +
      '.to-breneland:focus-visible{outline:3px solid #3f8fd9;outline-offset:2px}' +
      '@media (max-width:600px){.to-breneland:not(.tb-float) .tb-long{display:none}}' +
      '.to-breneland.tb-float{position:fixed;left:max(8px,env(safe-area-inset-left));top:max(8px,env(safe-area-inset-top));z-index:2147483000;margin:0}';
    document.head.appendChild(css);
    var a = document.createElement('a');
    a.className = 'to-breneland';
    a.href = '/?tools';
    var long = document.createElement('span');
    long.className = 'tb-long'; long.textContent = 'Back to ';   // (a narrow phone bar: just "Breneland")
    a.append(String.fromCharCode(0x2039) + ' ', long, 'Breneland');
    a.setAttribute('aria-label', 'Back to Breneland');
    var host = into ? document.querySelector(into) : null;
    if (host) host.insertBefore(a, host.firstChild);
    else { a.className += ' tb-float'; document.body.appendChild(a); }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', add); else add();
})();
