"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { ReactNode } from "react";
import { AlertTriangle, HelpCircle, X } from "lucide-react";

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Red, destructive styling for irreversible actions. */
  danger?: boolean;
}

type Resolver = (value: boolean) => void;

interface PendingConfirm extends ConfirmOptions {
  resolve: Resolver;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<PendingConfirm | null>(null);

  const confirm = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        setPending({ ...options, resolve });
      }),
    [],
  );

  const settle = useCallback(
    (value: boolean) => {
      setPending((current) => {
        current?.resolve(value);
        return null;
      });
    },
    [],
  );

  return (
    <ConfirmContext.Provider value={{ confirm }}>
      {children}
      {pending && (
        <div
          className="confirm-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) settle(false);
          }}
        >
          <div
            className={`confirm-dialog${pending.danger ? " is-danger" : ""}`}
            role="alertdialog"
            aria-modal="true"
            aria-label={pending.title}
          >
            <div className="confirm-head">
              <span className="confirm-icon" aria-hidden="true">
                {pending.danger ? (
                  <AlertTriangle size={20} />
                ) : (
                  <HelpCircle size={20} />
                )}
              </span>
              <h2>{pending.title}</h2>
              <button
                type="button"
                className="confirm-close"
                aria-label="Cancel"
                onClick={() => settle(false)}
              >
                <X size={16} />
              </button>
            </div>
            {pending.message && (
              <div className="confirm-body">
                <p>{pending.message}</p>
              </div>
            )}
            <div className="confirm-actions">
              <button
                type="button"
                className="confirm-button confirm-cancel"
                onClick={() => settle(false)}
              >
                {pending.cancelLabel ?? "Cancel"}
              </button>
              <button
                type="button"
                className="confirm-button confirm-confirm"
                onClick={() => settle(true)}
              >
                {pending.confirmLabel ?? "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) {
    throw new Error("useConfirm must be used within a ConfirmProvider");
  }
  return context.confirm;
}
