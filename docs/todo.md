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
