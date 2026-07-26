import { googleJson } from "../googleClient";

const BASE = "https://slides.googleapis.com/v1/presentations";

export class SlidesService {
  constructor(private env: Env, private sub: string) {}

  async create(title: string): Promise<{ presentationId: string; title?: string }> {
    return googleJson<{ presentationId: string; title?: string }>(this.env, this.sub, BASE, {
      method: "POST",
      body: JSON.stringify({ title }),
    });
  }

  async get(presentationId: string): Promise<{ presentationId: string; title?: string; slides?: unknown[] }> {
    return googleJson<{ presentationId: string; title?: string; slides?: unknown[] }>(
      this.env,
      this.sub,
      `${BASE}/${presentationId}`,
    );
  }

  async batchUpdate(presentationId: string, requests: unknown[]): Promise<unknown> {
    return googleJson(this.env, this.sub, `${BASE}/${presentationId}:batchUpdate`, {
      method: "POST",
      body: JSON.stringify({ requests }),
    });
  }
}
