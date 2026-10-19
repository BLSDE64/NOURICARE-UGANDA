// Admin API  →  /api/admin?action=...
// Sign-in = password, then authenticator code. Everything except me/login/verify/logout
// needs the full session cookie. Sessions are signed, HttpOnly, SameSite=Strict.
import crypto from "node:crypto";
import {
  content, images, readList, writeList, sorters, json, fail, sign, unsign, getCookie, cookie,
  verifyPassword, totpMatch, clientIp, tooMany, recordFail, clearFails, sniffImage, deleteLocalImage,
} from "../lib/common.mjs";

const IDLE_MS = 20 * 60 * 1000;      // sign out after 20 min idle
const ABSOLUTE_MS = 8 * 3600 * 1000; // sign in again after 8 hours
const MAX_IMAGE = 5 * 1024 * 1024;

const RESOURCES = {
  posts: {
    fields: { title: "str:200", description: "str:5000", post_date: "date" },
    required: ["title", "description", "post_date"], imageRequired: true,
  },
  products: {
    fields: { name: "str:150", description: "str:1000", badge_text: "str:40", badge_color: "enum:success,warning,info,danger,primary,dark", price_ugx: "int", sort_order: "int0", is_active: "bool" },
    required: ["name"], imageRequired: false,
  },
  gallery: {
    fields: { title: "str:200", description: "str:500", category: "enum:Nutrition,Community,Promotion,Production,Team,Customers" },
    required: ["title", "category"], imageRequired: true,
  },
};

class Bad extends Error {}
const bad = (m) => { throw new Bad(m); };

function clean(type, v) {
  v = typeof v === "string" ? v.trim() : v;
  const [t, arg = ""] = type.split(":");
  if (t === "str") return String(v ?? "").slice(0, parseInt(arg, 10));
  if (t === "date") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : bad("Invalid date.");
  if (t === "int") return v === "" || v == null ? null : Math.max(0, parseInt(v, 10) || 0);
  if (t === "int0") return v === "" || v == null ? 0 : parseInt(v, 10) || 0;
  if (t === "bool") return v === "1" || v === "true" || v === "on";
  if (t === "enum") return arg.split(",").includes(v) ? v : bad("Invalid choice for a field.");
}

/* ---------- session ---------- */
function readSession(req) {
  const s = unsign(getCookie(req, "nc_admin"));
  const now = Date.now();
  if (!s || s.stage !== "auth" || now - s.born > ABSOLUTE_MS || now - s.last > IDLE_MS) return null;
  return s;
}
const authCookie = (s) => cookie("nc_admin", sign({ ...s, last: Date.now() }), Math.floor(ABSOLUTE_MS / 1000));
function readPending(req) {
  const s = unsign(getCookie(req, "nc_pre"));
  return s && s.stage === "pre" && Date.now() < s.exp ? s : null;
}

export default async (req, context) => {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get("action") || "me";

    // Block cross-site requests: custom header + same-origin check on every POST
    if (req.method === "POST") {
      if (req.headers.get("x-requested-with") !== "nouricare") return fail("Bad request.", 400);
      const origin = req.headers.get("origin");
      if (origin && new URL(origin).host !== url.host) return fail("Bad origin.", 403);
    }

    const session = readSession(req);
    const refresh = (res) => { if (session) res.headers.append("Set-Cookie", authCookie(session)); return res; };

    /* ================= AUTH ================= */
    if (action === "me") {
      return refresh(json({ state: session ? "authed" : readPending(req) ? "need_code" : "guest" }));
    }

    if (action === "login") {
      if (req.method !== "POST") return fail("POST only.", 405);
      if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD_HASH || !process.env.ADMIN_TOTP_SECRET || !process.env.SESSION_SECRET)
        return fail("Admin is not set up yet. Add the 4 environment variables in Netlify and redeploy.", 500);
      const ip = clientIp(req, context);
      if ((await tooMany("ip:" + ip, 5)) || (await tooMany("all", 20))) return fail("Too many attempts. Please wait 15 minutes and try again.", 429);

      const f = await req.formData();
      const email = String(f.get("email") || "").trim().toLowerCase();
      const okPass = await verifyPassword(f.get("password"), process.env.ADMIN_PASSWORD_HASH); // always runs → same timing
      const a = Buffer.from(crypto.createHash("sha256").update(email).digest());
      const b = Buffer.from(crypto.createHash("sha256").update(process.env.ADMIN_EMAIL.trim().toLowerCase()).digest());
      if (!(okPass && crypto.timingSafeEqual(a, b))) {
        await recordFail("ip:" + ip); await recordFail("all");
        return fail("Invalid email or password.", 401);
      }
      const res = json({ state: "need_code" });
      res.headers.append("Set-Cookie", cookie("nc_pre", sign({ stage: "pre", exp: Date.now() + 5 * 60 * 1000 }), 300));
      return res;
    }

    if (action === "verify") {
      if (req.method !== "POST") return fail("POST only.", 405);
      if (!readPending(req)) return fail("Please sign in again.", 401);
      const ip = clientIp(req, context);
      if ((await tooMany("ip:" + ip, 5)) || (await tooMany("all", 20))) return fail("Too many attempts. Please wait 15 minutes and try again.", 429);

      const code = String((await req.formData()).get("code") || "").replace(/\D/g, "");
      const step = totpMatch(process.env.ADMIN_TOTP_SECRET, code);
      const last = (await content().get("auth/last_step", { type: "json" })) || 0;
      if (!step || step <= last) {
        await recordFail("ip:" + ip); await recordFail("all");
        return fail("That code is not valid. Check your authenticator app and try again.", 401);
      }
      await content().setJSON("auth/last_step", step);     // a code can only be used once
      await clearFails("ip:" + ip);
      const now = Date.now();
      const res = json({ state: "authed" });
      res.headers.append("Set-Cookie", cookie("nc_admin", sign({ stage: "auth", born: now, last: now }), Math.floor(ABSOLUTE_MS / 1000)));
      res.headers.append("Set-Cookie", cookie("nc_pre", "", 0));
      return res;
    }

    if (action === "logout") {
      const res = json({ state: "guest" });
      res.headers.append("Set-Cookie", cookie("nc_admin", "", 0));
      res.headers.append("Set-Cookie", cookie("nc_pre", "", 0));
      return res;
    }

    /* ================= CONTENT (admin only) ================= */
    if (!session) return fail("Not signed in.", 401);

    const resource = url.searchParams.get("resource") || "";
    const cfg = RESOURCES[resource];

    if (action === "list") {
      if (!cfg) return fail("Unknown resource.");
      return refresh(json({ data: (await readList(resource)).sort(sorters[resource]) }));
    }

    if (req.method !== "POST") return fail("POST only.", 405);
    const form = await req.formData();

    if (action === "toggle") {
      const list = await readList("products");
      const item = list.find((p) => p.id === form.get("id"));
      if (!item) return fail("Not found.", 404);
      item.is_active = !item.is_active;
      await writeList("products", list);
      return refresh(json({ ok: true }));
    }

    if (!cfg) return fail("Unknown resource.");

    if (action === "delete") {
      const list = await readList(resource);
      const item = list.find((x) => x.id === form.get("id"));
      await writeList(resource, list.filter((x) => x.id !== form.get("id")));
      if (item) await deleteLocalImage(item.image_url);
      return refresh(json({ ok: true }));
    }

    if (action === "save") {
      const id = String(form.get("id") || "");
      const vals = {};
      for (const [f, type] of Object.entries(cfg.fields)) {
        if (!form.has(f)) { if (id) continue; vals[f] = clean(type, ""); continue; }
        vals[f] = clean(type, form.get(f));
      }
      for (const f of cfg.required) if (f in vals && (vals[f] === "" || vals[f] === null)) return fail("Please fill in all required fields.");

      const list = await readList(resource);
      const existing = id ? list.find((x) => x.id === id) : null;
      if (id && !existing) return fail("That item no longer exists.", 404);

      // image upload (optional when editing)
      let newUrl = null;
      const file = form.get("image");
      if (file && typeof file === "object" && file.size > 0) {
        if (file.size > MAX_IMAGE) return fail("Image is too large (max 5 MB).");
        const buf = await file.arrayBuffer();
        const kind = sniffImage(buf);
        if (!kind) return fail("Only JPG, PNG, WebP or GIF images are allowed.");
        const name = crypto.randomBytes(12).toString("hex") + "." + kind.ext;
        await images().set(name, buf, { metadata: { contentType: kind.type } });
        newUrl = "/api/img/" + name;
      }
      if (!id && cfg.imageRequired && !newUrl) return fail("Please choose an image.");

      let savedId = id;
      if (existing) {
        Object.assign(existing, vals);
        if (newUrl) { await deleteLocalImage(existing.image_url); existing.image_url = newUrl; }
      } else {
        savedId = crypto.randomUUID();
        list.push({ id: savedId, ...vals, image_url: newUrl, created_at: new Date().toISOString() });
      }
      await writeList(resource, list);
      return refresh(json({ ok: true, id: savedId }));
    }

    return fail("Unknown action.", 404);
  } catch (e) {
    if (e instanceof Bad) return fail(e.message);
    console.error(e);
    return fail("Server error. Please try again.", 500);
  }
};

export const config = { path: "/api/admin" };
