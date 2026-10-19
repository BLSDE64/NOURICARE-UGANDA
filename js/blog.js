/* =========================================================
   LATEST UPDATES — public renderer
   Reads published posts from /api/posts (Netlify Functions) and renders
   them into #blogContainer. REPLACES the old Sanity/Supabase blog.js. Data comes from /api/posts.
   ========================================================= */

(function () {
    const container = document.getElementById("blogContainer");
    if (!container) return;

    const MAX_POSTS = 6; // most recent updates shown on the homepage

    function esc(str) {
        const d = document.createElement("div");
        d.textContent = str ?? "";
        return d.innerHTML;
    }

    function formatDate(post) {
        try {
            return new Date(post.post_date + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
        } catch (e) { return ""; }
    }

    function state(icon, text) {
        container.innerHTML = `<div class="blog-state"><i class="fa ${icon}"></i><p class="mb-0">${text}</p></div>`;
    }

    function render(posts) {
        container.innerHTML = posts.map((post) => {
            const image = post.image_url
                ? `<img src="${esc(post.image_url)}" alt="${esc(post.title)}" loading="lazy">`
                : `<div class="d-flex align-items-center justify-content-center h-100"><i class="fa fa-leaf fa-2x text-success"></i></div>`;
            return `
            <div class="col-lg-4 col-md-6 wow fadeInUp" data-wow-delay="0.1s">
                <article class="blog-card">
                    <div class="blog-card__img-wrap">${image}</div>
                    <div class="blog-card__body">
                        <span class="blog-card__date">${formatDate(post)}</span>
                        <h5 class="blog-card__title">${esc(post.title)}</h5>
                        <p class="blog-card__desc">${esc(post.description)}</p>
                    </div>
                </article>
            </div>`;
        }).join("");
        if (window.WOW) new window.WOW().init();
    }

    async function load() {
        container.innerHTML = Array.from({ length: 3 }).map(() => `<div class="col-lg-4 col-md-6"><div class="blog-skeleton"></div></div>`).join("");
        try {
            const res = await fetch("/api/posts?limit=" + MAX_POSTS, { cache: "no-store" });
            if (!res.ok) throw new Error("HTTP " + res.status);
            const data = (await res.json()).data;
            if (!data || !data.length) return state("fa-newspaper", "No updates have been posted yet. Check back soon!");
            render(data);
        } catch (err) {
            console.error("Error loading posts:", err);
            state("fa-triangle-exclamation", "We couldn't load updates right now. Please refresh the page.");
        }
    }

    document.addEventListener("DOMContentLoaded", load);
})();
