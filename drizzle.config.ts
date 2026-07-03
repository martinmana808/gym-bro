import { defineConfig } from "drizzle-kit";

// With DATABASE_URL set (production/Neon) drizzle-kit talks to that Postgres;
// without it, it targets the local PGlite directory used by `npm run dev`.
export default defineConfig(
  process.env.DATABASE_URL
    ? {
        dialect: "postgresql",
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: process.env.DATABASE_URL },
      }
    : {
        dialect: "postgresql",
        driver: "pglite",
        schema: "./src/db/schema.ts",
        out: "./drizzle",
        dbCredentials: { url: "./.pglite" },
      },
);
