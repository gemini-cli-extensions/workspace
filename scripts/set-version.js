/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');
const path = require('node:path');

const rootDir = path.join(__dirname, '..');
const packageJsonPath = path.join(rootDir, 'package.json');
const workspaceServerPackageJsonPath = path.join(
  rootDir,
  'workspace-server',
  'package.json',
);
const workspaceServerIndexPath = path.join(
  rootDir,
  'workspace-server',
  'src',
  'index.ts',
);

const updateJsonFile = (filePath, version) => {
  try {
    const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    content.version = version;
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2) + '\n');
    console.log(
      `Updated ${path.relative(rootDir, filePath)} to version ${version}`,
    );
  } catch (error) {
    console.error(
      `Failed to update JSON file at ${path.relative(rootDir, filePath)}:`,
      error,
    );
    process.exit(1);
  }
};

const main = () => {
  let version = process.argv[2];

  if (version) {
    // If version is provided as arg, update root package.json first
    updateJsonFile(packageJsonPath, version);
  } else {
    // Otherwise read from root package.json
    const packageJson = require(packageJsonPath);
    version = packageJson.version;
    console.log(`Using version from package.json: ${version}`);
  }

  if (!version) {
    console.error('No version specified and no version found in package.json');
    process.exit(1);
  }

  updateJsonFile(workspaceServerPackageJsonPath, version);
};

main();
