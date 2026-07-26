import { describe, it, expect, vi, afterEach } from "vitest";
import { WorkspaceEventsService } from "../workspaceevents";

vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

let fetchSpy: ReturnType<typeof vi.spyOn>;
afterEach(() => fetchSpy?.mockRestore());

function mock(body: unknown, status = 200) {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify(body), { status }));
}

describe("WorkspaceEventsService", () => {
  it("createSubscription posts target + eventTypes + pubsub topic", async () => {
    mock({ name: "subscriptions/1", state: "ACTIVE" });
    const svc = new WorkspaceEventsService({} as any, "s1");
    await svc.createSubscription(
      "//drive.googleapis.com/files/FILE1",
      ["google.workspace.drive.comment.v3.created"],
      "projects/p/topics/t",
      { includeResource: true },
    );
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://workspaceevents.googleapis.com/v1/subscriptions");
    expect(init.method).toBe("POST");
    const b = JSON.parse(init.body as string);
    expect(b.targetResource).toBe("//drive.googleapis.com/files/FILE1");
    expect(b.eventTypes).toContain("google.workspace.drive.comment.v3.created");
    expect(b.notificationEndpoint.pubsubTopic).toBe("projects/p/topics/t");
    expect(b.payloadOptions.includeResource).toBe(true);
  });

  it("listSubscriptions passes the filter", async () => {
    mock({ subscriptions: [{ name: "subscriptions/1" }] });
    const out = await new WorkspaceEventsService({} as any, "s1").listSubscriptions('event_types:"x"');
    expect(out.subscriptions).toHaveLength(1);
    expect(decodeURIComponent(fetchSpy.mock.calls[0][0] as string)).toContain('filter=event_types:"x"');
  });

  it("deleteSubscription issues DELETE on the resource name", async () => {
    mock({}, 200);
    await new WorkspaceEventsService({} as any, "s1").deleteSubscription("subscriptions/1");
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://workspaceevents.googleapis.com/v1/subscriptions/1");
    expect(init.method).toBe("DELETE");
  });
});
