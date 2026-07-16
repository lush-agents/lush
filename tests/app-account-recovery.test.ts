import { expect, test } from "bun:test";

test("email verification requires an explicit human submission", async () => {
  const source = await Bun.file(
    "apps/lush/src/routes/AccountRecoveryPage.tsx"
  ).text();
  const submit = source.indexOf("const submit = async");
  const verificationRequest = source.indexOf("await verifyEmail(");

  expect(submit).toBeGreaterThan(-1);
  expect(verificationRequest).toBeGreaterThan(submit);
  expect(source).toContain("Verify my email");
  expect(source).not.toContain("useEffect");
});

test("recovery routes remain available to authenticated users", async () => {
  const source = await Bun.file("apps/lush/src/app/router.tsx").text();
  const recoveryRoute = source.indexOf(
    '{ path: "verify-email", element: <AccountRecoveryPage mode="verify" /> }'
  );
  const publicOnlyGuard = source.indexOf("element: <PublicOnlyRoute />");

  expect(recoveryRoute).toBeGreaterThan(-1);
  expect(recoveryRoute).toBeLessThan(publicOnlyGuard);
});

test("registration success copy is neutral about the email contents", async () => {
  const source = await Bun.file("apps/lush/src/routes/AuthPage.tsx").text();

  expect(source).toContain(
    "Check ${result.verificationEmail} for next steps before signing in."
  );
  expect(source).not.toContain("Verify ${result.verificationEmail}");
});
