import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env } from "@/env";
import * as schema from "./schema";

const globalForDb = globalThis as unknown as {
  postgres?: ReturnType<typeof postgres>;
};

function createClient() {
  if (env.DATABASE_SOCKET) {
    return postgres({
      host: env.DATABASE_SOCKET,
      user: env.DATABASE_USER,
      password: env.DATABASE_PASSWORD,
      database: env.DATABASE_NAME,
    });
  }
  return postgres(env.DATABASE_URL!, { max: 3 });
}

const client = globalForDb.postgres ?? createClient();

if (process.env.NODE_ENV !== "production") {
  globalForDb.postgres = client;
}

export const db = drizzle(client, { schema });
