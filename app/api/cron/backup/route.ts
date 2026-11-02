import { json } from "@/lib/edge";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** Sunday night off-site backup. No destination is configured on this deployment. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
    return json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
  }
  return json({
    ok: false,
    error: "No backup destination is set up yet.",
    at: new Date().toISOString(),
    timezone: "Australia/Perth",
  });
}
