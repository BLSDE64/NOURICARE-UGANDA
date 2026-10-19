import { readList, sorters, json } from "../lib/common.mjs";

export default async () => {
  const list = (await readList("gallery")).sort(sorters.gallery);
  return json({ data: list.map(({ id, title, description, category, image_url, created_at }) => ({ id, title, description, category, image_url, created_at })) });
};
export const config = { path: "/api/gallery" };
