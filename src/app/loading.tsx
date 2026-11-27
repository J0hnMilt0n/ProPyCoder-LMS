import { Navbar } from "@/components/navbar";
import { LoaderCircle } from "lucide-react";

export default function GlobalLoading() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Navbar />
      <main className="flex min-h-[calc(100vh-64px)] items-center justify-center px-4 py-12">
        <div className="flex flex-col items-center gap-4 text-center">
          <LoaderCircle
            size={32}
            className="text-orange-600 animate-spin"
            aria-hidden="true"
          />
          <span className="text-gray-600 dark:text-gray-300">Loading…</span>
        </div>
      </main>
    </div>
  );
}
