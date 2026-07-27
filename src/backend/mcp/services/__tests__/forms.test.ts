import { describe, it, expect, vi, beforeEach } from "vitest";
import { FormsService } from "../forms";

let fetchSpy: any;
beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue(
    new Response(JSON.stringify({ formId: "f1", info: { title: "My Form" } }), { status: 200 }),
  );
});
vi.mock("../../tokenProvider", () => ({ getAccessToken: vi.fn(async () => "at") }));

describe("FormsService.create", () => {
  it("posts to /forms with info.title", async () => {
    const svc = new FormsService({} as any, "s1");
    const out = await svc.create("My Form");
    expect(out.formId).toBe("f1");
    const call = fetchSpy.mock.calls[0];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe("https://forms.googleapis.com/v1/forms");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    expect(body.info.title).toBe("My Form");
    expect(body.info.documentTitle).toBe("My Form");
  });
});

describe("FormsService.addQuestion", () => {
  it("builds a text question when no options are given", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const svc = new FormsService({} as any, "s1");
    await svc.addQuestion("f1", "What is your name?");
    const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const url = call[0] as string;
    const init = call[1] as RequestInit;
    expect(url).toBe("https://forms.googleapis.com/v1/forms/f1:batchUpdate");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body as string);
    const question = body.requests[0].createItem.item.questionItem.question;
    expect(question.textQuestion).toEqual({});
    expect(question.choiceQuestion).toBeUndefined();
    expect(body.requests[0].createItem.item.title).toBe("What is your name?");
  });

  it("builds a RADIO choice question when options are given", async () => {
    fetchSpy.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    const svc = new FormsService({} as any, "s1");
    await svc.addQuestion("f1", "Pick one", ["A", "B"], true, 2);
    const call = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
    const init = call[1] as RequestInit;
    const body = JSON.parse(init.body as string);
    const item = body.requests[0].createItem;
    const question = item.item.questionItem.question;
    expect(question.required).toBe(true);
    expect(question.choiceQuestion.type).toBe("RADIO");
    expect(question.choiceQuestion.options).toEqual([{ value: "A" }, { value: "B" }]);
    expect(question.textQuestion).toBeUndefined();
    expect(item.location.index).toBe(2);
  });
});

describe("FormsService.listResponses", () => {
  it("gets responses for a form", async () => {
    fetchSpy.mockResolvedValue(
      new Response(JSON.stringify({ responses: [{ responseId: "r1" }] }), { status: 200 }),
    );
    const svc = new FormsService({} as any, "s1");
    const out = await svc.listResponses("f1");
    expect(out.responses).toEqual([{ responseId: "r1" }]);
    const url = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1][0] as string;
    expect(url).toBe("https://forms.googleapis.com/v1/forms/f1/responses");
  });
});
