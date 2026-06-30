import pino, { type Logger } from "pino";
import { envSchema, readEnvSchema } from "@lush/config/env";

const loggingConfig = readEnvSchema({
  LUSH_LOG_LEVEL: envSchema.optionalString("info")
});

export type LushLogger = Logger;

export function createLogger(service: string): LushLogger {
  return pino({
    base: {
      service
    },
    formatters: {
      level(label) {
        return { level: label };
      }
    },
    level: loggingConfig.LUSH_LOG_LEVEL,
    messageKey: "message",
    timestamp: pino.stdTimeFunctions.isoTime
  });
}
