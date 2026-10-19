import { readList, sorters, json } from "../lib/common.mjs";

export default async () => {
  const list = (await readList("products")).filter((p) => p.is_active).sort(sorters.products);
  return json({ data: list.map(({ id, name, description, image_url, badge_text, badge_color, price_ugx }) => ({ id, name, description, image_url, badge_text, badge_color, price_ugx })) });
};
export const config = { path: "/api/products" };
