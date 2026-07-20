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

    expect(() =>
      configuredEmailDelivery({
        LUSH_EMAIL_DELIVERY: "smtp",
        LUSH_EMAIL_FROM: "Lush <noreply@example.com>",
        LUSH_SMTP_URL: "https://smtp.example.com"
      })
    ).toThrow(ConfigError);
  });

  test("maps SMTP URLs and text-plus-HTML messages to emailjs", async () => {
    let clientOptions: unknown;
    let startTlsOptions: unknown;
    let deliveredMessage: unknown;
    const delivery = new SmtpEmailDelivery(
      "smtps://api_token:p%40ss@smtp.example.com:465",
      "Lush <noreply@example.com>",
      (options) => {
        clientOptions = options;
        return {
          async sendAsync(message) {
            deliveredMessage = message;
          }
        };
      }
    );

    await delivery.send({
      to: "user@example.com",
      subject: "Welcome",
      text: "Welcome to Lush.",
      html: "<p>Welcome to Lush.</p>"
    });

    expect(clientOptions).toEqual({
      host: "smtp.example.com",
      port: 465,
      user: "api_token",
      password: "p@ss",
      ssl: { servername: "smtp.example.com" },
      tls: false,
      timeout: 30_000
    });

    new SmtpEmailDelivery(
      "smtp://user:password@smtp.example.com",
      "Lush <noreply@example.com>",
      (options) => {
        startTlsOptions = options;
        return { async sendAsync() {} };
      }
    );
    expect(startTlsOptions).toEqual({
      host: "smtp.example.com",
      port: 587,
      user: "user",
      password: "password",
      ssl: false,
      tls: true,
      timeout: 30_000
    });

    expect(deliveredMessage).toEqual({
      from: "Lush <noreply@example.com>",
      to: "user@example.com",
      subject: "Welcome",
      text: "Welcome to Lush.",
      attachment: {
        data: "<p>Welcome to Lush.</p>",
        alternative: true,
        type: "text/html",
        charset: "utf-8"
      }
    });
  });

  test("rejects unknown delivery modes", () => {
    expect(() =>
      configuredEmailDelivery({ LUSH_EMAIL_DELIVERY: "transactional-api" })
    ).toThrow(ConfigError);
  });

  test("fails closed whenever password authentication has no delivery", () => {
    expect(() =>
      assertEmailDeliveryConfigured({
        passwordAuthEnabled: true,
        delivery: undefined
      })
    ).toThrow(ConfigError);

    expect(() =>
      assertEmailDeliveryConfigured({
        passwordAuthEnabled: false,
        delivery: undefined
      })
    ).not.toThrow();
  });
});
