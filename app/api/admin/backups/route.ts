import { json } from "@/lib/edge";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const EMPTY = { runs: [], targets: [], overdue: true, lastOk: null };

export async function GET() {
  return json(EMPTY);
}

export async function POST() {
  return json({ ok: false, error: "No backup destination is set up yet." });
}
