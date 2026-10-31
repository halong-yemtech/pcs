import { evaluateAttention } from "@/lib/domain/attention";
import type { Workspace } from "@/lib/domain/types";
import { buildWorkspace } from "@/lib/fixtures/workspace";
import { fail, json } from "@/lib/edge";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = buildWorkspace();
    return json({ items: evaluateAttention(workspace), source: "edge" });
  } catch (error) {
    return fail("attention", error);
  }
}

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Pick<Workspace, "deals" | "orders" | "pos" | "rfqs" | "customers">;
    if (!body?.deals || !body.orders || !body.pos || !body.rfqs) {
      return json({ error: { code: "invalid", message: "deals, orders, pos and rfqs are required" } }, 400);
    }
    return json({ items: evaluateAttention(body), source: "edge" });
  } catch (error) {
    return fail("attention", error);
  }
}
