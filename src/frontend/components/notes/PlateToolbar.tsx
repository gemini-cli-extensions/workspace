/**
 * @fileoverview The notes editor toolbar — bold/italic/underline, H1–H3,
 * bulleted + numbered lists, blockquote, code block, and link.
 *
 * Buttons are built entirely from our base-ui shadcn primitives (`Button`,
 * `Separator`, `Tooltip`) — no Radix, no Plate "ui" registry components. Active
 * state is reflected via `aria-pressed` + the ghost button's pressed styling so
 * the toolbar reads correctly with keyboard + screen readers.
 *
 * All formatting is driven through the editor transforms:
 *   marks  → `editor.tf.toggleMark(key)`
 *   blocks → `editor.tf.toggleBlock(type)`        (heading / blockquote / code)
 *   lists  → `useListToolbarButton({ nodeType })` (indent-based ListPlugin)
 *   link   → `triggerFloatingLink()`              (opens the floating URL input)
 */

import {
  BoldIcon,
  CodeIcon,
  Heading1Icon,
  Heading2Icon,
  Heading3Icon,
  ItalicIcon,
  LinkIcon,
  ListIcon,
  ListOrderedIcon,
  QuoteIcon,
  UnderlineIcon,
} from "lucide-react";
import { KEYS } from "platejs";
import { useEditorRef, useEditorSelector } from "platejs/react";
import { triggerFloatingLink } from "@platejs/link/react";
import { useListToolbarButton, useListToolbarButtonState } from "@platejs/list/react";

import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import type { ReactNode } from "react";

// ---------------------------------------------------------------------------
// Generic toolbar button
// ---------------------------------------------------------------------------

interface ToolButtonProps {
  label: string;
  icon: ReactNode;
  pressed?: boolean;
  onClick: () => void;
}

/** A single ghost, ring-based toolbar button with a tooltip + pressed state. */
function ToolButton({ label, icon, pressed, onClick }: ToolButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Button
            type="button"
            size="icon-sm"
            variant="ghost"
            aria-label={label}
            aria-pressed={pressed}
            // Prevent the editor from losing selection on mousedown.
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClick}
            className={cn(pressed && "bg-muted text-foreground")}
          >
            {icon}
          </Button>
        }
      />
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

// ---------------------------------------------------------------------------
// Mark + block buttons (selection-aware)
// ---------------------------------------------------------------------------

/** Toggle a leaf mark (bold/italic/underline). */
function MarkButton({ nodeType, label, icon }: { nodeType: string; label: string; icon: ReactNode }) {
  const editor = useEditorRef();
  const pressed = useEditorSelector(
    (ed) => Boolean(ed.api.marks()?.[nodeType]),
    [nodeType],
  );
  return (
    <ToolButton
      label={label}
      icon={icon}
      pressed={pressed}
      onClick={() => editor.tf.toggleMark(nodeType)}
    />
  );
}

/** Toggle a block type (heading/blockquote/code block). */
function BlockButton({ nodeType, label, icon }: { nodeType: string; label: string; icon: ReactNode }) {
  const editor = useEditorRef();
  const pressed = useEditorSelector(
    (ed) => ed.api.some({ match: { type: nodeType } }),
    [nodeType],
  );
  return (
    <ToolButton
      label={label}
      icon={icon}
      pressed={pressed}
      onClick={() => editor.tf.toggleBlock(nodeType)}
    />
  );
}

/** Toggle an indent-based list (bulleted / numbered). */
function ListButton({ nodeType, label, icon }: { nodeType: string; label: string; icon: ReactNode }) {
  const state = useListToolbarButtonState({ nodeType });
  const { props } = useListToolbarButton(state);
  return (
    <ToolButton
      label={label}
      icon={icon}
      pressed={state.pressed}
      onClick={() => props.onClick()}
    />
  );
}

/** Insert/edit a link via the floating link UI. */
function LinkButton() {
  const editor = useEditorRef();
  const pressed = useEditorSelector((ed) => ed.api.some({ match: { type: KEYS.link } }), []);
  return (
    <ToolButton
      label="Link"
      icon={<LinkIcon />}
      pressed={pressed}
      onClick={() => triggerFloatingLink(editor, { focused: true })}
    />
  );
}

// ---------------------------------------------------------------------------
// Toolbar
// ---------------------------------------------------------------------------

/** The full fixed toolbar rendered above the editable surface. */
export function PlateToolbar() {
  return (
    // A single shared tooltip provider keeps hover delays consistent.
    <TooltipProvider delay={300}>
      <div className="flex flex-wrap items-center gap-0.5 rounded-t-md bg-muted/30 px-1.5 py-1">
        <MarkButton nodeType={KEYS.bold} label="Bold" icon={<BoldIcon />} />
        <MarkButton nodeType={KEYS.italic} label="Italic" icon={<ItalicIcon />} />
        <MarkButton nodeType={KEYS.underline} label="Underline" icon={<UnderlineIcon />} />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <BlockButton nodeType={KEYS.h1} label="Heading 1" icon={<Heading1Icon />} />
        <BlockButton nodeType={KEYS.h2} label="Heading 2" icon={<Heading2Icon />} />
        <BlockButton nodeType={KEYS.h3} label="Heading 3" icon={<Heading3Icon />} />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <ListButton nodeType={KEYS.ul} label="Bulleted list" icon={<ListIcon />} />
        <ListButton nodeType={KEYS.ol} label="Numbered list" icon={<ListOrderedIcon />} />

        <Separator orientation="vertical" className="mx-1 h-5" />

        <BlockButton nodeType={KEYS.blockquote} label="Quote" icon={<QuoteIcon />} />
        <BlockButton nodeType={KEYS.codeBlock} label="Code block" icon={<CodeIcon />} />
        <LinkButton />
      </div>
    </TooltipProvider>
  );
}
