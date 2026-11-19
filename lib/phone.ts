/**
 * Indian mobile numbers. Accepts "98765 43210", "+91 98765-43210",
 * "09876543210" … and returns E.164 ("+919876543210"), or null if invalid.
 */
export function normalizeIndianMobile(input: string): string | null {
  const digits = input.replace(/[\s()-]/g, "").replace(/^(\+91|0091|91(?=\d{10}$)|0)/, "");
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** "+919876543210" -> "+91 98765 43210" */
export function formatIndianMobile(e164: string) {
  const d = e164.replace(/^\+91/, "");
  return `+91 ${d.slice(0, 5)} ${d.slice(5)}`;
}
