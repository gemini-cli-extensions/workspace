import * as React from "react";

const COPY_FEEDBACK_TIMEOUT_MS = 2000;

export type FrontendErrorPayload = {
  sourcePage: {
    url: string;
    file: string;
  };
  codeSource: {
    file: string;
    functionName: string;
    description: string;
  };
  errorDetails: {
    friendlyError: string;
    serverError: unknown;
  };
};

export type FrontendErrorState = FrontendErrorPayload & {
  occurredAt: string;
};

function stringifyServerError(serverError: unknown): string {
  if (serverError instanceof Error) {
    return JSON.stringify(
      {
        name: serverError.name,
        message: serverError.message,
        stack: serverError.stack,
      },
      null,
      2,
    );
  }

  try {
    return JSON.stringify(serverError, null, 2);
  } catch {
    return String(serverError);
  }
}

export function buildErrorAgentPrompt(error: FrontendErrorState): string {
  return [
    "A frontend error needs to be fixed in this Cloudflare Workers + Astro + shadcn/ui project.",
    "",
    `Source page URL: ${error.sourcePage.url}`,
    `Source page file: ${error.sourcePage.file}`,
    `Code source file: ${error.codeSource.file}`,
    `Function name: ${error.codeSource.functionName}`,
    `Function description: ${error.codeSource.description}`,
    `Friendly error shown to the user: ${error.errorDetails.friendlyError}`,
    "Server error payload received:",
    stringifyServerError(error.errorDetails.serverError),
    "",
    "Please diagnose the root cause, update the relevant frontend code, keep the shared header intact, and continue using the centralized frontend error handling utility with shadcn components only.",
  ].join("\n");
}

export function useFrontendErrorHandler() {
  const [activeError, setActiveError] = React.useState<FrontendErrorState | null>(null);
  const [copyState, setCopyState] = React.useState<"idle" | "copied">("idle");
  const timeoutRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const clearError = React.useCallback(() => {
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setActiveError(null);
    setCopyState("idle");
  }, []);

  const handleError = React.useCallback((payload: FrontendErrorPayload) => {
    const nextError: FrontendErrorState = {
      ...payload,
      occurredAt: new Date().toISOString(),
    };

    console.error("Frontend error handler:", nextError);
    setCopyState("idle");
    setActiveError(nextError);
  }, []);

  const copyErrorPrompt = React.useCallback(async () => {
    if (!activeError) {
      return;
    }

    try {
      await navigator.clipboard.writeText(buildErrorAgentPrompt(activeError));
      setCopyState("copied");
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = window.setTimeout(() => {
        setCopyState("idle");
        timeoutRef.current = null;
      }, COPY_FEEDBACK_TIMEOUT_MS);
    } catch (error) {
      const fallbackError: FrontendErrorState = {
        sourcePage: activeError.sourcePage,
        codeSource: {
          file: "src/frontend/lib/error-handler.tsx",
          functionName: "copyErrorPrompt",
          description: "Copies a coding-agent fix prompt for the active frontend error.",
        },
        errorDetails: {
          friendlyError:
            "The fix prompt could not be copied. Review the error details and try again from a supported clipboard context.",
          serverError: error,
        },
        occurredAt: new Date().toISOString(),
      };

      console.error("Frontend error handler:", fallbackError);
      setActiveError(fallbackError);
      setCopyState("idle");
    }
  }, [activeError]);

  return {
    activeError,
    copyState,
    clearError,
    copyErrorPrompt,
    handleError,
  };
}
