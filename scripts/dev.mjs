import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { EXTENSION_DIR } from "./build.mjs";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".wasm": "application/wasm",
};

export function createDevHandler() {
  const manifest = JSON.parse(readFileSync(join(EXTENSION_DIR, "manifest.json"), "utf8"));
  const policy = manifest.content_security_policy.extension_pages;

  function send(response, status, body, type = "text/plain; charset=utf-8") {
    response.writeHead(status, {
      "Content-Type": type,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": policy,
    });
    response.end(body);
  }

  return async (request, response) => {
    const { host, origin } = request.headers;
    const port = request.socket.localPort;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) || (origin && origin !== `http://${host}`)) {
      return send(response, 403, "Open the preview using its loopback address.");
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.setHeader("Allow", "GET, HEAD");
      return send(response, 405, "Use GET or HEAD to load the preview.");
    }

    try {
      const { pathname } = new URL(request.url, `http://${host}`);
      const segments = pathname === "/" ? ["index.html"] : pathname.slice(1).split("/");
      const type = TYPES[extname(segments.at(-1))];
      const allowedPath = segments.length === 1
        ? ["index.html", "popup.html"].includes(segments[0])
        : ["src", "icons"].includes(segments[0]);
      if (type && allowedPath && segments.every((part) => /^[a-z0-9_-][a-z0-9_.-]*$/i.test(part))) {
        return send(response, 200, await readFile(join(EXTENSION_DIR, ...segments)), type);
      }
    } catch {
      // Invalid URLs and missing files use the same response.
    }
    send(response, 404, "This preview file does not exist.");
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const port = Number(process.env.CALCULATOR_DEV_PORT ?? "4173");
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    console.error("CALCULATOR_DEV_PORT must be an integer from 1 to 65535.");
    process.exitCode = 1;
  } else {
    createServer(createDevHandler())
      .on("error", (error) => {
        console.error(`Could not start the calculator preview. ${error.message}`);
        process.exitCode = 1;
      })
      .listen(port, "127.0.0.1", () => {
        console.log(`Calculator preview at http://127.0.0.1:${port}/`);
      });
  }
}
