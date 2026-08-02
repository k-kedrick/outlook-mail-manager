const SUNSET = "Sat, 01 Aug 2027 00:00:00 GMT";

export function markLegacyApi(response: Response): Response {
  response.headers.set("Deprecation", "true");
  response.headers.set("Sunset", SUNSET);
  response.headers.set("Link", '</api/v2/redemptions/code-requests>; rel="successor-version"');
  return response;
}
