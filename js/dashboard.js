/* ============================================================
   DASHBOARD.js — v5 (scoped + birthdays + finance isolation)
   ============================================================ */
(function(){
  if (!App.init('dashboard')) return;
  const s = Auth.session();
  const isFinance = Permissions.isFinanceRole();
  const scope = window.Hierarchy ? Hierarchy.getScope(s) : { all:true };

  // Scoped data
  const scopedMembers = window.Hierarchy ? Hierarchy.scopedMembers(s) : DB.all('members');
  const totalMembers = scopedMembers.length;
  const activeMembers = scopedMembers.filter(m=>m.member_status==='active').length;
  const atRisk = scopedMembers.filter(m=>m.member_status==='at_risk').length;
  const newMembers = scopedMembers.filter(m=>m.member_status==='new').length;

  const totalUsers = DB.count('users', u => u.is_active);
  const upcomingEvents = DB.count('events', e => new Date(e.starts_at) > new Date());
  const myTasks = DB.filter('followup_tasks', t =>
    (t.status==='open'||t.status==='in_progress') &&
    (scope.all || t.assigned_to===s.user_id || scopedMembers.some(m=>m.member_id===t.member_id))
  );
  const openTasks = myTasks.length;

  // Finance metric — ONLY for finance roles
  const todayDonations = isFinance
    ? DB.filter('financial_transactions', t => t.type==='donation' &&
        new Date(t.transaction_date).toDateString()===new Date().toDateString())
        .reduce((sum,t)=>sum+(+t.amount||0),0)
    : 0;

  const insights = (window.AIEngine ? AIEngine.insights() : []).slice(0,5)
    // For scoped users, filter insights tied to members outside scope
    .filter(i => scope.all || !i.member_id || scopedMembers.some(m=>m.member_id===i.member_id));

  const recentTasks = myTasks.sort((a,b)=>new Date(b.created_at)-new Date(a.created_at)).slice(0,5);
  const upcomingBdays = (window.Hierarchy ? Hierarchy.birthdaysUpcoming(30) : [])
    .filter(b => scope.all || scopedMembers.some(m=>m.member_id===b.member.member_id))
    .slice(0,8);
  const todayBdays = (window.Hierarchy ? Hierarchy.birthdaysToday() : [])
    .filter(m => scope.all || scopedMembers.some(x=>x.member_id===m.member_id));

  App.render(`
    <div class="page-header">
      <div>
        <h1 class="page-title">مرحباً، ${s.full_name} 👋</h1>
        <p class="page-subtitle">${s.church_name} — ${scope.all?'نظرة كاملة':'نطاق محدود بفصولك/خدمتك'}</p>
      </div>
      <div class="flex gap-sm">
        ${Permissions.can('canManageAttendance')?`<a href="attendance.html" class="btn btn-accent"><i class="fa-solid fa-plus"></i> جلسة حضور جديدة</a>`:''}
      </div>
    </div>

    ${todayBdays.length ? `
      <div class="card mb-2" style="border-inline-start:4px solid var(--accent,#7b61ff)">
        <div class="card-title"><i class="fa-solid fa-cake-candles"></i> أعياد ميلاد اليوم 🎉</div>
        <div class="flex gap-sm" style="flex-wrap:wrap;margin-top:.5rem">
          ${todayBdays.map(m=>`<span class="badge badge-blue">${m.full_name}</span>`).join('')}
        </div>
      </div>` : ''}

    <div class="grid grid-4">
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div>
        <div><div class="stat-value">${totalMembers}</div><div class="stat-label">المخدومين في نطاقك</div></div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-check"></i></div>
        <div><div class="stat-value">${activeMembers}</div><div class="stat-label">مخدومين نشطين</div></div></div>
      <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
        <div><div class="stat-value">${atRisk}</div><div class="stat-label">في حالة خطر</div></div></div>
      <div class="stat-card blue"><div class="stat-icon"><i class="fa-solid fa-user-plus"></i></div>
        <div><div class="stat-value">${newMembers}</div><div class="stat-label">مخدومين جدد</div></div></div>
      ${scope.all?`
      <div class="stat-card purple"><div class="stat-icon"><i class="fa-solid fa-user-shield"></i></div>
        <div><div class="stat-value">${totalUsers}</div><div class="stat-label">مستخدمين نشطين</div></div></div>`:''}
      <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-calendar"></i></div>
        <div><div class="stat-value">${upcomingEvents}</div><div class="stat-label">فعاليات قادمة</div></div></div>
      <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-list-check"></i></div>
        <div><div class="stat-value">${openTasks}</div><div class="stat-label">مهام افتقاد مفتوحة</div></div></div>
      ${isFinance?`
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-coins"></i></div>
        <div><div class="stat-value">${UI.fmt.money(todayDonations)}</div><div class="stat-label">تبرعات اليوم</div></div></div>`:''}
    </div>

    ${(function(){
      const smart = (window.Insights && Insights.dashboard) ? Insights.dashboard() : [];
      if (!smart.length) return '';
      const sevColor = { critical:'red', warning:'orange', info:'blue' };
      return `
      <div class="card mt-3">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-lightbulb"></i> رؤى ذكية (Insights)</div></div>
        <div class="grid grid-2" style="gap:.5rem">
          ${smart.map(s=>`
            <div style="padding:.75rem;border-inline-start:3px solid var(--${sevColor[s.severity]||'blue'});background:var(--bg2);border-radius:8px">
              <div style="display:flex;align-items:center;gap:.5rem;font-weight:700"><i class="fa-solid ${s.icon||'fa-lightbulb'}"></i> ${s.title}</div>
              <div style="font-size:.85rem;color:var(--text2);margin-top:.25rem">${s.body||''}</div>
            </div>`).join('')}
        </div>
      </div>`;
    })()}

    <div class="grid grid-2 mt-3">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-brain"></i> تحليلات AI الخاصة بك</div>
          <a href="ai-insights.html" class="btn btn-ghost btn-sm">عرض الكل</a></div>
        ${insights.length ? insights.map(i=>`
          <div style="padding:.75rem;border-inline-start:3px solid var(--${i.type==='critical'?'red':'orange'});background:var(--bg2);border-radius:8px;margin-bottom:.5rem">
            <div style="display:flex;align-items:center;gap:.5rem;font-weight:700"><i class="fa-solid ${i.icon||'fa-lightbulb'}"></i> ${i.title}</div>
            <div style="font-size:.85rem;color:var(--text2);margin-top:.25rem">${i.body||''}</div>
          </div>`).join('') : '<div class="empty"><i class="fa-solid fa-check-circle"></i>كل شيء على ما يرام في نطاقك</div>'}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-cake-candles"></i> أعياد ميلاد قادمة (30 يوم)</div></div>
        ${upcomingBdays.length ? upcomingBdays.map(b=>`
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.5rem;border-bottom:1px solid var(--border)">
            <div>
              <div style="font-weight:600">${b.member.full_name}</div>
              <div class="text-muted" style="font-size:.8rem">${b.next.toLocaleDateString('ar-EG',{month:'long',day:'numeric'})}</div>
            </div>
            <span class="badge ${b.daysAway<=7?'badge-orange':'badge-blue'}">${b.daysAway===0?'اليوم':`بعد ${b.daysAway} يوم`}</span>
          </div>`).join('') : '<div class="empty"><i class="fa-solid fa-calendar"></i>لا توجد أعياد ميلاد قريبة</div>'}
      </div>
    </div>

    <div class="grid grid-2 mt-3">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-hand-holding-heart"></i> مهام افتقاد حديثة</div>
          <a href="followup.html" class="btn btn-ghost btn-sm">عرض الكل</a></div>
        ${recentTasks.length ? recentTasks.map(t=>{
          const m = DB.byId('members','member_id',t.member_id);
          return `<div style="padding:.75rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:600">${m?.full_name||'—'}</div>
              <div style="font-size:.8rem;color:var(--text2)">${t.reason||''}</div>
            </div>
            <span class="badge badge-${t.priority==='high'?'red':t.priority==='medium'?'orange':'gray'}">${t.priority||'normal'}</span>
          </div>`;
        }).join('') : '<div class="empty"><i class="fa-solid fa-inbox"></i>لا توجد مهام في نطاقك</div>'}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">توزيع المخدومين حسب المرحلة</div></div>
        <canvas id="chart-stages" height="120"></canvas>
      </div>
    </div>
  `);

  // chart
  setTimeout(()=>{
    const ctx = document.getElementById('chart-stages');
    if (!ctx || !window.Chart) return;
    const rules = window.Hierarchy ? Hierarchy.STAGE_RULES : [];
    const counts = rules.map(r => scopedMembers.filter(m=>m.age_stage===r.stage).length);
    new Chart(ctx, {
      type:'doughnut',
      data:{ labels: rules.map(r=>r.label), datasets:[{ data: counts }] },
      options:{ plugins:{ legend:{ position:'bottom' } } }
    });
  }, 100);
})();
