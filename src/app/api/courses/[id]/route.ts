import { prisma } from "@/lib/prisma";
import { NextRequest, NextResponse } from "next/server";
import { getCourseDetail } from "@/lib/course-cache";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    
    // Cached — course details are public and read far more often than the
    // rare write (which invalidates this key).
    const course = await getCourseDetail(id);

    if (!course) {
      return NextResponse.json(
        { error: "Course not found" },
        { status: 404 }
      );
    }

    return NextResponse.json(course);
  } catch (error) {
    console.error("Course fetch error:", error);
    return NextResponse.json(
      { error: "Failed to fetch course" },
      { status: 500 }
    );
  }
}
