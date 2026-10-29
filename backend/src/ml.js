const base = process.env.ML_SERVICE_URL || "http://localhost:8000";
async function call(path, body, ms = 8000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(base + path, {
      method: body ? "POST" : "GET",
      signal: ctl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ML_API_KEY || "",
      },
      body: body && JSON.stringify(body),
    });
    if (!r.ok) throw new Error(`ML service responded ${r.status}`);
    return await r.json();
  } finally {
    clearTimeout(t);
  }
}
export const predict = (text) => call("/predict", { text });
export const findIncidents = (tickets) =>
  call("/incidents", { tickets }, 15000);
export const mlHealth = () => call("/health");
