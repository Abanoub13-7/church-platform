/* ============================================================
   SERVICE-WORKSPACE.js — Operational Service Control Center
   ------------------------------------------------------------
   Turns every Service (حضانة/ابتدائي/إعدادي/ثانوي/جامعة/شباب)
   into an independent Operational Workspace with 6 tabs:
     1) Overview        2) Classes & Groups
     3) Servants        4) Members
     5) Follow-up       6) Service Analytics
   + Service Health Score (Healthy / Warning / Critical)
   ============================================================ */
(function(){
  const WS = {};

  /* ---------- Helpers ---------- */
  function pct(n,d){ if(!d) return 0; return Math.round((n/d)*100); }
  function fmt(n){ return (n||0).toLocaleString('ar-EG'); }
  function stageLabel(s){ return (window.Hierarchy && Hierarchy.stageLabel(s)) || s || '—'; }

  function serviceById(id){ return DB.byId('services','service_id', id); }
  function stagesOf(serviceId){ return DB.filter('service_stages', s => s.service_id===serviceId); }
  function classesOf(serviceId){
    return DB.filter('service_classes', c => c.service_id===serviceId ||
      stagesOf(serviceId).some(st=>st.stage_id===c.stage_id));
  }
  function membersOf(serviceId){
    const classIds = classesOf(serviceId).map(c=>c.class_id);
    return DB.filter('members', m => m.service_id===serviceId || classIds.includes(m.service_class_id));
  }
  function servantsOf(serviceId){
    const classIds = classesOf(serviceId).map(c=>c.class_id);
    const asns = DB.filter('servant_assignments', a => classIds.includes(a.class_id) && a.active!==false);
    const ids = [...new Set(asns.map(a=>a.user_id))];
    return DB.filter('users', u => ids.includes(u.user_id));
  }
  function sessionsOf(serviceId, days){
    days = days || 60;
    const since = Date.now() - days*864e5;
    const classIds = classesOf(serviceId).map(c=>c.class_id);
    return DB.filter('attendance_sessions',
      ss => classIds.includes(ss.class_id) && new Date(ss.starts_at||ss.created_at||0).getTime() >= since);
  }
  function recordsOf(sessionIds){
    if (!sessionIds.length) return [];
    return DB.filter('attendance_records', r => sessionIds.includes(r.session_id));
  }
  function followupsOf(serviceId, days){
    days = days || 60;
    const since = Date.now() - days*864e5;
    const memIds = membersOf(serviceId).map(m=>m.member_id);
    return DB.filter('followups',
      f => memIds.includes(f.member_id) && new Date(f.created_at||f.date||0).getTime() >= since);
  }

  /* ---------- Service Analytics ---------- */
  WS.analytics = function(serviceId){
    const members = membersOf(serviceId);
    const classes = classesOf(serviceId);
    const servants = servantsOf(serviceId);

    const sessions = sessionsOf(serviceId, 60);
    const records  = recordsOf(sessions.map(s=>s.session_id));

    // attendance per session (avg)
    const presentMap = {};
    records.forEach(r => { presentMap[r.session_id] = (presentMap[r.session_id]||0)+1; });
    let totalAttended = 0, totalCapacity = 0;
    sessions.forEach(ss => {
      const cls = DB.byId('service_classes','class_id', ss.class_id);
      const expected = members.filter(m => m.service_class_id===ss.class_id).length || (cls?.capacity||0);
      totalAttended += presentMap[ss.session_id] || 0;
      totalCapacity += expected;
    });
    const attendanceRate = pct(totalAttended, totalCapacity);
    const absenceRate    = 100 - attendanceRate;

    // class performance
    const classPerf = classes.map(c => {
      const mems = members.filter(m => m.service_class_id===c.class_id).length;
      const ss = sessions.filter(x => x.class_id===c.class_id);
      let att=0, cap=0;
      ss.forEach(x => { att += presentMap[x.session_id]||0; cap += mems; });
      return { class:c, members:mems, attendance: pct(att,cap), sessions: ss.length };
    }).sort((a,b)=>b.attendance-a.attendance);

    // servant activity
    const followups = followupsOf(serviceId, 60);
    const servantPerf = servants.map(u => {
      const fu = followups.filter(f => f.servant_id===u.user_id).length;
      const myCls = DB.filter('servant_assignments', a => a.user_id===u.user_id && a.active!==false).map(a=>a.class_id);
      const myMems = members.filter(m => myCls.includes(m.service_class_id)).length;
      return {
        user:u, followups:fu, classes:myCls.length, members:myMems,
        activity: Math.min(100, fu*8 + myCls.length*5)
      };
    }).sort((a,b)=>b.activity-a.activity);

    // critical cases & at-risk
    const critical = members.filter(m => m.member_status==='at_risk' || m.health_notes);
    const inactive = members.filter(m => m.member_status==='inactive' || m.member_status==='left');

    // followup completion rate
    const followupNeeded = members.filter(m => m.member_status==='at_risk' || m.member_status==='inactive').length;
    const followupDone   = followups.filter(f => f.status==='done' || f.outcome).length;
    const followupRate   = pct(followupDone, Math.max(followupNeeded,1));

    return {
      members: members.length,
      classes: classes.length,
      servants: servants.length,
      attendanceRate, absenceRate,
      sessions: sessions.length,
      followups: followups.length,
      followupRate,
      criticalCount: critical.length,
      inactiveCount: inactive.length,
      classPerf,
      servantPerf,
      topClass:    classPerf[0] || null,
      weakestClass:classPerf[classPerf.length-1] || null,
    };
  };

  /* ---------- Service Health Score ---------- */
  WS.healthScore = function(serviceId){
    const a = WS.analytics(serviceId);
    // weighted score
    const attendanceConsistency = a.attendanceRate;            // 0–100
    const servantActivity       = a.servantPerf.length ?
      Math.round(a.servantPerf.reduce((s,p)=>s+p.activity,0)/a.servantPerf.length) : 0;
    const followupCompletion    = a.followupRate;
    const memberEngagement      = Math.max(0, 100 - pct(a.inactiveCount, Math.max(a.members,1)));
    const absencePenalty        = Math.max(0, 100 - a.absenceRate);

    const score = Math.round(
      attendanceConsistency*0.30 +
      servantActivity      *0.20 +
      followupCompletion   *0.20 +
      memberEngagement     *0.20 +
      absencePenalty       *0.10
    );

    let level = 'critical', color='red';
    if (score >= 75){ level='healthy'; color='green'; }
    else if (score >= 50){ level='warning'; color='amber'; }

    return {
      score, level, color,
      breakdown: { attendanceConsistency, servantActivity, followupCompletion, memberEngagement, absencePenalty }
    };
  };

  /* ---------- Renderer ---------- */
  WS.render = function(container, serviceId, opts){
    opts = opts || {};
    const sv = serviceById(serviceId);
    if (!sv){ container.innerHTML = '<div class="empty">الخدمة غير موجودة</div>'; return; }

    const tab = opts.tab || 'overview';
    const a   = WS.analytics(serviceId);
    const h   = WS.healthScore(serviceId);
    const sup = sv.supervisor_id ? DB.byId('users','user_id',sv.supervisor_id) : null;

    const tabs = [
      ['overview',   'نظرة عامة',         'fa-gauge-high'],
      ['classes',    'الفصول والمجموعات', 'fa-layer-group'],
      ['servants',   'الخدام',            'fa-user-shield'],
      ['members',    'المخدومين',         'fa-users'],
      ['followup',   'الافتقاد',          'fa-hand-holding-heart'],
      ['analytics',  'تحليلات الخدمة',    'fa-chart-line']
    ];

    let html = `
      <div class="ws-header card" style="background:linear-gradient(135deg,#0f4c81,#1e6ec8);color:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:1rem">
          <div>
            <div style="font-size:1.5rem;font-weight:800"><i class="fa-solid fa-church"></i> ${sv.name}</div>
            <div style="opacity:.85;margin-top:.25rem">${sv.description||''} ${sv.location?` • <i class="fa-solid fa-location-dot"></i> ${sv.location}`:''}</div>
            <div style="opacity:.85;margin-top:.25rem">
              ${sup?`<i class="fa-solid fa-user-tie"></i> مشرف: ${sup.full_name} • `:''}
              <i class="fa-solid fa-layer-group"></i> ${a.classes} فصل •
              <i class="fa-solid fa-user-shield"></i> ${a.servants} خادم •
              <i class="fa-solid fa-users"></i> ${a.members} مخدوم
            </div>
          </div>
          <div style="text-align:center;background:rgba(255,255,255,.15);padding:1rem 1.5rem;border-radius:14px;min-width:160px">
            <div style="font-size:.85rem;opacity:.85">Service Health</div>
            <div style="font-size:2.5rem;font-weight:800">${h.score}</div>
            <div class="badge" style="background:${h.color==='green'?'#16a34a':h.color==='amber'?'#f59e0b':'#dc2626'};color:#fff">
              ${h.level==='healthy'?'صحي ✓':h.level==='warning'?'تحذير ⚠':'حرج ✗'}
            </div>
          </div>
        </div>
      </div>

      <div class="ws-tabs" style="display:flex;gap:.5rem;flex-wrap:wrap;margin:1rem 0;border-bottom:2px solid var(--border,#e5e7eb)">
        ${tabs.map(t=>`
          <button class="ws-tab" data-tab="${t[0]}"
            style="padding:.75rem 1.25rem;border:none;background:${tab===t[0]?'#0f4c81':'transparent'};
                   color:${tab===t[0]?'#fff':'#374151'};border-radius:8px 8px 0 0;cursor:pointer;font-weight:600">
            <i class="fa-solid ${t[2]}"></i> ${t[1]}
          </button>`).join('')}
      </div>

      <div class="ws-body">${renderTab(tab, sv, a, h, sup)}</div>
    `;

    container.innerHTML = html;
    container.querySelectorAll('.ws-tab').forEach(btn => {
      btn.addEventListener('click', () => WS.render(container, serviceId, { tab: btn.dataset.tab }));
    });
  };

  function renderTab(tab, sv, a, h, sup){
    if (tab === 'overview') return overviewTab(sv, a, h, sup);
    if (tab === 'classes')  return classesTab(sv, a);
    if (tab === 'servants') return servantsTab(sv, a);
    if (tab === 'members')  return membersTab(sv);
    if (tab === 'followup') return followupTab(sv);
    if (tab === 'analytics')return analyticsTab(sv, a, h);
    return '';
  }

  function overviewTab(sv, a, h, sup){
    const days = (sv.schedule_days||[]).join('، ') || '—';
    const times = sv.schedule_times || sv.time || '—';
    return `
      <div class="grid grid-3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem">
        ${kpi('المخدومين', a.members, 'users', '#0f4c81')}
        ${kpi('الفصول', a.classes, 'layer-group', '#7c3aed')}
        ${kpi('الخدام', a.servants, 'user-shield', '#059669')}
        ${kpi('نسبة الحضور', a.attendanceRate+'%', 'chart-pie', a.attendanceRate>=70?'#16a34a':a.attendanceRate>=50?'#f59e0b':'#dc2626')}
        ${kpi('حالات حرجة', a.criticalCount, 'triangle-exclamation', a.criticalCount?'#dc2626':'#6b7280')}
        ${kpi('افتقاد مكتمل', a.followupRate+'%', 'hand-holding-heart', '#0891b2')}
      </div>
      <div class="card mt-2" style="margin-top:1rem">
        <h3><i class="fa-solid fa-circle-info"></i> معلومات الخدمة</h3>
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1rem;margin-top:.75rem">
          <div><strong>المشرف:</strong> ${sup?sup.full_name:'—'}</div>
          <div><strong>المكان:</strong> ${sv.location||'—'}</div>
          <div><strong>المبنى:</strong> ${sv.building||'—'}</div>
          <div><strong>الدور:</strong> ${sv.floor||'—'}</div>
          <div><strong>أيام الخدمة:</strong> ${days}</div>
          <div><strong>المواعيد:</strong> ${times}</div>
          <div><strong>الكود:</strong> ${sv.code||'—'}</div>
          <div><strong>الطاقة:</strong> ${sv.capacity||'—'}</div>
        </div>
      </div>
      <div class="card mt-2" style="margin-top:1rem">
        <h3><i class="fa-solid fa-heart-pulse"></i> Service Health Breakdown</h3>
        ${bar('انتظام الحضور',   h.breakdown.attendanceConsistency)}
        ${bar('نشاط الخدام',     h.breakdown.servantActivity)}
        ${bar('إكمال الافتقاد',  h.breakdown.followupCompletion)}
        ${bar('انخراط المخدومين',h.breakdown.memberEngagement)}
        ${bar('قلة الغياب',      h.breakdown.absencePenalty)}
      </div>`;
  }

  function classesTab(sv, a){
    if (!a.classPerf.length) return '<div class="empty">لا توجد فصول بعد</div>';
    return `
      <div class="card">
        <h3><i class="fa-solid fa-layer-group"></i> الفصول والمجموعات</h3>
        <table class="table" style="width:100%;margin-top:.5rem">
          <thead><tr>
            <th>الفصل</th><th>المرحلة</th><th>الخادم المسؤول</th>
            <th>عدد المخدومين</th><th>الجلسات</th><th>نسبة الحضور</th><th>الحالة</th>
          </tr></thead>
          <tbody>${a.classPerf.map(p=>{
            const sup = p.class.supervisor_id ? DB.byId('users','user_id',p.class.supervisor_id) : null;
            const st  = p.class.stage_id ? DB.byId('service_stages','stage_id',p.class.stage_id) : null;
            const stat = p.attendance>=70?'<span class="badge" style="background:#16a34a;color:#fff">نشط</span>'
                       : p.attendance>=40?'<span class="badge" style="background:#f59e0b;color:#fff">متوسط</span>'
                       : '<span class="badge" style="background:#dc2626;color:#fff">ضعيف</span>';
            return `<tr>
              <td><strong>${p.class.class_name}</strong></td>
              <td>${st?st.name:stageLabel(p.class.age_stage)}</td>
              <td>${sup?sup.full_name:'—'}</td>
              <td>${fmt(p.members)}</td>
              <td>${fmt(p.sessions)}</td>
              <td>${p.attendance}%</td>
              <td>${stat}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  function servantsTab(sv, a){
    if (!a.servantPerf.length) return '<div class="empty">لا يوجد خدام معينون</div>';
    return `
      <div class="card">
        <h3><i class="fa-solid fa-user-shield"></i> الخدام</h3>
        <table class="table" style="width:100%;margin-top:.5rem">
          <thead><tr>
            <th>الخادم</th><th>الفصول</th><th>المخدومين</th>
            <th>الافتقادات</th><th>نسبة النشاط</th><th>الالتزام</th>
          </tr></thead>
          <tbody>${a.servantPerf.map(p=>{
            const lvl = p.activity>=70?'مرتفع':p.activity>=40?'متوسط':'منخفض';
            const col = p.activity>=70?'#16a34a':p.activity>=40?'#f59e0b':'#dc2626';
            return `<tr>
              <td><strong>${p.user.full_name}</strong><div class="text-muted" style="font-size:.85rem">${p.user.email||''}</div></td>
              <td>${p.classes}</td>
              <td>${p.members}</td>
              <td>${p.followups}</td>
              <td>
                <div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden;width:100px">
                  <div style="width:${p.activity}%;background:${col};height:100%"></div>
                </div>
                ${p.activity}%
              </td>
              <td><span class="badge" style="background:${col};color:#fff">${lvl}</span></td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  function membersTab(sv){
    const members = membersOf(sv.service_id);
    if (!members.length) return '<div class="empty">لا يوجد مخدومون</div>';
    const today = new Date();
    return `
      <div class="card">
        <h3><i class="fa-solid fa-users"></i> المخدومين (${members.length})</h3>
        <table class="table" style="width:100%;margin-top:.5rem">
          <thead><tr>
            <th>الاسم</th><th>العمر</th><th>المرحلة</th><th>الفصل</th>
            <th>الحالة</th><th>آخر حضور</th><th>الميلاد</th>
          </tr></thead>
          <tbody>${members.slice(0,200).map(m=>{
            const cls = m.service_class_id ? DB.byId('service_classes','class_id',m.service_class_id) : null;
            const lastRec = DB.filter('attendance_records', r => r.member_id===m.member_id)
              .sort((a,b)=>new Date(b.check_in_at||0)-new Date(a.check_in_at||0))[0];
            const birthDay = m.birth_date ? new Date(m.birth_date) : null;
            const isBday = birthDay && birthDay.getMonth()===today.getMonth() && birthDay.getDate()===today.getDate();
            const statusBadge = {
              active:['نشط','#16a34a'], at_risk:['خطر','#dc2626'], inactive:['غير نشط','#6b7280'],
              new:['جديد','#0891b2'], left:['منقطع','#7f1d1d']
            }[m.member_status||'active'] || ['—','#6b7280'];
            return `<tr>
              <td><strong>${m.full_name}</strong> ${isBday?'<i class="fa-solid fa-cake-candles" style="color:#f59e0b" title="عيد ميلاد اليوم"></i>':''}</td>
              <td>${window.Hierarchy?Hierarchy.formatAge(m.birth_date):'—'}</td>
              <td>${stageLabel(m.age_stage)}</td>
              <td>${cls?cls.class_name:'—'}</td>
              <td><span class="badge" style="background:${statusBadge[1]};color:#fff">${statusBadge[0]}</span></td>
              <td>${lastRec?new Date(lastRec.check_in_at).toLocaleDateString('ar-EG'):'—'}</td>
              <td>${m.birth_date?new Date(m.birth_date).toLocaleDateString('ar-EG'):'—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>
      </div>`;
  }

  function followupTab(sv){
    const members = membersOf(sv.service_id);
    const needFu = members.filter(m => ['at_risk','inactive','left'].includes(m.member_status));
    const fus = followupsOf(sv.service_id, 90);
    return `
      <div class="grid grid-3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem">
        ${kpi('يحتاج افتقاد', needFu.length, 'user-clock', '#dc2626')}
        ${kpi('افتقاد آخر 90 يوم', fus.length, 'hand-holding-heart', '#0891b2')}
        ${kpi('حالات حرجة', members.filter(m=>m.member_status==='at_risk').length, 'triangle-exclamation', '#dc2626')}
        ${kpi('منقطعين', members.filter(m=>m.member_status==='left').length, 'user-slash', '#7f1d1d')}
      </div>
      <div class="card mt-2" style="margin-top:1rem">
        <h3><i class="fa-solid fa-hand-holding-heart"></i> المخدومين المحتاجين افتقاد</h3>
        ${needFu.length ? `<table class="table" style="width:100%">
          <thead><tr><th>الاسم</th><th>الفصل</th><th>الحالة</th><th>آخر زيارة</th><th>السبب</th></tr></thead>
          <tbody>${needFu.slice(0,100).map(m=>{
            const cls = m.service_class_id ? DB.byId('service_classes','class_id',m.service_class_id) : null;
            const lastFu = DB.filter('followups', f => f.member_id===m.member_id)
              .sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0))[0];
            return `<tr>
              <td><strong>${m.full_name}</strong></td>
              <td>${cls?cls.class_name:'—'}</td>
              <td>${m.member_status}</td>
              <td>${lastFu?new Date(lastFu.created_at).toLocaleDateString('ar-EG'):'لم يُفتقد'}</td>
              <td>${m.notes||lastFu?.outcome||'—'}</td>
            </tr>`;
          }).join('')}</tbody></table>` : '<div class="empty">لا يوجد محتاجين افتقاد</div>'}
      </div>`;
  }

  function analyticsTab(sv, a, h){
    return `
      <div class="grid grid-3" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:1rem">
        ${kpi('Service Health', h.score+'/100', 'heart-pulse', h.color==='green'?'#16a34a':h.color==='amber'?'#f59e0b':'#dc2626')}
        ${kpi('نسبة الحضور', a.attendanceRate+'%', 'chart-pie', '#0f4c81')}
        ${kpi('معدل الغياب', a.absenceRate+'%', 'chart-line', '#dc2626')}
        ${kpi('معدل الافتقاد', a.followupRate+'%', 'percent', '#0891b2')}
      </div>
      <div class="card mt-2" style="margin-top:1rem">
        <h3><i class="fa-solid fa-ranking-star"></i> أداء الفصول</h3>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
          <div>
            <strong style="color:#16a34a">أكثر الفصول نشاطاً</strong>
            ${a.topClass ? `<div>${a.topClass.class.class_name} — ${a.topClass.attendance}%</div>` : '<div class="text-muted">—</div>'}
          </div>
          <div>
            <strong style="color:#dc2626">أقل الفصول نشاطاً</strong>
            ${a.weakestClass ? `<div>${a.weakestClass.class.class_name} — ${a.weakestClass.attendance}%</div>` : '<div class="text-muted">—</div>'}
          </div>
        </div>
      </div>
      <div class="card mt-2" style="margin-top:1rem">
        <h3><i class="fa-solid fa-chart-column"></i> توزيع أداء الفصول</h3>
        ${a.classPerf.slice(0,10).map(p => `
          <div style="margin:.5rem 0">
            <div style="display:flex;justify-content:space-between;font-size:.9rem">
              <span>${p.class.class_name}</span><span>${p.attendance}%</span>
            </div>
            <div style="background:#e5e7eb;border-radius:6px;height:8px;overflow:hidden">
              <div style="width:${p.attendance}%;background:${p.attendance>=70?'#16a34a':p.attendance>=40?'#f59e0b':'#dc2626'};height:100%"></div>
            </div>
          </div>`).join('')}
      </div>`;
  }

  function kpi(label, val, icon, color){
    return `<div class="card" style="text-align:center;border-top:4px solid ${color}">
      <i class="fa-solid fa-${icon}" style="font-size:1.5rem;color:${color}"></i>
      <div style="font-size:1.75rem;font-weight:800;margin-top:.25rem">${val}</div>
      <div class="text-muted" style="font-size:.85rem">${label}</div>
    </div>`;
  }

  function bar(label, val){
    const col = val>=70?'#16a34a':val>=40?'#f59e0b':'#dc2626';
    return `<div style="margin:.5rem 0">
      <div style="display:flex;justify-content:space-between;font-size:.9rem"><span>${label}</span><span>${val}%</span></div>
      <div style="background:#e5e7eb;border-radius:6px;height:10px;overflow:hidden">
        <div style="width:${val}%;background:${col};height:100%"></div>
      </div>
    </div>`;
  }

  window.ServiceWorkspace = WS;
})();
