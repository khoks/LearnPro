import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";
import * as schema from "./schema.js";
import * as relations from "./relations.js";

export type LearnProDb = NodePgDatabase<typeof schema & typeof relations>;

export interface CreateDbOptions {
  connectionString: string;
  max?: number;
}

export function createDb(opts: CreateDbOptions): { db: LearnProDb; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: opts.connectionString,
    ...(opts.max !== undefined && { max: opts.max }),
  });
  const db = drizzle(pool, { schema: { ...schema, ...relations } });
  return { db, pool };
}

export function loadDatabaseUrl(env: NodeJS.ProcessEnv): string {
  const url = env["DATABASE_URL"];
  if (!url) {
    throw new Error("DATABASE_URL is not set — required to connect to Postgres");
  }
  return url;
}
