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

  /* v22 — warmup hook called by App.boot. Idempotent. */
  Permissions.warmup = function(){
    if (Permissions.__warmed) return; Permissions.__warmed = true;
    try { Permissions.matrixFor('church_admin'); } catch(_){}
  };

  /* v22 — unified single-source page visibility check.
     Consults role matrix + hierarchy + scoped + finance-isolation in ONE place.
     Returns true unless a layer explicitly denies. Fail-safe (never throws). */
  Permissions.canSeePage = function(pageId){
    try{
      const s = window.Auth && Auth.session(); if (!s) return false;
      if (s.role === 'super_admin'){
        // super admin only sees platform pages
        const platform = ['super-admin','tenants','platform-health','subscriptions','billing',
          'usage-analytics','ai-ops','white-label','support','knowledge-base','backups'];
        return platform.includes(pageId);
      }
      // finance isolation — non-finance roles cannot see finance pages
      if (window.FinanceIsolation && typeof FinanceIsolation.canAccess === 'function'){
        if (/^finance|my-billing/.test(pageId) && !FinanceIsolation.canAccess(s)) return false;
      }
      // hierarchy — supervisor-only pages
      if (window.Hierarchy && typeof Hierarchy.canSeePage === 'function'){
        const h = Hierarchy.canSeePage(s, pageId);
        if (h === false) return false;
      }
      // scoped permissions
      if (window.ScopedPermissions && typeof ScopedPermissions.canSeePage === 'function'){
        const sc = ScopedPermissions.canSeePage(s, pageId);
        if (sc === false) return false;
      }
      return true;
    }catch(_){ return true; }
  };

  window.Permissions = Permissions;
})();


/* ============================================================
   MERGED: SCOPED-PERMISSIONS (was js/scoped-permissions.js)
   ============================================================ */
/* ============================================================
   SCOPED-PERMISSIONS.js — Role × Scope guard layer
   ------------------------------------------------------------
   Wraps Permissions + Hierarchy.getScope to enforce:
     - Servant   → only own classes / members
     - Supervisor→ only own service (all stages/classes)
     - Finance   → finance entities only, NO member data
     - Admin     → full tenant
   Provides:
     ScopedPerm.canViewMember(memberId)
     ScopedPerm.canViewClass(classId)
     ScopedPerm.canViewService(serviceId)
     ScopedPerm.canSeeFinance()
     ScopedPerm.canSeeMembers()
     ScopedPerm.filterMembers(list)
     ScopedPerm.filterServices(list)
     ScopedPerm.assertOrThrow(check, msg)
   ============================================================ */
(function(){
  const SP = {};
  const FINANCE_ROLES = ['church_admin','financial_manager','finance'];
  const MEMBER_BLOCKED_ROLES = ['financial_manager','finance']; // finance never sees member data

  function sess(){ return window.Auth && Auth.session(); }
  function scope(){ const s = sess(); return s && window.Hierarchy ? Hierarchy.getScope(s) : { all:false, services:[], stages:[], classes:[] }; }

  SP.role = function(){ return (sess()||{}).role || 'guest'; };

  SP.canSeeFinance = function(){
    const r = SP.role();
    return FINANCE_ROLES.includes(r);
  };

  SP.canSeeMembers = function(){
    const r = SP.role();
    if (MEMBER_BLOCKED_ROLES.includes(r)) return false;
    return ['super_admin','church_admin','service_admin','service_supervisor','supervisor','servant_leader','servant'].includes(r);
  };

  SP.canApproveFinance = function(){
    const r = SP.role();
    // Finance manager submits, only church_admin approves (segregation of duties)
    return r === 'church_admin';
  };

  SP.canViewService = function(serviceId){
    const sc = scope();
    return sc.all || (sc.services||[]).includes(serviceId);
  };
  SP.canViewStage = function(stageId){
    const sc = scope();
    return sc.all || (sc.stages||[]).includes(stageId);
  };
  SP.canViewClass = function(classId){
    const sc = scope();
    return sc.all || (sc.classes||[]).includes(classId);
  };
  SP.canViewMember = function(memberId){
    if (!SP.canSeeMembers()) return false;
    const sc = scope();
    if (sc.all) return true;
    const m = DB.byId('members','member_id', memberId);
    if (!m) return false;
    return (sc.classes||[]).includes(m.service_class_id);
  };

  SP.filterServices = function(list){
    const sc = scope();
    if (sc.all) return list;
    return list.filter(s => (sc.services||[]).includes(s.service_id));
  };
  SP.filterClasses = function(list){
    const sc = scope();
    if (sc.all) return list;
    return list.filter(c => (sc.classes||[]).includes(c.class_id));
  };
  SP.filterMembers = function(list){
    if (!SP.canSeeMembers()) return [];
    const sc = scope();
    if (sc.all) return list;
    return list.filter(m => (sc.classes||[]).includes(m.service_class_id));
  };

  SP.assertOrThrow = function(check, msg){
    if (!check){
      try { window.Audit && Audit.log('scope.denied', { msg, severity:'warning' }); } catch(_){}
      throw new Error(msg || 'Access denied by scope');
    }
  };

  /* Convenience: redirect / blank UI if user clearly off-scope */
  SP.guardPage = function(allowedRoles){
    const r = SP.role();
    if (!allowedRoles.includes(r)){
      document.body.innerHTML = `<div style="padding:3rem;text-align:center;font-family:Cairo,sans-serif">
        <i class="fa-solid fa-lock" style="font-size:3rem;color:#dc2626"></i>
        <h2>غير مصرح</h2>
        <p>ليس لديك صلاحية الوصول لهذه الصفحة.</p>
        <a href="dashboard.html" class="btn btn-primary">الرجوع</a>
      </div>`;
      return false;
    }
    return true;
  };

  window.ScopedPerm = SP;
})();

/* ============================================================
   ROLE ENGINE — Phase 2 (additive)
   Person-centric role assignments with scoped context + conflict
   validation. Wraps existing roles matrix without breaking it.
   ============================================================ */
(function(){
  if (window.RoleEngine) return;

  const ROLE_TYPES = ['member','servant','supervisor','service_leader','priest','admin'];
  const CONTEXT_KEYS = ['service_id','class_id','group_id','sector_id'];

  function db(t){ try { return (window.DB && DB.all && DB.all(t)) || []; } catch(_) { return []; } }
  function now(){ return new Date().toISOString(); }
  function uid(){ return 'asn_' + Math.random().toString(36).slice(2,10); }

  // Get all assignments for a person — synthesized from the existing tables
  // so we never break current data: members, servant_assignments, service_supervisors.
  function assignmentsFor(personId){
    const out = [];
    db('members').filter(m => m.member_id === personId || m.user_id === personId).forEach(m => {
      out.push({
        assignment_id: 'mem_' + m.member_id,
        person_id: personId,
        role: 'member',
        service_id: m.service_id || null,
        class_id:   m.service_class_id || null,
        group_id:   m.group_id || null,
        active: m.status !== 'inactive'
      });
    });
    db('servant_assignments').filter(a => a.user_id === personId).forEach(a => {
      out.push({
        assignment_id: 'srv_' + (a.assignment_id || a.class_id),
        person_id: personId,
        role: 'servant',
        service_id: a.service_id || null,
        class_id:   a.class_id   || null,
        group_id:   a.group_id   || null,
        active: a.active !== false
      });
    });
    db('service_supervisors').filter(s => s.user_id === personId).forEach(s => {
      out.push({
        assignment_id: 'sup_' + (s.assignment_id || s.service_id),
        person_id: personId,
        role: 'supervisor',
        service_id: s.service_id || null,
        class_id: null, group_id: null,
        active: s.active !== false
      });
    });
    // Custom role rows (admin/priest/service_leader) live on the users table
    const u = (db('users').find(u => u.user_id === personId)) || null;
    if (u){
      if (u.role === 'church_admin' || u.role === 'service_admin')
        out.push({ assignment_id:'role_'+u.user_id, person_id:personId, role:'admin', active:true });
      if (u.role === 'priest' || u.is_priest)
        out.push({ assignment_id:'pr_'+u.user_id, person_id:personId, role:'priest', active:true });
      if (u.role === 'servant_leader')
        out.push({ assignment_id:'sl_'+u.user_id, person_id:personId, role:'service_leader',
                   service_id:u.service_id||null, active:true });
    }
    return out;
  }

  // Same context = same service/class/group scope key.
  function sameContext(a, b){
    return CONTEXT_KEYS.every(k => (a[k]||null) === (b[k]||null));
  }

  // Validate a proposed new assignment against current ones.
  // Returns { ok, errors:[...], warnings:[...] }.
  function validate(proposed){
    const errors = [], warnings = [];
    const p = proposed || {};
    if (!p.person_id) errors.push('person_id is required');
    if (!ROLE_TYPES.includes(p.role)) errors.push('invalid role: ' + p.role);
    const existing = assignmentsFor(p.person_id).filter(x => x.active !== false);

    // Rule 2: supervisor cannot supervise self
    if (p.role === 'supervisor' && p.supervises_person_id === p.person_id)
      errors.push('A supervisor cannot supervise themselves');

    // Rule 6: hierarchy loop prevention
    if (p.role === 'supervisor' && window.Hierarchy && p.service_id){
      const seen = new Set();
      let cur = p.service_id;
      while (cur && !seen.has(cur)){
        seen.add(cur);
        const node = (db('services').find(s => s.service_id === cur))
                  || (db('service_supervisors').find(s => s.service_id === cur));
        cur = node && node.parent_service_id;
        if (cur === p.service_id){ errors.push('Hierarchy loop detected'); break; }
      }
    }

    existing.forEach(ex => {
      // Rule 4: no duplicate active assignment per (person, role, node)
      if (ex.role === p.role && sameContext(ex, p))
        errors.push('Duplicate assignment for this role in same context');

      if (sameContext(ex, p)){
        // Rule 1: servant ↔ member conflict in same context
        if ((ex.role==='servant' && p.role==='member') || (ex.role==='member' && p.role==='servant'))
          errors.push('A servant cannot be a member in the same service/class/group');
        // Rule 3: servant cannot appear under their own class as a member
        if ((ex.role==='servant' && p.role==='member' && ex.class_id && ex.class_id===p.class_id))
          errors.push('Servant cannot be listed as a member under their own class');
        // Rule 5: priests/admins must not appear as regular members
        if ((ex.role==='priest' || ex.role==='admin') && p.role==='member')
          errors.push('Priests and admins cannot be listed as regular members');
        if (p.role==='priest' && ex.role==='member')
          errors.push('A regular member cannot also hold the priest role here');
      }
    });

    return { ok: errors.length === 0, errors, warnings };
  }

  // Apply an assignment — writes to the appropriate underlying table.
  function apply(proposed){
    const v = validate(proposed);
    if (!v.ok){
      if (window.UI) UI.toast(v.errors[0], 'error');
      if (window.Audit) Audit.log('role.denied', { proposed, errors: v.errors });
      return v;
    }
    const a = Object.assign({ assignment_id: uid(), created_at: now(), active: true }, proposed);
    try {
      if (a.role === 'servant' && window.DB && DB.insert){
        DB.insert('servant_assignments', {
          assignment_id: a.assignment_id, user_id: a.person_id,
          service_id: a.service_id, class_id: a.class_id, group_id: a.group_id,
          active: true, created_at: a.created_at
        });
      } else if (a.role === 'supervisor' && window.DB && DB.insert){
        DB.insert('service_supervisors', {
          assignment_id: a.assignment_id, user_id: a.person_id,
          service_id: a.service_id, active: true, created_at: a.created_at
        });
      } else if (a.role === 'member' && window.DB && DB.update){
        DB.update('members', a.person_id, {
          service_id: a.service_id, service_class_id: a.class_id,
          group_id: a.group_id, status: 'active'
        });
      }
      if (window.Audit) Audit.log('role.assigned', { assignment: a });
    } catch(err){
      if (window.Audit) Audit.log('role.error', { error: String(err) });
      return { ok:false, errors:[String(err)], warnings:[] };
    }
    return { ok:true, assignment: a, errors:[], warnings:v.warnings };
  }

  // Conflict scan across the whole tenant — used by audit pages.
  function scanConflicts(){
    const seen = {}, conflicts = [];
    db('members').forEach(m => {
      const key = (m.member_id||'') + '|' + (m.service_class_id||'');
      seen[key] = (seen[key]||0) + 1;
    });
    db('servant_assignments').filter(a => a.active !== false).forEach(a => {
      const memberRow = db('members').find(m => (m.user_id === a.user_id || m.member_id === a.user_id) && m.service_class_id === a.class_id);
      if (memberRow) conflicts.push({
        type:'servant_member_conflict', person_id: a.user_id,
        class_id: a.class_id,
        message: 'Servant also listed as member in the same class'
      });
    });
    db('service_supervisors').filter(s => s.active !== false && s.supervises_user_id === s.user_id).forEach(s => {
      conflicts.push({ type:'self_supervision', person_id: s.user_id, message: 'Supervisor supervises themselves' });
    });
    return conflicts;
  }

  window.RoleEngine = {
    ROLE_TYPES, assignmentsFor, validate, apply, scanConflicts,
    // tiny helpers for UI buttons
    canBeServantOf(personId, ctx){
      return validate({ person_id: personId, role:'servant', ...ctx }).ok;
    },
    canBeMemberOf(personId, ctx){
      return validate({ person_id: personId, role:'member', ...ctx }).ok;
    }
  };
})();
