/* ============================================================
   AI-SCOPE.js — Context-Aware AI insights
   ------------------------------------------------------------
   Wraps AI insights so a Servant only sees insights about HIS
   class, a Supervisor only sees insights about HIS service, etc.
   Never leaks data outside the caller's scope.
   ============================================================ */
(function(){
  const AI = {};

  function sess(){ return window.Auth && Auth.session(); }
  function scope(){ const s = sess(); return s && window.Hierarchy ? Hierarchy.getScope(s) : null; }

  AI.insightsForCurrentUser = function(){
    const s = sess(); if (!s) return [];
    const sc = scope(); if (!sc) return [];
    const role = s.role;

    // Block finance from any member analytics
    if (['financial_manager','finance'].includes(role)) return [];

    const members = window.Hierarchy.scopedMembers(s);
    const out = [];

    // 1) At-risk members
    const atRisk = members.filter(m => m.member_status==='at_risk');
    if (atRisk.length) out.push({
      icon:'triangle-exclamation', color:'#dc2626',
      title:'حالات حرجة في نطاقك',
      text:`${atRisk.length} مخدوم في خطر يحتاج تدخل عاجل`,
      members: atRisk.slice(0,5).map(m=>m.full_name)
    });

    // 2) Likely absentees (no record in last 30d)
    const since = Date.now() - 30*864e5;
    const recentlyPresent = new Set(
      DB.filter('attendance_records', r => new Date(r.check_in_at||0).getTime() >= since).map(r=>r.member_id)
    );
    const absentees = members.filter(m => m.member_status==='active' && !recentlyPresent.has(m.member_id));
    if (absentees.length) out.push({
      icon:'user-clock', color:'#f59e0b',
      title:'معرضون للانقطاع',
      text:`${absentees.length} مخدوم لم يحضر في آخر 30 يوم`,
      members: absentees.slice(0,5).map(m=>m.full_name)
    });

    // 3) Needs follow-up
    const needsFu = members.filter(m => ['at_risk','inactive'].includes(m.member_status));
    if (needsFu.length) out.push({
      icon:'hand-holding-heart', color:'#0891b2',
      title:'يحتاجون افتقاد',
      text:`${needsFu.length} مخدوم بحاجة للزيارة`,
      members: needsFu.slice(0,5).map(m=>m.full_name)
    });

    // 4) Supervisor: weak classes
    if (['service_supervisor','supervisor','church_admin','service_admin'].includes(role) && window.ServiceWorkspace){
      const services = sc.all ? DB.all('services') : DB.all('services').filter(sv=>sc.services.includes(sv.service_id));
      services.forEach(sv => {
        const a = ServiceWorkspace.analytics(sv.service_id);
        const h = ServiceWorkspace.healthScore(sv.service_id);
        if (h.level === 'critical') out.push({
          icon:'heart-pulse', color:'#dc2626',
          title:`خدمة ${sv.name} في حالة حرجة`,
          text:`Service Health = ${h.score}/100 — تحتاج تدخل فوري`
        });
        if (a.weakestClass && a.weakestClass.attendance < 30) out.push({
          icon:'arrow-trend-down', color:'#f59e0b',
          title:`فصل ضعيف في ${sv.name}`,
          text:`${a.weakestClass.class.class_name}: ${a.weakestClass.attendance}% حضور`
        });
      });
    }

    // 5) Birthdays this week
    if (window.Hierarchy){
      const bdays = Hierarchy.birthdaysUpcoming(7);
      const inScopeBdays = bdays.filter(b => {
        if (sc.all) return true;
        return sc.classes.includes(b.member.service_class_id);
      });
      if (inScopeBdays.length) out.push({
        icon:'cake-candles', color:'#7c3aed',
        title:'أعياد ميلاد قادمة',
        text:`${inScopeBdays.length} مخدوم لديهم عيد ميلاد خلال 7 أيام`,
        members: inScopeBdays.slice(0,5).map(b=>b.member.full_name)
      });
    }

    return out;
  };

  AI.render = function(container){
    const items = AI.insightsForCurrentUser();
    if (!items.length){
      container.innerHTML = '<div class="empty">لا توجد تنبيهات حالياً في نطاقك</div>';
      return;
    }
    container.innerHTML = `<div style="display:grid;gap:.75rem">${items.map(it=>`
      <div class="card" style="border-right:4px solid ${it.color}">
        <div style="display:flex;align-items:start;gap:.75rem">
          <i class="fa-solid fa-${it.icon}" style="color:${it.color};font-size:1.5rem;margin-top:.25rem"></i>
          <div style="flex:1">
            <strong>${it.title}</strong>
            <div class="text-muted" style="margin-top:.25rem">${it.text}</div>
            ${it.members?`<div style="margin-top:.5rem;font-size:.85rem">${it.members.join(' • ')}</div>`:''}
          </div>
        </div>
      </div>`).join('')}</div>`;
  };

  window.AIScope = AI;
})();
