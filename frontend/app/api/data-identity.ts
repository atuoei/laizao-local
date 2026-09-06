const COOKIE = "laizao_actor_id";

export function dataActor(request: Request) {
  const authenticated = request.headers.get("oai-authenticated-user-id")?.trim();
  if (authenticated) return { id: `oai:${authenticated}`, cookie: null };
  const cookieValue = request.headers.get("cookie")?.split(";").map(x => x.trim()).find(x => x.startsWith(`${COOKIE}=`))?.slice(COOKIE.length + 1);
  if (cookieValue && /^[a-zA-Z0-9:_-]{8,160}$/.test(cookieValue)) return { id: cookieValue, cookie: null };
  const id = `anon:${crypto.randomUUID()}`;
  const secure = new URL(request.url).protocol === "https:" ? "; Secure" : "";
  return { id, cookie: `${COOKIE}=${id}; Path=/; Max-Age=31536000; SameSite=Lax; HttpOnly${secure}` };
}

export function identifiedJson(body: unknown, actor: ReturnType<typeof dataActor>, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (actor.cookie) headers.set("Set-Cookie", actor.cookie);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}
