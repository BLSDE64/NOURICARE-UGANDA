/* =========================================================
   PRODUCTS — public renderer
   Reads ACTIVE products from /api/products (Netlify Functions) and
   renders them into:
     #productGrid     the product cards section
     #orderProducts   the product picker inside the order form
   The static HTML already in those containers is the fallback:
   if the server is unreachable or there are no products yet, it stays.
   ========================================================= */

(function () {
    const grid = document.getElementById("productGrid");
    const picker = document.getElementById("orderProducts");
    if (!grid && !picker) return;

    const BADGES = {
        success: "bg-success",
        warning: "bg-warning text-dark",
        info: "bg-info text-dark",
        danger: "bg-danger",
        primary: "bg-primary",
        dark: "bg-dark",
    };

    function esc(str) {
        const d = document.createElement("div");
        d.textContent = str ?? "";
        return d.innerHTML;
    }

    function price(p) {
        return p.price_ugx ? Number(p.price_ugx).toLocaleString("en-UG") : "";
    }

    function cardHTML(p, i) {
        const badge = p.badge_text
            ? `<span class="badge ${BADGES[p.badge_color] || BADGES.success} position-absolute top-0 end-0 m-3 px-3 py-2 rounded-pill">${esc(p.badge_text)}</span>`
            : "";
        const img = p.image_url
            ? `<img src="${esc(p.image_url)}" class="card-img-top" alt="${esc(p.name)}" loading="lazy">`
            : `<div class="d-flex align-items-center justify-content-center bg-light" style="height:220px"><i class="fa fa-leaf fa-3x text-success"></i></div>`;
        const priceTag = p.price_ugx
            ? `<div class="price-tag"><small>UGX</small> ${price(p)}</div>`
            : "";

        return `
        <div class="col-md-6 col-lg-3">
          <div class="card border-0 shadow-lg rounded-4 h-100 product-card overflow-hidden">
            <div class="position-relative">${img}${badge}</div>
            <div class="card-body text-center p-4">
              <h5 class="fw-bold mb-3 text-dark">${esc(p.name)}</h5>
              <p class="text-muted small mb-3">${esc(p.description)}</p>
              ${priceTag}
              <a href="#Order" data-order-product="${esc(p.name)}" class="btn btn-primary rounded-pill px-4 py-2 fw-semibold">Order Now</a>
            </div>
          </div>
        </div>`;
    }

    function tileHTML(p, i) {
        const thumb = p.image_url
            ? `<img src="${esc(p.image_url)}" alt="" loading="lazy">`
            : `<span class="ph"><i class="fa fa-leaf"></i></span>`;
        const meta = p.price_ugx ? `UGX ${price(p)}` : esc(p.badge_text || "");
        return `
        <div class="od-product">
          <input type="radio" name="product" id="prod-${i}" value="${esc(p.name)}" data-price="${p.price_ugx || ""}" ${i === 0 ? "required" : ""}>
          <label for="prod-${i}">
            ${thumb}
            <span><span class="nm">${esc(p.name)}</span><span class="mt">${meta}</span></span>
            <span class="tick"><i class="fa fa-check"></i></span>
          </label>
        </div>`;
    }

    async function load() {
        try {
            const res = await fetch("/api/products", { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = (await res.json()).data;

            // Empty or failed -> keep the static fallback markup untouched.
            if (!data || data.length === 0) return;

            if (grid) grid.innerHTML = data.map(cardHTML).join("");
            if (picker) picker.innerHTML = data.map(tileHTML).join("");
            document.dispatchEvent(new CustomEvent("products:rendered"));
        } catch (err) {
            console.error("Could not load products:", err);
        }
    }

    document.addEventListener("DOMContentLoaded", load);
})();
