import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

describe("web container contract", () => {
  test("nginx serves health and SPA routes but rejects API paths", async () => {
    const nginxConfig = await readFile(
      "containers/web/default.conf.template",
      "utf8"
    );

    expect(nginxConfig).not.toContain("proxy_pass");
    expect(nginxConfig).not.toContain("LUSH_API_UPSTREAM");
    expect(nginxConfig).not.toContain("LUSH_EXTERNAL_SCHEME");
    expect(nginxConfig).toContain("location = /healthz");
    expect(nginxConfig).toContain('add_header Cache-Control "no-store"');
    expect(nginxConfig).toMatch(/location = \/health \{\s+return 404;\s+\}/);
    expect(nginxConfig).toMatch(/location = \/v1beta \{\s+return 404;\s+\}/);
    expect(nginxConfig).toMatch(
      /location \^~ \/v1beta\/ \{\s+return 404;\s+\}/
    );
    expect(nginxConfig).toContain("try_files $uri $uri/ /index.html");
  });

  test("web has no API startup dependency or private upstream contract", async () => {
    const [dockerfile, compose] = await Promise.all([
      readFile("containers/web/Dockerfile", "utf8"),
      readFile("deploy/self-host/compose.yml", "utf8")
    ]);
    const webService = compose.match(/\n  web:\n(?<service>[\s\S]*?)\nnetworks:\n/)
      ?.groups?.service;

    expect(dockerfile).not.toContain("LUSH_API_UPSTREAM");
    expect(dockerfile).not.toContain("LUSH_EXTERNAL_SCHEME");
    expect(webService).toBeDefined();
    expect(webService).not.toContain("depends_on:");
    expect(webService).not.toContain("LUSH_API_UPSTREAM");
    expect(webService).not.toContain("LUSH_EXTERNAL_SCHEME");
  });

  test("local Caddy routes API paths directly to the API", async () => {
    const caddyfile = await readFile("deploy/self-host/Caddyfile.local", "utf8");

    expect(caddyfile).toContain("@api path /health /v1beta /v1beta/*");
    expect(caddyfile).toMatch(/handle @api \{\s+reverse_proxy api:7330\s+\}/);
    expect(caddyfile).toMatch(/handle \{\s+reverse_proxy web:8080\s+\}/);
  });
});
