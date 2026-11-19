import { NextResponse } from "next/server";
import { assertSameOrigin, handleError } from "@/lib/http";
import { destroySession } from "@/lib/session";

/** POST /auth/signout — logs out and returns to the storefront. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await destroySession();
    return NextResponse.redirect(new URL("/", request.url), { status: 303 });
  } catch (e) {
    return handleError(e);
  }
}
