import { evaluateAttention } from "@/lib/domain/attention";
import { buildWorkspace } from "@/lib/fixtures/workspace";
import { fail, json } from "@/lib/edge";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const workspace = buildWorkspace();
    const attention = evaluateAttention(workspace);
    return json({ ...workspace, attention });
  } catch (error) {
    return fail("workspace", error);
  }
}
