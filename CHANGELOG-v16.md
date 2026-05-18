# CHANGELOG v16 — Family Intelligence System Phase 2

Builds on v15 (Phase 1: sections 1–5, 12) and adds the remaining core operational
subsystems for the Enterprise Family Intelligence System.

## New sections covered

- **Section 6 — Spiritual life engine** (`js/family-spiritual.js`)
- **Section 7 — Serving / ministry engine** (`js/family-serving.js`)
- **Section 8 — Financial engine** (`js/family-financial.js`)
- **Section 9 — Legal custody system** (`js/family-custody.js`)
- **Section 10 — Emergency contacts & comms** (`js/family-emergency.js`)
- **Section 11 — Movement audit UI helpers** (`js/family-movement-ui.js`)
- **Section 13 — Workflow automation engine** (`js/family-workflows.js`)
- **Section 14 — AI insights layer (heuristic)** (`js/family-ai.js`)

## Schema additions — `data/schema-v14.js`

Additive only; loaded AFTER `schema-v13.js`. New tables:

| Table | Purpose |
|---|---|
| `family_spiritual_records` | sacraments, prayer life, classes, retreats |
| `family_serving_assignments` | ministry roles per member |
| `family_financial_records` | tithes, donations, pledges, assistance flows |
| `family_emergency_contacts` | non-member contacts + pickup authorization |
| `family_emergency_log` | logged calls/SMS/visits with severity |
| `family_custody_legal` | court orders, doc refs, validity windows |
| `family_workflow_triggers` | automation rule fire log |
| `family_ai_insights` | heuristic AI snapshot per family |

No existing field removed or renamed.

## UI integration — `js/family-profile.js`

7 new tabs added to the family profile:

- الحياة الروحية (`tabSpiritual`)
- الخدمة (`tabServing`)
- العطاء (`tabFinancial`) — includes 6-month bar chart
- الحضانة القانونية (`tabCustody`) — with expiring/expired warnings
- الطوارئ (`tabEmergency`) — contacts, log, emergency broadcast
- رؤى ذكية (`tabAI`) — colour-coded heuristic insights with confidence

Each tab ships its own action handler on `FamilyProfilePage` (addSpiritual,
addServing, addFinancial, addCustody, addEmergencyContact, broadcastEmergency,
clearEmergency).

## Workflow automation (`FamilyWorkflows`)

Built-in rules that auto-create follow-up tasks or notifications:

- `financial_drop` → follow-up
- `service_inactive` → follow-up
- `spiritual_decline` → follow-up
- `custody_expiring` → notification
- `emergency_active` → notification

Triggers fire automatically via `DB.on('insert', ...)` hooks on every new
spiritual / serving / financial / custody / emergency record.

## AI layer (`FamilyAI`)

Heuristic, offline insights composed from all engines (attendance, spiritual,
serving, financial, custody, relationships, risk). No external API calls.
Stored as snapshots in `family_ai_insights`, computed per-family on demand
or in bulk via `FamilyAI.computeAll()`.

## HTML integration

All 34 HTML pages updated: the 9 new script tags are injected right after
`js/family-risk.js`, preserving load order. No existing tags removed.

## Backwards compatibility

- All Phase 1 modules untouched (`family-core`, `family-relationships`,
  `family-attendance`, `family-risk`, `dashboard-families`).
- All Arabic / RTL UI preserved.
- `DB` API contract unchanged.
- Existing records remain valid; new fields default safely.

## Still out of scope (future rounds)

- Full real-time SMS/WhatsApp gateway integration (engine logs the intent;
  channel adapters belong in the integration layer).
- ML-based AI (current AI is rule-based heuristics with confidence scores).
- Advanced workflow builder UI surface for these new rules (the rules run
  headlessly; an admin UI to author them is its own subsystem).
