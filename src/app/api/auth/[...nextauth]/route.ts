import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { prisma } from "@/lib/prisma";
import bcrypt from "bcryptjs";

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

        if (!user?.isActive) return null;

        const passwordMatch = await bcrypt.compare(password, user.password);
        if (!passwordMatch) return null;

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
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
        if (typeof token.role === "string") session.user.role = token.role;
        if (typeof token.name === "string") session.user.name = token.name;
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id },
            select: { firstName: true, lastName: true, avatar: true },
          });
          if (dbUser) {
            session.user.name = `${dbUser.firstName} ${dbUser.lastName}`;
            session.user.image = dbUser.avatar;
          }
        } catch {
          // Database unavailable — fall back to the token's cached name.
        }
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
});

export const { GET, POST } = handlers;
