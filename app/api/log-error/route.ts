import { z } from "zod";
import { logError } from "@/lib/error-log";
import { assertSameOrigin, json } from "@/lib/http";
import { clientIp, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  message: z.string().max(500),
  path: z.string().max(300).default(""),
  digest: z.string().max(100).default(""),
});

/** Browser-side crashes reported by the error screens (rate-limited, same-site only). */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    await rateLimit("log-error", clientIp(request), 10, 10 * 60);
    const body = bodySchema.parse(await request.json());
    await logError("browser", body.message || "Unknown browser error", {
      path: body.path,
      ref: body.digest ? `digest ${body.digest}` : (request.headers.get("user-agent") ?? "").slice(0, 100),
    });
  } catch {
    // Reporting must never fail loudly.
  }
  return json({ ok: true });
}
