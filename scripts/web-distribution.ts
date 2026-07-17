import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { validateReleaseRef } from "./validate-release";

export const webDistributionManifestName = "lush-manifest.json";
export const emptyRuntimeConfig =
  "window.__LUSH_CONFIG__ = Object.freeze({});\n";

export type WebDistributionManifest = {
  schemaVersion: 1;
  name: "lush-web";
  version: string;
  revision: string;
};

export function createWebDistributionManifest(
  version: string,
  revision: string
): WebDistributionManifest {
  validateReleaseRef(`v${version}`, version);
  if (!/^(?:[0-9a-f]{40}|unknown)$/.test(revision)) {
    throw new Error("Web distribution revision must be a full Git SHA or unknown");
  }

  return {
    schemaVersion: 1,
    name: "lush-web",
    version,
    revision
  };
}

export async function writeWebDistributionManifest(
  directory: string,
  version: string,
  revision: string
) {
  const manifest = createWebDistributionManifest(version, revision);
  await writeFile(
    path.join(directory, webDistributionManifestName),
    `${JSON.stringify(manifest, null, 2)}\n`
  );
  return manifest;
}

export async function verifyWebDistribution(
  directory: string,
  version: string,
  revision: string
) {
  const expectedManifest = createWebDistributionManifest(version, revision);
  const manifest = await Bun.file(
    path.join(directory, webDistributionManifestName)
  ).json();
  if (JSON.stringify(manifest) !== JSON.stringify(expectedManifest)) {
    throw new Error("Web distribution manifest does not match its release coordinates");
  }

  const index = await Bun.file(path.join(directory, "index.html")).text();
  if (!index.includes('src="/runtime-config.js"')) {
    throw new Error("Web distribution does not load /runtime-config.js");
  }

  const runtimeConfig = await Bun.file(
    path.join(directory, "runtime-config.js")
  ).text();
  if (runtimeConfig !== emptyRuntimeConfig) {
    throw new Error("Web distribution runtime-config.js is not the empty placeholder");
  }

  const serve = async (pathname: string) => {
    const relativePath = pathname === "/" ? "index.html" : pathname.slice(1);
    const file = Bun.file(path.join(directory, relativePath));
    return (await file.exists()) ? new Response(file) : new Response(index);
  };

  const nestedRoute = await serve("/settings/organization");
  if (!nestedRoute.ok || (await nestedRoute.text()) !== index) {
    throw new Error("Web distribution did not serve its SPA fallback");
  }

  const servedRuntimeConfig = await serve("/runtime-config.js");
  if (
    !servedRuntimeConfig.ok ||
    (await servedRuntimeConfig.text()) !== emptyRuntimeConfig
  ) {
    throw new Error("Web distribution did not serve its runtime config placeholder");
  }
}

export async function writeSha256Checksum(archivePath: string) {
  const digest = createHash("sha256");
  for await (const chunk of createReadStream(archivePath)) {
    digest.update(chunk);
  }

  const checksumPath = `${archivePath}.sha256`;
  await writeFile(
    checksumPath,
    `${digest.digest("hex")}  ${path.basename(archivePath)}\n`
  );
  return checksumPath;
}

async function run(command: string[]) {
  const process = Bun.spawn({
    cmd: command,
    stdout: "inherit",
    stderr: "inherit"
  });
  const exitCode = await process.exited;
  if (exitCode !== 0) {
    throw new Error(`${command.join(" ")} exited with ${exitCode}`);
  }
}

if (import.meta.main) {
  const [command, first, second] = process.argv.slice(2);

  if (command === "build" && first && second) {
    await run(["bun", "run", "--cwd", "apps/lush", "bundle"]);
    await writeWebDistributionManifest("apps/lush/dist", first, second);
    await verifyWebDistribution("apps/lush/dist", first, second);
  } else if (command === "verify" && first && second) {
    const directory = process.argv[5];
    if (!directory) {
      throw new Error(
        "Usage: bun scripts/web-distribution.ts verify <version> <revision> <directory>"
      );
    }
    await verifyWebDistribution(directory, first, second);
  } else if (command === "checksum" && first) {
    await mkdir(path.dirname(first), { recursive: true });
    console.log(await writeSha256Checksum(first));
  } else {
    throw new Error(
      "Usage: bun scripts/web-distribution.ts <build version revision | verify version revision directory | checksum archive>"
    );
  }
}
