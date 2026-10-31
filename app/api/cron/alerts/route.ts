import { evaluateAttention } from "@/lib/domain/attention";
import { buildWorkspace } from "@/lib/fixtures/workspace";
import { fail, json } from "@/lib/edge";

export const runtime = "edge";
export const dynamic = "force-dynamic";

/** Hourly digest of stuck sales, late deliveries and approvals. */
export async function GET(req: Request) {
  try {
    const secret = process.env.CRON_SECRET;
    if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) {
      return json({ error: { code: "unauthorized", message: "Sign in required" } }, 401);
    }
    const workspace = buildWorkspace();
    const items = evaluateAttention(workspace);
    return json({
      ok: true,
      at: new Date().toISOString(),
      timezone: "Australia/Perth",
      count: items.length,
      escalated: items.filter((item) => item.escalate).length,
      approvals: items.filter((item) => item.severity === "approval").length,
      items,
    });
  } catch (error) {
    return fail("alerts", error);
  }
}
