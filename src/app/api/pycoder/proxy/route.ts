import { NextRequest } from "next/server";
import { proxyPyCoderPage } from "@/lib/pycoder-proxy";

export async function GET(request: NextRequest) {
  return proxyPyCoderPage(request, "/");
}
