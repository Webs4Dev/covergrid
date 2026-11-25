import { sql } from "drizzle-orm";
import { getDb } from "./index";

type Failure = { code?: unknown; message?: unknown; cause?: unknown; sourceError?: unknown };

// Turns a connection failure into a fixed sentence. Raw error text is never
// returned because it can contain the connection string.
function describeFailure(error: unknown): string {
  const texts: string[] = [];
  let current = error as Failure | undefined;
  for (let depth = 0; current && depth < 6; depth++) {
    texts.push(String(current.code ?? ""), String(current.message ?? ""));
    // Neon keeps the original network error in sourceError instead of cause.
    current = (current.cause ?? current.sourceError) as Failure | undefined;
  }
  const all = texts.join(" ");

  if (/28P01|password authentication failed/i.test(all)) return "Wrong user name or password in DATABASE_URL.";
  if (/ENOTFOUND|EAI_AGAIN/.test(all)) return "Database host not found. Check the host in DATABASE_URL, or this network's DNS may be blocking it.";
  if (/ECONNREFUSED|ETIMEDOUT|ECONNRESET|UND_ERR/.test(all)) return "Could not reach the database over the network.";
  if (/CERT|certificate/i.test(all)) return "The secure connection was refused (certificate problem).";
  if (/not a valid|could not be parsed|Invalid URL/i.test(all)) return "DATABASE_URL is not in a valid format.";
  if (/3D000|database .* does not exist/i.test(all)) return "The database name in DATABASE_URL does not exist.";
  if (/endpoint/i.test(all)) return "Neon could not find or start the database endpoint.";
  if (/fetch failed/i.test(all)) return "The request to the database failed before a reply came back.";
  return "The database check failed for an unknown reason.";
}

// Returns null when the database works, otherwise a reason that is safe to show.
export async function checkDatabase(): Promise<string | null> {
  const url = process.env.DATABASE_URL;
  if (!url) return "DATABASE_URL is empty or was not loaded.";
  if (!/^postgres(ql)?:\/\//.test(url)) return "DATABASE_URL must start with postgresql://";
  if (/\*{3,}/.test(url)) return "DATABASE_URL contains a hidden password (****).";
  if (/[^\x21-\x7e]/.test(url)) return "DATABASE_URL contains a space or an invisible character.";
  try {
    await getDb().execute(sql`select 1`);
    return null;
  } catch (error) {
    return describeFailure(error);
  }
}
