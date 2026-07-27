import { ArrowRightIcon, FileTextIcon, RefreshCwIcon, SparklesIcon } from "lucide-react";
import * as React from "react";

import { CopyButton } from "@/components/CopyButton";
import { FrontendErrorDialog } from "@/components/FrontendErrorDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { type FrontendErrorPayload, useFrontendErrorHandler } from "@/lib/error-handler";
import { TEMPLATE_FRONTEND_REPLACEMENT_PROMPT } from "@/lib/template-prompts";

type TemplateLandingPageProps = {
  currentPath: string;
};

const pageFile = "src/frontend/components/TemplateLandingPage.tsx";

function createErrorPayload(
  currentUrl: string,
  functionName: string,
  description: string,
  friendlyError: string,
  serverError: unknown,
): FrontendErrorPayload {
  return {
    sourcePage: {
      url: currentUrl,
      file: "src/frontend/pages/index.astro",
    },
    codeSource: {
      file: pageFile,
      functionName,
      description,
    },
    errorDetails: {
      friendlyError,
      serverError,
    },
  };
}

export function TemplateLandingPage({ currentPath }: TemplateLandingPageProps) {
  const { activeError, clearError, copyErrorPrompt, copyState, handleError } =
    useFrontendErrorHandler();
  const [currentUrl, setCurrentUrl] = React.useState(currentPath);

  React.useEffect(() => {
    if (typeof window !== "undefined") {
      setCurrentUrl(window.location.href);
    }
  }, [currentPath]);

  const handleCopyError = React.useCallback(
    (error: unknown) => {
      handleError(
        createErrorPayload(
          currentUrl,
          "handleCopyError",
          "Handles copy-to-clipboard failures for the template replacement prompt.",
          "The template instructions could not be copied. Use the copy fix prompt action to pass the failure details back to your coding agent.",
          error,
        ),
      );
    },
    [currentUrl, handleError],
  );

  const openLinkSafely = React.useCallback(
    async (href: string) => {
      try {
        const openedWindow = window.open(href, "_blank", "noopener,noreferrer");

        if (!openedWindow) {
          throw new Error("The browser blocked the requested window.");
        }
      } catch (error) {
        handleError(
          createErrorPayload(
            currentUrl,
            "openLinkSafely",
            "Opens the dynamic API documentation links from the template landing page.",
            "The requested documentation link could not be opened from the template landing page.",
            { href, error },
          ),
        );
      }
    },
    [currentUrl, handleError],
  );

  return (
    <>
      <section className="container mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-6 py-10">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3 text-primary">
              <SparklesIcon className="size-5" />
              <p className="text-sm font-medium uppercase tracking-[0.2em]">
                Template follow-up required
              </p>
            </div>
            <CardTitle className="text-3xl font-semibold">
              If you're seeing this page, your worker URL routes are still pointing to template
              pages.
            </CardTitle>
            <CardDescription className="max-w-3xl text-base">
              Replace this landing page with your project's real frontend, keep the shared header
              visible on all pages, and preserve the dynamic docs endpoints at{" "}
              <code>/openapi.json</code>, <code>/swagger</code>, and <code>/scaler</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
            <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <FileTextIcon className="size-4" />
                Copy this instruction into your coding agent
              </div>
              <pre className="overflow-auto whitespace-pre-wrap rounded-lg bg-background p-4 text-sm leading-6 text-foreground ring-1 ring-border">
                {TEMPLATE_FRONTEND_REPLACEMENT_PROMPT}
              </pre>
            </div>
            <div className="space-y-3 rounded-xl border border-border bg-background p-4 ring-1 ring-border/60">
              <p className="text-sm font-medium">Template checklist</p>
              <ul className="space-y-2 text-sm text-muted-foreground">
                <li>• Replace this template page with your actual app pages.</li>
                <li>• Keep the shared navigation header rendered by the base layout.</li>
                <li>• Keep the docs endpoints linked in the header for quick access.</li>
                <li>• Route every frontend error through the centralized error handler.</li>
              </ul>
            </div>
          </CardContent>
          <CardFooter className="flex flex-col items-start justify-between gap-3 border-t pt-6 sm:flex-row sm:items-center">
            <CopyButton
              text={TEMPLATE_FRONTEND_REPLACEMENT_PROMPT}
              label="Copy agent instruction"
              copiedLabel="Instruction copied"
              onCopyError={handleCopyError}
            />
            <p className="text-sm text-muted-foreground">
              The button uses shadcn UI feedback only — no browser alerts.
            </p>
          </CardFooter>
        </Card>

        <div className="grid gap-4 md:grid-cols-3">
          {[
            {
              href: "/openapi.json",
              label: "OpenAPI JSON",
              description: "Machine-readable API schema exposed dynamically from the Worker.",
            },
            {
              href: "/swagger",
              label: "Swagger UI",
              description: "Interactive docs rendered from the same live OpenAPI definition.",
            },
            {
              href: "/scaler",
              label: "Scaler Docs",
              description: "Friendly docs route kept as a dynamic pointer for generated repos.",
            },
          ].map((item) => (
            <Card key={item.href} size="sm" className="h-full">
              <CardHeader>
                <CardTitle>{item.label}</CardTitle>
                <CardDescription>{item.description}</CardDescription>
              </CardHeader>
              <CardFooter className="border-t pt-4">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => void openLinkSafely(item.href)}
                >
                  Open
                  <ArrowRightIcon className="size-4" />
                </Button>
              </CardFooter>
            </Card>
          ))}
        </div>

        <Card size="sm">
          <CardHeader>
            <CardTitle>What stays in place</CardTitle>
            <CardDescription>
              The shared header remains available on every page so you always have a route back home
              plus fast access to the generated docs.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2 text-sm text-muted-foreground">
            <span className="rounded-md border border-border bg-muted/40 px-3 py-1">Home</span>
            <span className="rounded-md border border-border bg-muted/40 px-3 py-1">
              /openapi.json
            </span>
            <span className="rounded-md border border-border bg-muted/40 px-3 py-1">/swagger</span>
            <span className="rounded-md border border-border bg-muted/40 px-3 py-1">/scaler</span>
          </CardContent>
          <CardFooter className="border-t pt-4">
            <Button type="button" variant="ghost" onClick={() => void openLinkSafely("/")}>
              <RefreshCwIcon className="size-4" />
              Refresh home route
            </Button>
          </CardFooter>
        </Card>
      </section>

      <FrontendErrorDialog
        error={activeError}
        copyState={copyState}
        onCopyPrompt={copyErrorPrompt}
        onOpenChange={(open) => {
          if (!open) {
            clearError();
          }
        }}
      />
    </>
  );
}
