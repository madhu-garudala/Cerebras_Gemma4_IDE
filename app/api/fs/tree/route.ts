import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import path from "node:path";
import { getProjectRoot, resolveSafe, SKIP_DIRS } from "../lib/path-jail";

export interface FileNode {
  name: string;
  path: string;
  type: "file" | "folder";
  children?: FileNode[];
}

// List a single directory level — no recursion.
async function listDir(absDir: string, root: string): Promise<FileNode[]> {
  const entries = await fs.readdir(absDir, { withFileTypes: true });
  const nodes: FileNode[] = [];

  for (const entry of entries) {
    if (entry.name.startsWith(".") && entry.name !== ".env.local") continue;
    if (SKIP_DIRS.has(entry.name)) continue;

    const absPath = path.join(absDir, entry.name);
    const relPath = path.relative(root, absPath);

    if (entry.isDirectory()) {
      nodes.push({ name: entry.name, path: relPath, type: "folder" });
    } else if (entry.isFile()) {
      nodes.push({ name: entry.name, path: relPath, type: "file" });
    }
  }

  return nodes.sort((a, b) => {
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

export async function GET(request: NextRequest) {
  try {
    const root = getProjectRoot();
    const relPath = request.nextUrl.searchParams.get("path");

    let targetAbs: string;
    if (relPath) {
      targetAbs = await resolveSafe(root, relPath);
    } else {
      targetAbs = root;
    }

    const nodes = await listDir(targetAbs, root);
    return NextResponse.json(nodes);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
