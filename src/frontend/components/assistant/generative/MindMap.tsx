/**
 * @fileoverview Dark-themed mind-map canvas built on `mind-elixir`.
 *
 * Converts the assistant's `{ topic, children }` node tree into a
 * `MindElixirData` shape and renders it into a read-only mind-elixir instance.
 * The library manipulates the DOM directly, so this component is strictly
 * browser-only and mounts mind-elixir inside an effect against a ref'd div.
 *
 * Reusable on its own (export `MindMap`) — the `showMindmap` tool UI in
 * `MindMapCard.tsx` simply wraps it with the tool plumbing.
 */

"use client";

import * as React from "react";

import MindElixir, { type MindElixirData, type MindElixirInstance } from "mind-elixir";
import "mind-elixir/style";

import type { MindmapNode } from "./types";

/** Monotonic id source for mind-elixir nodes (it requires a stable id per node). */
function makeIdFactory() {
  let n = 0;
  return () => `me-${(n++).toString(36)}`;
}

/** Recursively convert an authored `MindmapNode` into a mind-elixir node. */
function toMindElixirNode(
  node: MindmapNode,
  nextId: () => string,
): MindElixirData["nodeData"] {
  return {
    id: nextId(),
    topic: node.topic,
    children: (node.children ?? []).map((child) => toMindElixirNode(child, nextId)),
  };
}

/** Build the full `MindElixirData` document from a root node. */
function toMindElixirData(root: MindmapNode): MindElixirData {
  const nextId = makeIdFactory();
  return { nodeData: toMindElixirNode(root, nextId) };
}

/** Props for {@link MindMap}. */
export interface MindMapProps {
  /** The root node of the authored mind map. */
  root: MindmapNode;
  /** Extra classes for the canvas container. */
  className?: string;
}

/**
 * Render a read-only, dark-themed mind map. Browser-only.
 */
export function MindMap({ root, className }: MindMapProps) {
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const instanceRef = React.useRef<MindElixirInstance | null>(null);

  React.useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const me = new MindElixir({
      el,
      direction: MindElixir.SIDE,
      editable: false,
      contextMenu: false,
      toolBar: false,
      keypress: false,
      draggable: false,
      // Dark theme matching the Monolith surface.
      theme: {
        name: "monolith-dark",
        type: "dark",
        palette: [
          "oklch(0.7 0.15 250)",
          "oklch(0.72 0.16 160)",
          "oklch(0.74 0.16 60)",
          "oklch(0.7 0.17 320)",
          "oklch(0.72 0.15 20)",
        ],
        cssVar: {
          "--main-color": "oklch(0.92 0.01 250)",
          "--main-bgcolor": "transparent",
          "--color": "oklch(0.88 0.01 250)",
          "--bgcolor": "transparent",
          "--root-color": "oklch(0.98 0 0)",
          "--root-bgcolor": "oklch(0.55 0.18 250)",
          "--panel-color": "oklch(0.9 0.01 250)",
          "--panel-bgcolor": "oklch(0.2 0.01 250)",
        },
      },
    });

    me.init(toMindElixirData(root));
    instanceRef.current = me;

    return () => {
      instanceRef.current?.destroy?.();
      instanceRef.current = null;
    };
  }, [root]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ width: "100%", height: "100%" }}
      aria-label="Mind map"
    />
  );
}
