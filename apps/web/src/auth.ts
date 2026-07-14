import NextAuth from "next-auth";
import Google from "next-auth/providers/google";
import Resend from "next-auth/providers/resend";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { createDb, accounts, sessions, users, verificationTokens } from "@raah/db";
import { loadEnv } from "@raah/shared/env";

const env = loadEnv();
const { db } = createDb(env.DATABASE_URL);

/**
 * Auth.js v5 (P0.9): Google OAuth + email magic link (Resend free tier).
 * Providers register only when their keys exist, so dev boots without secrets.
 * JWT session strategy: the api verifies sessions without a DB round-trip.
 * Phone OTP is scale-phase by decision — do not add (ARCH §2).
 */
const providers = [
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? [Google({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET })]
    : []),
  ...(env.AUTH_RESEND_KEY ? [Resend({ apiKey: env.AUTH_RESEND_KEY, from: env.EMAIL_FROM })] : []),
];

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: env.AUTH_SECRET,
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt" },
  providers,
  callbacks: {
    jwt({ token, user }) {
      if (user?.id) token.userId = user.id;
      return token;
    },
    session({ session, token }) {
      if (typeof token.userId === "string") session.user.id = token.userId;
      return session;
    },
  },
});
