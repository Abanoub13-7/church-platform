/* ============================================================
   family-risk.js — Family Risk Intelligence Engine
   Composite score from attendance / service / financial / followup / stability.
   Updates families.risk_status, raises notifications, creates followups.
   ============================================================ */
(function(){
  if (!window.DB) return;

  const LEVEL_THRESHOLDS = { medium:30, high:55, critical:80 };

  function levelFor(score){
    if (score >= LEVEL_THRESHOLDS.critical) return 'critical';
    if (score >= LEVEL_THRESHOLDS.high)     return 'high';
    if (score >= LEVEL_THRESHOLDS.medium)   return 'medium';
    return 'low';
  }

  function fMembers(family_id){
    return window.Family && Family.familyMembers
      ? Family.familyMembers(family_id)
      : DB.filter('members', { family_id });
  }

  /* ---------- Sub-scores ---------- */

  function attendanceRisk(family_id){
    const m = window.FamilyAttendance
      ? FamilyAttendance.metrics(family_id)
      : null;
    if (!m) return { score:0, reasons:[] };
    let s = 0; const reasons = [];
    if (m.flags.full_family_absence)    { s += 35; reasons.push('غياب كامل للأسرة هذا الشهر'); }
    if (m.consecutive_absences >= 4)    { s += 25; reasons.push('غياب متتالٍ '+m.consecutive_absences+' أسابيع'); }
    else if (m.consecutive_absences>=2) { s += 12; reasons.push('غياب متتالٍ '+m.consecutive_absences+' أسابيع'); }
    if (m.engagement_trend === 'declining') { s += 15; reasons.push('انخفاض حاد في الحضور'); }
    if (m.flags.inactive_guardians_active_children) {
      s += 18; reasons.push('الأولياء غير حاضرين بينما الأبناء يحضرون');
    }
    if (m.monthly_pct < 25 && !m.flags.full_family_absence){
      s += 10; reasons.push('معدل حضور شهري منخفض ('+m.monthly_pct+'%)');
    }
    return { score: Math.min(60, s), reasons };
  }

  function followupRisk(family_id){
    const members = fMembers(family_id);
    if (!members.length) return { score:0, reasons:[] };
    const tasks = DB.filter('followups', t =>
      members.some(m => m.member_id===t.member_id) &&
      ['open','in_progress','pending','escalated'].includes(t.status));
    const unresolved = tasks.length;
    const escalated = tasks.filter(t => t.status==='escalated' || (t.escalation_level||0) > 0).length;
    let s = 0; const reasons = [];
    if (unresolved >= 3) { s += 15; reasons.push(unresolved+' مهام افتقاد غير محلولة'); }
    else if (unresolved >= 1) { s += 6; reasons.push(unresolved+' مهام مفتوحة'); }
    if (escalated > 0)  { s += 10; reasons.push(escalated+' مهام مُصعَّدة'); }
    return { score: Math.min(25, s), reasons };
  }

  function serviceRisk(family_id){
    const members = fMembers(family_id);
    if (!members.length) return { score:0, reasons:[] };
    const adults = members.filter(m => m.age_stage === 'adult' || m.age_stage === 'youth');
    if (!adults.length) return { score:0, reasons:[] };
    const servingAdults = adults.filter(m => m.is_servant || m.service_role || m.assigned_servant_id).length;
    let s = 0; const reasons = [];
    if (servingAdults === 0) { s += 8; reasons.push('لا يوجد أي خادم نشط في الأسرة'); }
    return { score: Math.min(15, s), reasons };
  }

  function financialRisk(family_id){
    let s = 0; const reasons = [];
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return { score:0, reasons:[] };
    const members = fMembers(family_id);
    const since = Date.now() - 180*864e5; // 6 months
    const tx = DB.filter('financial_transactions', t =>
      t.type === 'donation' &&
      members.some(m => m.member_id === t.member_id) &&
      new Date(t.transaction_date || t.created_at || 0).getTime() >= since
    );
    // Optional: legacy support_requests / assistance flags
    const assisted = (fam.financial_status === 'assisted' || fam.financial_status === 'dependent');
    if (!tx.length && !assisted) { s += 6; reasons.push('لا توجد مساهمات خلال 6 أشهر'); }
    if (assisted) { s += 4; reasons.push('أسرة تتلقى دعمًا — يلزم متابعة'); }
    return { score: Math.min(15, s), reasons };
  }

  function stabilityRisk(family_id){
    let s = 0; const reasons = [];
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return { score:0, reasons:[] };
    const issues = window.Rel ? Rel.detectIssues(family_id) : [];
    issues.forEach(i => {
      if (i.level === 'critical') s += 18;
      else if (i.level === 'high') s += 10;
      else if (i.level === 'medium') s += 5;
      else s += 2;
      reasons.push(i.message);
    });
    // recent movement churn
    const recentMovements = DB.filter('family_movement_log', l =>
      l.family_id === family_id &&
      Date.now() - new Date(l.occurred_at).getTime() < 60*864e5).length;
    if (recentMovements >= 3){ s += 8; reasons.push('تغيرات متعددة في الأسرة مؤخرًا'); }
    return { score: Math.min(35, s), reasons };
  }

  /* ---------- Compose ---------- */
  function recompute(family_id){
    const att = attendanceRisk(family_id);
    const fu  = followupRisk(family_id);
    const sv  = serviceRisk(family_id);
    const fn  = financialRisk(family_id);
    const st  = stabilityRisk(family_id);
    const total = Math.min(100, att.score + fu.score + sv.score + fn.score + st.score);
    const level = levelFor(total);
    const stability_score = Math.max(0, 100 - st.score*2);

    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;

    DB.update('families', family_id, { risk_status: level });

    const existing = DB.find('family_scores', { family_id });
    const patch = {
      attendance_risk: att.score,
      service_risk:    sv.score,
      financial_risk:  fn.score,
      followup_risk:   fu.score,
      stability_risk:  st.score,
      risk_total:      total,
      risk_level:      level,
      stability_score, computed_at: new Date().toISOString()
    };
    if (existing) DB.update('family_scores', existing.score_id, patch);
    else          DB.insert('family_scores', Object.assign({ family_id }, patch));

    const reasons = [].concat(att.reasons, fu.reasons, sv.reasons, fn.reasons, st.reasons);

    if (level === 'high' || level === 'critical'){
      ensureFamilyFollowup(family_id, level, reasons);
      raiseNotification(fam, level, reasons);
    }

    return { family_id, total, level, stability_score, sub:{att,fu,sv,fn,st}, reasons };
  }

  function ensureFamilyFollowup(family_id, level, reasons){
    const members = fMembers(family_id);
    if (!members.length) return;
    const anchor = members.find(m => m.family_role==='father')
                || members.find(m => m.family_role==='mother')
                || members[0];
    if (!anchor) return;
    const reason = (level==='critical' ? 'أسرة عالية الخطورة' : 'أسرة بحاجة متابعة') +
                   ' — ' + (reasons[0] || '');
    const existing = DB.find('followups', t =>
      t.member_id === anchor.member_id &&
      ['open','in_progress','pending','escalated'].includes(t.status) &&
      typeof t.reason === 'string' && t.reason.indexOf('أسرة') === 0
    );
    if (existing){
      DB.update('followups', existing.task_id, {
        priority: level==='critical'?'urgent':'high',
        reason
      });
      return existing;
    }
    return DB.insert('followups', {
      member_id: anchor.member_id,
      family_id,
      reason,
      status:'pending',
      priority: level==='critical' ? 'urgent' : 'high',
      auto_generated:true,
      source:'family_risk',
      created_by: (window.Auth && Auth.session()?.user_id) || null,
      due_at: new Date(Date.now() + 48*36e5).toISOString()
    });
  }

  function raiseNotification(fam, level, reasons){
    const s = window.Auth && Auth.session();
    if (!s) return;
    // dedupe: skip if same unread alert exists for the same family
    const dup = DB.find('notifications', n =>
      !n.is_read && n.user_id===s.user_id &&
      n.type==='alert' && n.link && n.link.indexOf(fam.family_id) >= 0);
    if (dup) return;
    DB.insert('notifications', {
      user_id: s.user_id,
      title: (level==='critical' ? '⚠️ أسرة حرجة: ' : '⚠️ أسرة عالية الخطورة: ') + (fam.family_name||fam.family_code),
      body: reasons.slice(0,3).join(' — ') || 'يلزم متابعة',
      type:'alert',
      priority: level==='critical' ? 'critical' : 'high',
      link: 'family-profile.html?family_id='+fam.family_id,
      is_read:false
    });
  }

  function recomputeAll(){
    const fams = DB.findAll('families');
    const out = { total:fams.length, high:0, critical:0 };
    fams.forEach(f => {
      const r = recompute(f.family_id);
      if (r && r.level === 'high') out.high++;
      if (r && r.level === 'critical') out.critical++;
    });
    return out;
  }

  function topAt(n, minLevel){
    n = n || 5;
    const order = { critical:4, high:3, medium:2, low:1 };
    const min = order[minLevel || 'high'];
    return DB.findAll('families')
      .map(f => {
        const sc = DB.find('family_scores', { family_id:f.family_id });
        return { fam:f, score: sc?.risk_total || 0, level: sc?.risk_level || f.risk_status || 'low' };
      })
      .filter(x => (order[x.level]||1) >= min)
      .sort((a,b)=> b.score - a.score)
      .slice(0, n);
  }

  window.FamilyRisk = {
    LEVEL_THRESHOLDS, levelFor,
    recompute, recomputeAll, topAt,
    attendanceRisk, followupRisk, serviceRisk, financialRisk, stabilityRisk
  };
  if (window.Family) window.Family.risk = window.FamilyRisk;
})();
