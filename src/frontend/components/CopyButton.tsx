import { CheckIcon, CopyIcon } from "lucide-react";
import * as React from "react";

import { Button } from "@/components/ui/button";

type CopyButtonProps = {
  text: string;
  label: string;
  copiedLabel?: string;
  onCopyError?: (error: unknown) => void;
};

export function CopyButton({ text, label, copiedLabel = "Copied", onCopyError }: CopyButtonProps) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = React.useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      onCopyError?.(error);
    }
  }, [onCopyError, text]);

  return (
    <Button type="button" variant={copied ? "secondary" : "default"} onClick={handleCopy}>
      {copied ? <CheckIcon className="size-4" /> : <CopyIcon className="size-4" />}
      {copied ? copiedLabel : label}
    </Button>
  );
}
