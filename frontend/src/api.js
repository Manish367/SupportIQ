import { useEffect, useState } from "react";
const BASE = import.meta.env.VITE_API_URL || "http://localhost:4000";
async function req(path, opts = {}) {
  let r;
  try {
    r = await fetch(BASE + path, {
      headers: { "Content-Type": "application/json" },
      ...opts,
    });
  } catch {
    throw new Error(
      "Can't reach the SupportIQ API. Check your connection or try again in a minute (free hosting may be waking up).",
    );
  }
  const data = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(data.error || `Request failed (${r.status})`);
  return data;
}
export const api = {
  analytics: () => req("/api/analytics"),
  incidents: () => req("/api/incidents"),
  health: () => req("/api/health"),
  categories: () => req("/api/categories"),
  tickets: (qs = "") => req("/api/tickets" + qs),
  create: (b) =>
    req("/api/tickets", { method: "POST", body: JSON.stringify(b) }),
  update: (id, b) =>
    req(`/api/tickets/${id}`, { method: "PATCH", body: JSON.stringify(b) }),
};
const pretty = (k) =>
  ({ it_support: "IT Support", sales_and_pre_sales: "Sales and Pre-Sales" })[
    k
  ] ||
  k
    .split("_")
    .map((w, i) =>
      i && w === "and" ? w : w.charAt(0).toUpperCase() + w.slice(1),
    )
    .join(" ");
export const CATS = new Proxy(
  {},
  {
    get: (_, k) =>
      typeof k !== "string" || ["", "null", "undefined"].includes(k)
        ? undefined
        : k === "uncategorized"
          ? "Unscored"
          : pretty(k),
  },
);
let cache = null;
export function useCategories() {
  const [c, setC] = useState(cache || []);
  useEffect(() => {
    if (!cache)
      api
        .categories()
        .then((r) => {
          cache = r.categories;
          setC(cache);
        })
        .catch(() => {});
  }, []);
  return c;
}
export const pct = (n) => `${Math.round((n || 0) * 100)}%`;
