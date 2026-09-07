import { readFile, readdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { findCommonChunk, transformExportHtml } from '../src/lib/build/commonPreload.mjs';

// This runs after Next's static export, when hashed filenames are final.
// POA_PRELOAD_COMMON=0 produces an unhinted comparison build.
const args = process.argv.slice(2);
let check = false;
let exportDir = path.resolve('out');
let manifestFile = path.resolve('.next/react-loadable-manifest.json');
for (let index = 0; index < args.length; index += 1) {
  if (args[index] === '--check') check = true;
  else if (['--export-dir', '--manifest-file'].includes(args[index]) && args[index + 1]) {
    const value = path.resolve(args[index + 1]);
    if (args[index] === '--export-dir') exportDir = value;
    else manifestFile = value;
    index += 1;
  } else throw new Error(`Unknown or incomplete option: ${args[index]}`);
}
async function htmlFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '_next') files.push(...await htmlFiles(file));
    } else if (entry.isFile() && entry.name.endsWith('.html')) files.push(file);
  }
  return files;
}
try {
  const enabled = process.env.POA_PRELOAD_COMMON !== '0';
  const manifest = enabled ? JSON.parse(await readFile(manifestFile, 'utf8')) : null;
  const chunk = enabled ? findCommonChunk(manifest) : null;
  if (enabled) await access(path.join(exportDir, '_next', chunk));
  const files = await htmlFiles(exportDir);
  // Validate all pages before writing any. A missing/ambiguous manifest or
  // malformed asset URL fails the build clearly, never leaving a partial patch.
  const plan = [];
  for (const file of files) {
    const before = await readFile(file, 'utf8');
    const result = transformExportHtml(before, chunk, { enabled, manifest });
    plan.push({ file, before, ...result });
  }
  // Validate every selected asset, including already-present scripts, before
  // any write. A stale manifest must not create partially patched exports.
  const assets = [...new Set(plan.flatMap((entry) => entry.assets || []))];
  await Promise.all(assets.map((asset) => access(path.join(exportDir, '_next', asset))));
  const changes = plan.filter((entry) => entry.before !== entry.html);
  if (check && changes.length) throw new Error(`${changes.length} exported page(s) do not match the expected preload policy.`);
  if (!check) for (const entry of changes) await writeFile(entry.file, entry.html);
  console.log(`[common-preload] ${check ? 'Checked' : 'Prepared'} ${files.length} pages; ${plan.filter((entry) => entry.hinted).length} eligible hints; ${changes.length} edits; ${enabled ? 'enabled' : 'disabled'}.`);
} catch (error) {
  console.error(`[common-preload] ${error.message}`);
  process.exitCode = 1;
}
