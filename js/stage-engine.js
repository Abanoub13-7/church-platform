/* ============================================================
   STAGE-ENGINE.js — Auto stage detection + supervisor approval queue
   ============================================================ */
(function(){
  /* Scan all members; if calculated stage differs from current age_stage,
     create a pending transition (unless one already pending for this member). */
  function scanTransitions(){
    const created = [];
    DB.all('members').forEach(m => {
      if (!m.birth_date) return;
      const auto = Hierarchy.stageFromBirth(m.birth_date);
      if (!auto || auto === m.age_stage) return;
      const existing = DB.find('pending_transitions',
        t => t.member_id===m.member_id && t.status==='pending');
      if (existing) return;
      const row = DB.insert('pending_transitions', {
        member_id: m.member_id,
        family_id: m.family_id || null,
        current_stage: m.age_stage || null,
        suggested_stage: auto,
        current_class_id: m.service_class_id || null,
        suggested_class_id: null,
        reason: 'انتقال عمري تلقائي بناءً على تاريخ الميلاد',
        age_years: Hierarchy.ageFromBirth(m.birth_date).years,
        status: 'pending'
      });
      created.push(row);
    });
    return created;
  }

  function approve(transition_id, opts){
    opts = opts || {};
    const t = DB.byId('pending_transitions','transition_id', transition_id);
    if (!t) return null;
    const patch = { age_stage: t.suggested_stage };
    if (opts.class_id) patch.service_class_id = opts.class_id;
    if (opts.servant_id) patch.assigned_servant_id = opts.servant_id;
    DB.update('members','member_id', t.member_id, patch);
    return DB.update('pending_transitions','transition_id', transition_id, {
      status:'approved',
      reviewed_at: new Date().toISOString(),
      reviewer_id: (Auth.session()||{}).user_id || null,
      approved_class_id: opts.class_id || null,
      approved_servant_id: opts.servant_id || null
    });
  }

  function reject(transition_id, reason){
    return DB.update('pending_transitions','transition_id', transition_id, {
      status:'rejected',
      reviewed_at: new Date().toISOString(),
      reviewer_id: (Auth.session()||{}).user_id || null,
      reject_reason: reason || ''
    });
  }

  function pendingCount(){
    return DB.count('pending_transitions', t => t.status==='pending');
  }

  window.StageEngine = { scanTransitions, approve, reject, pendingCount };

  // run on every page bootstrap
  window.addEventListener('DOMContentLoaded', () => {
    const s = window.Auth && Auth.session();
    if (!s || s.role==='super_admin') return;
    try{ scanTransitions(); }catch(_){}
  });
})();
