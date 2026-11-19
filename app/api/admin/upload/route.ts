import { handleError, json, assertSameOrigin } from "@/lib/http";
import { rateLimit } from "@/lib/rate-limit";
import { requireAction } from "@/lib/staff";
import { createSupabaseAdminClient } from "@/lib/supabase/server";

const BUCKET = "product-images";
const MAX_BYTES = 5 * 1024 * 1024;

/**
 * Detects the real image type from the file's first bytes, so a renamed
 * HTML/SVG/script file can't be uploaded by claiming to be an image.
 */
function sniffImageType(bytes: Uint8Array): { mime: string; ext: string } | null {
  const ascii = (from: number, to: number) => String.fromCharCode(...bytes.slice(from, to));
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  if (ascii(1, 4) === "PNG" && bytes[0] === 0x89) return { mime: "image/png", ext: "png" };
  if (ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return { mime: "image/webp", ext: "webp" };
  return null;
}

/** Uploads a product / category / content photo to the public Supabase Storage bucket. */
export async function POST(request: Request) {
  try {
    assertSameOrigin(request);
    const staff = await requireAction();
    await rateLimit("upload", staff.id, 120, 60 * 60);

    const file = (await request.formData()).get("file");
    if (!(file instanceof File) || file.size === 0 || file.size > MAX_BYTES) {
      return json({ error: "Choose a JPG, PNG or WebP image under 5 MB." }, 400);
    }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffImageType(bytes);
    if (!type) return json({ error: "That file isn’t a JPG, PNG or WebP image." }, 400);

    const path = `products/${crypto.randomUUID()}.${type.ext}`;
    const storage = createSupabaseAdminClient().storage.from(BUCKET);
    const { error } = await storage.upload(path, bytes, { contentType: type.mime, cacheControl: "31536000" });
    if (error) throw error;
    return json({ url: storage.getPublicUrl(path).data.publicUrl });
  } catch (e) {
    return handleError(e, "The photo could not be uploaded. Please try again.");
  }
}
