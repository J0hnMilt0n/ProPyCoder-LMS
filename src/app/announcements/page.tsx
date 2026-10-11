"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  ArrowUpRight,
  Bell,
  CheckCheck,
  LoaderCircle,
  Megaphone,
} from "lucide-react";
import toast from "react-hot-toast";

interface Broadcast {
  id: string;
  title: string;
  message: string;
  link: string | null;
  audience: string;
  createdAt: string;
}

interface InboxItem {
  id: string;
  title: string;
  message: string;
  link: string | null;
  type: string;
  read: boolean;
  createdAt: string;
}

export default function AnnouncementsPage() {
  const { status } = useSession();
  const [items, setItems] = useState<Broadcast[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inbox, setInbox] = useState<InboxItem[]>([]);
  const [unread, setUnread] = useState(0);
  const [marking, setMarking] = useState(false);

  // Public broadcasts — everyone, registered or not.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch("/api/announcements", {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("load failed");
        const data = (await response.json()) as { announcements?: Broadcast[] };
        if (!cancelled) setItems(data.announcements ?? []);
      } catch {
        if (!cancelled) toast.error("Could not load announcements");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Personal inbox — signed-in users only.
  const loadInbox = useCallback(async () => {
    if (status !== "authenticated") return;
    try {
      const response = await fetch("/api/notifications", {
        cache: "no-store",
      });
      if (!response.ok) return;
      const data = (await response.json()) as {
        notifications?: InboxItem[];
        unread?: number;
      };
      setInbox(data.notifications ?? []);
      setUnread(data.unread ?? 0);
    } catch {
      // Inbox is best-effort — public board still renders.
    }
  }, [status]);

  useEffect(() => {
    void loadInbox();
  }, [loadInbox]);

  async function markAllRead() {
    setMarking(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("update failed");
      setInbox((prev) => prev.map((item) => ({ ...item, read: true })));
      setUnread(0);
      toast.success("All caught up");
    } catch {
      toast.error("Could not update your inbox");
    } finally {
      setMarking(false);
    }
  }

  return (
    <div className="auth-page">
      <Navbar />
      <main className="auth-layout">
        <div className="auth-content">
          <div className="auth-card cert-page-card">
            <div className="auth-card-eyebrow">STAY IN THE LOOP</div>
            <h1>Announcements</h1>
            <p className="auth-card-description">
              News and updates from ProPyCoder — no account needed to read
              them.
            </p>

            {status === "authenticated" && (
              <section className="cert-verify-card">
                <div className="cert-verify-head">
                  <span>
                    <Megaphone size={14} /> New updates
                    {unread > 0 && (
                      <span className="cert-verify-count">{unread} new</span>
                    )}
                  </span>
                  {unread > 0 && (
                    <button
                      type="button"
                      className="cert-verify-clear"
                      onClick={markAllRead}
                      disabled={marking}
                    >
                      <CheckCheck size={14} /> Mark all read
                    </button>
                  )}
                </div>
                {unread == 0 ? (
                  <p className="cert-item-meta">
                    Nothing sent to you yet — new announcements will appear
                    here.
                  </p>
                ) : (
                  <ul className="cert-list">
                    {inbox.slice(0, 5).map((item) => (
                      !item.read?(
                      <li
                        onClick={() => window.location.href = `${item?.link}`}
                        key={item.id}
                        className={`cursor-pointer cert-item${item.read ? "" : " is-unread"}`}
                      >     <span className="cert-item-icon" aria-hidden="true">
                          <Bell size={18} />
                        </span>                 
                        <span className="cert-item-body">
                          <strong>{item.title}</strong>
                          <span className="cert-item-meta">
                            {item.message}
                          </span>
                        </span>
                      </li>):<></>
                    ))}
                  </ul>
                )}
              </section>
            )}

            {isLoading ? (
              <div style={{ textAlign: "center", padding: "24px 0" }}>
                <LoaderCircle
                  className="animate-spin"
                  size={28}
                  style={{ margin: "0 auto", color: "#e95f32" }}
                />
              </div>
            ) : inbox.length === 0 ? (
              <div className="cert-empty">
                <span className="cert-empty-icon" aria-hidden="true">
                  <Megaphone size={22} />
                </span>
                <h2>No announcements yet</h2>
                <p>Check back soon — new updates will show up here.</p>
                <Link href="/courses" className="auth-submit cert-empty-link">
                  Browse courses
                </Link>
              </div>
            ) : (
              <ul className="cert-list">
                {inbox.map((item) => ( item.read?(
                  <li key={item.id} className="cert-item cursor-pointer" onClick={() => window.location.href = `${item?.link}`}>
                    <span className="cert-item-icon" aria-hidden="true">
                      <Megaphone size={18} />
                    </span>
                    <span className="cert-item-body">
                      <strong>{item.title}</strong>
                      <span className="cert-item-meta">{item.message}</span>
                      <span className="cert-item-meta">
                        {new Date(item.createdAt).toLocaleDateString()}
                        {item.link ? (
                          <>
                            {" · "}
                            <a
                              href={item.link}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open link <ArrowUpRight size={12} />
                            </a>
                          </>
                        ) : null}
                      </span>
                    </span>
                  </li>):<></>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
