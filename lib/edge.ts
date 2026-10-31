export const runtime = "edge";

export function json(data: unknown, status = 200, cache = "private, no-store") {
  return Response.json(data, {
    status,
    headers: { "cache-control": cache },
  });
}

export function fail(scope: string, error: unknown, status = 500) {
  console.error(`${scope} failed`, error);
  return json({ error: { code: scope, message: "Request failed" } }, status);
}
