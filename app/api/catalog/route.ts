import seed from "@/data/pcs-catalog.json";
import { normalizeCatalog, type SeedFile } from "@/lib/domain/catalog";
import { fail, json } from "@/lib/edge";

export const runtime = "edge";

export async function GET() {
  try {
    const catalog = normalizeCatalog(seed as unknown as SeedFile);
    return json(catalog, 200, "public, max-age=3600, stale-while-revalidate=86400");
  } catch (error) {
    return fail("catalog", error);
  }
}
