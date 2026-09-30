export type RequestAuthSource =
  | { type: "bearer"; token: string }
  | { type: "cookie" }
  | null;

export function getRequestAuthSource(headers: Headers): RequestAuthSource {
  const authorization = headers.get("authorization");
  const bearerMatch = authorization?.match(/^Bearer\s+(.+)$/i);
  const token = bearerMatch?.[1]?.trim();
  if (token) return { type: "bearer", token };

  const cookie = headers.get("cookie")?.trim();
  if (cookie) return { type: "cookie" };

  return null;
}
