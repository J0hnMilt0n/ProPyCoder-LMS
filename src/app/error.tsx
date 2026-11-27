"use client";

import { useEffect } from "react";
import { Navbar } from "@/components/navbar";
import { RefreshCw, Home, AlertTriangle } from "lucide-react";
import Link from "next/link";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log the error to an error reporting service
    console.error("Application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <head>
        <title>Something went wrong | ProPyCoder</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="robots" content="noindex" />
      </head>
      <body className="min-h-screen bg-gray-50 dark:bg-gray-900">
        <Navbar />
        <main className="min-h-[calc(100vh-64px)] flex items-center justify-center px-4 py-12">
          <div className="max-w-md w-full text-center">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-100 dark:bg-red-900/30">
              <AlertTriangle
                className="h-8 w-8 text-red-600 dark:text-red-400"
                aria-hidden="true"
              />
            </div>
            <h1 className="mb-4 text-3xl font-bold text-gray-900 dark:text-white">
              Something went wrong
            </h1>
            <p className="mb-6 text-gray-600 dark:text-gray-300">
              We encountered an unexpected error. Please try refreshing the page
              or navigate back to the homepage.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <button
                onClick={reset}
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-6 py-3 text-sm font-medium text-white hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-orange-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors"
              >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Try again
              </button>
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-gray-300 dark:border-gray-600 px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 transition-colors"
              >
                <Home className="h-4 w-4" aria-hidden="true" />
                Go home
              </Link>
            </div>
            {process.env.NODE_ENV === "development" && (
              <details className="mt-8 text-left">
                <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400">
                  Error details (development only)
                </summary>
                <pre className="mt-4 overflow-auto rounded bg-gray-100 dark:bg-gray-800 p-4 text-xs text-gray-700 dark:text-gray-300 text-left">
                  {error.message}
                  {error.digest && (
                    <>
                      {" "}
                      <br /> {error.digest}{" "}
                    </>
                  )}
                  {error.stack && (
                    <>
                      {" "}
                      <br /> {error.stack}{" "}
                    </>
                  )}
                </pre>
              </details>
            )}
          </div>
        </main>
      </body>
    </html>
  );
}
