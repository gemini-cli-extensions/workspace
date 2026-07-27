/**
 * @fileoverview Styled Plate element + leaf render components for the notes
 * editor. Every block/mark is mapped to a Monolith-dark, prose-like presentation
 * built from Tailwind utility classes only — no 1px borders (blockquote uses a
 * ring-style left accent; code blocks use `bg-muted`).
 *
 * These are shared by both the editable `PlateEditor` and the read-only
 * `PlateRenderer`, so saved notes render identically to how they were authored.
 */

import { type PlateElementProps, type PlateLeafProps, PlateElement, PlateLeaf } from "platejs/react";

import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// Block elements
// ---------------------------------------------------------------------------

/** Paragraph — the default block. */
export function ParagraphElement(props: PlateElementProps) {
  return (
    <PlateElement {...props} className={cn("mb-2 leading-7", props.className)}>
      {props.children}
    </PlateElement>
  );
}

/** Heading level 1. */
export function H1Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h1"
      {...props}
      className={cn("mt-4 mb-2 text-2xl font-semibold tracking-tight text-foreground", props.className)}
    >
      {props.children}
    </PlateElement>
  );
}

/** Heading level 2. */
export function H2Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h2"
      {...props}
      className={cn("mt-4 mb-2 text-xl font-semibold tracking-tight text-foreground", props.className)}
    >
      {props.children}
    </PlateElement>
  );
}

/** Heading level 3. */
export function H3Element(props: PlateElementProps) {
  return (
    <PlateElement
      as="h3"
      {...props}
      className={cn("mt-3 mb-1.5 text-base font-semibold tracking-tight text-foreground", props.className)}
    >
      {props.children}
    </PlateElement>
  );
}

/** Blockquote — left accent built from a ring, never a 1px border. */
export function BlockquoteElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="blockquote"
      {...props}
      className={cn(
        "my-3 rounded-r-md bg-muted/30 py-1.5 pr-3 pl-4 text-muted-foreground italic shadow-[inset_2px_0_0_0_var(--color-border)]",
        props.className,
      )}
    >
      {props.children}
    </PlateElement>
  );
}

/** Code block container — `bg-muted`, mono, no borders. */
export function CodeBlockElement(props: PlateElementProps) {
  return (
    <PlateElement
      as="pre"
      {...props}
      className={cn(
        "my-3 overflow-x-auto rounded-md bg-muted/60 p-3 font-mono text-sm leading-6 text-foreground ring-1 ring-border/40",
        props.className,
      )}
    >
      <code>{props.children}</code>
    </PlateElement>
  );
}

/** A single line within a code block. */
export function CodeLineElement(props: PlateElementProps) {
  return <PlateElement {...props}>{props.children}</PlateElement>;
}

/** Inline link — uses the primary color, underline on hover. */
export function LinkElement(props: PlateElementProps) {
  const element = props.element as { url?: string };
  return (
    <PlateElement
      as="a"
      {...props}
      attributes={{
        ...props.attributes,
        href: element.url,
        target: "_blank",
        rel: "noreferrer",
      }}
      className={cn(
        "cursor-pointer font-medium text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary",
        props.className,
      )}
    >
      {props.children}
    </PlateElement>
  );
}

// ---------------------------------------------------------------------------
// Leaf marks
// ---------------------------------------------------------------------------

/** Bold mark. */
export function BoldLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="strong" className="font-semibold">
      {props.children}
    </PlateLeaf>
  );
}

/** Italic mark. */
export function ItalicLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="em" className="italic">
      {props.children}
    </PlateLeaf>
  );
}

/** Underline mark. */
export function UnderlineLeaf(props: PlateLeafProps) {
  return (
    <PlateLeaf {...props} as="u" className="underline underline-offset-2">
      {props.children}
    </PlateLeaf>
  );
}
