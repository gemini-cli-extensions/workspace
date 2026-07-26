/**
 * @fileoverview Ambient module declarations so skill `SKILL.md` documents can be
 * imported as raw strings (`import md from "./SKILL.md?raw"`) and bundled into
 * the Worker. The `?raw` suffix is handled by Vite/Astro at build time; this
 * declaration gives `tsc` the matching string type.
 */

declare module "*.md?raw" {
  const content: string;
  export default content;
}

declare module "*.md" {
  const content: string;
  export default content;
}
