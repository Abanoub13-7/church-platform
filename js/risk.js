/* ============================================================
   risk.js — Member Risk Engine
   Connects: attendance_records  →  members.risk_score
   Triggered by: attendance check-in / session close, and on demand.
   ============================================================ */
(function(){
  const NEW_MEMBER_WINDOW_MS = 30 * 24 * 3600 * 1000; // 30 days
  const RECENT_WINDOW_DAYS   = 60;
  const HIGH_RISK_THRESHOLD  = 50;

  function memberRelevantSessions(member, days){
    const cutoff = Date.now() - days*864e5;
    return DB.filter('attendance_sessions', s => {
      const t = new Date(s.starts_at || s.date || s.created_at).getTime();
      if (isNaN(t) || t < cutoff) return false;
      if (s.class_id && member.service_class_id && s.class_id !== member.service_class_id
          && s.activity_type !== 'mass') return false;
      return true;
    }).sort((a,b)=> new Date(a.starts_at||a.date||a.created_at)
                  - new Date(b.starts_at||b.date||b.created_at));
  }

  function recalculateRisk(member_id){
    const member = DB.byId('members','member_id', member_id);
    if (!member) return null;

    const sessions = memberRelevantSessions(member, RECENT_WINDOW_DAYS);
    const records  = DB.filter('attendance_records', { member_id });
    const attendedSessionIds = new Set(records.map(r => r.session_id));

    // Build chronological attendance flags for this member
    const flags = sessions.map(s => attendedSessionIds.has(s.session_id));

    let score = 0;

    // +30 for 3+ consecutive absences anywhere in the window
    let streak = 0, maxAbsenceStreak = 0;
    flags.forEach(att => {
      if (!att){ streak++; if (streak > maxAbsenceStreak) maxAbsenceStreak = streak; }
      else streak = 0;
    });
    if (maxAbsenceStreak >= 3) score += 30;

    // +20 for a new member whose latest tracked session was an absence
    const joinedAt = new Date(member.join_date || member.created_at || 0).getTime();
    const isNew = joinedAt && (Date.now() - joinedAt) <= NEW_MEMBER_WINDOW_MS;
    if (isNew && flags.length && flags[flags.length-1] === false) score += 20;

    // -10 for fully consistent recent attendance (≥4 sessions, no absences)
    if (flags.length >= 4 && flags.every(Boolean)) score -= 10;

    // -10 additional for very high attendance rate
    if (flags.length >= 6){
      const rate = flags.filter(Boolean).length / flags.length;
      if (rate >= 0.9) score -= 10;
    }

    // Clamp
    score = Math.max(0, Math.min(100, score));

    const prevScore = Number(member.risk_score) || 0;
    DB.update('members', member_id, { risk_score: score });

    // Auto-flag status when crossing threshold (non-destructive)
    if (score >= HIGH_RISK_THRESHOLD && member.member_status === 'active'){
      DB.update('members', member_id, { member_status: 'at_risk' });
    }

    // Auto-create / refresh a follow-up task for high-risk members
    if (score > HIGH_RISK_THRESHOLD){
      ensureHighRiskFollowup(member_id);
    }

    // Notify central Lifecycle Engine
    if (score !== prevScore){
      try { window.Lifecycle && Lifecycle.onRiskChanged(member_id); } catch(_){}
    }

    return score;
  }

  function ensureHighRiskFollowup(member_id){
    const existing = DB.find('followups', t =>
      t.member_id === member_id &&
      (t.status === 'open' || t.status === 'in_progress' || t.status === 'pending') &&
      typeof t.reason === 'string' && t.reason.indexOf('High risk') === 0
    );
    if (existing) return existing;
    return DB.insert('followups', {
      member_id,
      reason: 'High risk from attendance',
      status: 'pending',
      priority: 'high',
      auto_generated: true,
      created_by: (window.Auth && Auth.session()?.user_id) || null,
      due_at: new Date(Date.now() + 48*3600*1000).toISOString()
    });
  }

  /**
   * Recalculate risk for every member in tenant scope.
   * Returns the count of members whose score is now > threshold.
   */
  function recalculateAll(){
    const members = DB.findAll('members');
    let highRisk = 0;
    members.forEach(m => {
      const s = recalculateRisk(m.member_id);
      if (s != null && s > HIGH_RISK_THRESHOLD) highRisk++;
    });
    return { total: members.length, highRisk };
  }

  window.recalculateRisk    = recalculateRisk;
  window.RiskEngine = {
    recalculate: recalculateRisk,
    recalculateAll,
    ensureHighRiskFollowup,
    HIGH_RISK_THRESHOLD
  };
})();
