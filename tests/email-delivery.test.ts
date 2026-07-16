import { describe, expect, test } from "bun:test";
import { ConfigError } from "../packages/config/src/env";
import {
  assertEmailDeliveryConfigured,
  configuredEmailDelivery,
  LogEmailDelivery,
  SmtpEmailDelivery
} from "../services/notifications/src/email";

describe("email delivery configuration", () => {
  test("supports explicit none and development log delivery", () => {
    expect(configuredEmailDelivery({ LUSH_EMAIL_DELIVERY: "none" })).toBeUndefined();
    expect(configuredEmailDelivery({ LUSH_EMAIL_DELIVERY: "log" })).toBeInstanceOf(
      LogEmailDelivery
    );
  });

  test("builds SMTP delivery only with a sender and transport URL", () => {
    expect(
      configuredEmailDelivery({
        LUSH_EMAIL_DELIVERY: "smtp",
        LUSH_EMAIL_FROM: "Lush <noreply@example.com>",
        LUSH_SMTP_URL: "smtps://user:password@smtp.example.com:465"
      })
    ).toBeInstanceOf(SmtpEmailDelivery);

    expect(() =>
      configuredEmailDelivery({ LUSH_EMAIL_DELIVERY: "smtp" })
    ).toThrow(ConfigError);
  });

  test("rejects unknown delivery modes", () => {
    expect(() =>
      configuredEmailDelivery({ LUSH_EMAIL_DELIVERY: "transactional-api" })
    ).toThrow(ConfigError);
  });

  test("fails closed when password signup has no delivery", () => {
    expect(() =>
      assertEmailDeliveryConfigured({
        passwordAuthEnabled: true,
        signupEnabled: true,
        delivery: undefined
      })
    ).toThrow(ConfigError);

    expect(() =>
      assertEmailDeliveryConfigured({
        passwordAuthEnabled: true,
        signupEnabled: false,
        delivery: undefined
      })
    ).not.toThrow();
  });
});
