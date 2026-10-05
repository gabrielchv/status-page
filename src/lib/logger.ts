import "server-only";
import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  base: { service: "status-page" },
  redact: {
    paths: [
      "password",
      "passwordHash",
      "token",
      "*.password",
      "*.token",
      "headers.authorization",
    ],
    censor: "[REDACTED]",
  },
});
