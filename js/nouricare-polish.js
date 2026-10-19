/* Nouricare polish: seamless partner marquee + nav closes after tapping a link */
(function () {
  var t = document.querySelector(".partner-track");
  if (t && !t.dataset.cloned) {
    t.dataset.cloned = "1";
    Array.from(t.children).forEach(function (n) {
      var c = n.cloneNode(true); c.setAttribute("aria-hidden", "true"); t.appendChild(c);
    });
  }
  var nav = document.getElementById("navbarCollapse");
  if (nav) nav.addEventListener("click", function (e) {
    if (e.target.closest("a.nav-link") && nav.classList.contains("show") && window.bootstrap) {
      window.bootstrap.Collapse.getOrCreateInstance(nav).hide();
    }
  });
})();

/* keep the hero clear of the fixed header, whatever its real height is */
(function(){
  var h=document.querySelector(".fixed-top");
  if(!h)return;
  function set(){document.documentElement.style.setProperty("--hdr",h.offsetHeight+"px");}
  set();window.addEventListener("resize",set);window.addEventListener("load",set);
  if(window.ResizeObserver)new ResizeObserver(set).observe(h);
})();
