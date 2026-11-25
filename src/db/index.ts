import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

// Server only: never import this file from a client component.
// Connects when called, so the app can be built without a database.
export function getDb() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set. See .env.example.");
  return drizzle({ client: neon(url) });
}
