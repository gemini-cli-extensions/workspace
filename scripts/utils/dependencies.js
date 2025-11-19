/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');
const path = require('node:path');

/**
 * Gets the direct dependencies of a package from its package.json.
 * @param {string} rootDir - The root directory containing node_modules.
 * @param {string} pkgName - The name of the package.
 * @returns {string[]} - A list of dependency names.
 */
function getDependencies(rootDir, pkgName) {
  const pkgPath = path.join(rootDir, 'node_modules', pkgName, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return [];
  }
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
  return Object.keys(pkg.dependencies || {});
}

/**
 * Recursively finds all transitive dependencies for a list of packages.
 * @param {string} rootDir - The root directory containing node_modules.
 * @param {string[]} startPkgs - The list of initial packages to resolve.
 * @returns {Set<string>} - A set of all transitive dependencies (including startPkgs).
 */
function getTransitiveDependencies(rootDir, startPkgs) {
  const visited = new Set();
  const toVisit = [...startPkgs];

  while (toVisit.length > 0) {
    const pkg = toVisit.pop();
    if (visited.has(pkg)) continue;
    visited.add(pkg);

    const deps = getDependencies(rootDir, pkg);
    deps.forEach(dep => {
      if (!visited.has(dep)) {
        toVisit.push(dep);
      }
    });
  }

  return visited;
}

module.exports = {
  getDependencies,
  getTransitiveDependencies
};
