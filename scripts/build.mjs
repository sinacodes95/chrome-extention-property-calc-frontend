import { execFileSync } from "node:child_process";
import { copyFileSync, cpSync, existsSync, mkdirSync, mkdtempSync, renameSync, rmSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
export const DIST = join(ROOT, "dist");
export const EXTENSION_DIR = join(DIST, "property-desk-calc");
const TARGET = "wasm32-unknown-unknown";

export function buildExtension() {
  const backend = resolve(process.env.CALCULATOR_BACKEND_DIR
    || join(ROOT, "..", "chrome-extention-calc-backend"));
  const glue = join(backend, "web", "calculator-wasm.js");
  if (!existsSync(join(backend, "Cargo.toml")) || !existsSync(glue)) {
    throw new Error(`WebAssembly backend source not found at ${backend}. Use the sibling chrome-extention-calc-backend checkout or set CALCULATOR_BACKEND_DIR.`);
  }

  mkdirSync(DIST, { recursive: true });
  const targetDir = join(DIST, ".rust-target");
  try {
    execFileSync("cargo", [
      "build", "--locked", "--release", "--lib", "--target", TARGET, "--target-dir", targetDir,
    ], { cwd: backend, stdio: "inherit" });
  } catch (error) {
    if (error.code === "ENOENT") throw new Error("Cargo is required to build the extension. Install Rust with rustup.");
    throw new Error(`The Rust WebAssembly build failed. Check the Cargo output and make sure the target is installed: rustup target add ${TARGET}`);
  }

  const staging = mkdtempSync(join(DIST, ".extension-"));
  try {
    for (const path of ["manifest.json", "index.html", "popup.html", "LICENSE", "src", "icons"]) {
      cpSync(join(ROOT, path), join(staging, path), {
        recursive: true,
        filter: (source) => !basename(source).startsWith("."),
      });
    }
    for (const source of [glue, join(targetDir, TARGET, "release", "rust_calculator.wasm")]) {
      copyFileSync(source, join(staging, "src", basename(source)));
    }
    rmSync(EXTENSION_DIR, { recursive: true, force: true });
    renameSync(staging, EXTENSION_DIR);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
  console.log("Built dist/property-desk-calc");
  return EXTENSION_DIR;
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    buildExtension();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
