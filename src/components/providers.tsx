"use client";

import { SessionProvider } from "next-auth/react";
import { ReactNode } from "react";
import { Toaster } from "react-hot-toast";
import { ThemeProvider } from "@/components/theme-provider";
import { LabPreloader } from "@/components/lab-preloader";
import { ConfirmProvider } from "@/components/confirm-dialog";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <SessionProvider refetchOnWindowFocus={false}>
        <ConfirmProvider>
          {children}
          <Toaster position="top-right" />
          <LabPreloader />
        </ConfirmProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
