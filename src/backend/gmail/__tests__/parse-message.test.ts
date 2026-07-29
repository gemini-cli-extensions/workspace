import { describe, it, expect } from "vitest";

import { splitAddresses, parseAddress, extractBodyText, parseRawMessage } from "../parse-message";

describe("splitAddresses", () => {
  it("splits on top-level commas, not inside quotes/angles", () => {
    expect(splitAddresses('John Doe <j@x.com>, "Smith, Jane" <jane@y.com>')).toEqual([
      "John Doe <j@x.com>",
      '"Smith, Jane" <jane@y.com>',
    ]);
  });
});

describe("parseAddress", () => {
  it("name + email", () => {
    expect(parseAddress("John Doe <J@X.com>")).toEqual({ firstName: "John", lastName: "Doe", email: "j@x.com" });
  });
  it("bare email", () => {
    expect(parseAddress("a@b.com")).toEqual({ firstName: null, lastName: null, email: "a@b.com" });
  });
  it("Last, First quoted", () => {
    expect(parseAddress('"Doe, John" <j@x.com>')).toEqual({ firstName: "John", lastName: "Doe", email: "j@x.com" });
  });
  it("rejects non-addresses", () => {
    expect(parseAddress("not an address")).toBeNull();
  });
});

describe("extractBodyText", () => {
  const b64 = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_");
  it("prefers text/plain in a multipart tree", () => {
    const payload = {
      mimeType: "multipart/alternative",
      parts: [
        { mimeType: "text/html", body: { data: b64("<b>hi</b>") } },
        { mimeType: "text/plain", body: { data: b64("hi plain") } },
      ],
    };
    expect(extractBodyText(payload)).toBe("hi plain");
  });
});

describe("parseRawMessage", () => {
  it("extracts thread/subject/contacts/body from raw", () => {
    const raw = {
      id: "m1",
      threadId: "t1",
      snippet: "hello",
      internalDate: "1700000000000",
      labelIds: ["Label_1"],
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Hi there" },
          { name: "From", value: "John Doe <john@x.com>" },
          { name: "To", value: "a@b.com, C D <cd@e.com>" },
          { name: "Cc", value: "cc@z.com" },
        ],
        body: { data: btoa("body!").replace(/\+/g, "-").replace(/\//g, "_") },
      },
    };
    const p = parseRawMessage(raw);
    expect(p.subject).toBe("Hi there");
    expect(p.threadId).toBe("t1");
    expect(p.bodyText).toBe("body!");
    expect(p.contacts).toHaveLength(4);
    expect(p.contacts.filter((c) => c.type === "to")).toHaveLength(2);
    expect(p.contacts.find((c) => c.type === "cc")?.email).toBe("cc@z.com");
    expect(p.contacts.find((c) => c.type === "from")).toMatchObject({ firstName: "John", lastName: "Doe" });
  });
});
