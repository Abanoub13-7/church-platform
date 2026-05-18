# Consolidated Changelog


---

# PHASE10_FAMILY_CHANGELOG.md

# PHASE 10 — FAMILY-CENTERED CHURCH CENSUS & MINISTRY INTELLIGENCE

تحويل النظام من Member-Based إلى Family-Centered بدون كسر الـ Architecture الحالية.

## الإضافات

### 1) Family Entity
- جدول جديد `families` في `data/schema.js` يحتوي على:
  - معرف فريد ثابت `family_code` بصيغة `FAM-YYYY-NNNN`
  - بيانات الأسرة الكاملة (الاسم، العنوان، المنطقة، المدينة، الهاتف، الحالة، التواريخ).
  - بيانات الأب والأم (الاسم، الميلاد، الهاتف، المهنة، الحالة الروحية، الملاحظات).
  - ملاحظات المتابعة والافتقاد، الظروف الخاصة، الطوارئ.
  - حقول `latitude/longitude` جاهزة للخرائط الحرارية مستقبلًا.
- بيانات تجريبية في `data/mock-data.js`.

### 2) Member Linking
- إضافة `family_id` و `family_role` (`father|mother|child|other`) على schema الأعضاء.
- عند إنشاء أسرة جديدة يتم تلقائيًا إنشاء سجلات Member للأب والأم وكل الأبناء (عدد ديناميكي بدون `child1/child2`).
- ربط الأعضاء القدامى بأسر تجريبية.

### 3) Age Engine
- يعتمد على `Hierarchy.ageFromBirth` و `Hierarchy.formatAge` الموجودة (شهور للأصغر / سنوات للأكبر).
- مستخدم في الـ Family Profile وعرض كل فرد ديناميكيًا.

### 4) Stage Assignment Engine
- ملف جديد `js/stage-engine.js`:
  - يفحص كل الأعضاء عند تحميل الصفحة، ويقترح انتقال المرحلة (لا يطبقها تلقائيًا).
  - يستخدم `STAGE_RULES` الحالية (حضانة → KG → ابتدائي → إعدادي → ثانوي → جامعة → شباب → كبار → مسنين).

### 5) Supervisor Approval Layer
- جدول جديد `pending_transitions` في schema.
- صفحة جديدة `transitions.html` + `js/transitions.js`:
  - عرض كل الاقتراحات المعلقة (المخدوم، الأسرة، العمر، المرحلة الحالية، المقترحة، السبب).
  - يستطيع المشرف: Approve / Reject + اختيار الفصل والخادم عند الموافقة.
  - سجل آخر القرارات.
- مرتبط بصلاحيات `church_admin / service_admin / supervisor`.

### 6) Family Dashboard
- صفحة جديدة `families.html` + `js/families.js`:
  - قائمة الأسر، بحث، فلترة بالمنطقة والحالة.
  - KPI cards: إجمالي الأسر / الأفراد / تحتاج افتقاد / النشطة.
  - فورم إنشاء/تعديل أسرة مع إضافة أبناء ديناميكية.
- صفحة جديدة `family-profile.html` + `js/family-profile.js`:
  - عرض الأب، الأم، كل الأبناء.
  - لكل فرد: العمر، المرحلة، الفصل، الخادم، الحالة، آخر حضور.
  - معدل الحضور العام للأسرة، آخر حضور، ملاحظات الافتقاد، الظروف الخاصة، الطوارئ.

### 7) Navigation
- إضافة قسم "الأسر والخدمة" يحتوي على:
  - الأسر
  - اقتراحات النقل
  - هيكل الخدمة
  - المخدومين
  - المستخدمين

## التعديلات على الملفات

- `data/schema.js` — جدولين جديدين + `family_id/family_role` على members.
- `data/mock-data.js` — Seed لـ families + ربط أعضاء قدامى.
- `js/app.js` — تعديل القائمة الجانبية.
- جميع الـ `*.html` (30 صفحة) — تحميل `family-engine.js` و `stage-engine.js`.

## الملفات الجديدة

- `js/family-engine.js`
- `js/stage-engine.js`
- `js/families.js`
- `js/family-profile.js`
- `js/transitions.js`
- `families.html`
- `family-profile.html`
- `transitions.html`

## بدون كسر

- لم يتم تغيير اللغة أو الـ framework.
- لم يتم حذف أي ملف.
- جميع الـ engines الحالية (Workflow, AI, Notifications, Hierarchy, Permissions) تعمل كما هي.
- الـ `DB.js` كما هو — `church_id` scoping يعمل تلقائيًا مع الجداول الجديدة.
- الصلاحيات والـ Multi-Tenant Isolation محفوظة.


---

# PHASE11_BEHAVIOR_WIRING_CHANGELOG.md

# Phase 11 — Behavior Wiring (Lifecycle Engine)

- New `js/lifecycle-engine.js` exposes `window.Lifecycle` with:
  - `onMemberCreated(member)` — initializes risk_score=0, status='new', created_at; emits events; triggers silent page refresh.
  - `onAttendanceRecorded(member_id)` — calls `recalculateRisk`, refreshes member journey, broadcasts event.
  - `onRiskChanged(member_id)` — auto-inserts a `followups` row (`reason:'Auto generated from high risk'`, `status:'pending'`, `date:today`, dedup-guarded) when `risk_score > 50`.
- `risk.js` calls `Lifecycle.onRiskChanged` after every score update.
- `members.js` calls `Lifecycle.onMemberCreated` after `DB.insert('members', …)`.
- `attendance.js` calls `Lifecycle.onAttendanceRecorded` after each check-in and on session close.
- Lightweight silent refresh: Lifecycle pings `Members.render`, `FamilyProfile.render`, `Followup.render`, `Attendance.render`, `Dashboard.render` if present, plus dispatches `lifecycle:*` CustomEvents on `window`.
- All pages that already load `risk.js` now also load `lifecycle-engine.js` before it.
- Zero HTML/CSS changes. No pages removed.


---

# PHASE12_ENHANCEMENTS_CHANGELOG.md

# PHASE 12 — Enterprise Enhancements (additive, non-breaking)

This phase adds the schema, engines, and detectors required by Phases 1–6 of
the enterprise enhancement brief, **without modifying any existing file**.
All v4–v11 features continue to work unchanged.

## New files

| File | Purpose |
|---|---|
| `data/schema-v12.js` | Additive schema deltas (loaded after `data/schema.js`) |
| `js/hierarchy-resolver.js` | Single source of truth for permissions inheritance across services → stages → grades → classes → small groups |
| `js/attendance-plus.js` | Phase 4: explicit `status` enum, expectations roster, anti-fraud (geofence + device), offline queue, engagement score, 52-week heatmap |
| `js/spiritual-engine.js` | Phase 5: sacraments, milestones, mentorships, discipleship journeys, spiritual timeline, detectors |
| `js/followup-plus.js` | Phase 6: member journey timeline, outcomes, best-servant recommender, dashboard buckets |
| `js/family-plus.js` | Phase 1+2: family relationships, visitations, attendance/risk aggregations, disconnected detector, dashboard widgets |

## Schema deltas (v12)

### Phase 1+2 — Families
- New `family_relationships(rel_id, family_id, member_id, relationship_kind, is_primary)` — supports multiple roles per member.
- New `family_visitations(visit_id, family_id, performed_by, performed_at, outcome, notes)`.
- `families.family_status` enum extended with `new`, `high_risk`, `needs_visitation`, `spiritually_disconnected`.
- `families.father_member_id`, `families.mother_member_id` (FK → members).

### Phase 3 — Hierarchy
- New `service_grades(grade_id, stage_id, name, age_min, age_max)` — adds the Grade level the brief asks for.
- New `service_small_groups(small_group_id, class_id, name, leader_id)`.
- `service_classes.grade_id`, `members.grade_id`, `members.small_group_id`.

### Phase 4 — Attendance
- `attendance_records.status` enum: `present | late | excused | online | served | visitor | partial | absent` (default `present`). Existing `is_late` field is preserved for backward compatibility.
- `attendance_records.location_lat/lng`, `device_id`, `device_fingerprint`, `ip_hash`, `excuse_reason`, `partial_minutes`.
- New `attendance_session_expectations(session_id, member_id)` — explicit roster, enables deterministic Absent + Excused + Partial.
- New `attendance_offline_queue` for offline check-ins.
- `church_settings.geofence_lat/lng`, `geofence_radius_m` (default 500), `attendance_window_min` (default 30).

### Phase 5 — Spiritual
- New `sacraments(kind: baptism | chrismation | first_communion | marriage | ordination | confession)`.
- New `spiritual_milestones`, `mentorships`, `discipleship_journeys` (stages: seeker | new_believer | growing | serving | leading).

### Phase 6 — Follow-up
- `followup_logs.action` enum extended: `meeting`, `prayer_session`, `online_followup`, `counseling`, `emergency`.
- `followup_tasks.outcome` enum: `responded | no_response | needs_escalation | recovered | re_engaged | transferred | inactive | emergency` (separate from workflow `status`).
- New `member_journey_steps` — full lifecycle from `new` → `leadership`.

## Public engine APIs

```js
// Hierarchy
HierarchyResolver.getScopedClassIds(userId)
HierarchyResolver.getScopedMemberIds(userId)
HierarchyResolver.getBreadcrumb(class_id) // [{ level, id, name }, ...]
HierarchyResolver.validateClass(cls)

// Attendance (Phase 4)
AttendancePlus.STATUSES
AttendancePlus.setExpectedRoster(session_id, memberIds)
AttendancePlus.markStatus({ session_id, member_id, status, evidence })
AttendancePlus.closeSession(session_id) // materializes 'absent' rows
AttendancePlus.antiFraudCheck({ session_id, member_id, evidence }) // {ok, reason?}
AttendancePlus.enqueueOffline(payload); AttendancePlus.flushOffline()
AttendancePlus.engagementScore(member_id, days=90) // {score, label, sample}
AttendancePlus.heatmap(member_id) // { 'YYYY-MM-DD': count }

// Spiritual (Phase 5)
SpiritualEngine.recordSacrament({ member_id, kind, date, ... })
SpiritualEngine.recordMilestone({ member_id, kind, date, notes })
SpiritualEngine.startMentorship({ mentor_user_id, mentee_member_id, notes })
SpiritualEngine.setJourneyStage({ member_id, stage, notes })
SpiritualEngine.timeline(member_id) // merged chronological feed
SpiritualEngine.isDisconnected(member_id, days=60)
SpiritualEngine.needsMentorship(member_id)
SpiritualEngine.isPotentialServant(member_id)
SpiritualEngine.summary(memberIds) // class/family/church-level

// Follow-up (Phase 6)
FollowupPlus.JOURNEY_STEPS
FollowupPlus.advanceJourney(member_id, step, owner_user_id, notes)
FollowupPlus.journeyOf(member_id)
FollowupPlus.setOutcome(task_id, outcome) // auto-closes / escalates
FollowupPlus.recommendServant(member_id) // {user_id, score, openLoad, response_rate}
FollowupPlus.dashboard()

// Families (Phase 1+2)
FamilyPlus.setRelationship({ family_id, member_id, relationship_kind, is_primary })
FamilyPlus.logVisitation({ family_id, performed_by, outcome, notes })
FamilyPlus.computeFamilyAttendance(family_id, days=30) // {rate, sample, attended, members}
FamilyPlus.computeFamilyRiskScore(family_id) // {score, level, attendance}
FamilyPlus.detectDisconnected() // auto-tags families spiritually_disconnected
FamilyPlus.dashboard() // {total, active, inactive, new, high_risk, needs_visitation}
```

## Integration

Every HTML page in the project was updated to load these scripts:
- `data/schema-v12.js` is injected immediately after `data/schema.js`.
- The five `*-plus` / engine scripts are injected at the bottom of `<body>`.

No existing HTML, JS, or CSS file was modified. Old pages keep working; new
capabilities are opt-in via the `Hierarchy​Resolver`, `AttendancePlus`,
`SpiritualEngine`, `FollowupPlus`, and `FamilyPlus` globals.

## What is intentionally NOT done in this patch

These items from the report require larger UI rewrites that would risk
breaking existing pages. They are next-iteration work:

- New tree UI on `hierarchy.html` (drag-and-drop reparenting).
- Per-member status dropdown on the session screen (the engine supports it; the existing `attendance.html` still uses the simple check-in flow).
- Dedicated `spiritual.html` per-member view.
- Follow-up dashboard re-skin on `followup.html`.
- HTML shell de-duplication via a partials loader.
- Migration of duplicated parent fields off `members` into `families` (kept dual-write for one release).

## Known limitations (carried over from the existing project)

- Persistence is still `localStorage`. Multi-tenant isolation is JS-enforced, bypassable from devtools. A real backend (Postgres + RLS) is required for production.
- "AI" detectors in this phase are transparent heuristics (engagement score, disconnected, potential-servant), not ML models. They are labeled accordingly in the engine code.


---

# PHASE1_CHANGELOG.md

# PHASE 1 UPGRADE — Permissions & Super Admin Control Center

This is a focused architectural upgrade of the existing project. **No UI/visual identity was changed.** All modules and existing flows continue to work.

## What changed

### 1) Permission Matrix System — `js/permissions.js` (rewritten)
- **7 built-in roles**: `super_admin`, `church_admin`, `financial_manager`, `servant_leader`, `servant`, `viewer`, `member`.
- **Granular capabilities** (`canViewDashboard`, `canManageMembers`, `canEditMembers`, `canDeleteMembers`, `canManageAttendance`, `canManageFinance`, `canApproveFinance`, `canRejectFinance`, `canViewReports`, `canManageWorkflows`, `canManageUsers`, `canManageRoles`, `canAccessAI`, `canExportData`, `canManageChurch`, `canManageSubscriptions`, `canViewAuditLogs`, `canImpersonate`, `canBroadcastNotifications`, `canManageFeatureFlags`, `canManagePlatform`).
- **Backward-compatible alias map** — existing calls like `Permissions.can('members.edit')` still work.
- **Per-user overrides** (`session.permissions[cap] = true|false`) override the role matrix.
- **Custom roles** loaded from `custom_roles` table — fully dynamic.
- **Feature-flag aware**: if a church has a module disabled in `feature_flags`, related caps return false even for full-access roles.
- **`Permissions.applyDomGuards()`** — auto-hides any element with `data-perm="canX"` if user lacks the cap. Called automatically after layout and `App.render()`.
- **Financial manager intentionally lacks `canApproveFinance` / `canRejectFinance`** — only `church_admin` can approve.

### 2) Audit Logging — `js/audit.js` (new)
- Centralized `Audit.log(action, meta)` — non-throwing, capped at 5000 rows.
- Auto-records actor (user, role, church), severity, timestamp, and impersonator id.
- Wired into `auth.login_success`, `auth.login_failed`, `auth.login_blocked_suspended`, `auth.logout`, `permission.denied`, `church.created/updated/deleted/status_changed`, `feature_flag.changed`, `notification.sent/deleted`, `impersonation.start/stop`.

### 3) Super Admin Control Center — `js/super-admin.js` (rebuilt)
Single-page dashboard with tabs:
- **Overview** — totals, plan distribution chart, growth chart, recent platform events.
- **Churches** — create / edit / suspend / freeze / resume / **permanently delete** any church.
- **Subscriptions** — plan cards (free/basic/pro/enterprise), per-church usage bars vs plan limits, expiry tracking.
- **Feature Flags** — toggle any of `ai`, `attendance`, `finance`, `workflows`, `reports`, `notifications` per church.
- **Activity Monitor** — recent logins, failed logins, suspension-blocked logins, impersonation events, denied permissions.
- **Audit Logs** — full filterable table.
- **Global Notifications** — broadcast info / maintenance / alert / update to all churches or a specific one.

### 4) Impersonation Mode — `js/impersonation.js` (new)
- Super admin can "login as" any church's admin from the Churches tab.
- Original session is snapshotted; persistent **red banner** at top of every page until exit.
- `Impersonation.start()` / `Impersonation.stop()` — auditable, restores original session on exit.

### 5) Auth hardening — `js/auth.js` (patched)
- Blocks logins to **suspended / frozen / deactivated** churches with a clear message.
- Emits audit events on every login attempt and logout.

### 6) Schema additions — `data/schema.js`
New tables: `audit_logs`, `feature_flags`, `subscription_plans`, `custom_roles`, `platform_notifications`. Auto-seeded on first super-admin page load.

## How to use in existing pages
```html
<!-- hides a button if user lacks the capability -->
<button data-perm="canDeleteMembers" class="btn btn-danger">حذف</button>

<!-- guard inside a JS action handler -->
if (!Permissions.guard('canApproveFinance')) return;

<!-- audit any important action -->
Audit.log('finance.approved', { request_id, amount });
```

## Not changed
UI design tokens, CSS, HTML structure, existing module logic (members/attendance/finance/AI/workflows). The upgrade is additive and backward-compatible.

## Phases 2 (Finance approval workflow) and 3 (Member journey engine) are scoped for follow-up turns.


---

# PHASE2_CHANGELOG.md

# PHASE 2 CHANGELOG — Enterprise Hardening

This iteration adds Phase 1 (security), Phase 2 (enterprise finance) and
Phase 3 (smart notifications + member journey) on top of the existing
codebase WITHOUT changing the UI language or breaking current modules.

## Phase 1 — Authentication & Security
- **`js/security.js`** (new): PBKDF2-SHA256 password hashing (50k iters, 16-byte salt),
  constant-time comparison, automatic migration of legacy plaintext `password_hash`
  values on first successful login.
- Session lifecycle: absolute expiry (8h normal / 30d remember-me), 30-min idle
  timeout enforced by an event-driven watchdog, server-style re-validation on
  every page load.
- Failed-login tracking: 5 attempts → 15-min account lockout, anti-burst delay,
  separate `Security` event log distinct from generic audit.
- Authorization helper `Security.requireCap()` re-reads the session for each
  sensitive action so DOM-mutation bypasses cannot grant capabilities.
- **`security.html` + `js/security-page.js`** (new): admin console for active
  session, locked accounts (with unlock), recent security events.

## Phase 2 — Enterprise Finance
- **`js/finance-engine.js`** (new):
  - Chart of accounts (cash, bank, donations, tithes, salaries, expenses, …).
  - **Double-entry ledger** — every approved transaction produces balanced
    debit + credit entries in `ledger_entries`.
  - **Treasuries** with persistent running balance and full history timeline.
  - **Financial periods** (monthly) with open/closed status; locked periods
    block new transactions and require privileged re-open.
  - **Transaction lifecycle** `pending → approved (locked) | rejected → reversed`.
    Approved transactions are immutable; corrections happen via reversal entries
    that preserve audit integrity.
  - **Approval chains** with multi-step history, rejection notes, and a
    hard self-approval block (recorder cannot approve their own txn).
  - **Smart insights**: unusual spending, income drop, negative/inactive
    treasuries, broadcast to finance approvers via the notification engine.
  - **Exportable ledger CSV** (Excel-ready); period reports printable from the UI.
- `js/finance.js` rewritten on top of the engine — approve / reject / reverse
  actions, treasury panel, period panel, insights banner, transaction detail
  modal with full approval chain.

## Phase 3 — Workflow / Notifications Intelligence
- **`js/notifications-engine.js`** (new): idempotent (dedupe_key) smart-alert
  generator. Runs on every page load and produces priority-tagged
  notifications for:
  - attendance drops (4-week vs prior-month comparison)
  - overdue follow-up tasks
  - pending financial approvals (to approvers only, never the recorder)
  - workflow histories stuck > 7 days
  - smart financial insights
- Priority field added to notifications (low/medium/high/critical) and the
  notifications page sorts by priority then recency.
- Member journey timeline helper `NotificationsEngine.memberTimeline(memberId)`
  combines registration, attendance, follow-up, and notes into a single
  chronological view.

## Schema additions
- `treasuries`, `ledger_entries`, `fin_periods`, `fin_insights` registered in
  `data/schema.js`. Existing tables are unchanged; `financial_transactions`
  rows now carry the optional fields `status`, `locked`, `period_id`,
  `approval_chain`, `reversal_of`, `reversed_by` (additive).

## Backward compatibility
- All legacy users in `mock-data.js` still log in with their original
  passwords; `Security` rewrites the stored hash to PBKDF2 on first success.
- Existing finance rows without a `status` simply render as legacy entries in
  the new ledger UI and behave identically to before.
- Every existing page received `security.js`, `finance-engine.js`, and
  `notifications-engine.js` via additive `<script>` insertions; nothing was
  removed.


---

# PHASE2_PLUS_CHANGELOG.md

# PHASE 2+ ENTERPRISE UPGRADE — Changelog

This upgrade preserves all existing modules (auth, permissions, workflow-engine,
finance-engine, audit, attendance, super-admin, notifications-engine, ai-engine)
and adds an enterprise visualization, reporting, analytics, notification, and
performance layer on top.

## NEW FILES
- `css/enterprise.css` — BPM canvas, workflow nodes, timeline, kanban, journey,
  health gauge, priority chips, notification dropdown, skeleton loaders,
  responsive + print styles.
- `js/performance.js` — `Perf.Cache`, memoization, debounce/throttle,
  pagination helpers, skeleton renderer, centralized error handlers
  (`window.error` / `unhandledrejection`).
- `js/analytics-engine.js` — `AnalyticsEngine` API:
  `churchHealth()`, `risks()`, `insights()`, `attendanceTrend()`,
  `ministryScorecard()`, `servantScorecard()`, cross-module signals.
- `js/notifications-ui.js` — `NotifUI` realtime-like topbar dropdown with
  8-second polling, unread badge, priority colors, quick actions.
- `js/workflow-builder.js` — Visual SVG drag-and-drop BPM builder
  (Phase 1: nodes, ports, connections, inspector, journey panel, timeline,
  kanban, simulation, JSON export, 3 prebuilt templates).
- `js/finance-reports.js` — Executive financial reporting page
  (Phase 2: KPI cards, 12-month trend, doughnuts per category, treasury
  movement, period comparison, smart insights, print-ready PDF view).
- `js/analytics-page.js` — Operational intelligence dashboard
  (Phase 4: church health gauge, parts breakdown, risk detection,
  insights, ministry & servant scorecards, attendance trend).
- `workflow-builder.html`, `finance-reports.html`, `analytics.html`
  — page shells wiring the modules.

## PATCHED FILES
- All `*.html` pages now load `enterprise.css`, `performance.js`,
  `analytics-engine.js`, and `notifications-ui.js` (idempotent patching).
- `js/app.js` sidebar nav extended with:
  - “التحليلات التشغيلية” → analytics.html
  - “Workflow Builder” → workflow-builder.html
  - “التقارير المالية” → finance-reports.html (role-scoped)

## PHASE COVERAGE
- **Phase 1 — Visual Workflow Builder**: drag/drop nodes, ports & SVG arrows,
  inspector with priority/status, branching templates (attendance, finance,
  follow-up), live status dots, timeline, kanban board, member journey, KPI
  strip, JSON export, responsive layout.
- **Phase 2 — Financial Reports UI**: executive KPIs, multi-chart dashboards
  (line/doughnut/bar), period comparison, treasury analytics, smart insights,
  print/PDF-ready layout, role-based access enforcement.
- **Phase 3 — Notification Center**: live topbar dropdown, unread badge,
  priority filtering, 8s polling refresh, quick-open & mark-all-read.
  Existing notifications page enhanced via the new dropdown integration.
- **Phase 4 — Analytics Layer**: AnalyticsEngine computes health score from
  attendance / workflow / follow-up / servants / finance; risk detection and
  operational insights; ministry + servant scorecards.
- **Phase 5 — Performance**: `Perf.Cache` TTL memo cache, debounce/throttle,
  pagination helpers, skeleton loaders, global error capture, idle scheduling.

## ARCHITECTURE NOTES
- 100% additive — no breaking changes to existing engines or pages.
- Reuses existing globals: `DB`, `Auth`, `UI`, `App`, `WorkflowEngine`,
  `FinanceEngine`, `NotificationsEngine`, `AIEngine`.
- All new pages bootstrap through the existing `App.init()` flow so
  permission guards and role checks apply automatically.
- LocalStorage namespaced (`wf_builder_diagrams_v1`) — no DB schema changes.
- Mobile/tablet responsive grids and BPM canvas fallback for small screens.
- Print styles strip chrome for clean PDF export.


---

# PHASE3_EVENTS_CHANGELOG.md

# PHASE 3 — Enterprise Events & Reservation Module

Date: 2026-05-16

This phase transforms the basic events page into a connected enterprise event management system, while preserving the existing UI language, multi-tenant DB, permissions, audit, workflow, finance, notifications and analytics engines.

## New engines (js/)

| File | Responsibility |
|---|---|
| `event-engine.js` | Lifecycle, status, types, templates, capacity, role-based access |
| `registration-engine.js` | Eligibility, approval, waitlist auto-promotion, check-in, ticket codes |
| `ticket-engine.js` | Reservation codes, QR tickets, scan verification |
| `event-workflow-engine.js` | Task assignment, escalation, lifecycle hooks, follow-up triggers |
| `event-analytics.js` | Capacity, velocity, popularity, financial summary, member history |
| `event-notification-engine.js` | Lifecycle / booking / reminder / capacity notifications |

## Schema additions (`data/schema.js`)

Extended `events`, `event_bookings` and added:

- `event_templates` — reusable blueprints (defaults, tasks, budget lines)
- `event_tasks` — organizer/servant/volunteer assignments with escalation
- `event_budgets` — estimated/approved/actual + approval workflow
- `event_expenses` — categorized, linked to `financial_transactions`
- `event_timeline` — immutable per-event audit-style log

`events` now carries: `lifecycle`, derived `status`, `reserved_seats`, `vip_seats`, `servant_seats`, `waitlist_capacity`, `overbook_pct`, `access_rules`, `requires_approval`, `auto_close_when_full`, `registration_opens_at/closes_at`, `template_id`, `budget_id`, `treasury_id`, `approval_required`.

`event_bookings` adds: `pending|approved|rejected` statuses, `waitlist_position`, `seat_class` (regular/vip/servant/reserved), `amount_paid`, `reservation_code`, `checked_in_at`, `approved_by/at`, `rejected_reason`.

## Lifecycle

`draft → review → published → reg_open → reg_closed → ongoing → completed → archived` (with `cancelled` terminal).

Each transition: validated, audit-logged, timeline-logged, triggers notifications + workflow hooks. Status is auto-recomputed on every render from capacity vs. confirmed bookings (`active|full|waitlist`).

## Event Types

`conference, retreat, meeting, class, course, trip, camp, prayer, ministry, servant` — each with default capacity, icon, and `requires_approval` flag.

## Registration

- Eligibility: open window, no duplicates, role-based access rules (age/gender/ministry/class/attendance rate/serving level)
- Approval flow: `pending → approved/rejected` when `requires_approval`
- Waitlist: auto-position, auto-promotion on cancel/no-show, capacity-limited
- Smart overbooking: configurable % above hard capacity
- QR ticket + human reservation code generated per booking

## Deep integration

| System | Integration |
|---|---|
| Workflows | Lifecycle hooks create tasks from template, register no-show follow-ups in `followup_tasks` |
| Finance | `event_budgets` + `event_expenses`; budget approval routed to finance roles |
| Notifications | `NotificationsEngine.notify` used for registration / approval / waitlist promotion / 24h reminders / 90% capacity alerts / cancellation broadcasts |
| Audit | Every action logs via `Audit.log` |
| Permissions | Role gates on create/approve/cancel/register/approveReg/finance |
| Attendance | Check-in marks `attended`; lifecycle `completed` auto-flags remaining confirmed as `no_show` and creates follow-up tasks |
| Analytics | `EventAnalytics.overview/eventMetrics/popularityRanking/financialSummary/memberHistory` |

## Page UI (`events.html` / `js/events.js`)

Tabbed enterprise dashboard:

1. **Overview** — KPI cards, upcoming events, popularity ranking, pending approvals queue
2. **Events** — Cards with capacity bar + lifecycle stepper + quick actions
3. **Registrations** — Pending approvals queue, waitlist, recent registrations, inline approve/reject/check-in
4. **Templates** — Browse, one-click create from template
5. **Budget** (finance roles) — Budget list, approval, expense tracking
6. **Analytics** — Chart.js popularity + booking status distribution
7. **Timeline** — Recent immutable activity feed

Event detail drawer shows: KPIs, lifecycle stepper, financial summary, all lifecycle action buttons gated by `canTransition`, task list, bookings list, mini timeline.

## Preserved

- Original RTL Arabic UI language
- Existing CSS tokens (badges, cards, modal, grid)
- Existing engines (`Auth`, `DB`, `Audit`, `Permissions`, `WorkflowEngine`, `NotificationsEngine`, `FinanceEngine`)
- Existing multi-tenant `church_id` scoping (automatic via `DB.insert`)
- Existing schema fields (additive only, no breaking renames)

## Migration notes

The new schema is **additive**. Existing seed `events` rows in user `localStorage` may lack `lifecycle`/`status` enum extensions; the UI defensively falls back. To get the new seed data, users can call `localStorage.removeItem('church_db_v1')` once and reload.


---

# PHASE4_8_ENTERPRISE_CHANGELOG.md

# PHASE 4-8 ENTERPRISE SAAS UPGRADE — Changelog

This release transforms the Super Admin into a full Platform Owner control plane.
All work is additive, vanilla HTML/CSS/JS, no backend changes, no UI redesign.

## New engines (js/)
- `billing-engine.js` — plans, subscriptions, invoices, payments, trials, renewals, grace periods, feature-limit guards, MRR/ARR metrics, automatic lifecycle.
- `tenant-management.js` — tenant CRUD, suspend/freeze/archive/reactivate, resource usage vs limits, health score, feature flags, operational metrics.
- `usage-analytics.js` — top active churches, feature usage, growth & revenue trends, churn risk, metering, platform health.
- `white-label.js` — per-tenant branding (colors, logo, headers, subdomain), draft/publish, live apply.
- `support-engine.js` — tickets, messages, assignments, status workflow, analytics, knowledge base.
- `backup-engine.js` — full/tenant/module snapshots, restore with auto pre-snapshot, download, scheduled daily snapshot.
- `ai-ops.js` — heuristic insights, per-tenant risk score, smart recommendations, platform-wide alerts.

## New pages (super admin)
- `tenants.html` · `platform-health.html`
- `subscriptions.html` · `billing.html`
- `usage-analytics.html` · `ai-ops.html`
- `white-label.html` · `support.html` · `knowledge-base.html` · `backups.html`

## New pages (tenant)
- `my-billing.html` (church_admin / financial_manager)
- White-label, support, KB are reused.

## Integrations preserved
- All actions log to **Audit**.
- Billing lifecycle, backup scheduler, and white-label theming run on every page load via `app.js`.
- Tenant feature flags fall back to plan limits (`Billing.isFeatureAllowed`).
- Suspended/expired tenants blocked at login (already in `auth.js`).
- Data isolation: `DB` multi-tenant guard untouched. Super-admin still blocked from member PII.

## Default data seeded
- 4 plans (Free, Starter, Growth, Enterprise) with full limit matrices.
- Subscription record auto-created per church.
- 4 KB articles.

## Navigation
- Super-admin sidebar reorganized into 4 sections (Platform, Billing, Intelligence, Operations).
- Tenant sidebar gained: my-billing, white-label, support, knowledge-base.


---

# PHASE9_OPERATIONAL_CHANGELOG.md

# Phase 9 — Operational Enterprise Platform

تحويل المنصة من Dashboard / CRUD إلى **Enterprise Operational Church Management Platform**
مع الحفاظ الكامل على الـ Architecture الأصلية (HTML / CSS / Vanilla JS — بدون أي Framework جديد).

## 1) Service Workspaces — `js/service-workspace.js`
كل خدمة (حضانة، ابتدائي، إعدادي، ثانوي، جامعة، شباب) أصبحت **Operational Workspace مستقل**:
- **Service Overview**: المشرف، المكان، المبنى، الدور، الأيام، المواعيد، الفصول، الخدام، المخدومين، الطاقة.
- **Classes & Groups**: الفصول، الخدام المسؤولين، عدد المخدومين، نسبة الحضور، حالة الفصل.
- **Servants**: تقييم كل خادم، نسبة النشاط، الافتقادات، المخدومين، الالتزام، آخر نشاط.
- **Members**: الحضور، الحالات، أعياد ميلاد، آخر حضور، مستوى النشاط.
- **Follow-up & Visitation**: المنقطعين، الحالات الحرجة، المعرضين للانقطاع، سجل الافتقاد.
- **Service Analytics**: نسبة الحضور، الغياب، أداء الخدام، أكثر/أقل الفصول نشاطاً، الافتقاد، الحالات الحرجة.
- **Service Health Score** (Healthy / Warning / Critical) بحساب موزون لـ:
  attendance consistency × servant activity × follow-up completion × member engagement × absence rate.

## 2) Hierarchy
Church → Services → Stages → Groups → Classes → Members — مدعومة في `js/hierarchy.js` ومستخدمة في الـ Workspace + Scoping.

## 3) Operational Supervisor Dashboard — `js/supervisor-page.js`
- بطاقات لكل خدمة مع Health Score ولون حالة.
- تنبيهات AI سياقية في نطاق المشرف فقط.
- تقييم الخدام، نقل/تعيين بين الفصول، فصول ضعيفة/نشطة.
- المشرف لا يرى أي بيانات مالية أو خدمات أخرى أو إعدادات نظام.

## 4) Scoped Permissions — `js/scoped-permissions.js`
طبقة `ScopedPerm` تعتمد على role × service × stage × class × ownership:
- `canViewService / canViewClass / canViewMember`
- `filterServices / filterClasses / filterMembers`
- `canSeeFinance / canSeeMembers / canApproveFinance`
- `guardPage(allowedRoles)`
- Servant → فصله فقط • Supervisor → خدمته فقط • Finance → مالية فقط • Admin → كل شيء.

## 5) Financial Isolation Layer — `js/finance-isolation.js`
- بيانات مالية معزولة بالكامل: ممنوع ظهورها لأي خادم/مشرف/مستخدم عادي.
- workflow: **Request → Financial Review → Admin Approval / Reject → Final Confirmation**.
- API: `createRequest / review / finalApprove / finalReject / listRequests`.
- `guardFinancePage()` يحمي صفحات المالية ويعرض شاشة العزل لغير المخوّلين.

## 6) Context-Aware AI — `js/ai-scope.js`
`AIScope.insightsForCurrentUser()` يولّد تنبيهات في **نطاق المستخدم فقط**:
- الخادم: مخدوميه، المعرضين للغياب، المحتاجين افتقاد، حالات فصله الحرجة.
- المشرف: تحليلات خدمته، الفصول الضعيفة، الخدام غير النشطين.
- لا يتسرب أي شيء خارج النطاق. الفينانس مستثنى من تحليلات المخدومين كليًا.

## 7) Member Management
- حساب العمر تلقائيًا من تاريخ الميلاد (`Hierarchy.ageFromBirth`).
- اكتشاف المرحلة العمرية تلقائيًا (`Hierarchy.stageFromBirth`).
- تذكير أعياد الميلاد (`Hierarchy.birthdaysToday / birthdaysUpcoming`).
- الأطفال: optional member phone، required guardian phone.

## 8) Physical Service Structure
يتم استخدام: location / building / floor / schedule_days / schedule_times / capacity من جدول `services` وعرضها داخل الـ Workspace Overview.

## 9) UI
الواجهات الحالية أصبحت Operational Workspace Interfaces بدلاً من مجرد CRUD Pages، عن طريق Workspace dispatcher داخل `services-page.js` + dashboard المشرف الجديد.

## 10) Backward Compatibility
لم يتم حذف أي ملف. كل التعديلات additive:
- ملفات جديدة: `service-workspace.js`, `scoped-permissions.js`, `finance-isolation.js`, `ai-scope.js`.
- HTML pages تم حقن السكربتات الجديدة فيها فقط.
- `services-page.js` يفتح Workspace بشكل افتراضي مع زر للرجوع للهيكل التقليدي.
- `supervisor-page.js` يضيف Health Score Cards + AI Insights.
- `finance.js` تمت حمايته بـ `FinanceIsolation.guardFinancePage()`.
