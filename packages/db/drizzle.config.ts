import type { Config } from "drizzle-kit";

const url = process.env["DATABASE_URL"] ?? "postgresql://learnpro:learnpro@localhost:5432/learnpro";

export default {
  schema: "./src/schema.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
} satisfies Config;
