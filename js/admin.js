/* =========================================================
   ADMIN PANEL LOGIC  (talks to /api/admin — a Netlify Function)
   Sign-in = password, then 6-digit authenticator code.
   Manages: Updates, Products, Gallery.
   ========================================================= */

(function () {
    const API = "/api/admin";

    const $ = (id) => document.getElementById(id);
    const esc = (s) => { const d = document.createElement("div"); d.textContent = s ?? ""; return d.innerHTML; };

    /* ---------- helpers ---------- */
    function showAlert(el, msg, type) { el.textContent = msg; el.className = `alert admin-alert alert-${type}`; }
    function hideAlert(el) { el.classList.add("d-none"); }
    function setLoading(btn, on, label) {
        btn.disabled = on;
        btn.innerHTML = on ? `<span class="spinner-border spinner-border-sm me-2"></span>Working...` : label;
    }
    function todayISO() {
        const d = new Date();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().split("T")[0];
    }

    async function api(action, { method = "GET", data = null, query = {} } = {}) {
        const qs = new URLSearchParams({ action, ...query });
        const opt = { method, credentials: "same-origin", headers: { "X-Requested-With": "nouricare" } };
        if (data) {
            if (data instanceof FormData) opt.body = data;
            else { const f = new FormData(); Object.entries(data).forEach(([k, v]) => f.append(k, v)); opt.body = f; }
        }
        const res = await fetch(`${API}?${qs}`, opt);
        let json = {};
        try { json = await res.json(); } catch (e) {}
        if (res.status === 401 && !["login", "verify", "me"].includes(action)) {
            showView("login", "Your session ended. Please sign in again.");
            throw new Error("Session ended");
        }
        if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
        return json;
    }

    /* Shrinks big phone photos before upload (keeps them under the 5 MB limit) */
    async function prepareImage(file) {
        if (!file || !file.type.startsWith("image/") || file.type === "image/gif") return file;
        try {
            const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
            const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
            const c = document.createElement("canvas");
            c.width = Math.round(bmp.width * scale);
            c.height = Math.round(bmp.height * scale);
            c.getContext("2d").drawImage(bmp, 0, 0, c.width, c.height);
            const blob = await new Promise((r) => c.toBlob(r, "image/webp", 0.86));
            if (!blob) return file;
            return new File([blob], "image." + (blob.type === "image/webp" ? "webp" : "png"), { type: blob.type });
        } catch (e) { return file; }
    }

    /* ---------- views ---------- */
    const views = { login: $("loginView"), code: $("codeView"), dash: $("dashboardView") };
    function showView(name, note) {
        Object.entries(views).forEach(([k, el]) => el.classList.toggle("d-none", k !== name));
        $("logoutBtn").classList.toggle("d-none", name === "login");
        if (name === "login" && note) showAlert($("loginAlert"), note, "warning");
        if (name === "code") { $("codeInput").value = ""; $("codeInput").focus(); hideAlert($("codeAlert")); }
        if (name === "dash") loadAll();
    }

    async function boot() {
        try {
            const j = await api("me");
            showView(j.state === "authed" ? "dash" : j.state === "need_code" ? "code" : "login");
        } catch (e) { showAlert($("loginAlert"), "Could not reach the server: " + e.message, "danger"); }
    }

    /* ---------- login → code ---------- */
    $("loginForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        hideAlert($("loginAlert"));
        setLoading($("loginBtn"), true, "Continue");
        try {
            const j = await api("login", { method: "POST", data: { email: $("loginEmail").value, password: $("loginPassword").value } });
            $("loginPassword").value = "";
            showView(j.state === "need_code" ? "code" : "login");
        } catch (err) { showAlert($("loginAlert"), err.message, "danger"); }
        setLoading($("loginBtn"), false, "Continue");
    });

    $("codeForm").addEventListener("submit", async (e) => {
        e.preventDefault();
        hideAlert($("codeAlert"));
        setLoading($("codeBtn"), true, "Verify & Sign In");
        try {
            await api("verify", { method: "POST", data: { code: $("codeInput").value } });
            showView("dash");
        } catch (err) { showAlert($("codeAlert"), err.message, "danger"); }
        setLoading($("codeBtn"), false, "Verify & Sign In");
    });

    async function logout() {
        try { await api("logout", { method: "POST" }); } catch (e) {}
        showView("login");
    }
    $("logoutBtn").addEventListener("click", logout);
    $("codeBack").addEventListener("click", logout);

    /* ---------- tabs ---------- */
    document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".admin-tab-btn").forEach((b) => b.classList.remove("active"));
            document.querySelectorAll(".admin-tab-panel").forEach((p) => p.classList.add("d-none"));
            btn.classList.add("active");
            $(btn.dataset.tab).classList.remove("d-none");
        });
    });

    /* =====================================================
       Posts / Products / Gallery  (add, edit, delete)
       ===================================================== */
    const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" }) : "";
    const kicker = (t) => `<p class="mb-1" style="font-size:.75rem;color:var(--leaf);font-weight:700;text-transform:uppercase;letter-spacing:.04em;">${t}</p>`;
    const actions = (extra = "") => `<div class="actions">${extra}
        <button class="btn btn-sm btn-outline-success rounded-pill" data-act="edit" title="Edit"><i class="fa fa-pen"></i></button>
        <button class="btn btn-sm btn-outline-danger rounded-pill" data-act="delete" title="Delete"><i class="fa fa-trash"></i></button></div>`;

    const RES = {
        posts: {
            form: "postForm", alert: "postAlert", btn: "postSubmitBtn", list: "postsList", refresh: "refreshBtn",
            cancel: "postCancelBtn", heading: "postFormTitle", image: "postImage", label: "Publish Update", newHeading: "Post a New Update",
            fields: { title: "postTitle", description: "postDescription", post_date: "postDate" },
            ok: "Update published successfully.", noun: "update", empty: "No updates published yet.",
            row: (p) => `<div class="admin-post-row" data-id="${p.id}"><img src="${esc(p.image_url || "")}" alt="">
                <div class="meta"><h6>${esc(p.title)}</h6>${kicker(fmtDate(p.post_date))}<p>${esc(p.description)}</p></div>${actions()}</div>`,
        },
        products: {
            form: "prodForm", alert: "prodAlert", btn: "prodSubmitBtn", list: "prodList", refresh: "prodRefreshBtn",
            cancel: "prodCancelBtn", heading: "prodFormTitle", image: "prodImage", label: "Add Product", newHeading: "Add a Product",
            fields: { name: "prodName", description: "prodDescription", badge_text: "prodBadgeText", badge_color: "prodBadgeColor", price_ugx: "prodPrice", sort_order: "prodOrder" },
            checks: { is_active: "prodActive" },
            ok: "Product saved.", noun: "product", empty: "No products yet.",
            row: (p) => `<div class="admin-post-row ${+p.is_active ? "" : "is-hidden"}" data-id="${p.id}"><img src="${esc(p.image_url || "")}" alt="">
                <div class="meta"><h6>${esc(p.name)}</h6>
                    <p class="mb-1">${p.badge_text ? `<span class="admin-pill">${esc(p.badge_text)}</span>` : ""}${+p.is_active ? "" : `<span class="admin-pill off">Hidden</span>`}${p.price_ugx ? "UGX " + Number(p.price_ugx).toLocaleString("en-UG") : ""}</p>
                    <p>${esc(p.description)}</p></div>
                ${actions(`<button class="btn btn-sm btn-outline-secondary rounded-pill" data-act="toggle" title="${+p.is_active ? "Hide from website" : "Show on website"}"><i class="fa ${+p.is_active ? "fa-eye-slash" : "fa-eye"}"></i></button>`)}</div>`,
        },
        gallery: {
            form: "galleryForm", alert: "galleryAlert", btn: "gallerySubmitBtn", list: "galleryList", refresh: "galleryRefreshBtn",
            cancel: "galleryCancelBtn", heading: "galleryFormTitle", image: "galleryImage", label: "Add to Gallery", newHeading: "Add a Gallery Image",
            fields: { category: "galleryCategory", title: "galleryTitle", description: "galleryDescription" },
            ok: "Gallery saved.", noun: "image", empty: "No gallery images yet.",
            row: (g) => `<div class="admin-post-row" data-id="${g.id}"><img src="${esc(g.image_url || "")}" alt="">
                <div class="meta"><h6>${esc(g.title)}</h6>${kicker(esc(g.category))}<p>${esc(g.description || "")}</p></div>${actions()}</div>`,
        },
    };

    Object.entries(RES).forEach(([name, c]) => {
        c.name = name; c.items = []; c.editing = 0;
        c.el = { form: $(c.form), alert: $(c.alert), btn: $(c.btn), list: $(c.list), cancel: $(c.cancel), heading: $(c.heading), image: $(c.image) };
        c.imageRequired = c.el.image.required;

        c.load = async () => {
            c.el.list.innerHTML = `<p class="text-muted">Loading...</p>`;
            try {
                c.items = (await api("list", { query: { resource: name } })).data;
                c.el.list.innerHTML = c.items.length ? c.items.map(c.row).join("") : `<p class="text-muted">${c.empty}</p>`;
            } catch (err) { c.el.list.innerHTML = `<p class="text-danger">Could not load: ${esc(err.message)}</p>`; }
        };

        c.reset = () => {
            c.editing = 0;
            c.el.btn.disabled = false;
            c.el.form.reset();
            if (c.fields.post_date) $(c.fields.post_date).value = todayISO();
            if (c.checks) Object.values(c.checks).forEach((id) => ($(id).checked = true));
            c.el.image.required = c.imageRequired;
            c.el.heading.textContent = c.newHeading;
            c.el.btn.textContent = c.label;
            c.el.cancel.classList.add("d-none");
        };

        c.el.form.addEventListener("submit", async (e) => {
            e.preventDefault();
            hideAlert(c.el.alert);
            const label = c.editing ? "Save Changes" : c.label;
            setLoading(c.el.btn, true, label);
            try {
                const fd = new FormData();
                Object.entries(c.fields).forEach(([k, id]) => fd.append(k, $(id).value));
                if (c.checks) Object.entries(c.checks).forEach(([k, id]) => fd.append(k, $(id).checked ? "1" : "0"));
                if (c.editing) fd.append("id", c.editing);
                const file = c.el.image.files[0];
                if (file) fd.append("image", await prepareImage(file));
                await api("save", { method: "POST", data: fd, query: { resource: name } });
                showAlert(c.el.alert, c.ok, "success");
                c.reset();
                c.load();
            } catch (err) { showAlert(c.el.alert, err.message, "danger"); setLoading(c.el.btn, false, label); return; }
        });

        c.el.cancel.addEventListener("click", () => { c.reset(); hideAlert(c.el.alert); });
        $(c.refresh).addEventListener("click", c.load);

        c.el.list.addEventListener("click", async (e) => {
            const b = e.target.closest("[data-act]");
            if (!b) return;
            const id = b.closest("[data-id]").dataset.id;
            const item = c.items.find((i) => i.id === id);
            try {
                if (b.dataset.act === "delete") {
                    if (!confirm(`Delete this ${c.noun}? This cannot be undone.`)) return;
                    await api("delete", { method: "POST", data: { id }, query: { resource: name } });
                    c.load();
                } else if (b.dataset.act === "toggle") {
                    await api("toggle", { method: "POST", data: { id } });
                    c.load();
                } else if (b.dataset.act === "edit" && item) {
                    c.editing = id;
                    Object.entries(c.fields).forEach(([k, fid]) => ($(fid).value = item[k] ?? ""));
                    if (c.checks) Object.entries(c.checks).forEach(([k, fid]) => ($(fid).checked = !!+item[k]));
                    c.el.image.value = "";
                    c.el.image.required = false;
                    c.el.heading.textContent = `Edit ${c.noun}`;
                    c.el.btn.textContent = "Save Changes";
                    c.el.cancel.classList.remove("d-none");
                    hideAlert(c.el.alert);
                    c.el.form.scrollIntoView({ behavior: "smooth", block: "start" });
                }
            } catch (err) { alert(err.message); }
        });
    });

    function loadAll() {
        Object.values(RES).forEach((c) => { c.reset(); c.load(); });
    }

    boot();
})();
