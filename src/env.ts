import "server-only";
import { z } from "zod";

const schema = z.object({
  // TCP mode (local dev, Neon): a full connection string.
  DATABASE_URL: z.string().min(1).optional(),
  // Socket mode (Cloud Run -> Cloud SQL via the built-in connector): the
  // unix socket path plus explicit credentials.
  DATABASE_SOCKET: z.string().min(1).optional(),
  DATABASE_USER: z.string().min(1).optional(),
  DATABASE_PASSWORD: z.string().min(1).optional(),
  DATABASE_NAME: z.string().min(1).optional(),
  AUTH_SECRET: z.string().min(1),
  CHECK_RUNNER_SECRET: z.string().min(1),
  APP_URL: z.string().url().default("http://localhost:3000"),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error(
    "Invalid environment variables:",
    parsed.error.flatten().fieldErrors,
  );
  throw new Error("Invalid environment variables");
}

export const env = parsed.data;
