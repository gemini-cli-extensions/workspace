import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";

const clientErrorBody = z.object({
  message: z.string(),
  stack: z.string().optional(),
  url: z.string().optional(),
  userAgent: z.string().optional(),
});

export const clientErrorRouter = new OpenAPIHono<{ Bindings: Env }>();

clientErrorRouter.openapi(
  createRoute({
    method: "post",
    path: "/",
    operationId: "clientErrorCreate",
    request: { body: { content: { "application/json": { schema: clientErrorBody } } } },
    responses: {
      202: {
        description: "Logged client error",
        content: { "application/json": { schema: z.object({ ok: z.boolean() }) } },
      },
    },
  }),
  async (c) => {
    const body = c.req.valid("json");
    console.error(JSON.stringify({ level: "ERROR", source: "client", ...body }));

    return c.json({ ok: true }, 202);
  },
);
