// Shared helpers for all Nouricare functions
import crypto from "node:crypto";
import { getStore } from "@netlify/blobs";

/* ---------- storage ---------- */
export const content = () => getStore({ name: "nouricare", consistency: "strong" });
export const images = () => getStore({ name: "nouricare-images", consistency: "strong" });

/* Your 4 current products — shown until the admin edits products for the first time */
export const SEED_PRODUCTS = [
  { id: "seed-1", name: "Nouricare Reloaded", description: "Our original 4x “Quadro-formula” blend — combining Legume, Omega-3, Cereal, and Lactose. Packed with vitamins and minerals for babies, mothers, and the elderly.", image_url: "img/RELOADED.jpeg", badge_text: "Best Seller", badge_color: "success", price_ugx: null, is_active: true, sort_order: 1, created_at: "2026-01-01T00:00:00.000Z" },
  { id: "seed-2", name: "Nouricare Plus", description: "A premium Omega-free porridge rich in vitamins and minerals — made with Legume, Cereal, and Lactose. Ideal for those who avoid fish-based nutrients.", image_url: "img/PLUS.jpg", badge_text: "Omega-Free", badge_color: "warning", price_ugx: null, is_active: true, sort_order: 2, created_at: "2026-01-01T00:00:01.000Z" },
  { id: "seed-3", name: "Nouricare Advance", description: "A lactose-free nutritional porridge containing Legume, Cereal, and Omega-3. Enriched with vitamins, minerals, and a gentle vanilla aroma.", image_url: "img/ADVANCE.jpg", badge_text: "Lactose-Free", badge_color: "info", price_ugx: null, is_active: true, sort_order: 3, created_at: "2026-01-01T00:00:02.000Z" },
  { id: "seed-4", name: "Nouricare Extra", description: "A legume-free porridge crafted from Lactose, Cereal, and Omega-3 — fortified with vitamins and a smooth chocolate aroma for rich flavor.", image_url: "img/EXTRA.jpg", badge_text: "Legume-Free", badge_color: "danger", price_ugx: null, is_active: true, sort_order: 4, created_at: "2026-01-01T00:00:03.000Z" },
];

export async function readList(name) {
  const data = await content().get(name, { type: "json" });
  if (data) return data;
  return name === "products" ? structuredClone(SEED_PRODUCTS) : [];
}
export const writeList = (name, list) => content().setJSON(name, list);

export const sorters = {
  posts: (a, b) => (b.post_date || "").localeCompare(a.post_date || "") || (b.created_at || "").localeCompare(a.created_at || ""),
  products: (a, b) => (a.sort_order - b.sort_order) || (a.created_at || "").localeCompare(b.created_at || ""),
  gallery: (a, b) => (b.created_at || "").localeCompare(a.created_at || ""),
};

/* ---------- responses ---------- */
export function json(data, status = 200, extraHeaders = {}) {
  const h = new Headers({ "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff", ...extraHeaders });
  return new Response(JSON.stringify(data), { status, headers: h });
}
export const fail = (msg, status = 400) => json({ error: msg }, status);

/* ---------- signed cookies (stateless sessions) ---------- */
const b64u = (buf) => Buffer.from(buf).toString("base64url");
export function sign(payload) {
  const secret = process.env.SESSION_SECRET || "";
  const body = b64u(JSON.stringify(payload));
  const mac = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${mac}`;
}
export function unsign(token) {
  const secret = process.env.SESSION_SECRET || "";
  if (!secret || !token || !token.includes(".")) return null;
  const [body, mac] = token.split(".");
  const good = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  const a = Buffer.from(mac), b = Buffer.from(good);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try { return JSON.parse(Buffer.from(body, "base64url").toString()); } catch { return null; }
}
export function getCookie(req, name) {
  const m = (req.headers.get("cookie") || "").split(/;\s*/).find((c) => c.startsWith(name + "="));
  return m ? decodeURIComponent(m.slice(name.length + 1)) : "";
}
export const cookie = (name, value, maxAge) =>
  `${name}=${encodeURIComponent(value)}; Path=/api; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;

/* ---------- password (PBKDF2) ---------- */
// format:  pbkdf2:<iterations>:<saltBase64>:<hashBase64>   (made by tools/setup-admin.html)
export function verifyPassword(password, stored) {
  return new Promise((resolve) => {
    const [alg, iter, salt, hash] = String(stored || "").split(":");
    if (alg !== "pbkdf2" || !iter || !salt || !hash) return resolve(false);
    crypto.pbkdf2(String(password), Buffer.from(salt, "base64"), parseInt(iter, 10), 32, "sha256", (err, key) => {
      if (err) return resolve(false);
      const want = Buffer.from(hash, "base64");
      resolve(want.length === key.length && crypto.timingSafeEqual(want, key));
    });
  });
}

/* ---------- TOTP (Google/Microsoft Authenticator, Authy…) ---------- */
function b32dec(s) {
  const A = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const c of s.toUpperCase().replace(/=+$/, "")) { const p = A.indexOf(c); if (p >= 0) bits += p.toString(2).padStart(5, "0"); }
  const out = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) out.push(parseInt(bits.slice(i, i + 8), 2));
  return Buffer.from(out);
}
function totpAt(secret, step) {
  const ctr = Buffer.alloc(8); ctr.writeBigUInt64BE(BigInt(step));
  const h = crypto.createHmac("sha1", b32dec(secret)).update(ctr).digest();
  const o = h[19] & 15;
  const n = ((h[o] & 0x7f) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 1000000).padStart(6, "0");
}
/* returns the matched 30-second step, or 0. Allows ±1 step of clock drift. */
export function totpMatch(secret, code) {
  if (!/^\d{6}$/.test(code)) return 0;
  const now = Math.floor(Date.now() / 30000);
  for (let i = -1; i <= 1; i++) {
    const a = Buffer.from(totpAt(secret, now + i)), b = Buffer.from(code);
    if (crypto.timingSafeEqual(a, b)) return now + i;
  }
  return 0;
}

/* ---------- brute-force protection ---------- */
export const clientIp = (req, context) => context?.ip || req.headers.get("x-nf-client-connection-ip") || "unknown";
export async function tooMany(key, limit, windowMs = 15 * 60 * 1000) {
  const list = ((await content().get("rl/" + key, { type: "json" })) || []).filter((t) => Date.now() - t < windowMs);
  return list.length >= limit;
}
export async function recordFail(key, windowMs = 15 * 60 * 1000) {
  const list = ((await content().get("rl/" + key, { type: "json" })) || []).filter((t) => Date.now() - t < windowMs);
  list.push(Date.now());
  await content().setJSON("rl/" + key, list);
}
export const clearFails = (key) => content().delete("rl/" + key);

/* ---------- images ---------- */
export function sniffImage(buf) {
  const b = new Uint8Array(buf.slice(0, 12));
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", type: "image/jpeg" };
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return { ext: "png", type: "image/png" };
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x38) return { ext: "gif", type: "image/gif" };
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { ext: "webp", type: "image/webp" };
  return null;
}
export const LOCAL_IMG = /^\/api\/img\/([a-f0-9]{24}\.(jpg|png|webp|gif))$/;
export async function deleteLocalImage(url) {
  const m = LOCAL_IMG.exec(url || "");
  if (m) { try { await images().delete(m[1]); } catch {} }
}
