import {
  ConfigError,
  currentEnv,
  envSchema,
  readEnvSchema,
  type EnvSource
} from "@lush/config/env";
import { createLogger, type LushLogger } from "@lush/logging/logger";
import nodemailer from "nodemailer";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailDelivery {
  send(message: EmailMessage): Promise<void>;
}

export class SmtpEmailDelivery implements EmailDelivery {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: EmailMessage) {
    await this.transport.sendMail({ from: this.from, ...message });
  }
}

export class LogEmailDelivery implements EmailDelivery {
  constructor(
    private readonly logger: LushLogger = createLogger("@lush/notifications")
  ) {}

  async send(message: EmailMessage) {
    this.logger.info({ email: message }, "development email delivery");
  }
}

export function configuredEmailDelivery(
  env: EnvSource = currentEnv()
): EmailDelivery | undefined {
  const config = readEnvSchema(
    {
      LUSH_EMAIL_DELIVERY: envSchema.optionalString("none"),
      LUSH_EMAIL_FROM: envSchema.optionalString(""),
      LUSH_SMTP_URL: envSchema.optionalString("")
    },
    env
  );

  switch (config.LUSH_EMAIL_DELIVERY) {
    case "none":
      return undefined;
    case "log":
      return new LogEmailDelivery();
    case "smtp":
      if (!config.LUSH_EMAIL_FROM || !config.LUSH_SMTP_URL) {
        throw new ConfigError(
          "LUSH_EMAIL_FROM and LUSH_SMTP_URL are required for SMTP email delivery",
          { missing: ["LUSH_EMAIL_FROM", "LUSH_SMTP_URL"] }
        );
      }
      return new SmtpEmailDelivery(config.LUSH_SMTP_URL, config.LUSH_EMAIL_FROM);
    default:
      throw new ConfigError(
        "LUSH_EMAIL_DELIVERY must be one of: none, log, smtp",
        { invalid: ["LUSH_EMAIL_DELIVERY"] }
      );
  }
}

export function assertEmailDeliveryConfigured(options: {
  passwordAuthEnabled: boolean;
  delivery: EmailDelivery | undefined;
}) {
  if (options.passwordAuthEnabled && !options.delivery) {
    throw new ConfigError(
      "Email delivery must be configured when password authentication is enabled. Set LUSH_EMAIL_DELIVERY to smtp or log.",
      { missing: ["LUSH_EMAIL_DELIVERY"] }
    );
  }
}
