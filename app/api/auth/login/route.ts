export const runtime = "edge";

export function GET(req: Request) {
  return Response.redirect(new URL("/", req.url), 302);
}
