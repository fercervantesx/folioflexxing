import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const url = req.nextUrl.searchParams.get("url");
  
  if (!url) {
    return NextResponse.json({ error: "URL parameter is required" }, { status: 400 });
  }

  try {
    // Fetch the HTML from Vercel Blob
    const response = await fetch(url);
    const html = await response.text();

    // Return with proper headers to display in iframe
    return new NextResponse(html, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "public, max-age=31536000, immutable",
      },
    });
  } catch (error: any) {
    console.error("Error proxying HTML:", error);
    return NextResponse.json({ error: "Failed to fetch HTML" }, { status: 500 });
  }
}
