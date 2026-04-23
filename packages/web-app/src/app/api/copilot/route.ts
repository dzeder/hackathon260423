import { NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  return NextResponse.json({
    ok: true,
    echo: body,
    note: "Track A: wire Claude + MCP gateway here.",
  });
}
