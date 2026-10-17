# Phase 4 Implementation Plan - GPS and Telemetry Ingestion

This plan implements the parts of Phase 4 that are defined well enough today while keeping the existing application, map, and Azure telemetry jobs runnable. External device connectivity and unclear product behavior remain explicit integration points until the client answers the questions recorded in `docs/implementation-status.md`.

## Scope

Phase 4 will establish one reliable path for machine position and operational telemetry from existing OEM jobs and future Teltonika/Mictrack devices. It will not implement the complete Phase 6 map/zone product or pretend that a physical GPS connection exists before a parser, device, SIM, and test environment are available.

## Decisions We Can Make Now

- Keep `MachinePositionHistory` as the canonical detailed position stream. Do not introduce the client's overlapping `MachinePosition` model.
- Keep the latest position fields on `Machine` for fast map reads.
- Add provider links so provider identities and IMEIs are not stored as one-off columns on `Machine`.
- Store operational period summaries separately from individual position records.
- Make all new fields additive and nullable so existing records and integrations remain valid.
- Keep Teltonika/Mictrack protocol decoding outside the Next.js application. The portal receives normalized HTTPS requests only.
- Do not synthesize fuel, engine-hour, energy, or payload values when a provider does not supply them.
- Put Phase 6 zone evaluation behind an interface that safely does nothing until the zone engine exists.

## 1. Baseline And Compatibility

1. Record successful baseline checks for Prisma, TypeScript/Next.js, and the Azure Functions build.
2. Add focused tests around the current position-history persistence before changing it.
3. Preserve the current `/kart` data shape and existing machine location/history API responses.
4. Treat current provider jobs as production behavior: refactor them only behind tests and in small steps.

## 2. Additive Data Model

Add a migration containing:

- `TelemetryProvider`, including current providers plus `TELTONIKA`, `MICTRACK`, and `OTHER`.
- `MachineTelemetryLink` with machine, provider, external ID/IMEI, active state, and last-seen/sync timestamps.
- A normalized periodic telemetry snapshot with nullable engine, idle, fuel, energy, distance, and payload values.
- Nullable position-history fields for ignition, operating status, project, and provider event identity.
- Constraints that allow several providers per machine while preventing duplicate provider/external-ID mappings.

Do not require data backfills for the application to start. Existing `trackunitId` behavior remains until its migration to provider links has been verified.

## 3. Normalized Ingestion Contract

Define and document a versioned internal payload for parser/middleware calls. At minimum it will carry:

- Provider and device IMEI/external ID.
- A stable provider event ID where available.
- Event timestamp, latitude, longitude, speed, heading, and ignition.
- Optional engine hours, fuel, energy, distance/odometer, payload, and provider metadata.

Validate the contract with Zod. Invalid coordinates, timestamps, numeric values, or oversized batches must be rejected before database writes.

Provide JSON examples and automated fixtures. These fixtures are test inputs, not claims that a real Teltonika/Mictrack connection is active.

## 4. Portal Ingestion Service And API

Implement the business logic in a reusable telemetry service, with `POST /api/inbound/gps` as a thin adapter:

1. If ingestion is not configured, return a controlled service-unavailable response; do not fail application startup or normal page rendering.
2. Validate `x-ingest-secret` and the normalized payload.
3. Resolve the active provider/device link to a machine.
4. Log unknown devices with limited metadata and no secrets.
5. Insert records idempotently and tolerate delayed/out-of-order events.
6. Update `Machine` latest-position fields only when the incoming event is newer.
7. Derive `WORKING`, `IDLE`, or `OFF` only when ignition data is available.
8. Invoke the project-assignment and zone-evaluation interfaces when configured; otherwise record that those steps were skipped.
9. Update device last-seen state and return a deterministic per-record result.

The API must not be called by normal pages during startup, so a missing secret, parser, or device cannot break the web application.

## 5. Device Administration

Add a conservative super-admin-only API and UI for:

- Listing telemetry links and their last-seen state.
- Registering a provider and external ID/IMEI against an existing machine.
- Activating, deactivating, replacing, or reassigning a link with audit history.
- Showing that parser connectivity is "not configured" or "not yet verified" without blocking the rest of the app.

Role expansion beyond super-admin remains a client decision.

## 6. Existing Provider Normalization

Incrementally adapt the Azure CAT, Hydrema, and Trackunit jobs:

- Continue writing the existing latest-position fields and position history.
- Register/use provider-link identities where reliable external IDs exist.
- Write normalized operational snapshots only for measurements actually returned by each provider.
- Preserve current transaction and duplicate-prevention behavior.
- Do not disable a working provider job merely because another provider lacks configuration.

Connector-specific expansion for engine hours, fuel, and other OEM measurements can remain marked as unavailable until credentials, endpoints, and required fields are confirmed.

## 7. Period Aggregation

Add a testable aggregation service that can produce daily snapshots from ignition/status observations. Register its schedule only after the following client rules are resolved:

- Maximum allowed gap between observations when calculating elapsed operating time.
- Day boundary/timezone.
- Treatment of delayed records and corrections.
- Whether provider-reported cumulative counters override calculated durations.

Until then, provider-supplied snapshots may be stored, while calculated engine/idle totals remain explicitly unavailable rather than guessed.

## 8. Phase 6 Boundary

Create a small `evaluatePositionForZones` interface called after a position is persisted. Its Phase 4 implementation will be a documented no-op unless the client requires minimal geofencing now.

Phase 6 will replace that implementation with project assignment, zone transition detection, speeding/no-go/work-hours rules, event deduplication, and notifications. This avoids importing the supplied zone prototype before its data and behavior are agreed.

## 9. External Parser Placeholder

Document but do not fake the missing external service:

```text
Teltonika/Mictrack device
  -> vendor TCP protocol
  -> managed middleware or separately hosted parser
  -> normalized HTTPS request
  -> /api/inbound/gps
```

The repository will contain the normalized contract, sample requests, health expectations, and setup checklist. Parser code is implemented only after the exact hardware and managed-versus-self-hosted decision are known.

## 10. Verification And Rollout

Before merging:

- Run Prisma validation/generation and review the migration SQL.
- Run web type checking/build and Azure Function build.
- Test invalid/missing secrets, invalid payloads, unknown IMEIs, duplicates, delayed events, and newer/older latest-position updates.
- Confirm existing CAT, Hydrema, and Trackunit map/history behavior is unchanged.
- Confirm the application starts and normal pages work with no GPS integration environment variables.

Before enabling in production:

- Apply and verify the database migration.
- Configure secrets without storing them in the database or repository.
- Register test-device links.
- Run physical-device tests through the selected parser/middleware.
- Measure actual device-to-map latency and reconcile it with the agreed target.
- Verify access control, retention, monitoring, and rollback behavior.

## Completion Boundary

Code completion is possible without physical devices for the schema, validated ingestion contract, disabled-by-default endpoint, device administration, persistence, fixtures, and tests.

Phase 4 cannot be marked fully implemented until a real Teltonika or Mictrack device completes the end-to-end flow, the selected operational measurements are verified, the agreed latency is met, and the client decisions in the tracker are closed.
