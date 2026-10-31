export const runtime = "edge";

export function GET(req: Request) {
  return Response.redirect(new URL("/signed-out", req.url), 302);
}
