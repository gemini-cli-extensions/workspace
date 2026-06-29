/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { realpathSync } from 'node:fs';
import * as path from 'node:path';

/**
 * Optional filesystem allowlist for outgoing email attachments.
 *
 * When the `ATTACHMENT_ALLOWED_ROOTS` environment variable is set (a
 * `path.delimiter`-separated list of directories — `:` on POSIX, `;` on
 * Windows), every attachment `filePath` must
 * resolve — after symlinks are followed — inside one of those roots. This lets
 * an operator confine the set of files the server may read into an outgoing
 * message (e.g. only `/data/media:/tmp`) without changing the tool surface.
 *
 * When the variable is unset, no restriction is applied. This keeps the default
 * behaviour generic so the feature stays upstream-mergeable: deployments that
 * want a restriction opt in by setting the variable.
 *
 * Security properties:
 *  - `realpathSync` resolves symlinks on the candidate path BEFORE the
 *    containment check, so a symlink that lives inside an allowed root but
 *    points outside it is rejected (no symlink escape).
 *  - Containment uses `path.relative` so a sibling directory whose name shares
 *    a prefix with an allowed root (e.g. `/data/media-evil` vs `/data/media`)
 *    does NOT pass, and a root of `/` (or a drive root on Windows) is handled
 *    correctly.
 *  - A configured root that does not exist on disk is skipped with a warning
 *    rather than crashing the gate (`realpathSync` throws ENOENT on a missing
 *    path). If EVERY configured root is missing, the gate fails closed and
 *    rejects all paths, because setting the variable signals a deliberate
 *    restriction.
 *
 * @param filePath Absolute path of the file to attach.
 * @throws If a restriction is configured and `filePath` does not resolve inside
 *   any allowed root.
 */
export function assertWithinAllowedRoots(filePath: string): void {
  const raw = process.env.ATTACHMENT_ALLOWED_ROOTS;
  if (!raw) {
    // Unset → no restriction (upstream-generic default).
    return;
  }

  const configuredRoots = raw.split(path.delimiter).filter(Boolean);
  const resolvedRoots: string[] = [];
  for (const root of configuredRoots) {
    try {
      resolvedRoots.push(realpathSync(path.resolve(root)));
    } catch {
      // A missing/unreadable root must not brick the gate; skip it with a
      // warning and keep evaluating the remaining roots.
      console.warn(
        `ATTACHMENT_ALLOWED_ROOTS: skipping unresolvable root "${root}"`,
      );
    }
  }

  if (resolvedRoots.length === 0) {
    // The operator asked for a restriction but none of the roots exist — fail
    // closed rather than silently allowing every path.
    throw new Error(
      `Attachment path rejected: ATTACHMENT_ALLOWED_ROOTS is set but no configured root could be resolved: ${filePath}`,
    );
  }

  let real: string;
  try {
    real = realpathSync(path.resolve(filePath));
  } catch (err) {
    throw new Error(
      `Attachment path rejected: could not resolve real path for ${filePath}: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
  }

  const ok = resolvedRoots.some((root) => {
    const relative = path.relative(root, real);
    return !relative.startsWith('..') && !path.isAbsolute(relative);
  });
  if (!ok) {
    throw new Error(
      `Attachment path not within ATTACHMENT_ALLOWED_ROOTS: ${filePath}`,
    );
  }
}
