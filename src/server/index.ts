import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";

const app = new Hono();

app.get("/_api/health", (c) =>
  c.json({
    ok: true,
    service: "hospeda-leads",
    timestamp: new Date().toISOString(),
  }),
);

app.use("/*", serveStatic({ root: "./dist" }));

app.notFound((c) => {
  if (c.req.path.startsWith("/_api/")) {
    return c.json({ error: "Endpoint not found" }, 404);
  }
  return serveStatic({ path: "./dist/index.html" })(c, async () => {});
});

const port = Number(process.env.PORT || 3001);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Hospeda Leads listening on http://localhost:${info.port}`);
});
