"use client";

import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/theme-provider";
import { LabPreloader } from "@/components/lab-preloader";
import { ConfirmProvider } from "@/components/confirm-dialog";

export function Providers({
  children,
  session,
}: {
  children: ReactNode;
  session?: Session | null;
}) {
  return (
    <ThemeProvider>
      <SessionProvider session={session ?? undefined} refetchOnWindowFocus={false}>
        <ConfirmProvider>
          {children}
          <Toaster position="top-right" containerStyle={{
    top: 80,
  }} />
          <LabPreloader />
        </ConfirmProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
