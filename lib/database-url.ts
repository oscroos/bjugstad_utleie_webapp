// Prisma encrypts the connection when the URL says sslmode=require, but it only
// verifies the server certificate when the URL also says sslaccept=strict.
// Without that check, anyone on the network path could pose as the database and
// read the password. The app therefore adds sslaccept=strict itself.
//
// A URL that sets sslaccept explicitly is left alone. That is the way to opt out
// for a local database with a self-signed certificate.
const TLS_MODE = /[?&]sslmode=(require|verify-ca|verify-full)(&|$)/i;
const HAS_SSLACCEPT = /[?&]sslaccept=/i;

export function withStrictTls(url: string | undefined): string | undefined {
  if (!url || !TLS_MODE.test(url) || HAS_SSLACCEPT.test(url)) return url;
  return `${url}&sslaccept=strict`;
}
