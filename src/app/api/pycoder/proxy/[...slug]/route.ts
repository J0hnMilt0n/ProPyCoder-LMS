import { NextRequest } from "next/server";
import { proxyPyCoderPage } from "@/lib/pycoder-proxy";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  return proxyPyCoderPage(request, `/${slug.join("/")}`);
}
