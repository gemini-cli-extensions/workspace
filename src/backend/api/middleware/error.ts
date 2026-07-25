import type { ErrorHandler } from "hono";
import type { ContentfulStatusCode } from "hono/utils/http-status";

export const errorHandler: ErrorHandler<{
  Bindings: Env;
  Variables: { authed: boolean };
}> = (error, c) => {
  const status = (
    "status" in error && typeof error.status === "number" ? error.status : 500
  ) as ContentfulStatusCode;
  const isServerError = status >= 500;
  const environment = "ENVIRONMENT" in c.env ? c.env.ENVIRONMENT : "production";
  const message =
    isServerError && environment === "production" ? "Internal server error" : error.message;

  console.error(
    JSON.stringify({
      level: isServerError ? "ERROR" : "WARN",
      message: error.message,
      stack: error.stack,
      path: c.req.path,
    }),
  );

  return c.json({ error: message }, status);
};
