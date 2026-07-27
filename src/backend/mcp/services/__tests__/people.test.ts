import { describe, it, expect, vi, beforeEach } from "vitest";
import { PeopleService } from "../people";

let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ resourceName: "people/c123", names: [{ displayName: "A" }] }), { status: 200 }),
  );
});
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("PeopleService.getContact", () => {
  it("gets a contact with personFields", async () => {
    const svc = new PeopleService({} as any, "s1");
    const out = await svc.getContact("people/c123");
    expect(out.resourceName).toBe("people/c123");
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain("https://people.googleapis.com/v1/people/c123");
    expect(decodeURIComponent(url)).toContain("personFields=names,emailAddresses,phoneNumbers,organizations");
  });
});

describe("PeopleService.listConnections", () => {
  it("hits connections endpoint with sortOrder", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ connections: [{ resourceName: "people/c1" }], nextPageToken: "np" }), { status: 200 }),
    );
    const svc = new PeopleService({} as any, "s1");
    const out = await svc.listConnections(10);
    expect(out.connections[0].resourceName).toBe("people/c1");
    const url = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(url).toContain("https://people.googleapis.com/v1/people/me/connections");
    expect(decodeURIComponent(url)).toContain("sortOrder=LAST_MODIFIED_DESCENDING");
    expect(url).toContain("pageSize=10");
  });
});

describe("PeopleService.searchContacts", () => {
  it("searches with query and readMask", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ results: [{ person: { resourceName: "people/c1" } }] }), { status: 200 }),
    );
    const svc = new PeopleService({} as any, "s1");
    const out = await svc.searchContacts("jane");
    expect(out.results[0].person.resourceName).toBe("people/c1");
    const url = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(url).toContain("https://people.googleapis.com/v1/people:searchContacts");
    expect(decodeURIComponent(url)).toContain("query=jane");
    expect(decodeURIComponent(url)).toContain("readMask=names,emailAddresses");
  });
});

describe("PeopleService.createContact", () => {
  it("posts to people:createContact with the person body", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ resourceName: "people/c9" }), { status: 200 }),
    );
    const svc = new PeopleService({} as any, "s1");
    const person = { names: [{ givenName: "Jane", familyName: "Doe" }], emailAddresses: [{ value: "jane@x.com" }] };
    const out = await svc.createContact(person);
    expect(out.resourceName).toBe("people/c9");
    const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toContain("https://people.googleapis.com/v1/people:createContact");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.names[0].givenName).toBe("Jane");
    expect(body.emailAddresses[0].value).toBe("jane@x.com");
  });
});
