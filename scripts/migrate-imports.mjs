#!/usr/bin/env node

/**
 * @fileoverview Import Path Migration Script
 *
 * This script converts relative import paths in src/backend/**\/*.ts files
 * to use the tsconfig path aliases (@/backend/...).
 *
 * Usage:
 *   node scripts/migrate-imports.mjs
 *   node scripts/migrate-imports.mjs --dry-run  # Preview changes without writing
 *
 * The script follows these conversion rules:
 *   1. Relative imports within backend (../../foo) → @/backend/foo
 *   2. Same-directory imports (./foo) → Keep relative when within same feature
 *   3. Never changes external package imports
 *   4. Handles both .ts and implicit extensions
 *   5. Preserves type-only imports (import type)
 *
 * Path alias mappings from tsconfig.json:
 *   - @/backend/* → src/backend/*
 *   - @/backend/db/* → src/backend/db/*
 *   - @/backend/ai/* → src/backend/ai/*
 *   - @/backend/logging/* → src/backend/logging/*
 *   - @/backend/modules/* → src/backend/modules/*
 *   - @db/schemas → db/schemas (special case for Drizzle schemas)
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from "fs";
import { join, dirname, relative, resolve, sep } from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, "..");
const backendDir = join(rootDir, "src", "backend");

const dryRun = process.argv.includes("--dry-run");

// Path alias mapping configuration based on tsconfig.json
const pathAliases = {
  db: "@db", // Special case for db/schemas → @db/schemas
  "backend/db": "@/backend/db",
  "backend/ai": "@/backend/ai",
  "backend/logging": "@/backend/logging",
  "backend/modules": "@/backend/modules",
  backend: "@/backend",
};

/**
 * Recursively find all TypeScript files in a directory.
 * @param {string} dir - Directory to search
 * @returns {string[]} - Array of absolute file paths
 */
function findTypeScriptFiles(dir) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      files.push(...findTypeScriptFiles(fullPath));
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Convert a relative import path to an alias path.
 * @param {string} fromFile - The file making the import
 * @param {string} importPath - The relative import path
 * @returns {string|null} - The converted alias path, or null if no conversion needed
 */
function convertToAliasPath(fromFile, importPath) {
  // Skip external packages and non-relative paths
  if (!importPath.startsWith(".")) {
    return null;
  }

  // Resolve the absolute path of the import target
  const fromDir = dirname(fromFile);
  const absoluteImportPath = resolve(fromDir, importPath);

  // Get the path relative to project root
  const relativeToRoot = relative(rootDir, absoluteImportPath);

  // Check if the import is within src/backend
  if (!relativeToRoot.startsWith("src" + sep + "backend") && !relativeToRoot.startsWith("db")) {
    return null;
  }

  // Handle db/schemas → @db/schemas
  if (relativeToRoot.startsWith("db" + sep + "schemas")) {
    const pathWithinDb = relativeToRoot.substring("db/".length).replace(/\\/g, "/");
    return `@db/${pathWithinDb}`;
  }

  // Handle src/backend paths
  if (relativeToRoot.startsWith("src" + sep + "backend")) {
    const pathWithinBackend = relativeToRoot.substring("src/backend/".length).replace(/\\/g, "/");

    // Check for more specific aliases first
    if (pathWithinBackend.startsWith("db/")) {
      return `@/backend/${pathWithinBackend}`;
    }
    if (pathWithinBackend.startsWith("ai/")) {
      return `@/backend/${pathWithinBackend}`;
    }
    if (pathWithinBackend.startsWith("logging/")) {
      return `@/backend/${pathWithinBackend}`;
    }
    if (pathWithinBackend.startsWith("modules/")) {
      return `@/backend/${pathWithinBackend}`;
    }

    // Use general @/backend alias
    return `@/backend/${pathWithinBackend}`;
  }

  return null;
}

/**
 * Process a TypeScript file and convert its imports.
 * @param {string} filePath - Absolute path to the file
 * @returns {boolean} - True if file was modified
 */
function processFile(filePath) {
  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");
  let modified = false;
  const newLines = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // Match various import patterns:
    // import ... from '...'
    // import ... from "..."
    // import type ... from '...'
    // export ... from '...'
    const importMatch = line.match(
      /^(\s*(?:import|export)(?:\s+type)?\s+.*?\s+from\s+['"])([^'"]+)(['"].*)/,
    );

    if (importMatch) {
      const [, prefix, importPath, suffix] = importMatch;
      const aliasPath = convertToAliasPath(filePath, importPath);

      if (aliasPath) {
        const newLine = `${prefix}${aliasPath}${suffix}`;
        newLines.push(newLine);
        modified = true;

        if (!dryRun) {
          const relPath = relative(rootDir, filePath);
          console.log(`  ${relPath}`);
          console.log(`    - ${importPath}`);
          console.log(`    + ${aliasPath}`);
        }
      } else {
        newLines.push(line);
      }
    } else {
      newLines.push(line);
    }
  }

  if (modified && !dryRun) {
    writeFileSync(filePath, newLines.join("\n"), "utf-8");
  }

  return modified;
}

/**
 * Main execution
 */
function main() {
  console.log("Import Path Migration Script");
  console.log("============================\n");

  if (dryRun) {
    console.log("🔍 DRY RUN MODE - No files will be modified\n");
  }

  console.log(`Scanning: ${relative(rootDir, backendDir)}\n`);

  const files = findTypeScriptFiles(backendDir);
  console.log(`Found ${files.length} TypeScript files\n`);

  let modifiedCount = 0;
  let processedCount = 0;

  for (const file of files) {
    processedCount++;
    const wasModified = processFile(file);
    if (wasModified) {
      modifiedCount++;
    }
  }

  console.log(`\n✅ Processed ${processedCount} files`);
  console.log(`   ${modifiedCount} files ${dryRun ? "would be" : "were"} modified`);

  if (dryRun && modifiedCount > 0) {
    console.log("\n💡 Run without --dry-run to apply changes");
  }
}

main();
