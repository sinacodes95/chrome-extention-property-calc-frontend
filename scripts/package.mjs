import { execFileSync } from "node:child_process";
import { mkdtempSync, renameSync, rmSync } from "node:fs";
import { join } from "node:path";
import { buildExtension, DIST } from "./build.mjs";

function packageExtension() {
  const extensionDir = buildExtension();
  const staging = mkdtempSync(join(DIST, ".package-"));
  const name = "property-desk-calc.zip";
  try {
    const archive = join(staging, name);
    execFileSync("zip", ["-q", "-r", "-X", archive, "."], { cwd: extensionDir, stdio: "inherit" });
    renameSync(archive, join(DIST, name));
    console.log(`Created dist/${name}`);
  } finally {
    rmSync(staging, { recursive: true, force: true });
  }
}

try {
  packageExtension();
} catch (error) {
  console.error(error.code === "ENOENT" ? "Packaging requires the zip command and all extension files." : error.message);
  process.exitCode = 1;
}
