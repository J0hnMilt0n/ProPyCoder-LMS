"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  CheckCheck,
  LoaderCircle,
  Megaphone,
  Radio,
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

  // Public announcements
  const broadcastsRes = useResource<Broadcast[]>({
    key: "announcements",
    url: "/api/announcements",
    scope: "public",
    freshForMs: 5 * 60 * 1000,
    revalidateOnFocus: true,
    select: (json) =>
      (json as { announcements?: Broadcast[] }).announcements ?? [],
  });

  const broadcasts = broadcastsRes.data ?? [];

  // Personal notifications
  const inboxRes = useResource<{
    notifications: InboxItem[];
    unread: number;
  }>({
    key: "notifications",
    url: "/api/notifications",
    scope: userId,
    enabled: authenticated,
    freshForMs: 60 * 1000,
    revalidateOnFocus: true,
    select: (json) => {
      const data = json as {
        notifications?: InboxItem[];
        unread?: number;
      };

      return {
        notifications: data.notifications ?? [],
        unread: data.unread ?? 0,
      };
    },
  });

  const inbox = inboxRes.data?.notifications ?? [];
  const unread = inboxRes.data?.unread ?? 0;

  const unreadItems = inbox.filter((item) => !item.read);
  const readItems = inbox.filter((item) => item.read);

  const isLoading = authenticated
    ? inboxRes.isLoading
    : broadcastsRes.isLoading;

  const visibleItems = authenticated ? readItems : broadcasts;

  async function markAllRead() {
    if (marking || unread === 0) return;

    setMarking(true);

    try {
      const response = await fetch("/api/notifications", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ all: true }),
      });

      if (!response.ok) {
        throw new Error("Could not update notifications");
      }

      inboxRes.refresh();
      toast.success("All caught up");
    } catch {
      toast.error("Could not update your inbox");
    } finally {
      setMarking(false);
    }
  }

  function openItem(item: InboxItem | Broadcast) {
    if (!item.link) return;
    window.location.assign(item.link);
  }

  useEffect(() => {
    if (authenticated && inboxRes.error) {
      toast.error("Could not load your notifications");
    }

    if (!authenticated && broadcastsRes.error) {
      toast.error("Could not load announcements");
    }
  }, [authenticated, inboxRes.error, broadcastsRes.error]);

  return (
    <main className="catalog-page announcements-page">
      <Navbar />

      {/* Hero */}
      <header className="catalog-hero">
        <div className="catalog-hero-inner">
          <div className="catalog-eyebrow">
            <Megaphone size={14} />
            STAY IN THE LOOP
          </div>

          <div className="catalog-hero-row">
            <div>
              <h1>
                Latest <em>announcements.</em>
              </h1>

              <p>
                Important news, updates, opportunities, and messages from the
                ProPyCoder team.
              </p>
            </div>

            <div className="catalog-hero-note">
              <span>PROPYCODER UPDATES</span>
              <strong>
                {authenticated
                  ? `${unread} unread ${
                      unread === 1 ? "notification" : "notifications"
                    }`
                  : "Stay informed. Keep learning."}
              </strong>
            </div>
          </div>
        </div>
      </header>

      {/* Announcement content */}
      <section className="catalog-section">
        {status === "loading" ? (
          <div className="catalog-empty">
            <LoaderCircle className="animate-spin" />
            {/* <h2>Checking your account…</h2> */}
          </div>
        ) : isLoading ? (
          <div className="catalog-empty">
            <LoaderCircle className="animate-spin" />
            {/* <h2>Loading announcements…</h2> */}
          </div>
        ) : (
          <div
            className={`announcements-layout${
              authenticated ? " has-inbox" : ""
            }`}
          >
            {/* Left column: Personal inbox */}
            {authenticated && (
              <section className="announcement-inbox">
                <div className="announcement-section-heading">
                  <div>
                    <div className="catalog-eyebrow">
                      <Bell size={14} />
                      YOUR INBOX
                    </div>

                    {/* <h2>New updates</h2> */}
                  </div>

                  {unread > 0 && (
                    <button
                      type="button"
                      className="announcement-mark-read"
                      onClick={markAllRead}
                      disabled={marking}
                    >
                      {marking ? (
                        <LoaderCircle size={14} className="animate-spin" />
                      ) : (
                        <CheckCheck size={14} />
                      )}
                      Mark all read
                    </button>
                  )}
                </div>

                {unreadItems.length > 0 ? (
                  <div className="announcement-list">
                    {unreadItems.map((item) => (
                      <article
                        key={item.id}
                        className="announcement-card is-unread"
                      >
                        <span className="announcement-icon">
                          <Bell size={19} />
                        </span>

                        <div className="announcement-card-content">
                          <div className="announcement-card-title">
                            <h3>{item.title}</h3>

                            <span className="announcement-new-label">NEW</span>
                          </div>

                          <p>{item.message}</p>

                          <div className="announcement-card-meta">
                            <span>
                              {new Date(item.createdAt).toLocaleDateString()}
                            </span>

                            {item.link && (
                              <button
                                type="button"
                                onClick={() => openItem(item)}
                              >
                                Open update
                                <ArrowUpRight size={13} />
                              </button>
                            )}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="announcement-inbox-empty">
                    <CheckCheck size={19} />

                    <span>
                      You&apos;re all caught up. New notifications will appear
                      here.
                    </span>
                  </div>
                )}
              </section>
            )}

            {/* Right column: Previous updates */}
            <section className="announcement-previous">
              {!authenticated && (
                <div className="announcement-section-heading announcement-feed-heading">
                  <div className="catalog-eyebrow">
                    <Radio size={14} />
                    PUBLIC UPDATES{" "}
                    {visibleItems.length > 0 && (
                      <span className="announcement-total">
                        {visibleItems.length}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {visibleItems.length === 0 ? (
                <div className="catalog-empty">
                  <Megaphone size={28} />

                  <h2>
                    {authenticated
                      ? "No previous notifications"
                      : "No announcements yet"}
                  </h2>

                  <p>
                    {authenticated
                      ? "Your previous notifications will appear here."
                      : "Check back soon. New ProPyCoder updates will appear here."}
                  </p>

                  <Link href="/courses" className="auth-submit px-5">
                    Explore courses
                    <ArrowRight size={15} />
                  </Link>
                </div>
              ) : (
                <div className="announcement-list">
                  {visibleItems.map((item) => (
                    <article key={item.id} className="announcement-card">
                      <span className="announcement-icon">
                        <Megaphone size={19} />
                      </span>

                      <div className="announcement-card-content">
                        <h3>{item.title}</h3>

                        <p>{item.message}</p>

                        <div className="announcement-card-meta">
                          <span>
                            {new Date(item.createdAt).toLocaleDateString()}
                          </span>

                          {item.link && (
                            <button
                              type="button"
                              onClick={() => openItem(item)}
                            >
                              Open update
                              <ArrowUpRight size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </section>

      {/* Footer */}
      <footer className="catalog-footer">
        <span>PROPYCODER LEARNING</span>
        <span>Stay informed. Keep growing.</span>

        <Link href="/courses">
          Browse all courses
          <ArrowRight size={14} />
        </Link>
      </footer>
    </main>
  );
}
