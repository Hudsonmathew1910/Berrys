// Password hashing and image-upload safety. Run: npm test
import assert from "node:assert/strict";
import { randomBytes, scryptSync } from "node:crypto";
import sharp from "sharp";
import { finish, test } from "./setup.mts";

const core = await import("../lib/staff-core.ts");

console.log("Passwords");
await test("legacy hash still verifies and is flagged for upgrade", async () => {
  const salt = randomBytes(16);
  const legacy = `scrypt$${salt.toString("base64")}$${scryptSync("berrys2026x", salt, 64).toString("base64")}`;
  assert.equal(await core.verifyPassword("berrys2026x", legacy), true);
  assert.equal(await core.verifyPassword("wrong-pass1", legacy), false);
  assert.equal(core.needsRehash(legacy), true);
});
await test("new hashes use N=2^15 r=8 p=3; tampered weak parameters are rejected", async () => {
  const fresh = await core.hashPassword("berrys2026x");
  assert.ok(fresh.startsWith("scrypt$v2$32768$8$3$"));
  assert.equal(core.needsRehash(fresh), false);
  assert.equal(await core.verifyPassword("berrys2026x", fresh), true);
  assert.equal(await core.verifyPassword("x", "scrypt$v2$2$1$1$aa$bb"), false);
});

console.log("Uploads");
await test("re-encoding strips EXIF/GPS and shrinks huge images", async () => {
  const withExif = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#ccaa88" } })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Make: "SpyCam", Copyright: "GPS 12.97N 77.59E" } } })
    .toBuffer();
  assert.ok((await sharp(withExif).metadata()).exif, "fixture has EXIF");
  const out = await sharp(withExif, { limitInputPixels: 50_000_000, failOn: "error" })
    .rotate()
    .resize({ width: 1600, height: 2000, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer();
  const meta = await sharp(out).metadata();
  assert.equal(meta.format, "webp");
  assert.ok(meta.width! <= 1600 && meta.height! <= 2000);
  assert.equal(meta.exif, undefined);
});
await test("non-image content is rejected by the decoder", async () => {
  await assert.rejects(sharp(Buffer.from("<svg onload=alert(1)>")).webp().toBuffer());
});

await finish();
