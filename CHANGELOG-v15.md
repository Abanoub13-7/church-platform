# CHANGELOG v15 — Family Intelligence System (Phase 1, sections 1–5 + 12)

Additive, non-breaking extension of the existing platform.
No file structure changes. No framework migration. No removal of prior logic.

## New files

| File | Purpose |
|------|---------|
| `data/schema-v13.js`           | Schema extension: family fields (type, multi-status, geo, guardians), relationship custody/authority fields, new tables `family_movement_log` and `family_scores`. |
| `js/family-core.js`            | Family entity lifecycle: `setStatus`, `setType`, `archive`, `transferChurch`, `split`, `merge`, `changeAddress`, `setPrimaryGuardian`, `setSecondaryGuardian`, `movementLog`. |
| `js/family-relationships.js`   | `window.Rel` — relationship graph: `add`, `remove`, `guardiansOf`, `childrenOf`, `siblingsOf`, `graph(family_id)`, `detectIssues(family_id)`. Supports multi-guardian, shared/temporary/foster/emergency custody. |
| `js/family-attendance.js`      | `window.FamilyAttendance` — weekly/monthly %, consistency, parent vs child participation, consecutive absences, engagement trend, heatmap renderer, auto-recompute on attendance writes via `DB.on`. |
| `js/family-risk.js`            | `window.FamilyRisk` — composite risk (attendance + followup + service + financial + stability), thresholds → low/medium/high/critical, auto follow-up creation, dedup notifications, `topAt(n)` for dashboard. |
| `js/dashboard-families.js`     | "Families at Risk" widget that auto-mounts on `dashboard.html`. |

## Modified files

| File | Change |
|------|--------|
| `js/family-profile.js` | Replaced with a tabbed Family Intelligence Dashboard: Overview / Members / Relationship Map (SVG) / Attendance / Risk / Status / Follow-up / Timeline. Existing `FamilyProfilePage.edit` and `addChild` APIs preserved. |
| 34 `*.html` pages       | Injected `<script src="data/schema-v13.js">` after `schema-v12.js`, and family engine scripts after `engines.bundle.js`. `dashboard.html` additionally loads `js/dashboard-families.js`. |

## Behavioral contracts preserved

- All previous `window.Family.*` functions still exported and unchanged.
- All previous `DB.*` calls untouched.
- Existing `risk.js` (member risk) still runs; family risk is layered on top.
- New schema fields are optional; existing families/records remain valid.
- Arabic strings + RTL preserved; reuses existing CSS classes (`kpi-card`, `card`, `badge`, `table`, `btn`).

## Auto-integration points

- `DB.on('insert','attendance_records')` triggers `FamilyAttendance.recompute(family_id)` and `FamilyRisk.recompute(family_id)` for the affected family.
- `FamilyRisk.recompute` writes `families.risk_status`, upserts `family_scores`, raises a deduped notification, and creates/refreshes a high-priority follow-up for high/critical levels via the existing `followups` table.

## Out of scope this round (deferred to v16+)

Sections 6 (spiritual engine), 7 (serving engine), 8 (financial consistency engine), 9 (full legal custody engine), 10 (emergency comms layer), 11 (movement audit UI beyond timeline), 13 (workflow automation hookup beyond risk → followup), 14 (AI operational layer rewrite).
