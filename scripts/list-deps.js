/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const path = require('node:path');
const { getTransitiveDependencies } = require('./utils/dependencies');

const root = path.join(__dirname, '..');
const targetPackages = process.argv.slice(2);

if (targetPackages.length === 0) {
  console.log('Usage: node scripts/list-deps.js <package1> [package2...]');
  process.exit(1);
}

console.log(`Analyzing dependencies for: ${targetPackages.join(', ')}`);

const allDeps = getTransitiveDependencies(root, targetPackages);

console.log('\nTransitive Dependencies:');
Array.from(allDeps).sort().forEach(dep => {
  console.log(`- ${dep}`);
});
