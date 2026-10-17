# Implementation Status - Client Roadmap

Last reviewed: 2026-10-17

This document tracks implementation against the phases and acceptance criteria in the client's `kjoreplan-utviklere.md`. Update it whenever phase-related code, configuration, deployment state, or client decisions change.

## Status definitions

- **fully implemented**: The phase is implemented in the codebase and meets the stated acceptance criteria. Deployment or environment-specific caveats are called out separately.
- **started, not finished**: Relevant functionality exists, but one or more acceptance criteria, integrations, or required decisions remain.
- **not started**: No phase-specific implementation exists.

## Summary

| Phase | Area | Status |
| --- | --- | --- |
| 1 | Foundation and admin catalogues | **fully implemented** |
| 2 | Project module | **started, not finished** |
| 3 | Document hotel and call-offs | **started, not finished** |
| 4 | GPS and telemetry ingestion (AP-11) | **started, not finished** |
| 5 | Fleet and Fleet AI | **started, not finished** |
| 6 | Maps | **started, not finished** |
| 7 | Mass/load lists and mass coordination | **started, not finished** |
| 8 | Reporting and CO2 | **not started** |
| 9 | Change orders | **not started** |
| 10 | Personnel and time | **not started** |
| 11 | HSE | **not started** |
| 12 | Feed | **not started** |
| 13 | Mini-lawyer and legal base | **not started** |
| 14 | Standards, compliance, and global search | **started, not finished** |

## Cross-cutting verification notes

- Database migration state could not be confirmed during this review. `npx prisma migrate status` returned a generic Prisma schema-engine error in the current environment. The Phase 3 migration was previously known to require application to the target database; verify all migrations before release.
- A focused Vitest suite now covers the Phase 4 telemetry contract, status derivation, aggregation, configuration, and ingestion behavior. Broader end-to-end coverage is still outstanding.
- A coded integration path is not considered production-ready until its credentials, target service, error handling, and end-to-end behavior have been configured and verified in the deployment environment.

## Phase 1 - Foundation and admin catalogues

**Status: fully implemented**

### Implemented

- Added the shared mass-type catalogue, project custom-field definitions and values, project participants, and audit logging foundations in Prisma.
- Added a super-admin-only catalogue API and `/katalog` administration UI. Non-super-admin users receive `403` from the API.
- Mass types support unit, classification, tonnes per cubic metre, swell factor, sort order, and active status.
- Custom fields support text, number, date, select, and boolean values, plus required/active flags, ordering, and select options.
- Active required custom fields are included and validated during project setup.
- Unused catalogue entries can be deleted. Entries already in use are deactivated so historical references are retained.
- Catalogue changes are written to the audit log.

### Relevant files

- `prisma/migrations/20260829110000_phase_1_admin_catalogs/migration.sql`
- `prisma/schema.prisma`
- `app/api/admin/katalog/route.ts`
- `app/(admin)/katalog/page.tsx`
- `app/(admin)/katalog/CatalogAdminClient.tsx`
- `lib/access.ts`
- `lib/projects.ts`

### Comments

- The code meets the Phase 1 acceptance criteria found in the client roadmap. Automated acceptance tests have not yet been added.

## Phase 2 - Project module

**Status: started, not finished**

### Implemented

- Added project contract, address, size, client/contact, status, date, KPI, mass-plan, and custom-field data to Prisma.
- Added project creation and editing, access control, role checks, and audit logging.
- Added a project list searchable by project number, name, customer, client, city, and status.
- Added project workspace tabs for information, site map, mass/load data, and documents.
- Added contract-goal management and a shared red/yellow/green deviation calculation used on the front page and project views.
- Added project mass planning and the document-tab foundation.

### Remaining work

- Calculate KPI actual values from live telemetry, mass, and CO2 data. Current KPI values are entered manually.
- Confirm and implement the final warning rules. Current defaults are 90% of a maximum target and 80% of a minimum target; missing data is shown as yellow.
- Replace the site-map placeholder with the completed Phase 6 project map.
- Replace the mass/load placeholder and planning-only view with completed Phase 7 actual load data.
- Add focused end-to-end tests for project creation, editing, access, and deviation states.

### Outstanding decisions

- Which project fields are mandatory for each project/contract type?
- Who may add, remove, and change project participants and project roles? The data model exists, but there is no participant-management UI or API.
- What time period and project scope should each KPI use?
- Should manually entered KPI values remain available as an override after live calculations are connected?

### Relevant files

- `prisma/migrations/20260829143000_phase_2_project_module/migration.sql`
- `prisma/schema.prisma`
- `app/(main)/prosjekter/`
- `app/api/prosjekter/`
- `lib/projects.ts`
- `lib/project-status.ts`

## Phase 3 - Document hotel and call-offs

**Status: started, not finished**

### Implemented

- Added document folders, document metadata, call-offs, call-off lines, statuses, and audit history to Prisma.
- Added locked system folders and seeded agreement subfolders.
- Added customer and project document views, custom folders, and project-linked folders.
- Protected system and project folders from inappropriate deletion or modification.
- Added call-off drafts, lines, status transitions, sending, return handling, signing, rejection, and cancellation.
- Added authorization checks, audit logging, and a secret-protected inbound return webhook.
- Added clear disabled UI placeholders for file transfer and PDF behavior that still require external infrastructure.

### Remaining work

- Implement actual Azure Blob Storage upload and download. The files endpoint currently returns `501 Not Implemented`.
- Generate the call-off PDF, create the corresponding `DocFile`, archive it in `Avropsdokumenter`, and set `pdfDocFileId`.
- Configure and test AP-12/Blazor integration in both directions with real endpoints and secrets.
- Replace the plain project selector with the searchable project selector required by the roadmap.
- Run the complete acceptance flow with both systems active: draft, send, receive return, generate/store PDF, sign/reject, and audit.
- Decide whether file preview, deletion, and versioning are required before the document hotel is considered complete.

### Outstanding decisions

- Should project document folders be created automatically or manually?
- Is a framework agreement entered as free text or selected from an external register?
- Which roles may create folders, upload files, send call-offs, and sign/reject them?
- What signature method is required?
- What must the PDF contain, how should it be named, and should it be stored only under `Avropsdokumenter` or also in the project folder?
- Are notifications required when a call-off is sent, returned, signed, rejected, or cancelled?
- What Azure Storage region, retention policy, and access model should be used?

### Relevant files

- `prisma/migrations/20260829173000_phase_3_documents_calloffs/migration.sql`
- `prisma/schema.prisma`
- `app/(main)/dokumenter/`
- `app/(main)/prosjekter/[projectId]/ProjectDocumentsPanel.tsx`
- `app/api/dokumenter/`
- `app/api/avrop/route.ts`
- `app/api/inbound/avrop-retur/route.ts`
- `lib/documents.ts`

## Phase 4 - GPS and telemetry ingestion (AP-11)

**Status: started, not finished**

Existing telemetry work predates the phase implementation but covers part of its required foundation.

### Implemented

- The machine model stores current position, speed, distance, Trackunit identity, and related telemetry fields.
- Machine position history is stored and exposed through location APIs.
- Azure Functions poll and synchronize machine data from Trackunit, CAT, Hydrema, and the Bjugstad machine service.
- Existing machine and map views consume current positions and position history.
- Added an additive telemetry schema for provider links, position observations, operating status, and normalized period snapshots without replacing the existing position-history model.
- Added a versioned, validated GPS payload contract with request-size and batch-size limits.
- Added a secret-protected inbound GPS endpoint that is disabled by default, masks device identifiers in logs, rejects unknown or ambiguous devices, ignores duplicates, and prevents delayed records from replacing newer machine positions.
- Defined the provisional operating-status rule: ignition off is `OFF`, ignition on below 2 km/h is `IDLE`, and ignition on at or above 2 km/h is `WORKING`.
- Added a super-admin telemetry page for registering, reassigning, activating, and deactivating provider identities and IMEIs. Unused links can be deleted after confirmation, while links with telemetry activity remain deactivation-only. Administration changes are audited.
- Added explicit no-op project-assignment and zone-evaluation boundaries so Phase 4 does not invent Phase 6 behavior.
- Added idempotent snapshot persistence and a pure, unscheduled duration aggregator with an explicit maximum-gap rule.
- Extended the CAT, Hydrema, and Trackunit persistence path to maintain provider links after the Phase 4 migration exists while retaining the current pre-migration position behavior.
- Tightened customer access to machine location and history APIs to machines covered by an active agreement.
- Added automated telemetry tests and deployment/integration documentation.

### Remaining work

- Apply and verify the additive Phase 4 migration in the intended environment. Migration status currently fails with a generic Prisma schema-engine error against the configured Azure database, so it was not applied automatically.
- Select and configure Teltonika Codec 8 Extended and Mictrack parsing/middleware outside the Next.js runtime.
- Obtain the selected devices, SIM/APN setup, raw sample messages, vendor documentation, credentials, and a non-production integration environment.
- Implement project assignment after the authoritative agreement/project/geofence priority is decided.
- Replace the zone-evaluation no-op with the Phase 6 geofence engine.
- Confirm the aggregation gap, timezone/day boundaries, counter semantics, and correction policy before scheduling period aggregation.
- Expand normalized OEM operational measurements after provider-specific meanings and Phase 4 acceptance scope are confirmed.
- Configure production ingestion secrets and enable the endpoint only after the external parser or middleware is connected.
- Run database migration integration tests and end-to-end latency tests with physical devices.

The staged implementation approach is documented in `docs/phase-4-implementation-plan.md`.

### Open questions for the client

- Which exact Teltonika and Mictrack models, firmware versions, and quantities will be used first?
- Which machines will have CAN adapters, and which CAN measurements are expected from them?
- Should we use managed middleware such as flespi/Navixy, or must we host and maintain the TCP protocol parsers ourselves?
- If middleware is preferred, who supplies the account, subscription, credentials, and configuration access?
- Who is responsible for SIM cards, APN/network setup, physical installation, and configuring each device's destination host and port?
- Which measurements are required in Phase 4: position, ignition, engine hours, idle hours, fuel, energy, odometer/distance, payload, battery, signal strength, or other IO values?
- What is the authoritative ignition/CAN IO mapping for each selected device model and installation?
- Is the required end-to-end visibility target 10 seconds as stated in the roadmap, or 60 seconds as stated in the integrator specification?
- How frequently should devices report while moving, idle, off, and disconnected?
- If a machine reports through multiple providers, which source has priority for position and each operational measurement?
- How should offline buffering, delayed uploads, out-of-order messages, and clock differences on devices be handled?
- How long should detailed position records, raw provider payloads, and aggregated telemetry be retained, and what GDPR restrictions apply?
- Who may register, replace, deactivate, or reassign an IMEI to a machine?
- Can one machine have multiple active telemetry providers, and can one physical device ever be moved between machines?
- What is the authoritative rule for assigning a position to a project: active rental agreement, manual assignment, project geofence, or a priority order between these?
- How should the portal map external agreement/project references to the portal's `Project` records?
- What does "snapshot visible on the machine" mean in the acceptance criterion: updated map position, a machine-detail telemetry panel, or both?
- When should a machine be shown as stale/offline, and where should that state appear?
- Is the implemented location rule correct: super-admins may view every machine, while customers may view only machines on their active agreements? Which roles may view future operational telemetry?
- Should unknown devices, offline devices, suspected tampering, or ingestion failures create notifications; if so, who receives them and through which channel?
- Will the client provide configured test devices, test SIMs, sample raw messages, vendor documentation, and access to a non-production environment?
- Must all existing OEM integrations write normalized operational snapshots during Phase 4, or is Phase 4 acceptance initially limited to GPS devices plus the common data model?
- Before Phase 6 is implemented, should zone evaluation be skipped explicitly or should Phase 4 include a minimal site-boundary/geofence implementation?

### Relevant files

- `prisma/schema.prisma`
- `prisma/migrations/20260314133000_add_trackunit_telemetry_columns/migration.sql`
- `prisma/migrations/20260315110000_add_machine_position_history/migration.sql`
- `prisma/migrations/20261017120000_phase_4_telemetry_foundation/migration.sql`
- `app/(admin)/telemetri/`
- `app/api/admin/telemetri/route.ts`
- `app/api/inbound/gps/route.ts`
- `app/api/machines/[machineId]/location/route.ts`
- `app/api/machines/[machineId]/location-history/route.ts`
- `lib/telemetry/`
- `azure/function/src/functions/`
- `azure/function/src/services/`
- `azure/function/src/shared/db.ts`
- `docs/phase-4-implementation-plan.md`
- `docs/telemetry-integration.md`
- `tests/telemetry-*.test.ts`

## Phase 5 - Fleet and Fleet AI

**Status: started, not finished**

### Implemented

- `/maskiner` contains the intended dashboard structure with filters, charts, map, usage, energy, CO2, and idle-time views.
- Existing machine detail, customer, agreement, and current-location functionality provides part of the required data foundation.

### Remaining work

- Replace `DUMMY_MACHINES` and generated chart data in the dashboard with real telemetry, machine, customer, and agreement data.
- Implement the active-fleet business rule: owned machines plus rented machines with active agreements only, while excluding registered/pickup machines from fleet and map views.
- Add historical period queries and consistent ownership categories for owned, rented, and subcontractor equipment.
- Implement Fleet AI with access controls, usage limits, context assembly, and clear no-data behavior.
- Add fault, maintenance, and utilization data/models where the roadmap requires them.
- Calculate idle costs using an administratively configurable fuel price.
- Complete acceptance testing against live fleet data.

### Outstanding decisions

- What is the authoritative source for owned machines, ownership category, and agreement status mapping?
- Where should fuel price and other cost assumptions be managed?
- Which AI provider/model and deployment environment should Fleet AI use?
- Should the current `Maskiner` navigation label change to `Flåte`?
- Does the client approve the exact Fleet AI tone and suggested prompts described in the roadmap?

### Relevant files

- `app/(main)/maskiner/MachinesDashboard.tsx`
- `app/(main)/maskiner/page.tsx`
- `app/(main)/avtaler/`
- `app/api/machines/`
- `app/api/agreements/route.ts`
- `lib/machines.ts`
- `lib/agreements.ts`
- `azure/function/src/`

## Phase 6 - Maps

**Status: started, not finished**

### Implemented

- Added a MapLibre fleet map with current machine positions, search/filtering, table interaction, and position-history overlays.
- Added machine location/history APIs and OEM-based visual differentiation.

### Remaining work

- Add schematic, standard map, aerial-photo, and satellite display modes with per-user persistence.
- Add the required ownership ring and machine-status fill styling.
- Build the project site map; the current project tab has no zone implementation.
- Add site-zone and zone-event models, draw/edit tools, and rules for extraction, dumping, road speed, no-go areas, boundaries, and work hours.
- Build the geofence evaluation engine and event acknowledgement flow within the required latency.
- Add crew handling, BLE tags, routes, haul cycles, zone suggestions, and the driver-assistant behavior required by the roadmap.
- Configure and verify the selected production basemap/licensing arrangement.

### Outstanding decisions

- What commercial terms and endpoint will be used for Norge i bilder or another aerial/satellite provider?
- Which roles may draw/edit zones and acknowledge events?
- Which alert channels, work hours, and timezone rules apply?
- What should the default basemap be, and what exactly should the roadmap's schematic mode contain?

### Relevant files

- `app/(main)/kart/Map.tsx`
- `app/(main)/kart/MapClient.tsx`
- `app/(main)/kart/page.tsx`
- `app/(main)/prosjekter/[projectId]/ProjectWorkspaceClient.tsx`
- `app/api/machines/[machineId]/location/route.ts`
- `app/api/machines/[machineId]/location-history/route.ts`
- `prisma/schema.prisma`

## Phase 7 - Mass/load lists and mass coordination

**Status: started, not finished**

### Implemented

- Added the global mass catalogue with unit, tonnes-per-cubic-metre, and swell-factor data.
- Added per-project mass-type selection and planned incoming/outgoing quantities.
- Added a project workspace view for selected mass types and planned quantities.

### Remaining work

- Add mass-movement and load-ticket models and APIs.
- Support manual, app, scale, and GPS-derived registrations as required.
- Add actual incoming/outgoing registrations, tables, and forms to the project workspace.
- Implement auditable tonne/cubic-metre conversion.
- Compare plan with actual quantities and show agreed warning states.
- Build the cross-project coordination view with matching, map/table modes, and documented savings assumptions.
- Add and verify scale webhook and client-app integrations.

### Outstanding decisions

- What is the priority between manual, app, scale, and GPS sources, and who may approve or correct records?
- What plan-versus-actual deviation should trigger a warning?
- How should default conversion and swell factors behave, and which changes require audit history?
- Which distance, cost, emissions, and material assumptions should be used for coordination savings?

### Relevant files

- `app/(admin)/katalog/`
- `app/api/admin/katalog/route.ts`
- `app/(main)/prosjekter/ProjectSetupForm.tsx`
- `app/(main)/prosjekter/[projectId]/ProjectWorkspaceClient.tsx`
- `app/api/prosjekter/`
- `lib/projects.ts`
- `prisma/schema.prisma`

## Phase 8 - Reporting and CO2

**Status: not started**

## Phase 9 - Change orders

**Status: not started**

## Phase 10 - Personnel and time

**Status: not started**

## Phase 11 - HSE

**Status: not started**

## Phase 12 - Feed

**Status: not started**

## Phase 13 - Mini-lawyer and legal base

**Status: not started**

## Phase 14 - Standards, compliance, and global search

**Status: started, not finished**

### Implemented

- The front page includes a project deviation overview.
- Project list, project workspace, and front-page deviation views reuse the same red/yellow/green project KPI calculation.

### Remaining work

- Add the standards-library models, administration UI, document/version handling, sharing behavior, and required disclaimer.
- Expand compliance calculations to include overdue reports, HSE, contract KPIs, change orders, and mass deviations. Most of these inputs depend on Phases 8-13.
- Add global top-bar search across projects, machines, change orders, standards, and documents with access-aware results.
- Add standard-version checks, notifications, and any required scheduled jobs.

### Outstanding decisions

- What should global search include, how should results be ranked, and which role/access rules apply?
- How should compliance priorities be combined, and how should missing data affect status?
- Who may upload/share standards, what consent is required, and what legal disclaimer must be shown?
- Which source determines whether a standard version is current?

### Relevant files

- `app/(main)/page.tsx`
- `app/(main)/prosjekter/ProjectsListClient.tsx`
- `app/(main)/prosjekter/[projectId]/ProjectWorkspaceClient.tsx`
- `lib/project-status.ts`

## Maintenance checklist

Whenever phase-related work changes:

1. Update the phase status, implemented work, remaining work, decisions, and relevant files.
2. Mark a phase **fully implemented** only after all stated acceptance criteria are met.
3. Record migration, environment, external-service, and deployment requirements separately from code completion.
4. Update the review date and add a short changelog entry.

## Changelog

- **2026-10-17:** Implemented the portal-side Phase 4 telemetry foundation, administration, ingestion contract, migration, Azure provider-link compatibility, access checks, tests, and integration placeholders.
- **2026-10-17:** Added the staged Phase 4 implementation plan and expanded the client decision register for GPS/telemetry ingestion.
- **2026-10-17:** Initial codebase audit and phase status baseline created.
