import { readList, sorters, json } from "../lib/common.mjs";

export default async (req) => {
  const limit = Math.max(1, Math.min(50, parseInt(new URL(req.url).searchParams.get("limit") || "50", 10) || 50));
  const list = (await readList("posts")).sort(sorters.posts).slice(0, limit);
  return json({ data: list.map(({ id, title, description, image_url, post_date, created_at }) => ({ id, title, description, image_url, post_date, created_at })) });
};
export const config = { path: "/api/posts" };
