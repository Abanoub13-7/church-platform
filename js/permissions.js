/* ============================================================
   PERMISSIONS.js — Enterprise Permission Matrix (Phase 1)
   ------------------------------------------------------------
   - 7 built-in roles + dynamic custom roles
   - Granular capability flags (canX style + namespaced)
   - Per-user overrides
   - Feature-flag aware (a church can disable a whole module)
   - Centralized, reusable, scalable
   ============================================================ */
(function(){

  /* ---------- Capability registry ----------
     Every action in the platform must be one of these keys.
     UI uses Permissions.can('canManageMembers') OR the namespaced
     form Permissions.can('members.edit') — both resolve to the same matrix.
  ------------------------------------------- */
  const CAPS = [
    // Dashboard / general
    'canViewDashboard',
    'canViewReports',
    'canExportData',
    'canViewAuditLogs',
    'canAccessAI',

    // Members
    'canViewMembers','canManageMembers','canEditMembers','canDeleteMembers',

    // Attendance
    'canViewAttendance','canManageAttendance',

    // Follow-up / workflows
    'canManageFollowup','canManageWorkflows',

    // Finance
    'canViewFinance','canManageFinance','canApproveFinance','canRejectFinance',

    // Users / roles
    'canManageUsers','canManageRoles',

    // SaaS / platform
    'canManageChurch','canManageSubscriptions','canManagePlatform',
    'canImpersonate','canBroadcastNotifications','canManageFeatureFlags'
  ];

  /* Alias map: namespaced action  ->  canX capability
     so legacy `Permissions.can('members.edit')` still works. */
  const ALIAS = {
    'members.view':'canViewMembers','members.edit':'canEditMembers',
    'members.delete':'canDeleteMembers','members.manage':'canManageMembers',
    'attendance.view':'canViewAttendance','attendance.record':'canManageAttendance',
    'attendance.manage':'canManageAttendance',
    'followup.view':'canManageFollowup','followup.update':'canManageFollowup',
    'finance.view':'canViewFinance','finance.manage':'canManageFinance',
    'finance.approve':'canApproveFinance','finance.reject':'canRejectFinance',
    'workflows.view':'canManageWorkflows','workflows.manage':'canManageWorkflows',
    'users.manage':'canManageUsers','roles.manage':'canManageRoles',
    'ai.view':'canAccessAI','reports.view':'canViewReports',
    'export.data':'canExportData','audit.view':'canViewAuditLogs',
    'church.manage':'canManageChurch','platform.manage':'canManagePlatform',
    'events.view':'canViewMembers','events.manage':'canManageMembers',
    'notifications.send':'canBroadcastNotifications'
  };

  function emptyMatrix(){ const o={}; CAPS.forEach(c=>o[c]=false); return o; }
  function grant(matrix, list){ list.forEach(c => matrix[c]=true); return matrix; }
  function grantAll(matrix){ CAPS.forEach(c=>matrix[c]=true); return matrix; }

  /* ---------- Built-in roles ---------- */
  const ROLES = {
    super_admin: (()=>{
      // Platform owner — has platform caps but NOT member-data caps
      const m = emptyMatrix();
      return grant(m, [
        'canManagePlatform','canManageChurch','canManageSubscriptions',
        'canImpersonate','canBroadcastNotifications','canManageFeatureFlags',
        'canViewAuditLogs','canViewReports'
      ]);
    })(),

    church_admin: grantAll(emptyMatrix()), // everything inside tenant

    financial_manager: grant(emptyMatrix(), [
      'canViewDashboard','canViewReports','canExportData',
      'canViewFinance','canManageFinance',     // create / edit / submit
      // NOTE: cannot self-approve — approve/reject are NOT granted
      'canViewMembers','canViewAuditLogs'
    ]),

    servant_leader: grant(emptyMatrix(), [
      'canViewDashboard','canViewReports','canAccessAI',
      'canViewMembers','canEditMembers','canManageMembers',
      'canViewAttendance','canManageAttendance',
      'canManageFollowup','canManageWorkflows'
    ]),

    servant: grant(emptyMatrix(), [
      'canViewDashboard',
      'canViewMembers','canViewAttendance','canManageAttendance',
      'canManageFollowup'
    ]),

    viewer: grant(emptyMatrix(), [
      'canViewDashboard','canViewMembers','canViewAttendance','canViewReports'
    ]),

    member: grant(emptyMatrix(), [
      'canViewDashboard'
    ]),

    /* ---- v5: Service Supervisor (between admin and servants) ---- */
    service_supervisor: grant(emptyMatrix(), [
      'canViewDashboard','canViewReports','canAccessAI',
      'canViewMembers','canEditMembers','canManageMembers',
      'canViewAttendance','canManageAttendance',
      'canManageFollowup','canManageWorkflows',
      // NOTE: NO finance, NO users mgmt, NO platform
    ]),

    /* ---- Legacy roles kept for backward compatibility ---- */
    service_admin: null,  // ↦ servant_leader (set below)
    supervisor:    null,  // ↦ service_supervisor
    finance:       null   // ↦ financial_manager
  };
  ROLES.service_admin = ROLES.servant_leader;
  ROLES.supervisor    = ROLES.service_supervisor;
  ROLES.finance       = ROLES.financial_manager;

  /* ---------- Resolve action -> canonical cap ---------- */
  function resolveCap(action){
    if (!action) return null;
    if (CAPS.includes(action)) return action;
    if (ALIAS[action]) return ALIAS[action];
    // wildcard / namespace fallback — try matching alias namespace
    const ns = action.split('.')[0];
    const hit = Object.keys(ALIAS).find(k => k.startsWith(ns+'.'));
    return hit ? ALIAS[hit] : null;
  }

  /* ---------- Custom roles support ---------- */
  function customRoleMatrix(roleKey){
    try{
      const custom = (window.DB && DB._raw && DB._raw('custom_roles')) || [];
      const row = custom.find(r => r.role_key === roleKey && r.is_active !== false);
      if (!row) return null;
      const m = emptyMatrix();
      (row.capabilities || []).forEach(c => { if (m.hasOwnProperty(c)) m[c]=true; });
      return m;
    }catch(_){ return null; }
  }

  /* ---------- Feature flags per church ---------- */
  function moduleBlockedByFlag(capability, session){
    if (!session || !session.church_id) return false;
    try{
      const flags = (window.DB && DB._raw && DB._raw('feature_flags')) || [];
      const row = flags.find(f => f.church_id === session.church_id);
      if (!row || !row.disabled_modules) return false;
      const map = {
        ai:        ['canAccessAI'],
        attendance:['canViewAttendance','canManageAttendance'],
        finance:   ['canViewFinance','canManageFinance','canApproveFinance','canRejectFinance'],
        workflows: ['canManageWorkflows'],
        reports:   ['canViewReports'],
        notifications:['canBroadcastNotifications']
      };
      return row.disabled_modules.some(mod => (map[mod]||[]).includes(capability));
    }catch(_){ return false; }
  }

  /* ---------- Public API ---------- */
  const Permissions = {
    CAPS,
    ROLES: Object.keys(ROLES),

    matrixFor(roleKey){
      return ROLES[roleKey] || customRoleMatrix(roleKey) || emptyMatrix();
    },

    can(action){
      const session = window.Auth && Auth.session();
      if (!session) return false;
      const cap = resolveCap(action);
      if (!cap) return false;

      // Per-user explicit overrides (force allow/deny)
      const overrides = session.permissions || {};
      if (overrides[cap] === false) return false;
      if (overrides[action] === false) return false;
      if (overrides[cap] === true) return true;
      if (overrides[action] === true) return true;

      // Feature flag block (super admin bypasses)
      if (session.role !== 'super_admin' && moduleBlockedByFlag(cap, session)) return false;

      const matrix = Permissions.matrixFor(session.role);
      return !!matrix[cap];
    },

    canAny(actions){ return actions.some(a => Permissions.can(a)); },
    canAll(actions){ return actions.every(a => Permissions.can(a)); },

    guard(action){
      if (Permissions.can(action)) return true;
      if (window.UI) UI.toast('ليس لديك صلاحية لهذا الإجراء','error');
      if (window.Audit) Audit.log('permission.denied', { action });
      return false;
    },

    /* Convenience for templates — hides element if no perm. */
    applyDomGuards(root){
      (root||document).querySelectorAll('[data-perm]').forEach(el => {
        if (!Permissions.can(el.getAttribute('data-perm'))) el.style.display='none';
      });
      (root||document).querySelectorAll('[data-role-only]').forEach(el => {
        const allowed = el.getAttribute('data-role-only').split(',').map(s=>s.trim());
        const s = window.Auth && Auth.session();
        if (!s || !allowed.includes(s.role)) el.style.display='none';
      });
      (root||document).querySelectorAll('[data-role-hide]').forEach(el => {
        const hidden = el.getAttribute('data-role-hide').split(',').map(s=>s.trim());
        const s = window.Auth && Auth.session();
        if (s && hidden.includes(s.role)) el.style.display='none';
      });
    },

    /* v5 — ownership-scoped check. Verifies the member/class belongs
       to the user's scope (service/stage/class). Admins always pass. */
    canAccessMember(member){
      if (!member) return false;
      if (Permissions.can('canManagePlatform')) return false; // super admin blocked from member data
      const s = window.Auth && Auth.session();
      if (!s) return false;
      if (['church_admin','service_admin'].includes(s.role)) return true;
      if (!window.Hierarchy) return Permissions.can('canViewMembers');
      const scope = Hierarchy.getScope(s);
      if (scope.all) return true;
      if (member.assigned_servant_id === s.user_id) return true;
      if (member.supervisor_id === s.user_id) return true;
      return scope.classes.includes(member.service_class_id) ||
             scope.stages.includes(member.stage_id) ||
             scope.services.includes(member.service_id);
    },

    /* Hide finance-related caps from non-finance roles in UI lists. */
    isFinanceRole(){
      const s = window.Auth && Auth.session();
      return s && ['church_admin','financial_manager','finance'].includes(s.role);
    }
  };

  window.Permissions = Permissions;
})();

