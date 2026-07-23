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
const MAX_REDIRECTS = 5;

function proxyStream(url, req, res, redirects) {
  if (redirects > MAX_REDIRECTS) {
    if (!res.headersSent) res.status(502).end("Too many redirects");
    return;
  }

  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    if (!res.headersSent) res.status(400).end("Invalid url");
    return;
  }
  if (!ALLOWED_PROTOS.has(parsed.protocol)) {
    if (!res.headersSent) res.status(400).end("Invalid protocol");
    return;
  }

  const id = req.ip + "|" + url;
  const prev = activeProxies.get(id);
  if (prev) prev.destroy();

  const driver = parsed.protocol === "https:" ? https : http;
  const upstream = driver.get(url, { timeout: 15000, headers: { "User-Agent": "WaveStation/1.0", "Icy-MetaData": "0" } }, (stream) => {
    if ([301, 302, 307, 308].includes(stream.statusCode) && stream.headers.location) {
      stream.destroy();
      const next = new URL(stream.headers.location, url).href;
      proxyStream(next, req, res, redirects + 1);
      return;
    }

    if (stream.statusCode < 200 || stream.statusCode >= 400) {
      stream.destroy();
      if (!res.headersSent) res.status(502).end("Upstream returned " + stream.statusCode);
      return;
    }

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

  upstream.on("timeout", () => {
    upstream.destroy();
    activeProxies.delete(id);
    if (!res.headersSent) res.status(504).end("Upstream timeout");
  });

  upstream.on("error", () => {
    activeProxies.delete(id);
    if (!res.headersSent) res.status(502).end("Upstream failed");
  });

  req.on("close", () => {
    activeProxies.delete(id);
    upstream.destroy();
  });
}

app.get("/api/stream", (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).end("Missing url param");
  proxyStream(target, req, res, 0);
});

app.get("*", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, IS_PROD ? "0.0.0.0" : "127.0.0.1", () => {
  console.log(`Wavestation running on port ${PORT}`);
});
