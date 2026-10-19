/* =========================================================
   GALLERY — public renderer
   Reads /api/gallery (Netlify Functions) and renders image cards with a
   category badge and hover overlay into #galleryContainer.
   ========================================================= */

(function () {
    const container = document.getElementById("galleryContainer");
    if (!container) return;

    function esc(str) {
        const d = document.createElement("div");
        d.textContent = str ?? "";
        return d.innerHTML;
    }

    function state(text) {
        container.innerHTML = `<div class="gallery-state"><p class="mb-0">${text}</p></div>`;
    }

    function render(items) {
        container.innerHTML = items.map((item, i) => {
            const delay = ((i % 6) * 0.1 + 0.1).toFixed(1);
            return `
            <div class="col-lg-4 col-md-6 wow fadeInUp" data-wow-delay="${delay}s">
                <div class="gallery-card">
                    ${item.category ? `<span class="badge-category bg-success text-white">${esc(item.category)}</span>` : ""}
                    <img src="${esc(item.image_url)}" alt="${esc(item.title || "")}" loading="lazy">
                    <div class="gallery-overlay">
                        ${item.title ? `<h5>${esc(item.title)}</h5>` : ""}
                        ${item.description ? `<p>${esc(item.description)}</p>` : ""}
                    </div>
                </div>
            </div>`;
        }).join("");
        if (window.WOW) new window.WOW().init();
    }

    async function load() {
        container.innerHTML = Array.from({ length: 6 }).map(() => `<div class="col-lg-4 col-md-6"><div class="gallery-skeleton"></div></div>`).join("");
        try {
            const res = await fetch("/api/gallery", { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = (await res.json()).data;
            if (!data || !data.length) return state("No gallery images yet. Check back soon!");
            render(data);
        } catch (err) {
            console.error("Error loading gallery:", err);
            state("We couldn't load the gallery right now. Please refresh the page.");
        }
    }

    document.addEventListener("DOMContentLoaded", load);
})();
