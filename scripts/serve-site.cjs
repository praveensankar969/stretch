"use strict";
const http = require("http"),
  fs = require("fs"),
  path = require("path");
const root = path.resolve(__dirname, "..");
const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css",
  ".woff2": "font/woff2",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".json": "application/json",
};
function createServer() {
  return http.createServer((req, res) => {
    let name;
    try {
      name = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
    } catch {
      res.writeHead(400).end();
      return;
    }
    const base = name.startsWith("/src/") ? root : path.join(root, "website");
    const file = path.resolve(
      base,
      "." + name + (name.endsWith("/") ? "index.html" : ""),
    );
    if (!file.startsWith(base + path.sep)) {
      res.writeHead(403).end();
      return;
    }
    fs.readFile(file, (error, data) => {
      if (error) {
        res.writeHead(404).end("Not found");
        return;
      }
      res
        .writeHead(200, {
          "Content-Type":
            types[path.extname(file)] || "application/octet-stream",
        })
        .end(data);
    });
  });
}
module.exports = { createServer };
if (require.main === module)
  createServer().listen(Number(process.env.PORT) || 4173, "127.0.0.1", () =>
    console.log("Stretch website: http://127.0.0.1:4173"),
  );
