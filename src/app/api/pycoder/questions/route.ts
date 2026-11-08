import { NextResponse } from "next/server";

export async function GET() {
  try {
    const response = await fetch(
      "https://propycoder.pythonanywhere.com/api/questions/",
      { next: { revalidate: 600 } },
    );
    const text = await response.text();
    return new NextResponse(text, {
      status: response.status,
      headers: {
        "Content-Type":
          response.headers.get("Content-Type") || "application/json",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: String(error) }, { status: 500 });
  }
}
