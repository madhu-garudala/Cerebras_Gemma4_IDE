import { NextRequest, NextResponse } from "next/server";
import fs from "node:fs/promises";
import { getProjectRoot, resolveSafe } from "../lib/path-jail";

const MAX_FILE_BYTES = 5 * 1024 * 1024; // 5 MB read cap

export async function GET(request: NextRequest) {
  try {
    const root = getProjectRoot();
    const relPath = request.nextUrl.searchParams.get("path");

    if (!relPath) {
      return NextResponse.json({ error: "Missing path query parameter" }, { status: 400 });
    }
    if (typeof relPath !== "string" || relPath.trim() === "") {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }

    const absPath = await resolveSafe(root, relPath);
    const stat = await fs.stat(absPath);

    if (!stat.isFile()) {
      return NextResponse.json({ error: "Not a file" }, { status: 400 });
    }
    if (stat.size > MAX_FILE_BYTES) {
      return NextResponse.json(
        { error: `File too large (${stat.size} bytes; limit ${MAX_FILE_BYTES})` },
        { status: 413 }
      );
    }

    const content = await fs.readFile(absPath, "utf-8");
    return NextResponse.json({ content });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Path escapes project root" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: NextRequest) {
  try {
    const root = getProjectRoot();
    const body = await request.json();
    const { path: relPath, content } = body;

    if (typeof relPath !== "string" || relPath.trim() === "") {
      return NextResponse.json({ error: "Invalid path" }, { status: 400 });
    }
    if (typeof content !== "string") {
      return NextResponse.json({ error: "content must be a string" }, { status: 400 });
    }

    const absPath = await resolveSafe(root, relPath);
    await fs.writeFile(absPath, content, "utf-8");
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    const status = message === "Path escapes project root" ? 403 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
