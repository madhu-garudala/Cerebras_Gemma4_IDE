import path from "node:path";
import fs from "node:fs/promises";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".next", ".turbo"]);

// Runtime-mutable root — starts from env var, can be changed via /api/fs/setroot
let _runtimeRoot: string | null = null;

export function getProjectRoot(): string {
  const root = _runtimeRoot ?? process.env.PROJECT_ROOT;
  if (!root) throw new Error("PROJECT_ROOT env var is not set");
  return root;
}

export async function setProjectRoot(newRoot: string): Promise<string> {
  const real = await fs.realpath(newRoot).catch(() => {
    throw new Error(`Directory not found: ${newRoot}`);
  });
  const stat = await fs.stat(real);
  if (!stat.isDirectory()) throw new Error(`Not a directory: ${newRoot}`);
  _runtimeRoot = real;
  return real;
}

function assertInsideRoot(root: string, absPath: string): void {
  const rel = path.relative(root, absPath);
  // rel === ".." → the path IS the parent dir; rel.startsWith("../") → escapes via traversal.
  // We do NOT flag names that merely start with ".." (e.g. "..%2fpasswd" is a valid filename).
  if (rel === ".." || rel.startsWith(".." + path.sep) || path.isAbsolute(rel)) {
    throw new Error("Path escapes project root");
  }
}

export async function resolveSafe(root: string, userPath: string): Promise<string> {
  // Client must always send relative paths — reject absolute paths immediately
  if (path.isAbsolute(userPath)) {
    throw new Error("Path escapes project root");
  }

  const full = path.resolve(root, "." + path.sep + userPath);
  assertInsideRoot(root, full); // quick logical pre-check before hitting disk

  // Resolve root itself through symlinks (e.g. macOS /var → /private/var)
  const realRoot = await fs.realpath(root).catch(() => root);

  // Resolve target through symlinks so a symlink pointing outside root is caught
  let realFull: string;
  try {
    realFull = await fs.realpath(full);
  } catch {
    // Target doesn't exist yet (write case) — check nearest existing ancestor
    let parent = path.dirname(full);
    let realParent: string | undefined;
    while (parent !== path.dirname(parent)) {
      try {
        realParent = await fs.realpath(parent);
        break;
      } catch {
        parent = path.dirname(parent);
      }
    }
    if (realParent) assertInsideRoot(realRoot, realParent);
    // Return path under realRoot so callers always get a consistent resolved form
    return path.join(realRoot, path.relative(root, full));
  }

  assertInsideRoot(realRoot, realFull);
  return realFull;
}

export { SKIP_DIRS };
