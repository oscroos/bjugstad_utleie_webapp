// REFERANSE – behold deres eksisterende @/lib/auth (NextAuth) hvis dere har den.
//
// Modulene forventer at auth() returnerer en session der user har BÅDE `id` og
// `organizationId`. Hvis dere ikke eksponerer organizationId ennå, legg det på
// i NextAuth-callbackene (session/jwt), f.eks.:
//
//   callbacks: {
//     async jwt({ token, user }) {
//       if (user) token.organizationId = user.organizationId;
//       return token;
//     },
//     async session({ session, token }) {
//       session.user.id = token.sub!;
//       session.user.organizationId = token.organizationId as string;
//       return session;
//     },
//   }
//
// Og utvid typene (types/next-auth.d.ts):
//
//   declare module "next-auth" {
//     interface Session { user: { id: string; organizationId: string } & DefaultSession["user"] }
//     interface User { organizationId: string }
//   }

export { auth } from "@/auth"; // peker til deres NextAuth-oppsett
