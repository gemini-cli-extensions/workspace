/**
 * @fileoverview Google Workspace Events API — fine-grained event subscriptions
 * (workspaceevents.googleapis.com/v1). Richer than Drive changes.watch: you
 * subscribe a target resource (a file or shared drive) to specific CloudEvents
 * event types (e.g. google.workspace.drive.comment.v3.created,
 * google.workspace.drive.file.v3.contentChanged) and events are delivered to a
 * Cloud Pub/Sub topic. Comment/reply events include mentioned + assignee email
 * addresses — useful for "agent tagged in a comment" workflows.
 *
 * Delivery infra (Pub/Sub topic + a push subscription to this Worker's
 * /api/gws/drive-webhook) is configured out-of-band; these tools just manage
 * the subscription lifecycle.
 */
import { googleJson, googleFetch } from "../googleClient";

const BASE = "https://workspaceevents.googleapis.com/v1";

export type WorkspaceSubscription = {
  name?: string;
  targetResource?: string;
  eventTypes?: string[];
  state?: string;
  notificationEndpoint?: { pubsubTopic?: string };
};

export class WorkspaceEventsService {
  constructor(private env: Env, private sub: string) {}

  /**
   * Create a subscription. `targetResource` is like
   * `//drive.googleapis.com/files/FILE_ID` or `//drive.googleapis.com/drives/DRIVE_ID`.
   * `pubsubTopic` is like `projects/PROJECT/topics/TOPIC`.
   */
  async createSubscription(
    targetResource: string,
    eventTypes: string[],
    pubsubTopic: string,
    opts?: { includeResource?: boolean; includeDescendants?: boolean },
  ): Promise<WorkspaceSubscription> {
    const body: Record<string, unknown> = {
      targetResource,
      eventTypes,
      notificationEndpoint: { pubsubTopic },
      payloadOptions: { includeResource: opts?.includeResource ?? false },
    };
    if (opts?.includeDescendants !== undefined) {
      body.driveOptions = { includeDescendants: opts.includeDescendants };
    }
    return googleJson<WorkspaceSubscription>(this.env, this.sub, `${BASE}/subscriptions`, {
      method: "POST",
      body: JSON.stringify(body),
    });
  }

  /** List subscriptions. The Events API requires a `filter` (e.g. `event_types:"google.workspace.drive.file.v3.contentChanged"` or a target resource). */
  async listSubscriptions(filter: string): Promise<{ subscriptions: WorkspaceSubscription[]; nextPageToken?: string }> {
    const out = await googleJson<{ subscriptions?: WorkspaceSubscription[]; nextPageToken?: string }>(
      this.env,
      this.sub,
      `${BASE}/subscriptions?filter=${encodeURIComponent(filter)}`,
    );
    return { subscriptions: out.subscriptions ?? [], nextPageToken: out.nextPageToken };
  }

  /** Get a subscription by resource name (`subscriptions/SUBSCRIPTION_ID`). */
  async getSubscription(name: string): Promise<WorkspaceSubscription> {
    return googleJson<WorkspaceSubscription>(this.env, this.sub, `${BASE}/${name}`);
  }

  /** Delete a subscription by resource name. */
  async deleteSubscription(name: string): Promise<{ ok: true }> {
    await googleFetch(this.env, this.sub, `${BASE}/${name}`, { method: "DELETE" });
    return { ok: true };
  }

  /** Reactivate a suspended subscription by resource name. */
  async reactivateSubscription(name: string): Promise<WorkspaceSubscription> {
    return googleJson<WorkspaceSubscription>(this.env, this.sub, `${BASE}/${name}:reactivate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
  }
}
