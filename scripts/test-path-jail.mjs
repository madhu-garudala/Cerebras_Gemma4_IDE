/**
 * Path-jail gate test. Run with: node scripts/test-path-jail.mjs
 * Exits 0 on pass, 1 on any failure.
 *
 * Covers:
 *  - Valid relative paths: assert resolved value is inside root
 *  - Plain traversal: ../  ../../
 *  - Absolute paths: /etc/passwd
 *  - Nested mid-path traversal: foo/../../bar
 *  - URL-decoded traversal: Next.js decodes params before route handlers see them,
 *    so test the decoded values (../../etc/passwd, /etc/passwd)
 *  - Symlink inside root pointing outside: must be rejected via fs.realpath
 */
import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";

// ── mirror of the production resolveSafe ─────────────────────────────────────

function assertInsideRoot(root, absPath) {
  const rel = path.relative(root, absPath);
  // rel === ".." → parent dir itself; startsWith("../") → traversal escape.
  // Do NOT reject names that merely start with ".." (e.g. "..%2fpasswd" is valid).
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error("Path escapes project root");
  }
}

async function resolveSafe(root, userPath) {
  if (path.isAbsolute(userPath)) throw new Error("Path escapes project root");

  const full = path.resolve(root, "." + path.sep + userPath);
  assertInsideRoot(root, full); // quick logical pre-check before hitting disk

  // Resolve root itself through symlinks (e.g. macOS /var → /private/var)
  const realRoot = await fs.realpath(root).catch(() => root);

  let realFull;
  try {
    realFull = await fs.realpath(full);
  } catch {
    let parent = path.dirname(full);
    let realParent;
    while (parent !== path.dirname(parent)) {
      try { realParent = await fs.realpath(parent); break; }
      catch { parent = path.dirname(parent); }
    }
    if (realParent) assertInsideRoot(realRoot, realParent);
    // Return path under realRoot so callers always get a consistent resolved form
    return path.join(realRoot, path.relative(root, full));
  }

  assertInsideRoot(realRoot, realFull);
  return realFull;
}

// ── test harness ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

async function ok(label, fn) {
  try {
    await fn();
    console.log(`  ✓ ${label}`);
    passed++;
  } catch (e) {
    console.error(`  ✗ ${label}: ${e.message}`);
    failed++;
  }
}

async function rejects(label, fn) {
  try {
    await fn();
    console.error(`  ✗ ${label}: expected throw but did not`);
    failed++;
  } catch {
    console.log(`  ✓ ${label}`);
    passed++;
  }
}

// ── tests ─────────────────────────────────────────────────────────────────────

const ROOT = await fs.mkdtemp(path.join(os.tmpdir(), "jail-test-root-"));
const OUTSIDE = await fs.mkdtemp(path.join(os.tmpdir(), "jail-test-outside-"));
// On macOS /var is a symlink to /private/var — resolve so value assertions work
const REAL_ROOT = await fs.realpath(ROOT);

try {
  // Create a real file inside root so realpath works for it
  await fs.writeFile(path.join(ROOT, "hello.ts"), "");

  console.log("\nPath-jail tests:");
  console.log(`  root      = ${ROOT}`);
  console.log(`  real_root = ${REAL_ROOT}`);
  console.log(`  outside   = ${OUTSIDE}\n`);

  // ── Valid paths: assert resolved value stays inside root ──────────────────
  await ok("simple file — resolves inside root", async () => {
    const r = await resolveSafe(ROOT, "hello.ts");
    assertInsideRoot(REAL_ROOT, r); // value assertion, not just no-throw
  });

  await ok("nested relative path — resolves inside root", async () => {
    const r = await resolveSafe(ROOT, "src/index.ts");
    if (!r.startsWith(REAL_ROOT)) throw new Error(`Got: ${r}`);
    assertInsideRoot(REAL_ROOT, r);
  });

  await ok("file in root dir — exact path match", async () => {
    const r = await resolveSafe(ROOT, "hello.ts");
    if (r !== path.join(REAL_ROOT, "hello.ts")) throw new Error(`Got: ${r}`);
  });

  // ── Traversal: must throw ────────────────────────────────────────────────
  await rejects("plain ../escape", () => resolveSafe(ROOT, "../secret"));
  await rejects("../../escape", () => resolveSafe(ROOT, "../../etc/passwd"));
  await rejects("nested mid-path foo/../../bar", () => resolveSafe(ROOT, "foo/../../bar"));

  // ── Absolute paths: must throw ───────────────────────────────────────────
  await rejects("absolute /etc/passwd", () => resolveSafe(ROOT, "/etc/passwd"));
  await rejects("absolute /Users/... path", () => resolveSafe(ROOT, "/Users/other/secret.txt"));

  // ── URL-decoded traversal ─────────────────────────────────────────────────
  // Next.js decodes URL params before route handlers see them.
  // These are the decoded values the handler actually receives.
  await rejects(
    "URL-decoded traversal: decodeURI('../') → ../",
    () => resolveSafe(ROOT, decodeURIComponent("..%2f..%2fetc%2fpasswd"))
  );
  await rejects(
    "URL-decoded absolute: decodeURI('%2Fetc%2Fpasswd') → /etc/passwd",
    () => resolveSafe(ROOT, decodeURIComponent("%2Fetc%2Fpasswd"))
  );
  // Raw (not-decoded) %2f is treated as a literal filename — safe, stays inside root
  await ok("raw (non-decoded) ..%2f stays inside root as literal filename", async () => {
    const r = await resolveSafe(ROOT, "..%2fpasswd");
    assertInsideRoot(REAL_ROOT, r);
  });

  // ── Symlink pointing outside root: must throw ─────────────────────────────
  const symlinkPath = path.join(ROOT, "evil-link");
  await fs.symlink(OUTSIDE, symlinkPath);
  await rejects(
    "symlink inside root pointing outside is rejected",
    () => resolveSafe(ROOT, "evil-link")
  );
  await fs.unlink(symlinkPath);

  // Symlink to a file inside root must be allowed
  await fs.writeFile(path.join(ROOT, "real-file.ts"), "");
  const goodLink = path.join(ROOT, "good-link.ts");
  await fs.symlink(path.join(ROOT, "real-file.ts"), goodLink);
  await ok("symlink inside root pointing inside root is allowed", async () => {
    const r = await resolveSafe(ROOT, "good-link.ts");
    assertInsideRoot(REAL_ROOT, r);
  });
  await fs.unlink(goodLink);

} finally {
  await fs.rm(ROOT, { recursive: true, force: true });
  await fs.rm(OUTSIDE, { recursive: true, force: true });
}

console.log(`\nResults: ${passed} passed, ${failed} failed\n`);
process.exit(failed > 0 ? 1 : 0);
