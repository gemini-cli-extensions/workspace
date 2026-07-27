import { getAccessToken } from "./tokenProvider";

export class GoogleApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Google API ${status}: ${body.slice(0, 300)}`);
    this.name = "GoogleApiError";
  }
}

export async function googleFetch(env: Env, sub: string, url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getAccessToken(env, sub);
  const res = await fetch(url, {
    ...init,
    headers: { ...(init.headers as Record<string, string>), Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new GoogleApiError(res.status, await res.text());
  return res;
}

export async function googleJson<T>(env: Env, sub: string, url: string, init: RequestInit = {}): Promise<T> {
  const headers = { "content-type": "application/json", ...(init.headers as Record<string, string>) };
  const res = await googleFetch(env, sub, url, { ...init, headers });
  return (await res.json()) as T;
}
