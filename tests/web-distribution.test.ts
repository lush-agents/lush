import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  createWebDistributionManifest,
  emptyRuntimeConfig,
  verifyWebDistribution,
  writeSha256Checksum,
  writeWebDistributionManifest
} from "../scripts/web-distribution";

const version = "1.2.3-rc.1";
const revision = "0123456789abcdef0123456789abcdef01234567";

describe("web distribution", () => {
  test("records exact release coordinates", () => {
    expect(createWebDistributionManifest(version, revision)).toEqual({
      schemaVersion: 1,
      name: "lush-web",
      version,
      revision
    });
    expect(() => createWebDistributionManifest(version, "short")).toThrow(
      "full Git SHA"
    );
  });

  test("validates the manifest, empty runtime config, and SPA fallback", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "lush-web-dist-"));
    try {
      await writeFile(
        path.join(directory, "index.html"),
        '<!doctype html><script src="/runtime-config.js"></script><main>Lush</main>\n'
      );
      await writeFile(path.join(directory, "runtime-config.js"), emptyRuntimeConfig);
      await writeWebDistributionManifest(directory, version, revision);

      await verifyWebDistribution(directory, version, revision);

      await writeFile(
        path.join(directory, "runtime-config.js"),
        'window.__LUSH_CONFIG__ = { apiBaseUrl: "https://example.com" };\n'
      );
      await expect(
        verifyWebDistribution(directory, version, revision)
      ).rejects.toThrow("empty placeholder");
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  test("writes a portable SHA-256 checksum file", async () => {
    const directory = await mkdtemp(path.join(tmpdir(), "lush-web-checksum-"));
    try {
      const archive = path.join(directory, "lush-web-dist-1.2.3.tar.gz");
      await writeFile(archive, "artifact");
      const checksum = await writeSha256Checksum(archive);
      expect(await Bun.file(checksum).text()).toBe(
        "c7c5c1d70c5dec4416ab6158afd0b223ef40c29b1dc1f97ed9428b94d4cadb1c  lush-web-dist-1.2.3.tar.gz\n"
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
