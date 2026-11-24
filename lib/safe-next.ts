/** Only allow same-site relative paths as post-login destinations (no open redirects). */
export function safeNext(next: string | null | undefined, fallback = "/account") {
  // Browsers drop tabs/newlines and treat "\" like "/", so "/\t/evil.com" or
  // "/\evil.com" would become "//evil.com": refuse control characters and backslashes.
  return next && next.startsWith("/") && !next.startsWith("//") && !/[\\\u0000-\u001f\u007f]/.test(next)
    ? next
    : fallback;
}
