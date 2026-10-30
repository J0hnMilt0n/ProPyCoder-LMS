import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { CredentialsSignin } from "next-auth";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

class InvalidEmailSignin extends CredentialsSignin {
  code = "invalid-email";
}

class InvalidPasswordSignin extends CredentialsSignin {
  code = "invalid-password";
}

class EmailNotVerifiedSignin extends CredentialsSignin {
  code = "email-not-verified";
}

// The session callback below runs on every auth() call — i.e. once per
// authenticated API request. Reading the profile (including the full
// base64 avatar) from the database each time cost an extra round trip to
// the remote database on every request, which made the whole API feel
// slow. Cache the result briefly per user; session updates invalidate it
// immediately and the TTL bounds any other staleness.
const SESSION_PROFILE_TTL_MS = 30_000;
const sessionProfileCache = new Map<
  string,
  { name: string; avatar: string | null; expires: number }
>();
// In-flight profile loads keyed by user — parallel auth() calls in the same
// tick share one DB query instead of each firing their own.
const sessionProfileInflight = new Map<
  string,
  Promise<{ name: string; avatar: string | null } | null>
>();

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string")
          return null;

        const user = await prisma.user.findUnique({
          where: { email: email.trim().toLowerCase() },
        });

        if (!user) throw new InvalidEmailSignin();
        if (!user.isActive) throw new InvalidEmailSignin();

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) throw new InvalidPasswordSignin();
        if (!user.emailVerified) throw new EmailNotVerifiedSignin();

        // IMPORTANT: never return `image` here. Profile avatars are uploaded as
        // base64 data-URLs (they can be hundreds of KB). NextAuth copies
        // user.image into token.picture on sign-in, and a multi-hundred-KB JWT
        // gets chunked across dozens of cookies, which browsers then fail to
        // send back — the session silently decodes as null and login appears to
        // fail. The session callback below reads the avatar fresh from the DB,
        // so the token never needs the image at all.
        return {
          id: user.id,
          email: user.email,
          name: `${user.firstName} ${user.lastName}`,
          role: user.role,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60,
  },
  pages: {
    signIn: "/auth/login",
    error: "/auth/error",
  },
  callbacks: {
    async jwt({ token, user, trigger, session }) {
      // Belt-and-suspenders: make sure a large avatar never ends up baked into
      // the token (older sessions may already carry token.picture). The session
      // callback resolves the avatar from the database instead.
      delete (token as { picture?: string }).picture;
      if (user) {
        token.role = user.role;
        token.id = user.id;
        token.name = user.name;
        // NOTE: the avatar is deliberately NOT stored in the JWT. Avatars can
        // be large data-URLs and cookies are capped at ~4KB — putting the
        // image in the token silently breaks session updates, which is why
        // profile edits appeared as stale initials/pictures. The session
        // callback reads name + avatar fresh from the database instead.
      }
      // Keep the display name in sync after profile edits; the avatar is
      // resolved from the database when the session payload is built.
      if (trigger === "update" && session && typeof session.name === "string") {
        token.name = session.name;
      }
      if (trigger === "update" && typeof token.id === "string") {
        // The profile may have changed — drop the cached session profile so
        // the next auth() reads fresh values from the database.
        sessionProfileCache.delete(token.id);
        sessionProfileInflight.delete(token.id);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
        if (typeof token.role === "string") session.user.role = token.role;
        if (typeof token.name === "string") session.user.name = token.name;

        const cached = sessionProfileCache.get(token.id);
        if (cached && cached.expires > Date.now()) {
          session.user.name = cached.name;
          session.user.image = cached.avatar;
        } else {
          // Collapse concurrent identical loads: one DB read shared by every
          // auth() call in the same tick — without this, N parallel API
          // requests each fire their own profile query on a cold cache.
          const userId: string = token.id;
          const pending = sessionProfileInflight.get(userId);
          if (pending) {
            const profile = await pending.catch(() => null);
            if (profile) {
              session.user.name = profile.name;
              session.user.image = profile.avatar;
            }
          } else {
            try {
              const load = (async () => {
                const dbUser = await prisma.user.findUnique({
                  where: { id: userId },
                  select: { firstName: true, lastName: true, avatar: true },
                });
                if (!dbUser) return null;
                const name = `${dbUser.firstName} ${dbUser.lastName}`;
                // Opportunistic cleanup so the cache cannot grow unbounded.
                if (sessionProfileCache.size > 1_000) {
                  const now = Date.now();
                  for (const [key, entry] of sessionProfileCache) {
                    if (entry.expires <= now) sessionProfileCache.delete(key);
                  }
                }
                sessionProfileCache.set(userId, {
                  name,
                  avatar: dbUser.avatar,
                  expires: Date.now() + SESSION_PROFILE_TTL_MS,
                });
                return { name, avatar: dbUser.avatar };
              })();
              sessionProfileInflight.set(userId, load);
              const profile = await load.catch(() => null);
              if (profile) {
                session.user.name = profile.name;
                session.user.image = profile.avatar;
              }
            } catch {
              // Database unavailable — fall back to the token's cached name.
            } finally {
              sessionProfileInflight.delete(userId);
            }
          }
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export const { GET, POST } = handlers;
