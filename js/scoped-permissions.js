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
