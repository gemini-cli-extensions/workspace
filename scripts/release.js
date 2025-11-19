/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

const fs = require('node:fs');
const path = require('node:path');
const archiver = require('archiver');
const argv = require('minimist')(process.argv.slice(2));

const deleteFilesByExtension = (dir, ext) => {
  if (!fs.existsSync(dir)) {
    return;
  }

  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.lstatSync(filePath);
    if (stat.isDirectory()) {
      deleteFilesByExtension(filePath, ext);
    } else if (filePath.endsWith(ext)) {
      fs.unlinkSync(filePath);
    }
  }
};

const main = async () => {
  const platform = argv.platform;
  if (platform && typeof platform !== 'string') {
    console.error(
      'Error: The --platform argument must be a string (e.g., --platform=linux).'
    );
    process.exit(1);
  }
  const baseName = 'google-workspace-extension';
  const name = platform ? `${platform}.${baseName}` : baseName;
  const extension = 'tar.gz';

  const rootDir = path.join(__dirname, '..');
  const releaseDir = path.join(rootDir, 'release');
  fs.rmSync(releaseDir, { recursive: true, force: true });
  const archiveName = `${name}.${extension}`;
  const archiveDir = path.join(releaseDir, name);
  const workspaceMcpServerDir = path.join(rootDir, 'workspace-server');

  // Create the release directory
  fs.mkdirSync(releaseDir, { recursive: true });

  // Create the platform-specific directory
  fs.mkdirSync(archiveDir, { recursive: true });

  // Copy the dist directory
  fs.cpSync(
    path.join(workspaceMcpServerDir, 'dist'),
    path.join(archiveDir, 'dist'),
    { recursive: true }
  );

  // Clean up the dist directory
  const distDir = path.join(archiveDir, 'dist');
  deleteFilesByExtension(distDir, '.d.ts');
  deleteFilesByExtension(distDir, '.map');
  fs.rmSync(path.join(distDir, '__tests__'), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, 'auth'), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, 'services'), { recursive: true, force: true });
  fs.rmSync(path.join(distDir, 'utils'), { recursive: true, force: true });

  // Copy native modules and dependencies (keytar, jsdom)
  const nodeModulesDir = path.join(archiveDir, 'node_modules');
  fs.mkdirSync(nodeModulesDir, { recursive: true });
  
  const { getTransitiveDependencies } = require('./utils/dependencies');
  const visited = getTransitiveDependencies(rootDir, ['keytar', 'jsdom']);

  visited.forEach(pkg => {
    const source = path.join(rootDir, 'node_modules', pkg);
    const dest = path.join(nodeModulesDir, pkg);
    if (fs.existsSync(source)) {
      fs.cpSync(source, dest, { recursive: true });
    }
  });

  const version = process.env.GITHUB_REF_NAME || '0.0.1';

  // Generate the gemini-extension.json file
  const geminiExtensionJson = {
    name: 'google-workspace',
    version,
    contextFileName: 'WORKSPACE-Context.md',
    mcpServers: {
      'google-workspace': {
        command: 'node',
        args: ['dist/index.js'],
        cwd: '${extensionPath}',
      },
    },
  };
  fs.writeFileSync(
    path.join(archiveDir, 'gemini-extension.json'),
    JSON.stringify(geminiExtensionJson, null, 2)
  );

  // Copy the WORKSPACE-Context.md file
  fs.copyFileSync(
    path.join(workspaceMcpServerDir, 'WORKSPACE-Context.md'),
    path.join(archiveDir, 'WORKSPACE-Context.md')
  );

  // Copy the commands directory
  const commandsDir = path.join(rootDir, 'commands');
  if (fs.existsSync(commandsDir)) {
    fs.cpSync(commandsDir, path.join(archiveDir, 'commands'), { recursive: true });
  }


  // Create the archive
  const output = fs.createWriteStream(path.join(releaseDir, archiveName));
  const archive = archiver('tar', {
    gzip: true,
  });

  const archivePromise = new Promise((resolve, reject) => {
    output.on('close', function () {
      console.log(archive.pointer() + ' total bytes');
      console.log(
        'archiver has been finalized and the output file descriptor has closed.'
      );
      resolve();
    });

    archive.on('error', function (err) {
      reject(err);
    });
  });

  archive.pipe(output);
  archive.directory(archiveDir, false);
  archive.finalize();

  await archivePromise;
};

main().catch(err => {
    console.error(err);
    process.exit(1);
});
