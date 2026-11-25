import { connection } from "next/server";
import { checkDatabase } from "@/db/check";

export default async function Home() {
  await connection();
  const problem = await checkDatabase();
  if (problem) console.error(`Database check failed: ${problem}`);

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <h1 className="text-4xl font-semibold">CoverGrid</h1>
      <p>Smart roster management</p>
      <p role="status">{problem ? "Database not connected" : "Database connected"}</p>
      {problem && process.env.NODE_ENV === "development" && <p>{problem}</p>}
    </main>
  );
}
