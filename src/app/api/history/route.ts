import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = Redis.fromEnv();

export async function GET(req: NextRequest) {
  try {
    const identifier = req.ip ?? "127.0.0.1";
    const historyKey = `portfolio:history:${identifier}`;
    
    const history = await redis.get<any[]>(historyKey) || [];
    
    return NextResponse.json({ history });
  } catch (error: any) {
    console.error("Error fetching history:", error);
    return NextResponse.json({ error: error.message || "Failed to fetch history" }, { status: 500 });
  }
}
