## Phase 1: Foundation and admin catalogues

**Status: fully implemented**

## Phase 2: Project module

**Status: started, not finished**

- Connect project KPIs to live telemetry, mass, and CO2 data instead of manual values.
- Complete the project map and actual mass/load views through Phases 6 and 7.
- Decide required project fields and KPI rules.
- Add end-to-end tests for project setup, access, and status calculations.

## Phase 3: Document hotel and call-offs

**Status: started, not finished**

- Implement Azure file upload/download and call-off PDF generation and archiving.
- Configure and test the external call-off integration in both directions.
- Add searchable project selection and test the complete call-off workflow.
- Decide folder creation, permissions, signature method, PDF format/storage, notifications, and file retention.

## Phase 4: GPS and telemetry ingestion

**Status: started, not finished**

- Implemented the normalized GPS contract, disabled-by-default ingestion, IMEI/provider administration, operating status, snapshot foundation, location access checks, automated tests, and explicit Phase 6 placeholders.
- Apply and verify the database migration, then configure the real middleware/parser, devices, SIM/APN, credentials, and physical-device tests.
- Complete project assignment, geofencing, scheduled aggregation, and OEM operational metrics after the required rules and provider semantics are decided.
- Client decision: exact Teltonika/Mictrack models and firmware, CAN-equipped machines, required measurements, reporting frequency, and 10-second versus 60-second latency target.
- Client decision: managed middleware versus a self-hosted parser; ownership of accounts, TCP hosting, SIM/APN setup, installation, device configuration, credentials, and test hardware/messages.
- Client decision: source priority when a machine has multiple providers, handling of delayed/offline data and clock differences, and whether full OEM snapshot normalization is required in Phase 4.
- Client decision: position/raw/aggregate retention and GDPR rules, IMEI administration, whether devices can move between machines, and who may view location history and operational data.
- Client decision: project-assignment rules and agreement/project mapping, what "snapshot visible" means, stale/offline behavior, operational notifications, and whether minimal geofencing belongs in Phase 4.

## Phase 5: Fleet and Fleet AI

**Status: started, not finished**

- Replace dashboard demo data with real machine, telemetry, customer, and agreement data.
- Implement active-fleet, ownership, history, maintenance, utilization, idle-cost, and fault rules.
- Build Fleet AI with access control, usage limits, and suitable no-data behavior.
- Decide authoritative data sources, cost settings, AI provider/model, and final naming/tone.

## Phase 6: Maps

**Status: started, not finished**

- Add the required map modes, ownership/status styling, and saved user preferences.
- Build project zones, rules, geofence events, acknowledgements, routes, haul cycles, and driver assistance.
- Configure a production aerial/satellite map provider.
- Decide map licensing, default map mode, zone permissions, and alert/work-hour rules.

## Phase 7: Mass/load lists and mass coordination

**Status: started, not finished**

- Add actual mass movements and load tickets from manual, app, scale, and GPS sources.
- Add conversion, plan-versus-actual warnings, and cross-project mass coordination.
- Integrate and test scale and client-app data sources.
- Decide source priority, correction/approval permissions, warning thresholds, and savings assumptions.

## Phase 8: Reporting and CO2

**Status: not started**

## Phase 9: Change orders

**Status: not started**

## Phase 10: Personnel and time

**Status: not started**

## Phase 11: HSE

**Status: not started**

## Phase 12: Feed

**Status: not started**

## Phase 13: Mini-lawyer and legal base

**Status: not started**

## Phase 14: Standards, compliance, and global search

**Status: started, not finished**

- Build the standards library, version handling, sharing, and disclaimer flow.
- Expand compliance status to reporting, HSE, KPIs, change orders, and mass deviations.
- Add access-aware global search and standard-version notifications.
- Decide search scope/ranking, compliance rules, sharing consent, disclaimer wording, and version sources.
