// Serves the static site from /public and handles POST /api/subscribe -> Notion.
// Secrets: NOTION_TOKEN, NOTION_DB_ID. DB props: "Email" (Title), "Source" (Text).
const RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== "/api/subscribe") return env.ASSETS.fetch(req);

    const json = (o, s = 200) =>
      new Response(JSON.stringify(o), { status: s, headers: { "Content-Type": "application/json" } });

    if (req.method !== "POST") return json({ error: "method" }, 405);
    if ((req.headers.get("Origin") || url.origin) !== url.origin) return json({ error: "forbidden" }, 403);

    let body; try { body = await req.json(); } catch { return json({ error: "bad json" }, 400); }
    const email = String(body.email || "").trim().toLowerCase().slice(0, 254);
    const source = String(body.source || "direct").slice(0, 100);
    if (!RE.test(email)) return json({ error: "invalid email" }, 400);

    const h = {
      Authorization: `Bearer ${env.NOTION_TOKEN}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    };

    const q = await fetch(`https://api.notion.com/v1/databases/${env.NOTION_DB_ID}/query`, {
      method: "POST", headers: h,
      body: JSON.stringify({ filter: { property: "Email", title: { equals: email } }, page_size: 1 }),
    });
    if (q.ok && (await q.json()).results?.length) return json({ ok: true, duplicate: true });

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
    return r.ok ? json({ ok: true }) : json({ error: "notion" }, 502);
  },
};
