import { fail, json } from "@/lib/edge";

export const runtime = "edge";

const ME = {
  email: "jack.morris@pcs.com.au",
  name: "Jack Morris",
  role: "admin" as const,
  title: "Manager",
};

export async function GET() {
  try {
    return json(ME);
  } catch (error) {
    return fail("me", error);
  }
}
