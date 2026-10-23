// Cloudflare Worker: receives {email} from backin.io and writes it to a Notion database.
// Secrets (wrangler secret put): NOTION_TOKEN, NOTION_DB_ID
// Notion DB properties: "Email" (Title), "Source" (Text). Share the DB with your integration.
const ORIGINS = ["https://backin.io", "https://www.backin.io"];
const RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default {
  async fetch(req, env) {
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": ORIGINS.includes(origin) ? origin : ORIGINS[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Content-Type": "application/json",
    };
    const out = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: cors });
    if (req.method === "OPTIONS") return new Response(null, { headers: cors });
    if (req.method !== "POST" || !ORIGINS.includes(origin)) return out({ error: "forbidden" }, 403);

    let body; try { body = await req.json(); } catch { return out({ error: "bad json" }, 400); }
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
    const source = String(body.source || "direct").slice(0, 100);
    if (!RE.test(email)) return out({ error: "invalid email" }, 400);

    const h = {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };

    // de-dupe
    const q = await fetch(`https://api.notion.com/v1/databases/${env.NOTION_DB_ID}/query`, {
      method: "POST", headers: h,
      body: JSON.stringify({ filter: { property: "Email", title: { equals: email } }, page_size: 1 }),
    });
    if (q.ok && (await q.json()).results?.length) return out({ ok: true, duplicate: true });

    const r = await fetch("https://api.notion.com/v1/pages", {
      method: "POST", headers: h,
      body: JSON.stringify({
        parent: { database_id: env.NOTION_DB_ID },
        properties: {
          Email: { title: [{ text: { content: email } }] },
          Source: { rich_text: [{ text: { content: source } }] },
        },
      }),
    });
    return r.ok ? out({ ok: true }) : out({ error: "notion" }, 502);
  },
};
