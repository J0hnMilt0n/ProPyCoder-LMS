"use client";

import { useEffect, useState } from "react";
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
import { useResource } from "@/lib/use-resource";

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
  const { data: session, status } = useSession();
  const userId = session?.user?.id ?? "";
  const authenticated = status === "authenticated";
  const [marking, setMarking] = useState(false);

  // Public broadcasts — paint cached instantly, refresh in the background, and
  // patch only when the feed actually changes.
  const broadcastsRes = useResource<Broadcast[]>({
    key: "announcements",
    url: "/api/announcements",
    scope: "public",
    select: (json) =>
      (json as { announcements?: Broadcast[] }).announcements ?? [],
  });
  const items = broadcastsRes.data ?? [];
  const isLoading = broadcastsRes.isLoading;

  // Personal inbox — signed-in users only.
  const inboxRes = useResource<{ notifications: InboxItem[]; unread: number }>({
    key: "notifications",
    url: "/api/notifications",
    scope: userId,
    enabled: authenticated,
    select: (json) => {
      const data = json as { notifications?: InboxItem[]; unread?: number };
      return { notifications: data.notifications ?? [], unread: data.unread ?? 0 };
    },
  });
  const inbox = inboxRes.data?.notifications ?? [];
  const unread = inboxRes.data?.unread ?? 0;

  async function markAllRead() {
    setMarking(true);
    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ all: true }),
      });
      if (!response.ok) throw new Error("update failed");
      // Re-pull the inbox — the server invalidated it, and the hook patches
      // only the changed rows (badges/list go to read) without a reload.
      inboxRes.refresh();
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
                <div className="cert-verify-head flex lg:flex-row flex-col">
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
                        className={`cursor-pointer flex gap-3 p-2 cert-item${item.read ? "" : " is-unread"}`}
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
            ) : items.length === 0 ? (
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
                {status === "authenticated" ? (
                inbox.map((item) => ( item.read?(
                  <li key={item.id} className="cert-item cursor-pointer flex gap-4 p-2 items-center" onClick={() => window.location.href = `${item?.link}`}>
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
                ))):(items.map((item) => (
                  <li key={item.id} className="cert-item cursor-pointer flex gap-4 p-2 items-center rounded-xl m-2" onClick={() => window.location.href = `${item?.link}`}>
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
                  </li>
                )))
              }
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
