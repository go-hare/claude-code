#!/usr/bin/env bun
/**
 * Post-build processing for Vite build output.
 *
 * 1. Patch globalThis.Bun destructuring in third-party deps for Node.js compat
 * 2. Copy native addon files
 * 3. Generate dual entry points (cli-bun.js, cli-node.js)
 */
import { readdir, readFile, writeFile, cp } from "node:fs/promises";
import { chmodSync, existsSync } from "node:fs";
import { join } from "node:path";
import { execSync } from "node:child_process";

const outdir = "dist";

async function postBuild() {
  // Step 1: Patch globalThis.Bun destructuring in the single bundled file
  const cliPath = join(outdir, "cli.js");
  const BUN_DESTRUCTURE = /var \{([^}]+)\} = globalThis\.Bun;?/g;
  const BUN_DESTRUCTURE_SAFE =
    'var {$1} = typeof globalThis.Bun !== "undefined" ? globalThis.Bun : {};';

  let bunPatched = 0;
  {
    const content = await readFile(cliPath, "utf-8");
    if (BUN_DESTRUCTURE.test(content)) {
      await writeFile(
        cliPath,
        content.replace(BUN_DESTRUCTURE, BUN_DESTRUCTURE_SAFE),
      );
      bunPatched++;
    }
    BUN_DESTRUCTURE.lastIndex = 0;
  }

  // Step 2: Copy native addon files
  for (const nativeVendor of [
    "audio-capture",
    "computer-use-input",
    "computer-use-swift",
    "image-processor",
    "url-handler",
  ]) {
    const vendorDir = join(outdir, "vendor", nativeVendor);
    await cp(join("vendor", nativeVendor), vendorDir, {
      recursive: true,
    } as never);
    console.log(`Copied vendor/${nativeVendor}/ → ${vendorDir}/`);
  }

  const ripgrepVendorSrc = join("src", "utils", "vendor", "ripgrep");
  if (existsSync(ripgrepVendorSrc)) {
    const ripgrepVendorDir = join(outdir, "vendor", "ripgrep");
    await cp(ripgrepVendorSrc, ripgrepVendorDir, {
      recursive: true,
    } as never);
    console.log(`Copied ${ripgrepVendorSrc}/ → ${ripgrepVendorDir}/`);
  } else {
    console.warn(
      `Skipped copying ${ripgrepVendorSrc}/ because it does not exist`,
    );
  }

  // Step 3: Generate dual entry points
  const cliBun = join(outdir, "cli-bun.js");
  const cliNode = join(outdir, "cli-node.js");

  await writeFile(cliBun, '#!/usr/bin/env bun\nimport "./cli.js"\n');
  await writeFile(cliNode, '#!/usr/bin/env node\nimport "./cli.js"\n');

  chmodSync(cliBun, 0o755);
  chmodSync(cliNode, 0o755);

  console.log(
    `Post-build complete: patched ${bunPatched} Bun destructure, generated entry points`,
  );
}

postBuild().catch((err) => {
  console.error("Post-build failed:", err);
  process.exit(1);
});
