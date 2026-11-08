import { execFile } from "node:child_process";
import { accessSync, constants } from "node:fs";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { extname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const LIMIT = 64 * 1024;
const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".woff2": "font/woff2",
};

export function calculatorBinary() {
  const executable = process.platform === "win32" ? "rust-calculator.exe" : "rust-calculator";
  const candidate = process.env.CALCULATOR_BIN
    || join(ROOT, "..", "chrome-extention-calc-backend", "target", "debug", executable);
  const path = resolve(candidate);
  try {
    accessSync(path, constants.X_OK);
    return path;
  } catch {
    return null;
  }
}

function send(response, status, body, type = "application/json; charset=utf-8") {
  response.writeHead(status, {
    "Content-Type": type,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "script-src 'self'; object-src 'none'",
  });
  response.end(body);
}

function fail(response, status, code, message) {
  send(response, status, JSON.stringify({ ok: false, error: { code, message } }));
}

function runCalculator(binary, body) {
  return new Promise((resolveResult, reject) => {
    const child = execFile(binary, { timeout: 10_000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout) => {
      if (error) reject(error);
      else resolveResult(stdout);
    });
    child.stdin.on("error", reject);
    child.stdin.end(body);
  });
}

async function calculate(request, response, binary) {
  if (request.method !== "POST") {
    response.setHeader("Allow", "POST");
    return fail(response, 405, "method", "Send a POST request to run the calculator.");
  }
  if (request.headers["content-type"]?.split(";")[0].trim() !== "application/json") {
    return fail(response, 415, "content_type", "Send the calculation as application/json.");
  }
  if (Number(request.headers["content-length"]) > LIMIT) {
    return fail(response, 413, "invalid_input", "The request exceeds 64 KiB.");
  }

  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length <= LIMIT) chunks.push(chunk);
  }
  if (length > LIMIT) {
    return fail(response, 413, "invalid_input", "The request exceeds 64 KiB.");
  }
  try {
    const result = await runCalculator(binary, Buffer.concat(chunks, length));
    send(response, 200, result);
  } catch {
    fail(response, 502, "local_calculator_error", "The local Rust calculator could not run. Check the backend executable.");
  }
}

async function serveFile(request, response, pathname) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    response.setHeader("Allow", "GET, HEAD");
    return fail(response, 405, "method", "Use GET or HEAD to load the preview.");
  }
  const segments = pathname === "/" ? ["index.html"] : pathname.slice(1).split("/");
  const type = TYPES[extname(segments.at(-1))];
  const allowedDirectory = segments.length === 1 || ["src", "assets", "icons"].includes(segments[0]);
  if (!type || !allowedDirectory || segments.some((segment) => !/^[a-z0-9_-][a-z0-9_.-]*$/i.test(segment))) {
    return fail(response, 404, "not_found", "This preview file does not exist.");
  }
  try {
    send(response, 200, await readFile(join(ROOT, ...segments)), type);
  } catch {
    fail(response, 404, "not_found", "This preview file does not exist.");
  }
}

export function createDevHandler(binary) {
  return async (request, response) => {
    const { host, origin } = request.headers;
    const port = request.socket.localPort;
    if (![`127.0.0.1:${port}`, `localhost:${port}`].includes(host) || (origin && origin !== `http://${host}`)) {
      return fail(response, 403, "origin", "Open the local preview using its loopback address.");
    }
    try {
      const url = new URL(request.url, `http://${host}`);
      if (url.pathname === "/api/calculate") {
        await calculate(request, response, binary);
      } else {
        await serveFile(request, response, url.pathname);
      }
    } catch {
      if (!response.destroyed && !response.headersSent) {
        fail(response, 400, "invalid_request", "The preview could not read this request.");
      }
    }
  };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const binary = calculatorBinary();
  if (!binary) {
    console.error("Build the sibling chrome-extention-calc-backend repository with cargo build --locked, or set CALCULATOR_BIN to an existing executable.");
    process.exitCode = 1;
  } else {
    const port = Number(process.env.CALCULATOR_DEV_PORT ?? "4173");
    if (!Number.isInteger(port) || port < 1 || port > 65_535) {
      console.error("CALCULATOR_DEV_PORT must be an integer from 1 to 65535.");
      process.exitCode = 1;
    } else {
      createServer({ requestTimeout: 15_000 }, createDevHandler(binary))
        .on("error", (error) => {
          console.error(`Could not start the calculator preview. ${error.message}`);
          process.exitCode = 1;
        })
        .listen(port, "127.0.0.1", () => {
          console.log(`Calculator preview at http://127.0.0.1:${port}/`);
        });
    }
  }
}
