#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const ROOT_DIR = path.resolve(__dirname, '..');
const PACKAGE_JSON_PATH = path.join(ROOT_DIR, 'package.json');
const PACKAGE_LOCK_PATH = path.join(ROOT_DIR, 'package-lock.json');

// Helper to run shell commands safely
function runCmd(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'pipe',
      ...options,
    }).trim();
  } catch (err) {
    if (options.ignoreError) return null;
    throw err;
  }
}

function askQuestion(rl, query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

// Parse semver string: [major, minor, patch, prerelease]
function parseSemver(str) {
  const match = str.trim().match(/^v?(\d+)\.(\d+)\.(\d+)(?:-([a-zA-Z0-9.-]+))?$/);
  if (!match) return null;
  return {
    raw: str,
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] || null,
  };
}

function compareSemver(a, b) {
  if (a.major !== b.major) return a.major - b.major;
  if (a.minor !== b.minor) return a.minor - b.minor;
  if (a.patch !== b.patch) return a.patch - b.patch;
  if (!a.prerelease && b.prerelease) return 1;
  if (a.prerelease && !b.prerelease) return -1;
  return 0;
}

async function main() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log('===================================================');
  console.log('            CADLite Release & Tag Helper           ');
  console.log('===================================================\n');

  // 1. Verify Git
  try {
    runCmd('git --version', { silent: true });
  } catch {
    console.error('[ERROR] Git is not installed or not in PATH.');
    rl.close();
    process.exit(1);
  }

  // 2. Fetch latest tags from remote
  process.stdout.write('Fetching tags from remote origin... ');
  try {
    runCmd('git fetch --tags origin', { silent: true });
    console.log('Done.');
  } catch {
    console.log('[WARN] Could not fetch remote tags. Continuing with local tags.');
  }

  // 3. Check Git branch & working tree
  const currentBranch = runCmd('git rev-parse --abbrev-ref HEAD', { ignoreError: true }) || 'unknown';
  if (currentBranch !== 'main' && currentBranch !== 'master') {
    console.log(`\n[WARNING] You are currently on branch '${currentBranch}', not 'main'.`);
    const proceed = await askQuestion(rl, 'Do you still want to proceed with releasing from this branch? (y/N): ');
    if (proceed.trim().toLowerCase() !== 'y') {
      console.log('Release aborted.');
      rl.close();
      return;
    }
  }

  const gitStatus = runCmd('git status --porcelain', { ignoreError: true });
  if (gitStatus && gitStatus.length > 0) {
    console.log('\n[WARNING] You have uncommitted changes:');
    console.log(gitStatus);
    const proceed = await askQuestion(rl, 'Do you want to proceed anyway? (y/N): ');
    if (proceed.trim().toLowerCase() !== 'y') {
      console.log('Release aborted.');
      rl.close();
      return;
    }
  }

  // 4. Read package.json version
  if (!fs.existsSync(PACKAGE_JSON_PATH)) {
    console.error('[ERROR] package.json not found in project root.');
    rl.close();
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(PACKAGE_JSON_PATH, 'utf-8'));
  const currentPkgVersion = pkg.version || '0.1.0';
  const pkgSemver = parseSemver(currentPkgVersion) || { major: 0, minor: 1, patch: 0 };

  // 5. Detect latest Git release tag
  const rawTags = runCmd('git tag -l', { silent: true }) || '';
  const tagList = rawTags.split(/\r?\n/).filter(Boolean);

  const parsedTags = tagList
    .map((tag) => ({ tag, semver: parseSemver(tag) }))
    .filter((item) => item.semver !== null)
    .sort((a, b) => compareSemver(a.semver, b.semver));

  let latestTag = parsedTags.length > 0 ? parsedTags[parsedTags.length - 1] : null;

  // Determine base semver: the highest between latest tag semver and package.json version
  let baseSemver = { ...pkgSemver };
  if (latestTag && compareSemver(latestTag.semver, baseSemver) > 0) {
    baseSemver = { ...latestTag.semver };
  }

  const baseVersionStr = `${baseSemver.major}.${baseSemver.minor}.${baseSemver.patch}`;

  console.log('\n---------------------------------------------------');
  console.log(`Current package.json version:  ${currentPkgVersion}`);
  console.log(`Latest Git tag found:          ${latestTag ? latestTag.tag : 'None'}`);
  console.log(`Base version for increment:    ${baseVersionStr}`);
  console.log('---------------------------------------------------\n');

  // 6. Calculate next versions
  const nextPatch = `${baseSemver.major}.${baseSemver.minor}.${baseSemver.patch + 1}`;
  const nextMinor = `${baseSemver.major}.${baseSemver.minor + 1}.0`;
  const nextMajor = `${baseSemver.major + 1}.0.0`;

  console.log('Select version increment:');
  console.log(`  1) Patch:  ${nextPatch}   (Bug fixes, patches)`);
  console.log(`  2) Minor:  ${nextMinor}   (New features, backwards-compatible)`);
  console.log(`  3) Major:  ${nextMajor}   (Breaking changes, major release)`);
  console.log('  4) Custom version');
  console.log('  5) Cancel\n');

  const choice = (await askQuestion(rl, 'Enter your choice (1-5): ')).trim();

  let newVersion = null;
  if (choice === '1') {
    newVersion = nextPatch;
  } else if (choice === '2') {
    newVersion = nextMinor;
  } else if (choice === '3') {
    newVersion = nextMajor;
  } else if (choice === '4') {
    while (!newVersion) {
      const custom = (await askQuestion(rl, 'Enter custom version (e.g. 0.2.1): ')).trim().replace(/^v/, '');
      if (parseSemver(custom)) {
        newVersion = custom;
      } else {
        console.log('[ERROR] Invalid semantic version format. Format must be X.Y.Z (e.g. 1.0.0).');
      }
    }
  } else {
    console.log('Release cancelled.');
    rl.close();
    return;
  }

  const newTag = `v${newVersion}`;

  // Check if tag already exists
  if (tagList.includes(newTag)) {
    console.error(`\n[ERROR] Git tag '${newTag}' already exists! Aborting.`);
    rl.close();
    process.exit(1);
  }

  // 7. Confirmation
  console.log('\n===================================================');
  console.log('               Release Confirmation                ');
  console.log('===================================================');
  console.log(`Target Version:  ${newVersion}`);
  console.log(`Git Tag:         ${newTag}`);
  console.log('\nThis will perform:');
  console.log(`  1. Update version to ${newVersion} in package.json & package-lock.json`);
  console.log(`  2. Git commit: 'chore(release): ${newTag}'`);
  console.log(`  3. Create annotated tag: '${newTag}'`);
  console.log(`  4. Push commit and tag to origin`);
  console.log(`  5. GitHub Actions will trigger and create the GitHub Release with .exe installer`);
  console.log('===================================================\n');

  const confirm = (await askQuestion(rl, `Proceed with releasing ${newTag}? (y/N): `)).trim().toLowerCase();
  if (confirm !== 'y') {
    console.log('Release cancelled.');
    rl.close();
    return;
  }

  rl.close();

  console.log('\n[1/5] Updating package.json...');
  pkg.version = newVersion;
  fs.writeFileSync(PACKAGE_JSON_PATH, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');

  if (fs.existsSync(PACKAGE_LOCK_PATH)) {
    console.log('[2/5] Updating package-lock.json...');
    const lock = JSON.parse(fs.readFileSync(PACKAGE_LOCK_PATH, 'utf-8'));
    lock.version = newVersion;
    if (lock.packages && lock.packages['']) {
      lock.packages[''].version = newVersion;
    }
    fs.writeFileSync(PACKAGE_LOCK_PATH, JSON.stringify(lock, null, 2) + '\n', 'utf-8');
  } else {
    console.log('[2/5] No package-lock.json found. Skipping.');
  }

  console.log('[3/5] Committing changes...');
  runCmd('git add package.json package-lock.json', { ignoreError: true });
  runCmd(`git commit -m "chore(release): ${newTag}"`);

  console.log(`[4/5] Creating annotated git tag ${newTag}...`);
  runCmd(`git tag -a ${newTag} -m "Release ${newTag}"`);

  console.log('[5/5] Pushing to GitHub (branch & tag)...');
  try {
    runCmd('git push origin HEAD');
    runCmd(`git push origin ${newTag}`);
  } catch (err) {
    console.error('\n[ERROR] Failed to push to remote:');
    console.error(err.message);
    process.exit(1);
  }

  console.log('\n===================================================');
  console.log(`🎉 Successfully released and pushed tag ${newTag}!`);
  console.log('GitHub Actions has been triggered to build the installer.');
  console.log('You can track build progress and download the release at:');
  console.log('  Actions:  https://github.com/riyazpanarwala/cadlite/actions');
  console.log('  Releases: https://github.com/riyazpanarwala/cadlite/releases');
  console.log('===================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL ERROR]', err);
  process.exit(1);
});
