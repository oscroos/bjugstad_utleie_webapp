# Telemetry Integration - Phase 4

This document describes the portal-side integration boundary implemented for Phase 4. It does not mean that Teltonika or Mictrack hardware, SIM cards, TCP parsing, or middleware are configured.

## Runtime Configuration

GPS ingestion is disabled by default. Both variables are required to enable it:

```dotenv
GPS_INGEST_ENABLED=true
GPS_INGEST_SECRET=replace-with-a-long-random-secret
```

If either setting is absent, `POST /api/inbound/gps` returns `503` while the rest of the application continues to run normally.

The secret belongs in the deployment secret store. Do not commit it or store it in `MachineTelemetryLink`.

## Normalized GPS Request

The external parser or middleware sends HTTPS JSON to:

```text
POST /api/inbound/gps
x-ingest-secret: <GPS_INGEST_SECRET>
Content-Type: application/json
```

Example:

```json
{
  "version": 1,
  "provider": "TELTONIKA",
  "deviceImei": "123456789012345",
  "records": [
    {
      "eventId": "provider-event-123",
      "at": "2026-10-17T10:00:00Z",
      "lat": 60.123,
      "lng": 10.123,
      "altitude": 145.2,
      "speedKmh": 1.5,
      "heading": 220,
      "ignition": true,
      "distanceKm": 1240.5,
      "engineHours": 245.7,
      "fuelLiters": 910.2
    }
  ]
}
```

`provider` may be omitted only when the IMEI has exactly one active Teltonika/Mictrack mapping. Sending it is recommended.

Requests contain 1-500 records and are limited to 1 MB. IMEIs must contain 8-20 digits. Coordinates, timestamps, headings, speeds, and non-negative measurements are validated before database writes.

## Persistence Behavior

- IMEI and provider resolve through `MachineTelemetryLink`.
- Duplicate records are ignored using the provider event ID when supplied. If it is omitted, the portal derives a stable ID from the normalized observation; the existing machine/source/timestamp key remains an additional safeguard.
- Delayed records are stored in history but cannot overwrite a newer latest position.
- Ignition off becomes `OFF`.
- Ignition on with speed below 2 km/h becomes `IDLE`.
- Ignition on with speed at or above 2 km/h becomes `WORKING`.
- Provider counters are retained on the position observation for later aggregation.
- Unknown identifiers are logged in masked form and return `404`.
- Project assignment is currently explicitly unconfigured.
- Phase 6 zone evaluation is currently an explicit no-op.

## Period Snapshots

`MachineTelemetrySnapshot` stores normalized period values separately from individual positions. Supported values are engine hours, idle hours, fuel, energy, distance, and payload.

Provider connectors can call `upsertTelemetrySnapshot` when their period semantics are known. Calculated daily snapshots are not scheduled until the client confirms maximum observation gaps, timezone/day boundaries, correction handling, and whether provider counters take priority.

## External Parser Placeholder

The missing external path is:

```text
Teltonika/Mictrack device
  -> SIM/mobile network
  -> vendor TCP protocol
  -> managed middleware or separately hosted parser
  -> normalized HTTPS request
  -> portal endpoint
```

The repository does not contain a Codec 8 Extended or Mictrack TCP parser. Do not point physical devices directly at the Next.js endpoint.

## Administration

Super-admins manage provider/external-ID mappings under `/telemetri`. The page stores no provider passwords or API keys. It supports registering, moving, activating, and deactivating mappings with audit logging. A mapping can be permanently deleted only before it has been seen, synchronized, or referenced by position history; established mappings remain deactivation-only.

## Deployment Order

1. Deploy/apply `20261017120000_phase_4_telemetry_foundation`.
2. Deploy the web application and Azure Functions.
3. Register test-device mappings under `/telemetri`.
4. Configure the parser or middleware with the HTTPS endpoint and shared secret.
5. Set `GPS_INGEST_SECRET` and then enable `GPS_INGEST_ENABLED`.
6. Test invalid secrets, unknown IMEIs, duplicates, delayed messages, status calculation, and map updates.
7. Measure physical device-to-map latency before enabling production devices.

Azure CAT, Hydrema, and Trackunit timers detect whether the Phase 4 tables exist. They retain their previous position/history behavior before migration and start maintaining provider links after migration.
