import { NextRequest, NextResponse } from "next/server";
import { getProjectRoot, setProjectRoot } from "../lib/path-jail";

export async function GET() {
  try {
    return NextResponse.json({ root: getProjectRoot() });
  } catch {
    return NextResponse.json({ root: null });
  }
}

export async function POST(request: NextRequest) {
  try {
    const { path: newPath } = await request.json();
    if (typeof newPath !== "string" || !newPath.trim()) {
      return NextResponse.json({ error: "path is required" }, { status: 400 });
    }
    const real = await setProjectRoot(newPath.trim());
    return NextResponse.json({ root: real });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
