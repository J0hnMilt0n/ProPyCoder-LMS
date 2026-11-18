
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code2,
  List,
  ListOrdered,
  Quote,
  Undo2,
  Redo2,
  Send,
  LoaderCircle,
} from "lucide-react";
import toast from "react-hot-toast";

const SENDER_ADDRESSES = [
  { value: "career@propycoder.com", label: "Career" },
  { value: "support@propycoder.com", label: "Support" },
] as const;

const SENDER_TEMPLATES: Record<string, string> = {
  "career@propycoder.com": "instructor-recruitment",
  "support@propycoder.com": "announcement",
};

export function EmailSender() {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [senderEmail, setSenderEmail] = useState<string>(
    SENDER_ADDRESSES[0].value,
  );
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);

  const previewRef = useRef<HTMLDivElement>(null);
  const requestIdRef = useRef(0);

  // Load the template whenever the sender changes.
  useEffect(() => {
    const templateType = SENDER_TEMPLATES[senderEmail];

    if (!templateType) return;

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    async function loadTemplate() {
      setIsLoadingTemplate(true);

      // Clear previous template immediately.
      if (previewRef.current) {
        previewRef.current.innerHTML = "";
      }

      setSubject("");

      try {
        const res = await fetch("/api/admin/email-preview", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            templateType,
            senderEmail,
          }),
          signal: controller.signal,
        });

        if (!res.ok) {
          throw new Error("Failed to load email template");
        }

        const data = await res.json();

        // Ignore outdated requests.
        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        if (previewRef.current) {
          previewRef.current.innerHTML = data.htmlContent ?? "";
        }

        setSubject(data.subject ?? "");
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        if (requestId === requestIdRef.current) {
          toast.error(
            error instanceof Error
              ? error.message
              : "Failed to load template",
          );
        }
      } finally {
        if (requestId === requestIdRef.current) {
          setIsLoadingTemplate(false);
        }
      }
    }

    void loadTemplate();

    return () => {
      controller.abort();
    };
  }, [senderEmail]);

  const applyFormatting = useCallback(
    (command: string, value?: string) => {
      const el = previewRef.current;
      if (!el) return;

      el.focus();
      document.execCommand(command, false, value);
    },
    [],
  );

  const handleSend = useCallback(async () => {
    if (!recipient.trim()) {
      toast.error("Please enter a recipient email address");
      return;
    }

    const bodyHtml = previewRef.current?.innerHTML ?? "";

    if (!bodyHtml.trim()) {
      toast.error("Email body is empty");
      return;
    }

    setIsSending(true);

    try {
      const res = await fetch("/api/admin/email-send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          to: recipient.trim(),
          customSubject: subject || undefined,
          customHtml: bodyHtml,
          senderEmail,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to send email");
      }

      toast.success(`Email sent to ${recipient.trim()}`);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to send email",
      );
    } finally {
      setIsSending(false);
    }
  }, [recipient, subject, senderEmail]);

  const toolbarButtons = [
    { cmd: "bold", icon: Bold, label: "Bold" },
    { cmd: "italic", icon: Italic, label: "Italic" },
    { cmd: "underline", icon: Underline, label: "Underline" },
    { cmd: "strikeThrough", icon: Strikethrough, label: "Strikethrough" },
    // { cmd: "insertHTML", icon: Code2, label: "Code", value: "code" },
    // { cmd: "insertUnorderedList", icon: List, label: "Bullet list" },
    // { cmd: "insertOrderedList", icon: ListOrdered, label: "Numbered list" },
    // { cmd: "formatBlock", icon: Quote, label: "Quote", value: "blockquote" },
    { cmd: "undo", icon: Undo2, label: "Undo" },
    { cmd: "redo", icon: Redo2, label: "Redo" },
  ];

  return (
    <section className="admin-panel admin-email-panel">
      <div className="admin-email-layout">
        <div className="admin-email-form">
          <label>
            Recipient
            <input
              type="email"
              placeholder="instructor@example.com"
              value={recipient}
              onChange={(e) => setRecipient(e.target.value)}
            />
          </label>

          <label>
            Subject
            <input
              type="text"
              placeholder="Email subject"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
            />
          </label>

          <label>
            Send from
            <select
              value={senderEmail}
              onChange={(e) => setSenderEmail(e.target.value)}
            >
              {SENDER_ADDRESSES.map((addr) => (
                <option key={addr.value} value={addr.value}>
                  {addr.label}
                </option>
              ))}
            </select>
          </label>

          <div className="admin-email-toolbar">
            {toolbarButtons.map((btn) => (
              <button
                key={btn.cmd + btn.label}
                type="button"
                title={btn.label}
                disabled={isLoadingTemplate}
                // onClick={() => applyFormatting(btn.cmd, btn.value)}
                onClick={() => applyFormatting(btn.cmd)}
              >
                <btn.icon size={16} />
              </button>
            ))}
          </div>

          <button
            type="button"
            className="admin-button admin-button-primary"
            onClick={() => void handleSend()}
            disabled={isSending || isLoadingTemplate}
          >
            {isSending ? (
              <>
                <LoaderCircle size={14} className="spin" />
                Sending…
              </>
            ) : (
              <>
                <Send size={14} />
                Send email
              </>
            )}
          </button>
        </div>

        <div className="admin-email-preview">
          {/* <div className="admin-email-preview-head">
            <span className="admin-email-preview-subject">
              {subject || "No subject"}
            </span>

            <small>
              From: {senderEmail} → To: {recipient || "—"}
            </small>
          </div> */}

          <div
            ref={previewRef}
            className="admin-email-preview-frame"
            contentEditable={!isLoadingTemplate}
            suppressContentEditableWarning
            style={{
              opacity: isLoadingTemplate ? 0.5 : 1,
              pointerEvents: isLoadingTemplate ? "none" : "auto",
            }}
          />

          {isLoadingTemplate && (
            <div className="admin-email-preview-empty">
              <LoaderCircle size={28} className="spin" />
              <span>Loading template…</span>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
