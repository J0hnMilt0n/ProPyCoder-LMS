"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import Editor from "@monaco-editor/react";
import * as prettier from "prettier/standalone";
import htmlPlugin from "prettier/plugins/html";
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
  Link2,
  AlignLeft,
  AlignCenter,
  AlignRight,
  WandSparkles,
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

function getBodyContent(source: string): string {
  if (!source.trim()) return "";

  const parsed = new DOMParser().parseFromString(source, "text/html");
  return parsed.body.innerHTML || source;
}

function replaceBodyContent(source: string, bodyContent: string): string {
  if (!source.trim()) {
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body>
${bodyContent}
</body>
</html>`;
  }

  const parsed = new DOMParser().parseFromString(source, "text/html");
  parsed.body.innerHTML = bodyContent;

  // Preserve the original document/head and update only the body.
  const doctype = source.match(/<!doctype[^>]*>/i)?.[0] ?? "<!doctype html>";
  return `${doctype}\n${parsed.documentElement.outerHTML}`;
}

export function EmailSender() {
  const [recipient, setRecipient] = useState("");
  const [subject, setSubject] = useState("");
  const [senderEmail, setSenderEmail] = useState<string>(
    SENDER_ADDRESSES[0].value,
  );
  const [html, setHtml] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isLoadingTemplate, setIsLoadingTemplate] = useState(false);
  const [isFormatting, setIsFormatting] = useState(false);
  const [isLinkEditorOpen, setIsLinkEditorOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  const visualEditorRef = useRef<HTMLDivElement>(null);
  const htmlRef = useRef(html);
  const requestIdRef = useRef(0);
  const savedSelectionRef = useRef<Range | null>(null);
  const linkInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    htmlRef.current = html;
  }, [html]);

  // Load the selected sender's existing email template.
  useEffect(() => {
    const templateType = SENDER_TEMPLATES[senderEmail];
    if (!templateType) return;

    const controller = new AbortController();
    const requestId = ++requestIdRef.current;

    async function loadTemplate() {
      setIsLoadingTemplate(true);
      setHtml("");
      setSubject("");

      try {
        const response = await fetch("/api/admin/email-preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ templateType, senderEmail }),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error("Failed to load email template");
        }

        const data = await response.json();

        if (
          controller.signal.aborted ||
          requestId !== requestIdRef.current
        ) {
          return;
        }

        setHtml(data.htmlContent ?? "");
        setSubject(data.subject ?? "");
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;

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
    return () => controller.abort();
  }, [senderEmail]);

  // Keep the visual editor in sync when the HTML source changes.
  useEffect(() => {
    const editor = visualEditorRef.current;
    if (!editor) return;

    // Do not reset the caret/selection while the user is typing visually.
    if (document.activeElement === editor) return;

    const nextContent = getBodyContent(html);
    if (editor.innerHTML !== nextContent) {
      editor.innerHTML = nextContent;
    }
  }, [html, isLoadingTemplate]);

  const updateFromVisualEditor = useCallback(() => {
    const editor = visualEditorRef.current;
    if (!editor) return;

    const nextHtml = replaceBodyContent(
      htmlRef.current,
      editor.innerHTML,
    );
    htmlRef.current = nextHtml;
    setHtml(nextHtml);
  }, []);

  const runVisualCommand = useCallback(
    (event: MouseEvent<HTMLButtonElement>, command: string, value?: string) => {
      event.preventDefault();

      const editor = visualEditorRef.current;
      if (!editor) return;

      if (command === "createLink") {
        editor.focus();

        const selection = window.getSelection();
        if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
          toast.error("Select some text before inserting a link");
          return;
        }

        savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
        setLinkUrl("");
        setIsLinkEditorOpen(true);

        requestAnimationFrame(() => {
          linkInputRef.current?.focus();
        });
        return;
      }

      editor.focus();
      document.execCommand(command, false, value);
      updateFromVisualEditor();
    },
    [updateFromVisualEditor],
  );

  const insertLink = useCallback(() => {
    const url = linkUrl.trim();

    if (!url) {
      toast.error("Enter a URL");
      return;
    }

    let safeUrl = url;
    if (!/^(https?:\/\/|mailto:|tel:)/i.test(safeUrl)) {
      safeUrl = `https://${safeUrl}`;
    }

    try {
      const parsedUrl = new URL(safeUrl);
      if (!["http:", "https:", "mailto:", "tel:"].includes(parsedUrl.protocol)) {
        toast.error("Invalid URL");
        return;
      }
    } catch {
      toast.error("Please enter a valid URL");
      return;
    }

    const editor = visualEditorRef.current;
    const savedRange = savedSelectionRef.current;

    if (!editor || !savedRange) {
      setIsLinkEditorOpen(false);
      return;
    }

    editor.focus();

    const selection = window.getSelection();
    if (selection) {
      selection.removeAllRanges();
      selection.addRange(savedRange);
    }

    document.execCommand("createLink", false, safeUrl);
    updateFromVisualEditor();

    savedSelectionRef.current = null;
    setIsLinkEditorOpen(false);
    setLinkUrl("");
  }, [linkUrl, updateFromVisualEditor]);

  const closeLinkEditor = useCallback(() => {
    setIsLinkEditorOpen(false);
    setLinkUrl("");
    savedSelectionRef.current = null;
    visualEditorRef.current?.focus();
  }, []);

  const formatHTML = useCallback(async () => {
    if (!html.trim()) {
      toast.error("HTML editor is empty");
      return;
    }

    setIsFormatting(true);
    try {
      const formatted = await prettier.format(html, {
        parser: "html",
        plugins: [htmlPlugin],
        tabWidth: 2,
        useTabs: false,
        printWidth: 80,
        htmlWhitespaceSensitivity: "css",
        bracketSameLine: false,
      });

      setHtml(formatted);
      toast.success("HTML formatted successfully");
    } catch (error) {
      toast.error(
        error instanceof Error
          ? `HTML formatting failed: ${error.message}`
          : "HTML formatting failed",
      );
    } finally {
      setIsFormatting(false);
    }
  }, [html]);

  const handleSend = useCallback(async () => {
    if (!recipient.trim()) {
      toast.error("Please enter a recipient email address");
      return;
    }
    if (!html.trim()) {
      toast.error("Email HTML is empty");
      return;
    }
    if (!subject.trim()) {
      toast.error("Please enter an email subject");
      return;
    }

    setIsSending(true);
    try {
      const response = await fetch("/api/admin/email-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          to: recipient.trim(),
          customSubject: subject,
          customHtml: html,
          senderEmail,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error ?? "Failed to send email");
      }

      toast.success(`Email sent to ${recipient.trim()}`);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to send email",
      );
    } finally {
      setIsSending(false);
    }
  }, [recipient, subject, senderEmail, html]);

  const editorDisabled = isSending || isLoadingTemplate || isFormatting;

  return (
    <section className="admin-panel admin-email-panel">
      <div className="admin-email-form">
        
<div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between min-w-0 w-full">
  <div className="admin-email-fields flex flex-1 min-w-0 w-full flex-col gap-5">
    <label>
      Recipient
      <input
        type="email"
        placeholder="instructor@example.com"
        value={recipient}
        onChange={(event) => setRecipient(event.target.value)}
      />
    </label>

    <label>
      Subject
      <input
        type="text"
        placeholder="Email subject"
        value={subject}
        onChange={(event) => setSubject(event.target.value)}
      />
    </label>

    <label>
      Send from
      <select
        value={senderEmail}
        onChange={(event) => setSenderEmail(event.target.value)}
      >
        {SENDER_ADDRESSES.map((address) => (
          <option key={address.value} value={address.value}>
            {address.label}
          </option>
        ))}
      </select>
    </label>
  </div>

  <div className="admin-email-actions flex flex-col gap-3 mt-2 lg:mt-0 lg:ml-5 shrink-0">
    <button
      type="button"
      className="admin-button"
      onClick={() => void formatHTML()}
      disabled={editorDisabled || !html.trim()}
    >
      {isFormatting ? (
        <LoaderCircle size={15} className="spin" />
      ) : (
        <WandSparkles size={15} />
      )}
      {isFormatting ? "Formatting..." : "Format HTML"}
    </button>

    <button
      type="button"
      className="admin-button admin-button-primary"
      onClick={() => void handleSend()}
      disabled={editorDisabled}
    >
      {isSending ? (
        <LoaderCircle size={15} className="spin" />
      ) : (
        <Send size={15} />
      )}
      {isSending ? "Sending..." : "Send email"}
    </button>
  </div>
</div>

       
        <div className="admin-email-editor-toolbar">
            <button type="button" title="Bold" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "bold")}><Bold size={16} /></button>
            <button type="button" title="Italic" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "italic")}><Italic size={16} /></button>
            <button type="button" title="Underline" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "underline")}><Underline size={16} /></button>
            <button type="button" title="Strikethrough" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "strikeThrough")}><Strikethrough size={16} /></button>
            <span className="admin-email-toolbar-divider" />
            <button type="button" title="Bulleted list" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "insertUnorderedList")}><List size={16} /></button>
            <button type="button" title="Numbered list" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "insertOrderedList")}><ListOrdered size={16} /></button>
            <button type="button" title="Quote" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "formatBlock", "blockquote")}><Quote size={16} /></button>
            <button type="button" title="Inline code" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "formatBlock", "pre")}><Code2 size={16} /></button>
            <span className="admin-email-toolbar-divider" />
            <button type="button" title="Align left" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "justifyLeft")}><AlignLeft size={16} /></button>
            <button type="button" title="Align center" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "justifyCenter")}><AlignCenter size={16} /></button>
            <button type="button" title="Align right" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "justifyRight")}><AlignRight size={16} /></button>
            <button type="button" title="Insert link" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "createLink")}><Link2 size={16} /></button>
            <span className="admin-email-toolbar-divider" />
            <button type="button" title="Undo" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "undo")}><Undo2 size={16} /></button>
            <button type="button" title="Redo" disabled={editorDisabled} onMouseDown={(event) => runVisualCommand(event, "redo")}><Redo2 size={16} /></button>
          </div>
      </div>

      <div className="admin-email-editors">
        <section className="admin-email-editor-section">

          {isLinkEditorOpen && (
            <div className="admin-email-link-editor">
              <div className="admin-email-link-icon">
                <Link2 size={18} />
              </div>

              <div className="admin-email-link-content">
                <div className="admin-email-link-heading">
                  <strong>Insert link</strong>
                  <span>Attach a URL to your selected text</span>
                </div>

                <input
                  ref={linkInputRef}
                  type="url"
                  value={linkUrl}
                  placeholder="https://example.com"
                  onChange={(event) => setLinkUrl(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      insertLink();
                    }
                    if (event.key === "Escape") {
                      closeLinkEditor();
                    }
                  }}
                />

                <div className="admin-email-link-actions">
                  <button
                    type="button"
                    className="admin-email-link-cancel"
                    onClick={closeLinkEditor}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="admin-email-link-insert"
                    onClick={insertLink}
                    disabled={!linkUrl.trim()}
                  >
                    <Link2 size={14} />
                    Insert link
                  </button>
                </div>
              </div>
            </div>
          )}

          <div
            ref={visualEditorRef}
            className="admin-email-visual-editor"
            contentEditable={!editorDisabled}
            suppressContentEditableWarning
            data-placeholder="Write your email content here..."
            onInput={updateFromVisualEditor}
          />
        </section>

        <section className="admin-email-editor-section">
          <div className="admin-email-monaco">
            {isLoadingTemplate ? (
              <div className="admin-email-loading">
                <LoaderCircle size={25} className="spin" />
                Loading template...
              </div>
            ) : (
              <Editor
                height="1000px"
                language="html"
                theme="vs"
                value={html}
                onChange={(value) => setHtml(value ?? "")}
                loading={
                  <div className="admin-email-loading">
                    Loading HTML editor...
                  </div>
                }
                options={{
                  readOnly: editorDisabled,
                  minimap: { enabled: false },
                  fontSize: 13,
                  lineHeight: 21,
                  fontFamily: "'Cascadia Code', 'Fira Code', Consolas, monospace",
                  fontLigatures: true,
                  wordWrap: "on",
                  automaticLayout: true,
                  scrollBeyondLastLine: false,
                  tabSize: 2,
                  insertSpaces: true,
                  formatOnPaste: true,
                  formatOnType: true,
                  autoClosingBrackets: "always",
                  autoClosingQuotes: "always",
                  autoIndent: "full",
                  folding: true,
                  lineNumbers: "on",
                  renderLineHighlight: "all",
                  bracketPairColorization: { enabled: true },
                  padding: { top: 14, bottom: 14 },
                  scrollbar: {
                    verticalScrollbarSize: 9,
                    horizontalScrollbarSize: 9,
                  },
                }}
              />
            )}
          </div>
        </section>
      </div>
    </section>
  );
}
