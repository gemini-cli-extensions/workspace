import { describe, it, expect } from "vitest";
import { SCOPES, SCOPE_STRING } from "../scopes";

describe("scopes", () => {
  it("includes drive, docs, sheets, gmail + openid identity", () => {
    expect(SCOPES).toEqual(expect.arrayContaining([
      "openid", "email", "profile",
      "https://www.googleapis.com/auth/drive",
      "https://www.googleapis.com/auth/documents",
      "https://www.googleapis.com/auth/spreadsheets",
      "https://www.googleapis.com/auth/gmail.modify",
    ]));
    expect(SCOPE_STRING).toContain("spreadsheets");
  });
});
