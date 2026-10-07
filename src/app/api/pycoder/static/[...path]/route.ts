import { NextRequest } from "next/server";
import { proxyPyCoderStatic } from "@/lib/pycoder-proxy";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  const { path } = await params;
  return proxyPyCoderStatic(path);
}
