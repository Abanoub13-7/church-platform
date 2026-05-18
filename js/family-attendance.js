/* ============================================================
   family-attendance.js — Family Attendance Intelligence
   Aggregates attendance_records for entire families.
   Exposes window.FamilyAttendance + extends window.Family.attendance.
   ============================================================ */
(function(){
  if (!window.DB) return;

  const DAY  = 864e5;
  const WEEK = 7 * DAY;

  function fMembers(family_id){
    return window.Family && Family.familyMembers
      ? Family.familyMembers(family_id)
      : DB.filter('members', { family_id });
  }

  function memberRecords(member_id, sinceMs){
    return DB.filter('attendance_records', r =>
      r.member_id === member_id &&
      new Date(r.check_in_at).getTime() >= sinceMs
    );
  }

  function sessionsSince(sinceMs){
    return DB.filter('attendance_sessions', s =>
      new Date(s.starts_at || s.date || s.created_at).getTime() >= sinceMs);
  }

  function pct(part, whole){
    if (!whole) return 0;
    return Math.max(0, Math.min(100, Math.round((part/whole)*100)));
  }

  /* ----- Core aggregate metrics ----- */
  function metrics(family_id){
    const members = fMembers(family_id);
    const now = Date.now();
    const weeklyCut  = now - 7*DAY;
    const monthlyCut = now - 30*DAY;
    const trendCut   = now - 56*DAY; // 8 weeks

    const weekSessions  = sessionsSince(weeklyCut).length  || 1;
    const monthSessions = sessionsSince(monthlyCut).length || 1;

    const weekRecs   = members.reduce((s,m)=> s + memberRecords(m.member_id, weeklyCut).length, 0);
    const monthRecs  = members.reduce((s,m)=> s + memberRecords(m.member_id, monthlyCut).length, 0);

    const weekly_pct  = members.length ? pct(weekRecs,  weekSessions  * members.length) : 0;
    const monthly_pct = members.length ? pct(monthRecs, monthSessions * members.length) : 0;

    // parent / child split
    const parents  = members.filter(m => m.family_role === 'father' || m.family_role === 'mother');
    const children = members.filter(m => m.family_role === 'child');
    const parentRecs  = parents.reduce((s,m)=>  s + memberRecords(m.member_id, monthlyCut).length, 0);
    const childRecs   = children.reduce((s,m)=> s + memberRecords(m.member_id, monthlyCut).length, 0);
    const parent_participation = parents.length  ? pct(parentRecs, monthSessions * parents.length)  : 0;
    const child_participation  = children.length ? pct(childRecs,  monthSessions * children.length) : 0;

    // consistency: stddev-ish proxy — % of weeks in last 8 with at least 1 attendance
    const buckets = new Array(8).fill(0);
    members.forEach(m => memberRecords(m.member_id, trendCut).forEach(r => {
      const w = Math.floor((now - new Date(r.check_in_at).getTime())/WEEK);
      if (w>=0 && w<8) buckets[w]++;
    }));
    const activeWeeks = buckets.filter(b => b>0).length;
    const consistency_score = pct(activeWeeks, 8);

    // consecutive absences (weeks from most recent backwards with zero records)
    let consecutive_absences = 0;
    for (let i=0;i<8;i++){ if (buckets[i]===0) consecutive_absences++; else break; }

    // trend: compare last 4 weeks vs prior 4 weeks
    const recent = buckets.slice(0,4).reduce((a,b)=>a+b,0);
    const prior  = buckets.slice(4,8).reduce((a,b)=>a+b,0);
    let engagement_trend = 'stable';
    if (recent === 0 && prior === 0) engagement_trend = 'unknown';
    else if (recent > prior * 1.15) engagement_trend = 'rising';
    else if (recent < prior * 0.85) engagement_trend = 'declining';

    // flag: inactive guardians but children active
    const inactiveGuardiansActiveChildren =
      parents.length>0 && parentRecs === 0 && childRecs > 0;
    const fullFamilyAbsence = monthRecs === 0;

    return {
      family_id,
      weekly_pct, monthly_pct,
      consistency_score,
      parent_participation, child_participation,
      consecutive_absences, engagement_trend,
      buckets,
      flags: {
        inactive_guardians_active_children: inactiveGuardiansActiveChildren,
        full_family_absence: fullFamilyAbsence,
        declining: engagement_trend === 'declining'
      },
      computed_at: new Date().toISOString()
    };
  }

  /* ----- Heatmap (weeks × members) — returns plain HTML ----- */
  function heatmapHtml(family_id, weeks){
    weeks = weeks || 12;
    const members = fMembers(family_id);
    const now = Date.now();
    const cells = members.map(m => {
      const recs = memberRecords(m.member_id, now - weeks*WEEK);
      const arr = new Array(weeks).fill(0);
      recs.forEach(r => {
        const w = Math.floor((now - new Date(r.check_in_at).getTime())/WEEK);
        if (w>=0 && w<weeks) arr[w]++;
      });
      return { name:m.full_name, arr };
    });
    const shade = n => n===0 ? '#e5e7eb' : n===1 ? '#bbf7d0' : n===2 ? '#4ade80' : '#16a34a';
    const head = `<th></th>` + Array.from({length:weeks}, (_,i)=>`<th style="font-size:.65rem;color:#888">w-${weeks-i}</th>`).join('');
    const rows = cells.map(c =>
      `<tr><td style="font-weight:600;white-space:nowrap">${c.name}</td>` +
      c.arr.slice().reverse().map(v =>
        `<td title="${v} حضور" style="padding:2px"><div style="width:14px;height:14px;border-radius:3px;background:${shade(v)}"></div></td>`
      ).join('') + `</tr>`
    ).join('');
    if (!cells.length) return '<div class="empty">لا يوجد أفراد</div>';
    return `<div style="overflow:auto"><table style="border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ----- Cache write ----- */
  function recompute(family_id){
    const m = metrics(family_id);
    const existing = DB.find('family_scores', { family_id });
    const patch = {
      attendance_weekly_pct:  m.weekly_pct,
      attendance_monthly_pct: m.monthly_pct,
      consistency_score:      m.consistency_score,
      parent_participation:   m.parent_participation,
      child_participation:    m.child_participation,
      consecutive_absences:   m.consecutive_absences,
      engagement_trend:       m.engagement_trend,
      computed_at:            m.computed_at
    };
    if (existing) DB.update('family_scores', existing.score_id, patch);
    else          DB.insert('family_scores', Object.assign({ family_id }, patch));
    return m;
  }

  function recomputeAll(){
    const fams = DB.findAll('families');
    fams.forEach(f => recompute(f.family_id));
    return fams.length;
  }

  window.FamilyAttendance = { metrics, heatmapHtml, recompute, recomputeAll };
  if (window.Family) window.Family.attendance = window.FamilyAttendance;

  /* Auto-recompute on attendance writes */
  if (DB.on){
    DB.on((op, table, row) => {
      if (table !== 'attendance_records' || op !== 'insert' || !row) return;
      const member = DB.byId('members','member_id', row.member_id);
      if (member && member.family_id){
        try { recompute(member.family_id); } catch(_){}
        try { window.FamilyRisk && FamilyRisk.recompute(member.family_id); } catch(_){}
      }
    });
  }
})();
