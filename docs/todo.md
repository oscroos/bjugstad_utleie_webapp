# TODO

Known gaps and agreed target states that are not being worked on yet. Add new
items at the bottom of the fitting section. Move an item out of this file when
it is done; the git history keeps the record.

## Security

### Restrict machine access per company and contract period

**Status:** open, no code changes made yet (noted 2026-11-22)

**Today:** `GET /api/machines/[machineId]` only checks that the caller is
logged in with role `customer` or `super_admin`. Any logged-in customer can
fetch the details of any machine by guessing its id. The same question applies
to every other place that returns machine data (machine list, map positions,
telemetry).

**Target state:**

- Super admins have access to all machines across all companies.
- Other users have access only to machines that are on rental agreements with
  a company they belong to.
- That access holds only while the agreement is active, meaning within the
  contract period. Before the start date and after the end date the machine is
  not accessible to that company's users.

**Open points to settle when this is picked up:**

- Whether ended agreements should still show the machine name in agreement
  history while the machine details and position stay blocked.
- An agreement without an end date counts as active from its start date.
  `splitAgreementsByStatus` in `lib/agreements.ts` currently looks at the end
  date only, so agreements that have not started yet count as active.
- The check needs the customer's agreements from the Bjugstad register on each
  request, so it should reuse the cached lookup in `lib/agreements.ts`.

### Close the database firewall rule that allows the whole internet

**Status:** open, no changes made (found 2026-11-24)

**Today:** the PostgreSQL server `oem-webapp-server` has a firewall rule named
`AllowAll…` that admits every IP address, next to a rule for all Azure services
and ten single-address rules for developers. Anyone on the internet can reach
the login prompt; only the password and TLS stand in the way. The rule is most
likely there because the web app runs on Vercel, which has no fixed outgoing
addresses on the standard plans.

**Target state:** the database accepts connections only from the web app, the
Function App and named developer addresses.

**Ways to get there:**

- Host the web app in Azure and reach the database over private networking.
  See "Host the web app in Azure instead of Vercel" below.
- Stay on Vercel and use its fixed outgoing addresses (a paid feature), then
  replace `AllowAll…` with those addresses.
- Remove developer rules that are no longer used.

## Architecture

### Host the web app in Azure instead of Vercel

**Status:** open, to be evaluated and done at some point (noted 2026-11-24)

**Today:** the Next.js web app is deployed on Vercel. The database, the
Function App, the Key Vault and monitoring are in Azure, in resource group
`rg-oem`. There is no web app resource in Azure.

**Is it possible:** yes. A Next.js app with server rendering, API routes and
middleware runs on Azure App Service (Linux, Node) or Azure Container Apps.
Azure Static Web Apps also supports Next.js, with more limitations.

**Why consider it:**

- The database firewall can be closed to the internet (see the Security item
  above), because the web app and the database can share a private network.
- Secrets can come from the Key Vault, as they already do for the Function
  App, instead of being copied into Vercel's settings.
- One place for hosting, logs, access control and cost.

**To evaluate before implementing:**

- Which Azure service, and what it costs compared with Vercel.
- How deployments will run. Vercel builds on every push; Azure needs a
  pipeline (for example GitHub Actions) that builds and deploys.
- What Vercel does for free that must be replaced or accepted as lost: preview
  deployments per branch, the global edge network, image optimisation.
- Settings that are tied to the address of the app: the Vipps redirect
  addresses, `NEXTAUTH_URL`, and the custom domain and its DNS.
- The middleware runs on Vercel's edge runtime today. On App Service it runs
  in the same Node process, which should work but must be tested.
- Database migrations: decide where `prisma migrate deploy` runs in the new
  pipeline.
- A cut-over plan with a way back, since this is the production login path.

### Move all Bjugstad API calls out of the web app and into the Azure backend

**Status:** open, needs evaluation before anything is built (noted 2026-11-24)

This is a design choice, not a decided change. Evaluate it first; the points
below are the input for that evaluation.

**Today:** the web app has two data sources. Most pages read our own Azure
database. Some pages also call the Bjugstad rental register API live, from the
web app's server side, each time the page is opened:

- Avtaler and the machine list on a project: `GetRentals` and
  `GetRentalsByCustomerId` in `lib/agreements.ts`
- Kunder: `GetCustomers` in `app/(admin)/kunder/page.tsx`
- Min profil and the customer dialog: `GetCustomerById` in
  `app/(main)/profil/page.tsx` and `app/api/customers/[customerId]/route.ts`
- Machine details and machine attachments: `app/api/machines/[machineId]/`

The calls are made by the server, not by the browser, so the API key is not
exposed to users. But the web app needs its own copy of the Bjugstad API
address and key (`BJUGSTAD_API_BASEURL`, `BJUGSTAD_API_KEY_PRIMARY`,
`BJUGSTAD_API_KEY_SECONDARY`), and those pages fail when the settings are
missing or the register is down. The Azure Function already calls the same API
to sync machines and customers into the database.

**Proposed target state:** the web app never calls the Bjugstad system. All
calls to it are made in the Azure backend, which stores what the web app needs
in the database. The web app reads the database only.

**To evaluate before implementing:**

- Freshness. Agreements are read live today. Synced data is as old as the last
  sync, so decide how stale agreements, customers and machine details may be.
- What cannot be synced sensibly. Machine attachments are files fetched on
  demand; they may need a backend endpoint that passes them through instead.
- Access control. The machine access item under Security depends on
  agreements, so the two should be designed together.
- Where the backend lives: more timer-based sync in the existing Function App,
  or an API in Azure that the web app calls on demand.
- Load and limits on the Bjugstad API when everything is synced on a schedule
  instead of fetched when someone opens a page.
- What it removes: the web app's own copy of the API key, a second failure
  mode on five pages, and the slowest part of loading Avtaler and Prosjekter.
- What it costs: new tables, sync jobs and monitoring, and a migration of the
  pages listed above.
