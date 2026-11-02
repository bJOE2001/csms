/** Compare browser Origin with the actual Host header, not a proxy-normalized URL. */
export function isSameOrigin(
  request: Request,
  expectedOrigin?: string,
): boolean {
  try {
    const origin = new URL(request.headers.get("origin") ?? "");
    const host = new URL(`http://${request.headers.get("host") ?? ""}`).host;
    return (
      ["http:", "https:"].includes(origin.protocol) &&
      origin.host === host &&
      (!expectedOrigin || origin.origin === new URL(expectedOrigin).origin)
    );
  } catch {
    return false;
  }
}
