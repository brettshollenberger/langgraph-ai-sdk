#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

const packages = [
  'packages/langgraph-ai-sdk-types',
  'packages/langgraph-ai-sdk',
  'packages/langgraph-ai-sdk-react'
];

function compareVersions(v1, v2) {
  const [major1, minor1, patch1] = v1.split('.').map(Number);
  const [major2, minor2, patch2] = v2.split('.').map(Number);

  if (major1 !== major2) return major1 - major2;
  if (minor1 !== minor2) return minor1 - minor2;
  return patch1 - patch2;
}

function bumpVersion(version, type) {
  const [major, minor, patch] = version.split('.').map(Number);

  switch (type) {
    case 'major':
      return `${major + 1}.0.0`;
    case 'minor':
      return `${major}.${minor + 1}.0`;
    case 'patch':
      return `${major}.${minor}.${patch + 1}`;
    default:
      throw new Error(`Unknown version type: ${type}`);
  }
}

const versionType = process.argv[2] || 'patch';

if (!['major', 'minor', 'patch'].includes(versionType)) {
  console.error('Usage: node version.mjs [major|minor|patch]');
  process.exit(1);
}

// Find the highest version across all packages
let highestVersion = '0.0.0';
for (const pkg of packages) {
  const pkgPath = join(rootDir, pkg, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (compareVersions(pkgJson.version, highestVersion) > 0) {
    highestVersion = pkgJson.version;
  }
}

const newVersion = bumpVersion(highestVersion, versionType);

console.log(`\nBumping ${versionType} version: ${highestVersion} → ${newVersion}\n`);

// Set all packages to the same new version
for (const pkg of packages) {
  const pkgPath = join(rootDir, pkg, 'package.json');
  const pkgJson = JSON.parse(readFileSync(pkgPath, 'utf8'));
  const oldVersion = pkgJson.version;

  pkgJson.version = newVersion;

  writeFileSync(pkgPath, JSON.stringify(pkgJson, null, 2) + '\n');

  console.log(`  ${pkgJson.name}: ${oldVersion} → ${newVersion}`);
}

console.log('\n✓ All packages synchronized to version ' + newVersion + '\n');
