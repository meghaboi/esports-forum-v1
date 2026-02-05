import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json(
    { status: "ok", message: "Valorant Forum API is running" },
    { status: 200 }
  );
}
