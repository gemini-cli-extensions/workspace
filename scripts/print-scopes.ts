/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Prints the OAuth scopes that should be registered on the GCP consent
 * screen, one per line. Sourced from FEATURE_GROUPS so the registration
 * list and the runtime request list cannot drift.
 *
 * Used by scripts/setup-gcp.sh.
 */

import { getAllPossibleScopes } from '../workspace-server/src/features/feature-config';

for (const scope of getAllPossibleScopes()) {
  console.log(scope);
}
