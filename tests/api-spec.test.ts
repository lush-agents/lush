import { expect, test } from "bun:test";
import { apiSpec } from "../services/api/src/spec";

test("public API routes are grouped under v1beta", () => {
  expect(apiSpec.apiGroup).toBe("/v1beta");
  expect(apiSpec.healthPath).toBe("/v1beta/health");
  expect(apiSpec.routes.length).toBeGreaterThan(0);
  expect(apiSpec.routes.every((route) => route.path.startsWith("/v1beta/"))).toBe(
    true
  );
  expect(apiSpec.routes.some((route) => route.path === "/v1beta/auth/register")).toBe(
    true
  );
  expect(
    apiSpec.routes.some(
      (route) => route.path === "/v1beta/agents/:agentSlug/chat"
    )
  ).toBe(true);
});
