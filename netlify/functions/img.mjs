// Serves uploaded images:  /api/img/<name>
import { images, LOCAL_IMG } from "../lib/common.mjs";

export default async (req) => {
  const name = new URL(req.url).pathname.split("/").pop();
  if (!LOCAL_IMG.test("/api/img/" + name)) return new Response("Not found", { status: 404 });
  const r = await images().getWithMetadata(name, { type: "arrayBuffer" });
  if (!r) return new Response("Not found", { status: 404 });
  return new Response(r.data, {
    headers: {
      "Content-Type": r.metadata?.contentType || "application/octet-stream",
      "Cache-Control": "public, max-age=31536000, immutable",   // names are random, so safe to cache forever
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'",
    },
  });
};
export const config = { path: "/api/img/*" };
