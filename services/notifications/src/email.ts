import {
  ConfigError,
  currentEnv,
  envSchema,
  readEnvSchema,
  type EnvSource
} from "@lush/config/env";
import { createLogger, type LushLogger } from "@lush/logging/logger";
import {
  SMTPClient,
  type MessageHeaders,
  type SMTPConnectionOptions
} from "emailjs";

export type EmailMessage = {
  to: string;
  subject: string;
  text: string;
  html?: string;
};

export interface EmailDelivery {
  send(message: EmailMessage): Promise<void>;
}

type SmtpClient = {
  sendAsync(message: MessageHeaders): Promise<unknown>;
};

type SmtpClientFactory = (
  options: Partial<SMTPConnectionOptions>
) => SmtpClient;

function smtpClientOptions(smtpUrl: string): Partial<SMTPConnectionOptions> {
  let url: URL;

  try {
    url = new URL(smtpUrl);
  } catch {
    throw invalidSmtpUrl();
  }

  const implicitTls = url.protocol === "smtps:";
  if ((!implicitTls && url.protocol !== "smtp:") || !url.hostname) {
    throw invalidSmtpUrl();
  }

  const port = url.port ? Number(url.port) : implicitTls ? 465 : 587;
  if (!Number.isSafeInteger(port) || port < 1 || port > 65_535) {
    throw invalidSmtpUrl();
  }

  try {
    return {
      host: url.hostname,
      port,
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      ssl: implicitTls ? { servername: url.hostname } : false,
      tls: !implicitTls,
      timeout: 30_000
    };
  } catch {
    throw invalidSmtpUrl();
  }
}

function invalidSmtpUrl() {
  return new ConfigError(
    "LUSH_SMTP_URL must be a valid smtp:// or smtps:// URL",
    { invalid: ["LUSH_SMTP_URL"] }
  );
}

export class SmtpEmailDelivery implements EmailDelivery {
  private readonly client: SmtpClient;

  constructor(
    smtpUrl: string,
    private readonly from: string,
    createClient: SmtpClientFactory = (options) => new SMTPClient(options)
  ) {
    this.client = createClient(smtpClientOptions(smtpUrl));
  }

  async send(message: EmailMessage) {
    const email: MessageHeaders = {
      from: this.from,
      to: message.to,
      subject: message.subject,
      text: message.text
    };

    if (message.html) {
      email.attachment = {
        data: message.html,
        alternative: true,
        type: "text/html",
        charset: "utf-8"
      };
    }

    await this.client.sendAsync(email);
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
