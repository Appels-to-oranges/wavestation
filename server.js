const express = require("express");
const path = require("path");
const http = require("http");
const https = require("https");

const app = express();
const PORT = process.env.PORT || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

if (IS_PROD) app.set("trust proxy", 1);

app.use(express.static(path.join(__dirname, "public")));

/* ===== Radio stream proxy ===== */

const ALLOWED_PROTOS = new Set(["http:", "https:"]);
const activeProxies = new Map();

app.get("/api/stream", (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).end("Missing url param");

  let parsed;
  try {
    parsed = new URL(target);
  } catch {
    return res.status(400).end("Invalid url");
  }
  if (!ALLOWED_PROTOS.has(parsed.protocol))
    return res.status(400).end("Invalid protocol");

  const id = req.ip + "|" + target;
  const prev = activeProxies.get(id);
  if (prev) prev.destroy();

  const driver = parsed.protocol === "https:" ? https : http;
  const upstream = driver.get(target, { timeout: 10000 }, (stream) => {
    const ct = stream.headers["content-type"] || "audio/mpeg";
    res.setHeader("Content-Type", ct);
    res.setHeader("Transfer-Encoding", "chunked");
    activeProxies.set(id, stream);
    stream.pipe(res);
    stream.on("end", () => activeProxies.delete(id));
    stream.on("error", () => {
      activeProxies.delete(id);
      if (!res.headersSent) res.status(502).end();
    });
  });

  upstream.on("error", () => {
    activeProxies.delete(id);
    if (!res.headersSent) res.status(502).end("Upstream failed");
  });

  req.on("close", () => {
    activeProxies.delete(id);
    upstream.destroy();
  });
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, IS_PROD ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Wavestation running on port ${PORT}`);
});
