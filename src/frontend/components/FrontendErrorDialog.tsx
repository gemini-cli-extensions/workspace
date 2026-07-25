import { AlertCircleIcon, CheckIcon, CopyIcon } from "lucide-react";

import type { FrontendErrorState } from "@/lib/error-handler";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type FrontendErrorDialogProps = {
  error: FrontendErrorState | null;
  copyState: "idle" | "copied";
  onCopyPrompt: () => Promise<void>;
  onOpenChange: (open: boolean) => void;
};

export function FrontendErrorDialog({
  error,
  copyState,
  onCopyPrompt,
  onOpenChange,
}: FrontendErrorDialogProps) {
  return (
    <AlertDialog open={Boolean(error)} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-2xl">
        <AlertDialogHeader>
          <AlertDialogMedia className="bg-destructive/10 text-destructive">
            <AlertCircleIcon className="size-8" />
          </AlertDialogMedia>
          <AlertDialogTitle>Something needs attention</AlertDialogTitle>
          <AlertDialogDescription>
            {error?.errorDetails.friendlyError ?? "An unexpected frontend error occurred."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {error ? (
          <div className="space-y-3 rounded-lg border border-border bg-muted/40 p-4 text-sm">
            <div>
              <p className="font-medium">Source page</p>
              <p className="text-muted-foreground">
                {error.sourcePage.file} — {error.sourcePage.url}
              </p>
            </div>
            <div>
              <p className="font-medium">Code source</p>
              <p className="text-muted-foreground">
                {error.codeSource.file} / {error.codeSource.functionName}
              </p>
              <p className="text-muted-foreground">{error.codeSource.description}</p>
            </div>
            <div>
              <p className="font-medium">Server error</p>
              <pre className="max-h-56 overflow-auto whitespace-pre-wrap break-words rounded-md bg-background p-3 text-xs">
                {typeof error.errorDetails.serverError === "string"
                  ? error.errorDetails.serverError
                  : JSON.stringify(error.errorDetails.serverError, null, 2)}
              </pre>
            </div>
          </div>
        ) : null}

        <AlertDialogFooter>
          <AlertDialogAction type="button" variant="outline" onClick={() => void onCopyPrompt()}>
            {copyState === "copied" ? (
              <CheckIcon className="size-4" />
            ) : (
              <CopyIcon className="size-4" />
            )}
            {copyState === "copied" ? "Copied" : "Copy fix prompt"}
          </AlertDialogAction>
          <AlertDialogCancel type="button" onClick={() => onOpenChange(false)}>
            Dismiss
          </AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
