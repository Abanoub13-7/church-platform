/* ===== js/ai-ops-page.js ===== */
/* ============================================================
   AI-OPS.PAGE.js — Executive AI insights & recommendations
   ============================================================ */
(function(){
  if (!App.init('ai-ops', ['super_admin'])) return;
  function render(){
    const insights = AIOps.platformInsights();
    const churches = DB._raw('churches');
    const ranked = churches.map(c=>({ c, ...AIOps.churchRisk(c.church_id) })).sort((a,b)=>b.risk-a.risk);
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">رؤى الذكاء التشغيلي</h1>
        <p class="page-subtitle">توصيات تنفيذية، نقاط مخاطرة، وتنبيهات ذكية على مستوى المنصة</p>
      </div></div>

      <div class="card mb-3"><div class="card-header"><h3><i class="fa-solid fa-brain"></i> رؤى المنصة</h3></div>
        ${insights.length ? insights.map(i=>`<div class="alert ${i.severity==='danger'?'red':i.severity==='warning'?'orange':'blue'}" style="margin-bottom:.5rem">
          <b>${i.title}</b> — ${i.detail}</div>`).join('') : '<p class="muted">لا توجد تنبيهات الآن. الكل بخير ✓</p>'}
      </div>

      <div class="card mb-3"><div class="card-header"><h3>نقاط مخاطرة الكنائس</h3></div>
        <table class="table">
          <thead><tr><th>الكنيسة</th><th>المخاطرة</th><th>المستوى</th><th>الصحة</th><th>تنبيهات</th><th></th></tr></thead>
          <tbody>${ranked.map(r=>`<tr>
            <td>${r.c.church_name}</td>
            <td><div style="width:80px;background:var(--border);border-radius:4px;overflow:hidden"><div style="width:${r.risk}%;background:${r.color};height:8px"></div></div>${r.risk}%</td>
            <td><b style="color:${r.color}">${r.band}</b></td>
            <td>${r.health.score}%</td>
            <td>${r.insights.length}</td>
            <td><button class="btn btn-sm btn-ghost" data-deep="${r.c.church_id}">تفاصيل</button></td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    `);
    document.querySelectorAll('[data-deep]').forEach(b => b.onclick = ()=> deep(b.dataset.deep));
  }
  function deep(cid){
    const r = AIOps.churchRisk(cid);
    const recs = AIOps.recommendations(cid);
    const c = DB._raw('churches').find(x=>x.church_id===cid);
    UI.modal(`<h3>${c.church_name} — رؤى ذكية</h3>
      <div style="display:flex;gap:1rem;margin-bottom:1rem">
        <div class="stat-card" style="flex:1"><b>الصحة</b><div style="font-size:2rem">${r.health.score}%</div><small>${r.health.label}</small></div>
        <div class="stat-card" style="flex:1;background:${r.color};color:#fff"><b>المخاطرة</b><div style="font-size:2rem">${r.risk}%</div><small>${r.band}</small></div>
      </div>
      <h4>تنبيهات</h4>
      ${r.insights.length?r.insights.map(i=>`<div class="alert ${i.severity==='danger'?'red':'orange'}"><b>${i.title}</b><br>${i.detail}</div>`).join(''):'<p class="muted">لا توجد تنبيهات</p>'}
      <h4>توصيات ذكية</h4>
      ${recs.length?recs.map(rc=>`<div class="alert"><b>[${rc.priority}] ${rc.title}</b><br>${rc.detail}</div>`).join(''):'<p class="muted">لا توجد توصيات</p>'}
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>`);
  }
  render();
})();

/* ===== js/analytics-page.js ===== */
/* ============================================================
   ANALYTICS-PAGE.js — Executive overview, health, risks, scorecards
   ============================================================ */
(function(){
  if (!App.init('analytics')) return;

  const H = AnalyticsEngine.churchHealth();
  const risks = AnalyticsEngine.risks();
  const insights = AnalyticsEngine.insights();
  const ministries = AnalyticsEngine.ministryScorecard().slice(0,8);
  const servants = AnalyticsEngine.servantScorecard().slice(0,8);
  const trend = AnalyticsEngine.attendanceTrend(90);

  function gaugeSvg(score){
    const r=60, c=Math.PI*r;
    const offset = c - (score/100)*c;
    const color = score>=75?'#22c55e':score>=55?'#eab308':'#ef4444';
    return `<svg viewBox="0 0 160 90">
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="var(--bg2)" stroke-width="14" stroke-linecap="round"/>
      <path d="M 20 80 A 60 60 0 0 1 140 80" fill="none" stroke="${color}" stroke-width="14" stroke-linecap="round"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}" style="transition:stroke-dashoffset .8s"/>
    </svg>`;
  }
  const pill = s => s>=75?'good':s>=55?'warn':'bad';

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title"><i class="fa-solid fa-chart-mixed"></i> التحليلات والذكاء التشغيلي</h1>
        <p class="page-subtitle">نظرة تنفيذية على صحة الكنيسة والمخاطر والأداء</p></div>
      <a class="btn btn-ghost" href="ai-insights.html"><i class="fa-solid fa-brain"></i> رؤى AI</a>
    </div>

    <div style="display:grid;grid-template-columns:1fr 2fr;gap:1rem;margin-bottom:1rem">
      <div class="card" style="text-align:center">
        <div class="card-header" style="justify-content:center"><div class="card-title">مؤشر صحة الكنيسة</div></div>
        <div class="gauge">${gaugeSvg(H.score)}<div class="gauge-val">${H.score}</div></div>
        <div style="margin-top:.5rem"><span class="score-pill ${pill(H.score)}">${H.score>=75?'صحي':H.score>=55?'يحتاج انتباه':'حرج'}</span></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title">تفصيل المؤشر</div></div>
        ${Object.entries(H.parts).map(([k,v])=>`
          <div style="margin-bottom:.6rem">
            <div class="flex-between" style="display:flex;justify-content:space-between;font-size:.85rem;margin-bottom:.2rem">
              <span>${({attendance:'الحضور',workflow:'كفاءة Workflows',followup:'الافتقاد',servants:'نشاط الخدام',finance:'الاستقرار المالي'})[k]}</span>
              <b>${Math.round(v)}%</b>
            </div>
            <div style="height:8px;background:var(--bg2);border-radius:4px;overflow:hidden">
              <div style="height:100%;width:${Math.round(v)}%;background:linear-gradient(90deg,${v>=75?'#22c55e':v>=55?'#eab308':'#ef4444'},${v>=75?'#16a34a':v>=55?'#ca8a04':'#dc2626'})"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem;margin-bottom:1rem">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-triangle-exclamation"></i> المخاطر المكتشفة</div></div>
        ${risks.length ? risks.map(r=>`
          <div style="padding:.7rem;background:var(--bg2);border-inline-start:3px solid var(--${r.sev==='critical'?'red':r.sev==='high'?'orange':'blue'});border-radius:8px;margin-bottom:.5rem">
            <div style="font-weight:600">${r.msg}</div>
            ${r.delta?`<div style="font-size:.78rem;color:var(--text2)">التغير: ${r.delta}</div>`:''}
            ${r.list?`<div style="font-size:.78rem;color:var(--text2)">أمثلة: ${r.list.join('، ')}</div>`:''}
            <span class="prio ${r.sev}" style="margin-top:.3rem">${r.sev}</span>
          </div>`).join('') : '<div class="empty">لا توجد مخاطر مرصودة</div>'}
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-lightbulb"></i> رؤى تشغيلية</div></div>
        ${insights.map(i=>`
          <div style="padding:.6rem;background:var(--bg2);border-inline-start:3px solid var(--${i.sev==='critical'?'red':i.sev==='high'?'orange':'green'});border-radius:8px;margin-bottom:.5rem;font-size:.88rem">
            <i class="fa-solid ${i.icon}"></i> ${i.text}
          </div>`).join('')}
      </div>
    </div>

    <div class="card mb-3">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-chart-line"></i> اتجاه الحضور (90 يوم)</div></div>
      <canvas id="attTrend" height="80"></canvas>
    </div>

    <div style="display:grid;grid-template-columns:1fr 1fr;gap:1rem">
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-church"></i> أداء الفصول / الخدمات</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الفصل</th><th>جلسات</th><th>حضور</th><th>التقييم</th></tr></thead>
          <tbody>${ministries.map(m=>`<tr><td>${m.name}</td><td>${m.sessions}</td><td>${m.attendances}</td>
            <td><span class="score-pill ${pill(m.score)}">${m.score}</span></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">لا توجد بيانات</div></td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-user-tie"></i> بطاقات أداء الخدام</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الخادم</th><th>مكتمل</th><th>مفتوح</th><th>التقييم</th></tr></thead>
          <tbody>${servants.map(s=>`<tr><td>${s.name}</td><td>${s.completed}</td><td>${s.open}</td>
            <td><span class="score-pill ${pill(s.score)}">${s.score}</span></td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">لا توجد بيانات</div></td></tr>'}</tbody>
        </table></div>
      </div>
    </div>
  `);

  setTimeout(()=>{
    if (!window.Chart) return;
    const c = document.getElementById('attTrend');
    c && new Chart(c, { type:'line', data:{ labels:trend.labels, datasets:[{ label:'حضور', data:trend.values, borderColor:'#c9a24d', backgroundColor:'rgba(201,162,77,.18)', fill:true, tension:.35, pointRadius:0 }]}, options:{ responsive:true, plugins:{ legend:{ display:false }}, scales:{ x:{ display:false }}}});
  }, 50);
})();

/* ===== js/attendance-page.js ===== */
/* ATTENDANCE PAGE — sessions list, create, check-in (manual/QR/group) */
(function(){
  if (!App.init('attendance')) return;
  let currentScanner = null;

  function render(){
    const sessions = DB.all('attendance_sessions').sort((a,b)=> new Date(b.starts_at)-new Date(a.starts_at));
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الحضور</h1>
          <p class="page-subtitle">جلسات الحضور — ${sessions.filter(s=>s.status==='open').length} مفتوحة الآن</p></div>
        <button class="btn btn-accent" onclick="AttPage.newSession()"><i class="fa-solid fa-plus"></i> جلسة جديدة</button>
      </div>

      <div class="grid grid-4 mb-3">
        ${Object.entries(Attendance.ACTIVITY_TYPES).slice(0,4).map(([k,t]) => {
          const count = sessions.filter(s=>s.activity_type===k).length;
          return `<div class="stat-card ${t.color||''}"><div class="stat-icon"><i class="fa-solid ${t.icon}"></i></div>
            <div><div class="stat-value">${count}</div><div class="stat-label">${t.label}</div></div></div>`;
        }).join('')}
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title">الجلسات</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>النشاط</th><th>العنوان</th><th>الوقت</th><th>الحضور</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${sessions.length ? sessions.map(s => {
            const stats = Attendance.sessionStats(s.session_id);
            const t = Attendance.ACTIVITY_TYPES[s.activity_type]||{};
            return `<tr>
              <td><i class="fa-solid ${t.icon}" style="color:var(--${t.color||'accent'})"></i> ${t.label}</td>
              <td><b>${s.title}</b></td>
              <td>${UI.fmt.dateTime(s.starts_at)}</td>
              <td>${stats.total} <small class="text-muted">(${stats.late} متأخر)</small></td>
              <td><span class="badge badge-${s.status==='open'?'green':'gray'}">${s.status==='open'?'مفتوحة':'مغلقة'}</span></td>
              <td>
                ${s.status==='open' ? `<button class="btn btn-accent btn-sm" onclick="AttPage.openCheckin('${s.session_id}')"><i class="fa-solid fa-check"></i> تسجيل</button>` : ''}
                <button class="btn btn-ghost btn-sm" onclick="AttPage.viewSession('${s.session_id}')"><i class="fa-solid fa-eye"></i></button>
                ${s.status==='open' ? `<button class="btn btn-ghost btn-sm" onclick="AttPage.close('${s.session_id}')"><i class="fa-solid fa-lock"></i></button>` : ''}
              </td></tr>`;
          }).join('') : '<tr><td colspan="6"><div class="empty"><i class="fa-solid fa-calendar-xmark"></i>لا توجد جلسات</div></td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }

  window.AttPage = {
    newSession(){
      const classes = DB.all('service_classes');
      UI.modal(`
        <div class="modal-header"><h3>جلسة حضور جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="sess-form">
          <div class="form-group"><label class="form-label">نوع النشاط</label>
            <select class="form-select" name="activity_type" required>
              ${Object.entries(Attendance.ACTIVITY_TYPES).map(([k,t])=>`<option value="${k}">${t.label}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" name="title" placeholder="مثلاً: قداس الأحد" required></div>
          <div class="form-group"><label class="form-label">الفصل (اختياري)</label>
            <select class="form-select" name="class_id"><option value="">—</option>${classes.map(c=>`<option value="${c.class_id}">${c.class_name}</option>`).join('')}</select></div>
          <div class="grid grid-2">
            <div class="form-group"><label class="form-label">يبدأ</label><input class="form-control" type="datetime-local" name="starts_at" value="${new Date().toISOString().slice(0,16)}"></div>
            <div class="form-group"><label class="form-label">يُعتبر متأخر بعد (دقيقة)</label><input class="form-control" type="number" name="late_after_min" value="15"></div>
          </div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="AttPage.saveSession()"><i class="fa-solid fa-save"></i> إنشاء وفتح</button>
        </div>`);
    },
    saveSession(){
      const fd = new FormData(document.getElementById('sess-form'));
      const data = Object.fromEntries(fd.entries());
      data.starts_at = new Date(data.starts_at).toISOString();
      data.late_after_min = +data.late_after_min;
      const s = Attendance.createSession(data);
      UI.closeModal();
      if (s) AttPage.openCheckin(s.session_id);
      render();
    },
    openCheckin(sid){
      const session = DB.byId('attendance_sessions','session_id',sid);
      const members = DB.all('members').filter(m => !session.class_id || m.service_class_id === session.class_id);
      const checkedIds = new Set(DB.filter('attendance_records', r => r.session_id===sid).map(r=>r.member_id));
      UI.modal(`
        <div class="modal-header"><h3>تسجيل: ${session.title}</h3><button class="icon-btn" onclick="AttPage.closeScanner();UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="tabs"><div class="tab active" onclick="AttPage.tab(event,'manual')">يدوي</div><div class="tab" onclick="AttPage.tab(event,'qr')">QR Scanner</div><div class="tab" onclick="AttPage.tab(event,'group')">جماعي</div></div>
          <div id="tab-manual">
            <input class="form-control mb-2" placeholder="بحث..." oninput="document.querySelectorAll('#manual-list .row').forEach(r=>r.style.display=r.dataset.name.includes(this.value)?'flex':'none')">
            <div id="manual-list" style="max-height:400px;overflow-y:auto">
              ${members.map(m => `<div class="row" data-name="${m.full_name}" style="display:flex;justify-content:space-between;align-items:center;padding:.6rem;border-bottom:1px solid var(--border)">
                <div>${m.full_name} <small class="text-muted">${m.phone||m.parent_phone||''}</small></div>
                ${checkedIds.has(m.member_id)
                  ? '<span class="badge badge-green"><i class="fa-solid fa-check"></i> حاضر</span>'
                  : `<button class="btn btn-accent btn-sm" onclick="AttPage.check('${sid}','${m.member_id}',this)"><i class="fa-solid fa-plus"></i></button>`}
              </div>`).join('')}
            </div>
          </div>
          <div id="tab-qr" style="display:none;text-align:center">
            <div id="qr-reader" style="width:100%;max-width:300px;margin:0 auto"></div>
            <p class="mt-2" id="qr-status">جاهز للمسح...</p>
          </div>
          <div id="tab-group" style="display:none">
            <p class="mb-2">اختر مجموعة لتسجيل حضورها دفعة واحدة:</p>
            <div style="max-height:300px;overflow-y:auto">
              ${members.filter(m=>!checkedIds.has(m.member_id)).map(m => `<label style="display:flex;gap:.5rem;padding:.4rem;border-bottom:1px solid var(--border)">
                <input type="checkbox" value="${m.member_id}" class="group-chk"> ${m.full_name}
              </label>`).join('')}
            </div>
            <button class="btn btn-accent mt-2" onclick="AttPage.groupSubmit('${sid}')"><i class="fa-solid fa-check-double"></i> تسجيل المحددين</button>
          </div>
        </div>`);
    },
    tab(e, name){
      document.querySelectorAll('.modal .tab').forEach(t=>t.classList.remove('active'));
      e.target.classList.add('active');
      ['manual','qr','group'].forEach(t => document.getElementById('tab-'+t).style.display = t===name ? 'block':'none');
      if (name==='qr' && !currentScanner){
        currentScanner = QR.startScanner('qr-reader', code => {
          const session = document.querySelector('.modal h3').textContent;
          const sid = Array.from(document.querySelectorAll('.modal .btn-accent')).map(b=>b.getAttribute('onclick')).find(s=>s&&s.includes("'"));
          // fetch session id from any check button
          const btn = document.querySelector('[onclick^="AttPage.check"]');
          const realSid = btn ? btn.getAttribute('onclick').match(/'([^']+)'/)[1] : null;
          if (!realSid) return;
          const r = Attendance.checkInByQR(code, realSid);
          document.getElementById('qr-status').textContent = r.ok ? '✅ تم تسجيل الحضور' : '❌ '+r.error;
          if (r.ok) UI.toast('تم تسجيل الحضور','success');
        });
      } else if (name!=='qr'){
        QR.stopScanner(currentScanner); currentScanner=null;
      }
    },
    closeScanner(){ QR.stopScanner(currentScanner); currentScanner=null; },
    check(sid, mid, btn){
      const r = Attendance.checkIn(sid, mid, 'manual');
      if (r.ok){
        btn.outerHTML = `<span class="badge badge-${r.is_late?'orange':'green'}"><i class="fa-solid fa-check"></i> ${r.is_late?'متأخر':'حاضر'}</span>`;
        UI.toast('تم التسجيل','success');
      } else UI.toast(r.error,'error');
    },
    groupSubmit(sid){
      const ids = Array.from(document.querySelectorAll('.group-chk:checked')).map(c=>c.value);
      const r = Attendance.groupCheckIn(sid, ids);
      UI.toast(`تم تسجيل ${r.success} من ${r.total}`,'success');
      UI.closeModal(); render();
    },
    close(sid){
      if (!UI.confirm('إغلاق الجلسة سيُحوّل غير الحاضرين تلقائياً إلى no-show. متابعة؟')) return;
      Attendance.closeSession(sid);
      UI.toast('تم إغلاق الجلسة','success'); render();
    },
    viewSession(sid){
      const session = DB.byId('attendance_sessions','session_id',sid);
      const records = DB.filter('attendance_records', r => r.session_id===sid);
      UI.modal(`
        <div class="modal-header"><h3>${session.title}</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <p>${UI.fmt.dateTime(session.starts_at)} — ${records.length} حاضر</p>
          <table class="table mt-2"><thead><tr><th>الاسم</th><th>الوقت</th><th>الطريقة</th><th>متأخر؟</th></tr></thead>
          <tbody>${records.map(r => {
            const m = DB.byId('members','member_id',r.member_id);
            return `<tr><td>${m?.full_name||'—'}</td><td>${UI.fmt.dateTime(r.check_in_at)}</td><td>${r.check_in_method}</td><td>${r.is_late?'<span class="badge badge-orange">متأخر</span>':'<span class="badge badge-green">في الوقت</span>'}</td></tr>`;
          }).join('')}</tbody></table>
        </div>`);
    }
  };
  render();
})();

/* ===== js/backups-page.js ===== */
/* ============================================================
   BACKUPS.PAGE.js — Backup & Restore center
   ============================================================ */
(function(){
  if (!App.init('backups', ['super_admin'])) return;
  Backup.schedule();
  function render(){
    const list = Backup.list();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">النسخ الاحتياطي والاستعادة</h1>
        <p class="page-subtitle">نسخ كاملة، نسخ لكل كنيسة، نسخ لكل وحدة، مع استعادة آمنة</p></div>
        <div style="display:flex;gap:.5rem">
          <button class="btn btn-primary" id="full"><i class="fa-solid fa-database"></i> نسخة كاملة</button>
          <button class="btn btn-ghost" id="tenant"><i class="fa-solid fa-church"></i> نسخة كنيسة</button>
          <button class="btn btn-ghost" id="module"><i class="fa-solid fa-cube"></i> نسخة وحدة</button>
        </div>
      </div>

      <div class="card mb-3" style="background:rgba(239,68,68,.08);border-color:var(--red)">
        <b style="color:var(--red)">⚠️ تحذيرات الأمان:</b> الاستعادة تستبدل بيانات حالية. سيتم إنشاء نسخة احتياطية تلقائية قبل أي عملية استعادة لحماية البيانات.
      </div>

      <div class="card"><div class="card-header"><h3>النسخ المتوفرة (${list.length})</h3></div>
        <table class="table">
          <thead><tr><th>الوصف</th><th>النوع</th><th>النطاق</th><th>الحجم</th><th>التاريخ</th><th>المُنشئ</th><th>إجراءات</th></tr></thead>
          <tbody>${list.map(b=>`<tr>
            <td><b>${b.label}</b></td>
            <td><span class="badge blue">${b.type}</span></td>
            <td>${b.type==='tenant'?(DB._raw('churches').find(c=>c.church_id===b.church_id)?.church_name||'-'):b.type==='module'?b.module_key:'-'}</td>
            <td>${b.size_kb} KB</td>
            <td>${UI.fmt.dateTime(b.created_at)}</td>
            <td>${b.created_by_name||'-'}</td>
            <td style="display:flex;gap:.3rem">
              <button class="btn btn-sm btn-ghost" data-pre="${b.backup_id}"><i class="fa-solid fa-eye"></i></button>
              <button class="btn btn-sm btn-success" data-rest="${b.backup_id}"><i class="fa-solid fa-rotate-left"></i> استعادة</button>
              <button class="btn btn-sm btn-ghost" data-dl="${b.backup_id}"><i class="fa-solid fa-download"></i></button>
              <button class="btn btn-sm btn-red" data-del="${b.backup_id}"><i class="fa-solid fa-trash"></i></button>
            </td>
          </tr>`).join('') || '<tr><td colspan="7" class="muted">لا توجد نسخ بعد</td></tr>'}</tbody>
        </table>
      </div>
    `);
    document.getElementById('full').onclick = ()=>{ const l=prompt('وصف النسخة:','Full snapshot'); if(l===null)return; Backup.create({label:l, type:'full'}); UI.toast('تم إنشاء النسخة','success'); render(); };
    document.getElementById('tenant').onclick = ()=>{
      const ch = DB._raw('churches');
      const opts = ch.map((c,i)=>`${i+1}. ${c.church_name}`).join('\n');
      const idx = +prompt('اختر رقم الكنيسة:\n'+opts); if(!idx) return;
      const c = ch[idx-1]; if(!c) return;
      Backup.create({ label:`Tenant: ${c.church_name}`, type:'tenant', church_id:c.church_id });
      UI.toast('تم','success'); render();
    };
    document.getElementById('module').onclick = ()=>{
      const mods = Backup.moduleKeys();
      const idx = +prompt('اختر وحدة:\n'+mods.map((m,i)=>`${i+1}. ${m}`).join('\n')); if(!idx) return;
      const k = mods[idx-1]; if(!k) return;
      Backup.create({ label:`Module: ${k}`, type:'module', module_key:k });
      UI.toast('تم','success'); render();
    };
    document.querySelectorAll('[data-pre]').forEach(b => b.onclick = ()=> preview(b.dataset.pre));
    document.querySelectorAll('[data-rest]').forEach(b => b.onclick = ()=> restoreModal(b.dataset.rest));
    document.querySelectorAll('[data-dl]').forEach(b => b.onclick = ()=> Backup.download(b.dataset.dl));
    document.querySelectorAll('[data-del]').forEach(b => b.onclick = ()=>{ if(confirm('حذف النسخة؟')){ Backup.remove(b.dataset.del); render(); } });
  }
  function preview(id){
    const p = Backup.preview(id);
    UI.modal(`<h3>معاينة: ${p.rec.label}</h3>
      <table class="table"><thead><tr><th>الجدول</th><th>عدد السجلات</th></tr></thead>
      <tbody>${Object.entries(p.counts).map(([k,v])=>`<tr><td>${k}</td><td>${v}</td></tr>`).join('')}</tbody></table>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>`);
  }
  function restoreModal(id){
    const p = Backup.preview(id);
    UI.modal(`<h3 style="color:var(--red)">⚠️ تأكيد الاستعادة</h3>
      <p>أنت على وشك استعادة <b>${p.rec.label}</b>. سيتم إنشاء نسخة احتياطية تلقائية أولاً.</p>
      <p>اكتب <b>RESTORE</b> للتأكيد:</p><input id="cnf" class="input">
      <label>الوضع</label>
      <select id="mode" class="input"><option value="replace">استبدال كامل</option><option value="merge">دمج</option></select>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-red" id="ok">تأكيد الاستعادة</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      if (document.getElementById('cnf').value!=='RESTORE'){ UI.toast('يجب كتابة RESTORE','warning'); return; }
      Backup.restore(id, document.getElementById('mode').value);
      UI.toast('تمت الاستعادة، سيتم إعادة التحميل','success');
      setTimeout(()=>location.reload(), 800);
    };
  }
  render();
})();

/* ===== js/billing-page.js ===== */
/* ============================================================
   BILLING.PAGE.js — Super Admin · Invoices · Payments · MRR
   ============================================================ */
(function(){
  if (!App.init('billing', ['super_admin'])) return;
  Billing.runLifecycle();

  function fmt(n){ return new Intl.NumberFormat('ar-EG').format(n||0)+' ج.م'; }
  function badge(status){
    const map = {
      pending:['الانتظار','orange'], submitted:['تم الإرسال','blue'], under_review:['قيد المراجعة','blue'],
      approved:['تم القبول','green'], rejected:['مرفوضة','red'], paid:['مدفوعة','green'], overdue:['متأخرة','red']
    };
    const [t,c] = map[status]||[status,'gray'];
    return `<span class="badge ${c}">${t}</span>`;
  }

  function render(){
    const m = Billing.metrics();
    const invs = Billing.listInvoices().sort((a,b)=>b.issued_at.localeCompare(a.issued_at));
    const payments = Billing.allPayments().sort((a,b)=>b.submitted_at.localeCompare(a.submitted_at));

    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الفوترة والمدفوعات</h1>
        <p class="page-subtitle">إدارة الفواتير، مراجعة المدفوعات، ومتابعة الإيرادات</p></div>
        <div>
          <button class="btn btn-ghost" id="btn-gen-all"><i class="fa-solid fa-file-invoice"></i> توليد فواتير دورية</button>
        </div>
      </div>

      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-arrow-trend-up"></i></div><div><div class="stat-value">${fmt(m.mrr)}</div><div class="stat-label">MRR</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-calendar"></i></div><div><div class="stat-value">${fmt(m.arr)}</div><div class="stat-label">ARR</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-hourglass-half"></i></div><div><div class="stat-value">${m.pendingReview}</div><div class="stat-label">مدفوعات قيد المراجعة</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${m.overdue}</div><div class="stat-label">فواتير متأخرة</div></div></div>
      </div>

      <div class="card">
        <div class="card-header"><h3>الفواتير</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>رقم الفاتورة</th><th>الكنيسة</th><th>الخطة</th><th>المبلغ</th><th>الإصدار</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${invs.map(i=>`
            <tr>
              <td><b>${i.invoice_number}</b></td>
              <td>${i.church_name||'-'}</td>
              <td>${i.plan_key} / ${i.billing_cycle==='yearly'?'سنوي':'شهري'}</td>
              <td>${fmt(i.amount)}</td>
              <td>${UI.fmt.date(i.issued_at)}</td>
              <td>${UI.fmt.date(i.due_at)}</td>
              <td>${badge(i.status)}</td>
              <td><button class="btn btn-sm btn-ghost" data-inv="${i.invoice_id}"><i class="fa-solid fa-eye"></i></button></td>
            </tr>`).join('') || '<tr><td colspan="8" class="muted">لا توجد فواتير</td></tr>'}</tbody>
        </table></div>
      </div>

      <div class="card mt-3">
        <div class="card-header"><h3>المدفوعات المقدمة</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الفاتورة</th><th>المبلغ</th><th>الطريقة</th><th>المرجع</th><th>التاريخ</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${payments.map(p=>{
            const inv = invs.find(x=>x.invoice_id===p.invoice_id);
            return `<tr>
              <td>${inv?.invoice_number||p.invoice_id}</td>
              <td>${fmt(p.amount)}</td>
              <td>${p.method}</td>
              <td>${p.reference||'-'}</td>
              <td>${UI.fmt.dateTime(p.submitted_at)}</td>
              <td>${badge(p.status)}</td>
              <td>${p.status==='submitted'?`<button class="btn btn-sm btn-success" data-rev="${p.payment_id}">مراجعة</button>`:''}</td>
            </tr>`;
          }).join('') || '<tr><td colspan="7" class="muted">لا توجد مدفوعات</td></tr>'}</tbody>
        </table></div>
      </div>
    `);

    document.getElementById('btn-gen-all').onclick = () => {
      DB._raw('churches').forEach(c => Billing.generateInvoice(c.church_id));
      UI.toast('تم توليد الفواتير','success'); render();
    };
    document.querySelectorAll('[data-inv]').forEach(b => b.onclick = ()=> openInvoice(b.dataset.inv));
    document.querySelectorAll('[data-rev]').forEach(b => b.onclick = ()=> reviewModal(b.dataset.rev));
  }

  function openInvoice(id){
    const inv = Billing.listInvoices().find(x=>x.invoice_id===id);
    const pays = Billing.paymentsByInvoice(id);
    UI.modal(`
      <h3>${inv.invoice_number}</h3>
      <p>${inv.church_name} — ${inv.plan_key} (${inv.billing_cycle})</p>
      <table class="table">
        <thead><tr><th>وصف</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead>
        <tbody>${(inv.items||[]).map(it=>`<tr><td>${it.desc}</td><td>${it.qty}</td><td>${fmt(it.unit)}</td><td>${fmt(it.total)}</td></tr>`).join('')}</tbody>
      </table>
      <p><b>الإجمالي:</b> ${fmt(inv.amount)} — <b>الحالة:</b> ${badge(inv.status)}</p>
      <h4>المدفوعات</h4>
      ${pays.length ? pays.map(p=>`<div class="alert">${UI.fmt.dateTime(p.submitted_at)} — ${fmt(p.amount)} — ${badge(p.status)} ${p.proof_name?`<br><small>إثبات: ${p.proof_name}</small>`:''}${p.notes?`<br><small>${p.notes}</small>`:''}</div>`).join('') : '<p class="muted">لا توجد مدفوعات</p>'}
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
    `);
  }

  function reviewModal(pid){
    const p = Billing.allPayments().find(x=>x.payment_id===pid);
    UI.modal(`
      <h3>مراجعة دفعة</h3>
      <p>المبلغ: <b>${fmt(p.amount)}</b> · الطريقة: ${p.method} · المرجع: ${p.reference||'-'}</p>
      ${p.proof_name?`<p>إثبات الدفع: <b>${p.proof_name}</b></p>`:''}
      ${p.notes?`<p>ملاحظات الكنيسة: ${p.notes}</p>`:''}
      <label>ملاحظات المراجعة</label>
      <textarea id="rev-notes" class="input" rows="3"></textarea>
      <div style="text-align:left;margin-top:1rem;display:flex;gap:.5rem;justify-content:flex-end">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        <button class="btn btn-red" id="reject">رفض</button>
        <button class="btn btn-success" id="approve">قبول</button>
      </div>
    `);
    document.getElementById('approve').onclick = ()=>{ Billing.reviewPayment(pid,'approved', document.getElementById('rev-notes').value); UI.toast('تم القبول','success'); UI.closeModal(); render(); };
    document.getElementById('reject').onclick  = ()=>{ Billing.reviewPayment(pid,'rejected', document.getElementById('rev-notes').value); UI.toast('تم الرفض','warning'); UI.closeModal(); render(); };
  }

  render();
})();

/* ===== js/kb-page.js ===== */
/* ============================================================
   KB.PAGE.js — Knowledge Base
   ============================================================ */
(function(){
  if (!App.init('knowledge-base')) return;
  const session = Auth.session();
  const isSuper = session.role==='super_admin';
  function render(){
    const arts = Support.kbList();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">قاعدة المعرفة</h1>
        <p class="page-subtitle">دلائل، أسئلة شائعة، واستكشاف الأخطاء</p></div>
        ${isSuper?'<div><button class="btn btn-primary" id="new"><i class="fa-solid fa-plus"></i> مقال جديد</button></div>':''}
      </div>
      <div class="grid grid-3">
        ${arts.map(a=>`<div class="card" style="cursor:pointer" data-id="${a.article_id}">
          <h3 style="margin-top:0">${a.title}</h3>
          <span class="badge blue">${a.category}</span>
          <p class="muted" style="font-size:.85rem">${(a.body||'').slice(0,120)}...</p>
          <small class="muted">${a.views||0} مشاهدة</small>
        </div>`).join('')||'<p class="muted">لا توجد مقالات</p>'}
      </div>
    `);
    if (isSuper) document.getElementById('new').onclick = ()=> edit();
    document.querySelectorAll('[data-id]').forEach(c => c.onclick = ()=> view(c.dataset.id));
  }
  function view(id){
    const a = Support.kbGet(id);
    UI.modal(`<h3>${a.title}</h3><span class="badge blue">${a.category}</span>
      <div style="margin:1rem 0;line-height:1.8;white-space:pre-wrap">${a.body}</div>
      <div style="text-align:left">
        ${isSuper?`<button class="btn btn-ghost" id="ed">تعديل</button>
        <button class="btn btn-red" id="del">حذف</button>`:''}
        <button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button>
      </div>`);
    if (isSuper){
      document.getElementById('ed').onclick = ()=>{ UI.closeModal(); edit(a); };
      document.getElementById('del').onclick = ()=>{ if(confirm('حذف؟')){ Support.kbDelete(id); UI.closeModal(); render(); } };
    }
  }
  function edit(a){
    a = a||{};
    UI.modal(`<h3>${a.article_id?'تعديل':'مقال جديد'}</h3>
      <label>العنوان</label><input id="t" class="input" value="${a.title||''}">
      <label>التصنيف</label>
      <select id="c" class="input">
        ${['onboarding','faq','guide','troubleshooting','release'].map(x=>`<option value="${x}" ${a.category===x?'selected':''}>${x}</option>`).join('')}
      </select>
      <label>المحتوى</label><textarea id="b" class="input" rows="10">${a.body||''}</textarea>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="ok">حفظ</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      Support.kbUpsert({ article_id:a.article_id, title:t.value, category:c.value, body:b.value });
      UI.toast('تم الحفظ','success'); UI.closeModal(); render();
    };
  }
  render();
})();

/* ===== js/my-billing-page.js ===== */
/* ============================================================
   MY-BILLING.PAGE.js — Tenant view: my invoices, pay, history
   ============================================================ */
(function(){
  if (!App.init('my-billing', ['church_admin','financial_manager'])) return;
  const s = Auth.session();
  Billing.runLifecycle();
  function fmt(n){ return new Intl.NumberFormat('ar-EG').format(n||0)+' ج.م'; }
  function badge(st){ const m={pending:['pending','orange'],submitted:['submitted','blue'],under_review:['review','blue'],approved:['approved','green'],paid:['paid','green'],rejected:['rejected','red'],overdue:['overdue','red']};
    const [t,c]=m[st]||[st,'gray']; return `<span class="badge ${c}">${t}</span>`; }
  function render(){
    const sub = Billing.getByChurch(s.church_id);
    const invs = Billing.invoicesByChurch(s.church_id).sort((a,b)=>b.issued_at.localeCompare(a.issued_at));
    const plans = Billing.listPlans();
    const curPlan = plans.find(p=>p.plan_key===sub?.plan_key);
    const hist = Billing.history(s.church_id);
    const notices = Billing.notices(s.church_id);
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">اشتراكي وفواتيري</h1>
        <p class="page-subtitle">إدارة اشتراك الكنيسة ودفع الفواتير</p>
      </div></div>
      ${notices.slice(0,3).map(n=>`<div class="alert orange">⚠️ ${n.message} — ${UI.fmt.relative(n.at)}</div>`).join('')}
      <div class="grid grid-3 mb-3">
        <div class="card"><b>الخطة الحالية</b><h2 style="margin:.3rem 0">${curPlan?.label_ar||sub?.plan_key||'-'}</h2>
          <small class="muted">${sub?.billing_cycle==='yearly'?'سنوي':'شهري'} · ${badge(sub?.status||'-')}</small></div>
        <div class="card"><b>تنتهي في</b><h2 style="margin:.3rem 0">${UI.fmt.date(sub?.current_period_end)}</h2>
          <small class="muted">${UI.fmt.relative(sub?.current_period_end)}</small></div>
        <div class="card"><b>الفواتير المستحقة</b><h2 style="margin:.3rem 0;color:var(--red)">${invs.filter(i=>['pending','overdue'].includes(i.status)).length}</h2>
          <small class="muted">يجب السداد</small></div>
      </div>
      <div class="card mb-3"><div class="card-header"><h3>الفواتير</h3></div>
        <table class="table">
          <thead><tr><th>رقم</th><th>المبلغ</th><th>الاستحقاق</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${invs.map(i=>`<tr>
            <td><b>${i.invoice_number}</b></td><td>${fmt(i.amount)}</td>
            <td>${UI.fmt.date(i.due_at)}</td><td>${badge(i.status)}</td>
            <td>${['pending','overdue','rejected'].includes(i.status)?`<button class="btn btn-sm btn-primary" data-pay="${i.invoice_id}">دفع</button>`:''}</td>
          </tr>`).join('')||'<tr><td colspan="5" class="muted">لا توجد فواتير</td></tr>'}</tbody>
        </table>
      </div>
      <div class="card"><div class="card-header"><h3>سجل الاشتراك</h3></div>
        ${hist.slice(0,10).map(h=>`<div class="alert">${h.action} · ${UI.fmt.dateTime(h.at)}</div>`).join('')||'<p class="muted">لا يوجد سجل</p>'}
      </div>
    `);
    document.querySelectorAll('[data-pay]').forEach(b => b.onclick = ()=> payModal(b.dataset.pay));
  }
  function payModal(id){
    const inv = Billing.listInvoices().find(x=>x.invoice_id===id);
    UI.modal(`<h3>دفع فاتورة ${inv.invoice_number}</h3>
      <p>المبلغ: <b>${fmt(inv.amount)}</b></p>
      <label>طريقة الدفع</label>
      <select id="m" class="input"><option value="bank_transfer">تحويل بنكي</option><option value="instapay">إنستاباي</option><option value="cash">نقدي</option><option value="other">أخرى</option></select>
      <label>رقم المرجع / رقم التحويل</label><input id="r" class="input">
      <label>إثبات الدفع (اسم الملف أو رابط)</label><input id="p" class="input" placeholder="receipt.jpg أو https://...">
      <label>ملاحظات</label><textarea id="n" class="input" rows="2"></textarea>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="ok">إرسال للمراجعة</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      Billing.submitPayment(id, {
        method:document.getElementById('m').value,
        reference:document.getElementById('r').value,
        proof_name:document.getElementById('p').value,
        notes:document.getElementById('n').value
      });
      UI.toast('تم إرسال الدفعة للمراجعة','success'); UI.closeModal(); render();
    };
  }
  render();
})();

/* ===== js/platform-health-page.js ===== */
/* ============================================================
   PLATFORM-HEALTH.PAGE.js — System overview for super admin
   ============================================================ */
(function(){
  if (!App.init('platform-health', ['super_admin'])) return;
  function render(){
    const ph = UsageAnalytics.platformHealth();
    const churches = DB._raw('churches');
    const allLogs = JSON.parse(localStorage.getItem('church_db_v1')||'{}').audit_logs||[];
    const today = new Date().toISOString().slice(0,10);
    const todayLogs = allLogs.filter(l=>l.created_at.startsWith(today)).length;
    const breakdown = churches.map(c=>{
      const h = TenantMgmt.health(c.church_id);
      const op = TenantMgmt.operational(c.church_id);
      const u = TenantMgmt.usage(c.church_id);
      return { c, h, op, u };
    });
    const overloaded = breakdown.filter(b=>{
      const v = TenantMgmt.usageVsLimits(b.c.church_id);
      return v.members.pct>=90 || v.storage_mb.pct>=90 || v.users.pct>=90;
    });
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">صحة المنصة</h1>
        <p class="page-subtitle">حالة التشغيل، الوحدات المحملة، والتحذيرات العامة</p>
      </div></div>
      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-server"></i></div><div><div class="stat-value">${ph.totalT}</div><div class="stat-label">المستأجرون</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-circle-check"></i></div><div><div class="stat-value">${ph.activeT}</div><div class="stat-label">نشطون</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-list-check"></i></div><div><div class="stat-value">${todayLogs}</div><div class="stat-label">حدث اليوم</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${overloaded.length}</div><div class="stat-label">وحدات محملة بشدة</div></div></div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h3>تفصيل تشغيلي بالكنائس</h3></div>
        <table class="table">
          <thead><tr><th>الكنيسة</th><th>الصحة</th><th>دخول 30ي</th><th>حضور 30ي</th><th>workflows</th><th>ماليات</th><th>تخزين</th></tr></thead>
          <tbody>${breakdown.map(b=>`<tr>
            <td>${b.c.church_name}</td>
            <td><span class="badge ${b.h.band==='green'?'green':b.h.band==='blue'?'blue':b.h.band==='orange'?'orange':'red'}">${b.h.score}%</span></td>
            <td>${b.op.loginActivity}</td><td>${b.op.engagement}</td><td>${b.op.workflowActivity}</td><td>${b.op.financeUsage}</td>
            <td>${b.u.storage_mb} MB</td>
          </tr>`).join('')}</tbody></table>
      </div>

      ${overloaded.length?`<div class="card">
        <div class="card-header"><h3 style="color:var(--red)">تحذيرات وحدات محملة</h3></div>
        ${overloaded.map(b=>{
          const v = TenantMgmt.usageVsLimits(b.c.church_id);
          return `<div class="alert">⚠️ <b>${b.c.church_name}</b> — المخدومون ${v.members.pct}% · التخزين ${v.storage_mb.pct}% · المستخدمون ${v.users.pct}%</div>`;
        }).join('')}
      </div>`:''}
    `);
  }
  render();
})();

/* ===== js/security-page.js ===== */
/* SECURITY admin page */
(function(){
  if (!App.init('security', ['church_admin','super_admin'])) return;
  function render(){
    const events = Security.listEvents().slice(0,100);
    const locks = Security.listLocks();
    const session = Auth.session();
    const sevColor = s => s==='critical'?'red':s==='warning'?'yellow':'blue';
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title"><i class="fa-solid fa-shield-halved"></i> الأمان</h1>
        <p class="page-subtitle">إدارة الجلسات والأحداث الأمنية وحماية الدخول</p></div>
        <button class="btn btn-ghost" onclick="location.reload()"><i class="fa-solid fa-rotate"></i> تحديث</button>
      </div>

      <div class="grid grid-3 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-user-check"></i></div>
          <div><div class="stat-value">${session?1:0}</div><div class="stat-label">جلسة نشطة (هذا المتصفح)</div></div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-lock"></i></div>
          <div><div class="stat-value">${locks.filter(l=>l.locked_until>Date.now()).length}</div><div class="stat-label">حسابات مقفلة</div></div></div>
        <div class="stat-card yellow"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
          <div><div class="stat-value">${events.filter(e=>e.severity==='warning'||e.severity==='critical').length}</div><div class="stat-label">أحداث تحذيرية</div></div></div>
      </div>

      <div class="grid grid-2 mb-3">
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> الجلسة الحالية</div></div>
          ${session ? `<div style="padding:1rem"><div><b>${session.full_name}</b> — ${session.role}</div>
            <div style="color:var(--text2);font-size:.85rem">تسجيل: ${UI.fmt.dateTime(session.logged_at)}</div>
            <div style="color:var(--text2);font-size:.85rem">انتهاء: ${UI.fmt.dateTime(new Date(session.expires_at).toISOString())}</div>
            <div style="color:var(--text2);font-size:.85rem">آخر نشاط: ${UI.fmt.relative(session.last_activity)}</div>
            <button class="btn btn-danger btn-sm mt-2" onclick="Auth.logout()"><i class="fa-solid fa-power-off"></i> إنهاء الجلسة</button>
          </div>` : '<div class="empty">لا توجد جلسة</div>'}
        </div>
        <div class="card">
          <div class="card-header"><div class="card-title"><i class="fa-solid fa-user-lock"></i> حسابات مقفلة</div></div>
          <div class="table-wrap"><table class="table">
            <thead><tr><th>البريد</th><th>محاولات فاشلة</th><th>قفل حتى</th><th></th></tr></thead>
            <tbody>${locks.length? locks.map(l=>`<tr>
              <td>${l.email}</td><td>${l.fails||0}</td>
              <td>${l.locked_until>Date.now()? UI.fmt.dateTime(new Date(l.locked_until).toISOString()):'—'}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="Security.unlock('${l.email}');location.reload()"><i class="fa-solid fa-lock-open"></i> فتح</button></td>
            </tr>`).join('') : '<tr><td colspan="4"><div class="empty">لا يوجد حسابات مقفلة</div></td></tr>'}</tbody>
          </table></div>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><div class="card-title"><i class="fa-solid fa-list"></i> آخر الأحداث الأمنية</div></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الوقت</th><th>النوع</th><th>الخطورة</th><th>تفاصيل</th></tr></thead>
          <tbody>${events.length? events.map(e=>`<tr>
            <td>${UI.fmt.dateTime(e.at)}</td>
            <td><code>${e.type}</code></td>
            <td><span class="badge badge-${sevColor(e.severity)}">${e.severity}</span></td>
            <td><code style="font-size:.75rem">${JSON.stringify(e.meta||{})}</code></td>
          </tr>`).join('') : '<tr><td colspan="4"><div class="empty">لا توجد أحداث</div></td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }
  render();
})();

/* ===== js/services-page.js ===== */
/* SERVICES PAGE — Hierarchical browser: Church → Services → Stages → Classes → Members */
(function(){
  if (!App.init('services')) return;
  const s = Auth.session();
  const scope = Hierarchy.getScope(s);

  let view = { service:null, stage:null, class:null };
  let mode = 'workspace';

  function inScope(serviceId){ return scope.all || scope.services.includes(serviceId); }
  function inScopeStage(stageId){ return scope.all || scope.stages.includes(stageId); }
  function inScopeClass(classId){ return scope.all || scope.classes.includes(classId); }

  function render(){
    const services = DB.all('services').filter(sv => inScope(sv.service_id));
    let html = `
      <div class="page-header">
        <div><h1 class="page-title"><i class="fa-solid fa-sitemap"></i> هيكل الخدمة</h1>
          <p class="page-subtitle">${s.church_name} — ${services.length} خدمة في نطاقك</p></div>
      </div>
      <div class="breadcrumbs mb-2">
        <a href="#" onclick="ServicesPage.go();return false">الكنيسة</a>
        ${view.service?` &gt; <a href="#" onclick="ServicesPage.go('${view.service}');return false">${DB.byId('services','service_id',view.service)?.name||''}</a>`:''}
        ${view.stage?` &gt; <a href="#" onclick="ServicesPage.go('${view.service}','${view.stage}');return false">${DB.byId('service_stages','stage_id',view.stage)?.name||''}</a>`:''}
        ${view.class?` &gt; ${DB.byId('service_classes','class_id',view.class)?.class_name||''}`:''}
      </div>
    `;

    if (!view.service){
      // List services
      html += '<div class="grid grid-3">';
      services.forEach(sv => {
        const stages = DB.filter('service_stages', st => st.service_id===sv.service_id);
        const memCount = DB.filter('members', m => m.service_id===sv.service_id).length;
        const sup = sv.supervisor_id ? DB.byId('users','user_id',sv.supervisor_id) : null;
        html += `<div class="card hoverable" onclick="ServicesPage.go('${sv.service_id}')" style="cursor:pointer">
          <div class="card-title"><i class="fa-solid fa-church"></i> ${sv.name}</div>
          <div class="text-muted">${sv.code||''}</div>
          <div class="mt-1"><span class="badge badge-blue">${stages.length} مرحلة</span>
            <span class="badge badge-green">${memCount} مخدوم</span></div>
          ${sup?`<div class="text-muted mt-1">مشرف: ${sup.full_name}</div>`:''}
        </div>`;
      });
      html += '</div>';
    } else if (!view.stage){
      const sv = DB.byId('services','service_id', view.service);
      if (mode === 'workspace' && window.ServiceWorkspace){
        App.render(html + `<div style="margin:1rem 0">
          <button class="btn" onclick="ServicesPage.toggleMode()">
            <i class="fa-solid fa-sitemap"></i> عرض الهيكل التقليدي</button>
        </div><div id="ws-host"></div>`);
        const el = document.getElementById('ws-host');
        if (el) ServiceWorkspace.render(el, view.service);
        return;
      }
      const stages = DB.filter('service_stages', st => st.service_id===view.service && inScopeStage(st.stage_id));
      html += `<h2>${sv?.name||''} — المراحل</h2><div class="grid grid-3">`;
      stages.forEach(st => {
        const classCount = DB.filter('service_classes', c => c.stage_id===st.stage_id).length;
        const memCount = DB.filter('members', m => m.stage_id===st.stage_id).length;
        html += `<div class="card hoverable" onclick="ServicesPage.go('${view.service}','${st.stage_id}')" style="cursor:pointer">
          <div class="card-title">${st.name}</div>
          <div class="text-muted">العمر: ${st.age_min||'?'}-${st.age_max||'?'} سنة</div>
          <div class="mt-1"><span class="badge badge-blue">${classCount} فصل</span>
            <span class="badge badge-green">${memCount} مخدوم</span></div>
        </div>`;
      });
      if (!stages.length) html += '<div class="empty">لا توجد مراحل</div>';
      html += '</div>';
    } else if (!view.class){
      const st = DB.byId('service_stages','stage_id', view.stage);
      const classes = DB.filter('service_classes', c => c.stage_id===view.stage && inScopeClass(c.class_id));
      html += `<h2>${st?.name||''} — الفصول</h2><div class="grid grid-3">`;
      classes.forEach(c => {
        const memCount = DB.filter('members', m => m.service_class_id===c.class_id).length;
        const asn = DB.filter('servant_assignments', a => a.class_id===c.class_id && a.active!==false);
        html += `<div class="card hoverable" onclick="ServicesPage.go('${view.service}','${view.stage}','${c.class_id}')" style="cursor:pointer">
          <div class="card-title">${c.class_name}</div>
          <div class="mt-1"><span class="badge badge-green">${memCount} مخدوم</span>
            <span class="badge badge-blue">${asn.length} خادم</span></div>
        </div>`;
      });
      if (!classes.length) html += '<div class="empty">لا توجد فصول</div>';
      html += '</div>';
    } else {
      // Class detail
      const c = DB.byId('service_classes','class_id', view.class);
      const members = DB.filter('members', m => m.service_class_id===view.class);
      const asn = DB.filter('servant_assignments', a => a.class_id===view.class && a.active!==false);
      const servants = asn.map(a => DB.byId('users','user_id', a.user_id)).filter(Boolean);
      html += `<h2>${c?.class_name||''}</h2>
        <div class="grid grid-3 mb-2">
          <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-users"></i></div>
            <div><div class="stat-value">${members.length}</div><div class="stat-label">مخدومين</div></div></div>
          <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-user-shield"></i></div>
            <div><div class="stat-value">${servants.length}</div><div class="stat-label">خدام</div></div></div>
          <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
            <div><div class="stat-value">${members.filter(m=>m.member_status==='at_risk').length}</div><div class="stat-label">في خطر</div></div></div>
        </div>
        <div class="grid grid-2">
          <div class="card">
            <div class="card-title">الخدام</div>
            ${servants.length?servants.map(u=>`<div class="row" style="padding:.5rem;border-bottom:1px solid var(--border)">
              <b>${u.full_name}</b> <span class="text-muted">— ${u.role}</span></div>`).join(''):'<div class="empty">لا يوجد خدام</div>'}
          </div>
          <div class="card">
            <div class="card-title">المخدومين</div>
            ${members.length?`<table class="table"><thead><tr><th>الاسم</th><th>العمر</th><th>الحالة</th></tr></thead><tbody>
              ${members.map(m=>`<tr><td>${m.full_name}</td><td>${Hierarchy.formatAge(m.birth_date)}</td>
                <td><span class="badge badge-${({active:'green',at_risk:'red',new:'blue',inactive:'gray',left:'gray'})[m.member_status]||'gray'}">${m.member_status||'—'}</span></td></tr>`).join('')}
            </tbody></table>`:'<div class="empty">لا يوجد مخدومين</div>'}
          </div>
        </div>`;
    }

    App.render(html);
  }

  window.ServicesPage = {
    go(svc, stg, cls){ view = { service:svc||null, stage:stg||null, class:cls||null };
      if (stg || cls) mode = 'hierarchy';
      render();
    },
    toggleMode(){ mode = (mode==='workspace'?'hierarchy':'workspace'); render(); }
  };
  try { const dl = sessionStorage.getItem('svc_open'); if (dl){ sessionStorage.removeItem('svc_open'); view.service = dl; } } catch(_){}
  render();
})();

/* ===== js/subscriptions-page.js ===== */
/* ============================================================
   SUBSCRIPTIONS.PAGE.js — Plans + tenant subscriptions
   ============================================================ */
(function(){
  if (!App.init('subscriptions', ['super_admin'])) return;
  Billing.runLifecycle();
  function fmt(n){ return new Intl.NumberFormat('ar-EG').format(n||0)+' ج.م'; }
  function statusBadge(s){
    const map = { active:['نشط','green'], trial:['تجريبي','blue'], suspended:['معلق','red'], cancelled:['ملغاة','gray'],
      expired:['منتهية','red'], grace_period:['فترة سماح','orange'], pending_payment:['بانتظار الدفع','orange'] };
    const [t,c]=map[s]||[s,'gray']; return `<span class="badge ${c}">${t}</span>`;
  }
  function render(){
    const plans = Billing.listPlans();
    const subs = Billing.listSubscriptions();
    const churches = DB._raw('churches');
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">الاشتراكات والخطط</h1>
        <p class="page-subtitle">إدارة الخطط، الاشتراكات، التجديدات، والترقيات</p></div>
      </div>

      <div class="card mb-3">
        <div class="card-header"><h3>خطط الاشتراك</h3></div>
        <div class="grid grid-4">${plans.map(p=>`
          <div class="card" style="border:2px solid var(--border)">
            <h3 style="margin-top:0">${p.label_ar||p.label}</h3>
            <div style="font-size:1.5rem;font-weight:800;color:var(--primary)">${fmt(p.price_monthly)}<small style="font-size:.7rem">/شهري</small></div>
            <div style="color:var(--muted);font-size:.85rem">أو ${fmt(p.price_yearly)} سنوي</div>
            <hr>
            <ul style="font-size:.85rem;list-style:none;padding:0">
              <li><i class="fa-solid fa-users"></i> ${p.limits.users} مستخدم</li>
              <li><i class="fa-solid fa-user-friends"></i> ${p.limits.members} مخدوم</li>
              <li><i class="fa-solid fa-database"></i> ${p.limits.storage_mb} MB تخزين</li>
              <li><i class="fa-solid fa-calendar"></i> ${p.limits.events} فعالية</li>
              <li><i class="fa-solid fa-diagram-project"></i> ${p.limits.workflows} workflow</li>
              <li style="color:${p.limits.finance?'var(--green)':'var(--red)'}"><i class="fa-solid fa-${p.limits.finance?'check':'xmark'}"></i> ماليات</li>
              <li style="color:${p.limits.analytics?'var(--green)':'var(--red)'}"><i class="fa-solid fa-${p.limits.analytics?'check':'xmark'}"></i> تحليلات</li>
              <li style="color:${p.limits.ai?'var(--green)':'var(--red)'}"><i class="fa-solid fa-${p.limits.ai?'check':'xmark'}"></i> AI</li>
            </ul>
          </div>`).join('')}</div>
      </div>

      <div class="card">
        <div class="card-header"><h3>اشتراكات الكنائس</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الكنيسة</th><th>الخطة</th><th>الدورة</th><th>الحالة</th><th>تنتهي في</th><th>التجريبي ينتهي</th><th>إجراءات</th></tr></thead>
          <tbody>${subs.map(s=>{
            const c = churches.find(x=>x.church_id===s.church_id);
            return `<tr>
              <td>${c?.church_name||s.church_id}</td>
              <td>${s.plan_key}</td>
              <td>${s.billing_cycle==='yearly'?'سنوي':'شهري'}</td>
              <td>${statusBadge(s.status)}</td>
              <td>${UI.fmt.date(s.current_period_end)}</td>
              <td>${s.status==='trial'?UI.fmt.relative(s.trial_ends_at):'-'}</td>
              <td style="display:flex;gap:.3rem">
                <button class="btn btn-sm btn-ghost" data-change="${s.church_id}"><i class="fa-solid fa-arrow-up"></i> تغيير</button>
                <button class="btn btn-sm btn-success" data-renew="${s.church_id}"><i class="fa-solid fa-rotate"></i></button>
                <button class="btn btn-sm btn-ghost" data-history="${s.church_id}"><i class="fa-solid fa-clock-rotate-left"></i></button>
              </td>
            </tr>`;
          }).join('')}</tbody></table></div>
      </div>
    `);
    document.querySelectorAll('[data-change]').forEach(b => b.onclick = ()=> changeModal(b.dataset.change));
    document.querySelectorAll('[data-renew]').forEach(b => b.onclick = ()=>{ Billing.renew(b.dataset.renew); UI.toast('تم التجديد','success'); render(); });
    document.querySelectorAll('[data-history]').forEach(b => b.onclick = ()=> historyModal(b.dataset.history));
  }
  function changeModal(cid){
    const plans = Billing.listPlans();
    const cur = Billing.getByChurch(cid);
    UI.modal(`<h3>تغيير الخطة</h3>
      <label>الخطة</label>
      <select id="m-plan" class="input">${plans.map(p=>`<option value="${p.plan_key}" ${p.plan_key===cur.plan_key?'selected':''}>${p.label_ar||p.label}</option>`).join('')}</select>
      <label>الدورة</label>
      <select id="m-cycle" class="input"><option value="monthly" ${cur.billing_cycle==='monthly'?'selected':''}>شهرية</option><option value="yearly" ${cur.billing_cycle==='yearly'?'selected':''}>سنوية</option></select>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="save">حفظ</button></div>`);
    document.getElementById('save').onclick = ()=>{
      Billing.changePlan(cid, document.getElementById('m-plan').value, document.getElementById('m-cycle').value);
      UI.toast('تم تغيير الخطة','success'); UI.closeModal(); render();
    };
  }
  function historyModal(cid){
    const h = Billing.history(cid);
    UI.modal(`<h3>سجل الاشتراك</h3>
      <div style="max-height:400px;overflow:auto">${h.length?h.map(x=>`
        <div class="alert"><b>${x.action}</b> · ${UI.fmt.dateTime(x.at)}<br><small>${JSON.stringify(x.to||x.from||x.reason||'')}</small></div>`).join(''):'<p class="muted">لا يوجد سجل</p>'}</div>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>`);
  }
  render();
})();

/* ===== js/supervisor-page.js ===== */
/* SUPERVISOR DASHBOARD — Service Supervisor overview */
(function(){
  if (!App.init('supervisor', ['church_admin','service_admin','service_supervisor','supervisor'])) return;
  const s = Auth.session();
  const scope = Hierarchy.getScope(s);
  const services = DB.all('services').filter(sv => scope.all || scope.services.includes(sv.service_id));
  const classes = Hierarchy.scopedClasses(s);
  const members = Hierarchy.scopedMembers(s);
  const servants = Hierarchy.scopedServants(s);

  // Compute simple class performance
  const perf = classes.map(c => {
    const mems = members.filter(m => m.service_class_id===c.class_id);
    const atRisk = mems.filter(m=>m.member_status==='at_risk').length;
    const sessions = DB.filter('attendance_sessions', x => x.class_id===c.class_id);
    const attended = DB.filter('attendance_records', r => sessions.some(x=>x.session_id===r.session_id)).length;
    const possible = sessions.length * Math.max(mems.length,1);
    const rate = possible ? Math.round(attended*100/possible) : 0;
    return { class:c, members:mems.length, atRisk, rate };
  }).sort((a,b)=>a.rate-b.rate);

  const weak = perf.filter(p=>p.rate<60).slice(0,5);
  const strong = [...perf].sort((a,b)=>b.rate-a.rate).slice(0,3);

  App.render(`
    <div class="page-header">
      <div><h1 class="page-title"><i class="fa-solid fa-user-tie"></i> لوحة مشرف الخدمة</h1>
        <p class="page-subtitle">${services.map(x=>x.name).join('، ')||'لا توجد خدمات معينة'}</p></div>
    </div>

    <div class="grid grid-4 mb-2">
      <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-church"></i></div>
        <div><div class="stat-value">${services.length}</div><div class="stat-label">خدمات</div></div></div>
      <div class="stat-card blue"><div class="stat-icon"><i class="fa-solid fa-school"></i></div>
        <div><div class="stat-value">${classes.length}</div><div class="stat-label">فصول</div></div></div>
      <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-users"></i></div>
        <div><div class="stat-value">${members.length}</div><div class="stat-label">مخدومين</div></div></div>
      <div class="stat-card purple"><div class="stat-icon"><i class="fa-solid fa-user-shield"></i></div>
        <div><div class="stat-value">${servants.length}</div><div class="stat-label">خدام</div></div></div>
    </div>


    <div class="card mb-2">
      <div class="card-title"><i class="fa-solid fa-church"></i> خدماتك (اضغط للدخول للـ Workspace)</div>
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:.75rem">
        ${services.map(sv=>{
          const h = window.ServiceWorkspace ? ServiceWorkspace.healthScore(sv.service_id) : null;
          const col = h? (h.color==='green'?'#16a34a':h.color==='amber'?'#f59e0b':'#dc2626') : '#6b7280';
          return `<a href="services.html#${sv.service_id}" onclick="sessionStorage.setItem('svc_open','${sv.service_id}')"
            style="text-decoration:none;color:inherit">
            <div class="card hoverable" style="border-right:4px solid ${col};cursor:pointer">
              <div style="font-weight:700"><i class="fa-solid fa-church"></i> ${sv.name}</div>
              ${h?`<div style="font-size:.85rem;color:${col};margin-top:.25rem">Health: ${h.score}/100 (${h.level})</div>`:''}
            </div></a>`;
        }).join('')}
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-title"><i class="fa-solid fa-brain"></i> تنبيهات ذكية (في نطاقك فقط)</div>
      <div id="sup-ai-insights"></div>
    </div>

    <div class="grid grid-2 mb-2">
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-triangle-exclamation"></i> فصول ضعيفة (تحتاج تدخل)</div>
        ${weak.length?weak.map(p=>`<div style="padding:.5rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <div><b>${p.class.class_name}</b> <span class="text-muted">— ${p.members} مخدوم</span></div>
          <span class="badge badge-red">حضور ${p.rate}%</span></div>`).join(''):'<div class="empty">لا توجد فصول ضعيفة</div>'}
      </div>
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-trophy"></i> فصول نشطة</div>
        ${strong.length?strong.map(p=>`<div style="padding:.5rem;border-bottom:1px solid var(--border);display:flex;justify-content:space-between">
          <div><b>${p.class.class_name}</b></div>
          <span class="badge badge-green">حضور ${p.rate}%</span></div>`).join(''):'<div class="empty">—</div>'}
      </div>
    </div>

    <div class="card mb-2">
      <div class="card-header"><div class="card-title"><i class="fa-solid fa-user-shield"></i> الخدام تحت إشرافك</div></div>
      <table class="table">
        <thead><tr><th>الخادم</th><th>الفصل</th><th>إجراءات</th></tr></thead>
        <tbody>${servants.length?servants.map(u=>{
          const asn = DB.filter('servant_assignments', a => a.user_id===u.user_id && a.active!==false);
          const clsNames = asn.map(a=>DB.byId('service_classes','class_id',a.class_id)?.class_name).filter(Boolean).join('، ');
          return `<tr>
            <td><b>${u.full_name}</b><div class="text-muted">${u.email||''}</div></td>
            <td>${clsNames||'—'}</td>
            <td>
              <button class="btn btn-ghost btn-sm" onclick="SupervisorPage.evaluate('${u.user_id}')"><i class="fa-solid fa-star"></i> تقييم</button>
              <button class="btn btn-ghost btn-sm" onclick="SupervisorPage.reassign('${u.user_id}')"><i class="fa-solid fa-arrows-rotate"></i> نقل/تعيين</button>
            </td></tr>`;
        }).join(''):'<tr><td colspan="3"><div class="empty">لا يوجد خدام</div></td></tr>'}</tbody>
      </table>
    </div>
  `);

  setTimeout(()=>{ const el=document.getElementById('sup-ai-insights'); if (el && window.AIScope) AIScope.render(el); },50);

  window.SupervisorPage = {
    evaluate(uid){
      const u = DB.byId('users','user_id',uid);
      UI.modal(`<div class="modal-header"><h3>تقييم: ${u.full_name}</h3>
        <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="eval-form">
          ${['attendance_score','visitation_score','spiritual_score','teamwork_score'].map(k=>`
            <div class="form-group"><label class="form-label">${({attendance_score:'الحضور',visitation_score:'الافتقاد',spiritual_score:'الروحانيات',teamwork_score:'العمل الجماعي'})[k]} (0-10)</label>
            <input type="number" min="0" max="10" class="form-control" name="${k}" value="7"></div>`).join('')}
          <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-control" name="notes"></textarea></div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="SupervisorPage.saveEval('${uid}')">حفظ التقييم</button>
        </div>`);
    },
    saveEval(uid){
      const data = Object.fromEntries(new FormData(document.getElementById('eval-form')).entries());
      const scores = ['attendance_score','visitation_score','spiritual_score','teamwork_score'].map(k=>+data[k]||0);
      data.overall = Math.round(scores.reduce((a,b)=>a+b,0)/scores.length);
      data.servant_id = uid; data.supervisor_id = s.user_id; data.period = new Date().toISOString().slice(0,7);
      DB.insert('servant_evaluations', data);
      UI.toast('تم حفظ التقييم','success'); UI.closeModal();
    },
    reassign(uid){
      const allCls = DB.all('service_classes');
      UI.modal(`<div class="modal-header"><h3>نقل / تعيين خادم</h3>
        <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body">
          <div class="form-group"><label class="form-label">الفصل الجديد</label>
            <select id="new-cls" class="form-select">${allCls.map(c=>`<option value="${c.class_id}">${c.class_name}</option>`).join('')}</select></div>
        </div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="SupervisorPage.doReassign('${uid}')">تعيين</button>
        </div>`);
    },
    doReassign(uid){
      const newCls = document.getElementById('new-cls').value;
      // deactivate previous
      DB.filter('servant_assignments', a=>a.user_id===uid && a.active).forEach(a=>{
        DB.update('servant_assignments','assignment_id', a.assignment_id, { active:false });
      });
      DB.insert('servant_assignments', { user_id:uid, class_id:newCls, active:true, assigned_at:new Date().toISOString() });
      UI.toast('تم النقل','success'); UI.closeModal();
    }
  };
})();

/* ===== js/support-page.js ===== */
/* ============================================================
   SUPPORT.PAGE.js — Ticket center (super admin + tenants)
   ============================================================ */
(function(){
  if (!App.init('support')) return;
  const session = Auth.session();
  const isSuper = session.role==='super_admin';

  function badge(s){
    const m={ open:['مفتوحة','blue'],pending:['قيد المتابعة','orange'],escalated:['مُصعّدة','red'],resolved:['تم الحل','green'],closed:['مغلقة','gray']};
    const [t,c]=m[s]||[s,'gray']; return `<span class="badge ${c}">${t}</span>`;
  }
  function prio(p){
    const m={low:'منخفضة',normal:'عادية',high:'عالية',urgent:'عاجلة'};
    const c={low:'gray',normal:'blue',high:'orange',urgent:'red'}[p]||'gray';
    return `<span class="badge ${c}">${m[p]||p}</span>`;
  }
  function render(){
    const tickets = Support.list();
    const m = Support.metrics();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">مركز الدعم</h1>
        <p class="page-subtitle">${isSuper?'إدارة جميع التذاكر عبر المنصة':'تقديم ومتابعة تذاكر الدعم'}</p></div>
        <div><button class="btn btn-primary" id="new"><i class="fa-solid fa-plus"></i> تذكرة جديدة</button>
        <a href="knowledge-base.html" class="btn btn-ghost"><i class="fa-solid fa-book"></i> قاعدة المعرفة</a></div>
      </div>
      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-ticket"></i></div><div><div class="stat-value">${m.total}</div><div class="stat-label">إجمالي التذاكر</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-folder-open"></i></div><div><div class="stat-value">${m.open}</div><div class="stat-label">مفتوحة</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-fire"></i></div><div><div class="stat-value">${m.escalated}</div><div class="stat-label">مُصعّدة</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-stopwatch"></i></div><div><div class="stat-value">${m.avgHours}h</div><div class="stat-label">متوسط الحل</div></div></div>
      </div>
      <div class="card"><div class="card-header"><h3>التذاكر</h3></div>
        <table class="table">
          <thead><tr><th>#</th><th>الموضوع</th><th>النوع</th><th>الأولوية</th><th>الحالة</th><th>الكنيسة</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>${tickets.map(t=>`<tr>
            <td><b>${t.ticket_number}</b></td><td>${t.subject}</td>
            <td>${t.type}</td><td>${prio(t.priority)}</td><td>${badge(t.status)}</td>
            <td>${(DB._raw('churches').find(c=>c.church_id===t.church_id)||{}).church_name||'-'}</td>
            <td>${UI.fmt.relative(t.created_at)}</td>
            <td><button class="btn btn-sm btn-ghost" data-view="${t.ticket_id}">عرض</button></td>
          </tr>`).join('') || '<tr><td colspan="8" class="muted">لا توجد تذاكر</td></tr>'}</tbody>
        </table></div>
    `);
    document.getElementById('new').onclick = newModal;
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = ()=> viewModal(b.dataset.view));
  }
  function newModal(){
    UI.modal(`<h3>تذكرة جديدة</h3>
      <label>الموضوع</label><input id="s" class="input">
      <label>الوصف</label><textarea id="b" class="input" rows="4"></textarea>
      <label>النوع</label>
      <select id="t" class="input"><option value="support">طلب دعم</option><option value="bug">بلاغ خطأ</option><option value="feature">طلب ميزة</option></select>
      <label>الأولوية</label>
      <select id="p" class="input"><option value="low">منخفضة</option><option value="normal" selected>عادية</option><option value="high">عالية</option><option value="urgent">عاجلة</option></select>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="ok">إرسال</button></div>`);
    document.getElementById('ok').onclick = ()=>{
      Support.create({ subject:s.value, body:b.value, type:t.value, priority:p.value });
      UI.toast('تم إنشاء التذكرة','success'); UI.closeModal(); render();
    };
  }
  function viewModal(id){
    const t = Support.get(id);
    const msgs = Support.messages(id);
    UI.modal(`<h3>${t.ticket_number} — ${t.subject}</h3>
      <div>${badge(t.status)} ${prio(t.priority)} <small class="muted">منذ ${UI.fmt.relative(t.created_at)}</small></div>
      <div style="max-height:300px;overflow:auto;margin:1rem 0;border:1px solid var(--border);padding:.5rem;border-radius:8px">
        ${msgs.map(m=>`<div style="margin-bottom:.5rem"><b>${m.author_name}</b> <small class="muted">${UI.fmt.relative(m.created_at)}</small>
        ${m.internal?'<span class="badge orange">داخلية</span>':''}<div>${(m.body||'').replace(/</g,'&lt;').replace(/\n/g,'<br>')}</div></div>`).join('')||'<p class="muted">لا توجد رسائل</p>'}
      </div>
      <label>رد جديد</label><textarea id="reply" class="input" rows="3"></textarea>
      <label><input type="checkbox" id="internal"> ملاحظة داخلية</label>
      <div style="display:flex;gap:.5rem;margin-top:.75rem;flex-wrap:wrap">
        ${isSuper?`
          <button class="btn btn-orange" data-st="escalated">تصعيد</button>
          <button class="btn btn-success" data-st="resolved">حل</button>
          <button class="btn btn-ghost" data-st="closed">إغلاق</button>
          <button class="btn btn-primary" id="assign">تعيين</button>`:''}
        <button class="btn btn-primary" id="send" style="margin-inline-start:auto">إرسال الرد</button>
      </div>`);
    document.getElementById('send').onclick = ()=>{ Support.addMessage(id, document.getElementById('reply').value, document.getElementById('internal').checked); UI.closeModal(); viewModal(id); };
    document.querySelectorAll('[data-st]').forEach(b => b.onclick = ()=>{ Support.setStatus(id, b.dataset.st); UI.toast('تم تحديث الحالة','success'); UI.closeModal(); render(); });
    if (isSuper) document.getElementById('assign').onclick = ()=>{
      const team = prompt('الفريق (support|tech|finance):','support'); if(!team)return;
      Support.assign(id, team, null); UI.toast('تم التعيين','success'); UI.closeModal(); viewModal(id);
    };
  }
  render();
})();

/* ===== js/tenants-page.js ===== */
/* ============================================================
   TENANTS.PAGE.js — Tenant Control Center
   ============================================================ */
(function(){
  if (!App.init('tenants', ['super_admin'])) return;
  function render(){
    const churches = DB._raw('churches');
    const subs = Billing.listSubscriptions();
    App.render(`
      <div class="page-header">
        <div><h1 class="page-title">مركز التحكم بالمستأجرين</h1>
        <p class="page-subtitle">إدارة الكنائس، الموارد، الصحة، وحالة التشغيل</p></div>
        <div><button class="btn btn-primary" id="new"><i class="fa-solid fa-plus"></i> كنيسة جديدة</button></div>
      </div>
      <div class="card"><div class="card-header"><h3>الكنائس (${churches.length})</h3></div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الكنيسة</th><th>الخطة</th><th>الحالة</th><th>الصحة</th><th>الاستخدام</th><th>إجراءات</th></tr></thead>
          <tbody>${churches.map(c=>{
            const h = TenantMgmt.health(c.church_id);
            const u = TenantMgmt.usageVsLimits(c.church_id);
            const sub = subs.find(s=>s.church_id===c.church_id);
            return `<tr>
              <td><b>${c.church_name}</b><br><small class="muted">${c.church_code||''}</small></td>
              <td>${sub?.plan_key||'-'}</td>
              <td><span class="badge ${c.subscription_status==='active'?'green':c.subscription_status==='trial'?'blue':'red'}">${c.subscription_status}</span></td>
              <td><span class="badge ${h.band==='green'?'green':h.band==='blue'?'blue':h.band==='orange'?'orange':'red'}">${h.score}% · ${h.label}</span></td>
              <td><div style="font-size:.8rem">
                <div>المخدومون: ${u.members.used}/${u.members.limit===Infinity?'∞':u.members.limit} (${u.members.pct}%)</div>
                <div>التخزين: ${u.storage_mb.used} MB (${u.storage_mb.pct}%)</div>
              </div></td>
              <td><button class="btn btn-sm btn-primary" data-view="${c.church_id}">إدارة</button></td>
            </tr>`;
          }).join('')}</tbody></table></div></div>
    `);
    document.getElementById('new').onclick = ()=> createModal();
    document.querySelectorAll('[data-view]').forEach(b => b.onclick = ()=> openTenant(b.dataset.view));
  }
  function createModal(){
    UI.modal(`<h3>إنشاء كنيسة (Tenant) جديدة</h3>
      <label>اسم الكنيسة</label><input id="t-name" class="input">
      <label>الكود</label><input id="t-code" class="input">
      <label>الخطة</label>
      <select id="t-plan" class="input">${Billing.listPlans().map(p=>`<option value="${p.plan_key}">${p.label_ar||p.label}</option>`).join('')}</select>
      <label>بريد المدير</label><input id="t-email" class="input">
      <label>اسم المدير</label><input id="t-aname" class="input">
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
      <button class="btn btn-primary" id="save">إنشاء</button></div>`);
    document.getElementById('save').onclick = ()=>{
      TenantMgmt.create({ name:document.getElementById('t-name').value, code:document.getElementById('t-code').value,
        plan:document.getElementById('t-plan').value, admin_email:document.getElementById('t-email').value,
        admin_name:document.getElementById('t-aname').value });
      UI.toast('تم الإنشاء','success'); UI.closeModal(); render();
    };
  }
  function openTenant(cid){
    const c = TenantMgmt.get(cid);
    const u = TenantMgmt.usageVsLimits(cid);
    const h = TenantMgmt.health(cid);
    const op = TenantMgmt.operational(cid);
    const flags = TenantMgmt.flags(cid);
    const features = ['finance','analytics','ai','events','workflows','notifications'];
    UI.modal(`<h3>${c.church_name}</h3>
      <div class="grid grid-3">
        <div class="card"><b>الصحة</b><br><div style="font-size:2rem;font-weight:800">${h.score}%</div><div>${h.label}</div></div>
        <div class="card"><b>النشاط (30 يوم)</b><br><small>دخول: ${op.loginActivity}<br>حضور: ${op.engagement}<br>workflows: ${op.workflowActivity}<br>ماليات: ${op.financeUsage}</small></div>
        <div class="card"><b>الموارد</b><br><small>المستخدمون: ${u.users.used}/${u.users.limit===Infinity?'∞':u.users.limit}<br>المخدومون: ${u.members.used}/${u.members.limit===Infinity?'∞':u.members.limit}<br>التخزين: ${u.storage_mb.used} MB</small></div>
      </div>
      <h4>مفاتيح الميزات</h4>
      <div style="display:grid;grid-template-columns:repeat(2,1fr);gap:.5rem">
        ${features.map(f=>{
          const cur = TenantMgmt.isFlagEnabled(cid,f);
          return `<label style="display:flex;align-items:center;gap:.5rem"><input type="checkbox" data-flag="${f}" ${cur?'checked':''}> ${f}</label>`;
        }).join('')}
      </div>
      <h4>إجراءات</h4>
      <div style="display:flex;gap:.5rem;flex-wrap:wrap">
        <button class="btn btn-success" id="act">تفعيل</button>
        <button class="btn btn-orange" id="susp">تعليق</button>
        <button class="btn btn-ghost" id="frz">تجميد</button>
        <button class="btn btn-red" id="arc">أرشفة</button>
      </div>
      <div style="text-align:left;margin-top:1rem"><button class="btn btn-ghost" onclick="UI.closeModal()">إغلاق</button></div>
    `);
    document.querySelectorAll('[data-flag]').forEach(cb => cb.onchange = e => TenantMgmt.setFlag(cid, cb.dataset.flag, cb.checked));
    document.getElementById('act').onclick  = ()=>{ TenantMgmt.reactivate(cid); UI.toast('تم التفعيل','success'); UI.closeModal(); render(); };
    document.getElementById('susp').onclick = ()=>{ const r=prompt('السبب؟'); TenantMgmt.suspend(cid,r); UI.toast('تم التعليق','warning'); UI.closeModal(); render(); };
    document.getElementById('frz').onclick  = ()=>{ TenantMgmt.freeze(cid,'admin freeze'); UI.toast('تم التجميد'); UI.closeModal(); render(); };
    document.getElementById('arc').onclick  = ()=>{ if(!confirm('تأكيد الأرشفة؟'))return; TenantMgmt.archive(cid,'archived'); UI.toast('تم الأرشفة'); UI.closeModal(); render(); };
  }
  render();
})();

/* ===== js/usage-analytics-page.js ===== */
/* ============================================================
   USAGE-ANALYTICS.PAGE.js — Executive BI dashboards
   ============================================================ */
(function(){
  if (!App.init('usage-analytics', ['super_admin'])) return;
  function render(){
    const ph = UsageAnalytics.platformHealth();
    const top = UsageAnalytics.topActiveChurches(10);
    const feat = UsageAnalytics.featureUsage();
    const churn = UsageAnalytics.churnRisk();
    const growth = UsageAnalytics.growthTrend();
    const revenue = UsageAnalytics.revenueTrend();
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">التحليلات والذكاء التشغيلي</h1>
        <p class="page-subtitle">رؤية تنفيذية على نمو المنصة، الاستخدام، ومخاطر الانسحاب</p>
      </div></div>

      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-church"></i></div><div><div class="stat-value">${ph.totalT}</div><div class="stat-label">إجمالي المستأجرين</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-bolt"></i></div><div><div class="stat-value">${ph.activeT}</div><div class="stat-label">نشط</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-moon"></i></div><div><div class="stat-value">${ph.inactiveT}</div><div class="stat-label">غير نشط</div></div></div>
        <div class="stat-card" style="background:linear-gradient(135deg,#dc2626,#991b1b);color:#fff"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div><div><div class="stat-value">${ph.warnings}</div><div class="stat-label">تحذيرات تشغيلية</div></div></div>
      </div>

      <div class="grid grid-2 mb-3">
        <div class="card"><h3>نمو المستأجرين</h3><canvas id="cv-growth" height="160"></canvas></div>
        <div class="card"><h3>الإيرادات (مدفوعة)</h3><canvas id="cv-rev" height="160"></canvas></div>
      </div>

      <div class="grid grid-2 mb-3">
        <div class="card"><h3>اعتماد الميزات</h3><canvas id="cv-feat" height="160"></canvas></div>
        <div class="card"><h3>أعلى الكنائس نشاطاً</h3>
          <table class="table"><thead><tr><th>الكنيسة</th><th>الصحة</th><th>النشاط</th></tr></thead>
          <tbody>${top.map(t=>`<tr><td>${t.church.church_name}</td><td>${t.score}%</td><td>${t.activity}</td></tr>`).join('')}</tbody></table>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3>تحليل مخاطر الانسحاب (Churn)</h3></div>
        <table class="table">
          <thead><tr><th>الكنيسة</th><th>المخاطرة</th><th>المستوى</th><th>الأسباب</th></tr></thead>
          <tbody>${churn.map(r=>`<tr>
            <td>${r.church.church_name}</td>
            <td>${r.risk}%</td>
            <td><span class="badge ${r.band==='critical'?'red':r.band==='high'?'orange':r.band==='medium'?'blue':'green'}">${r.band}</span></td>
            <td><small>${r.reasons.join(' · ')||'-'}</small></td>
          </tr>`).join('')}</tbody></table>
      </div>
    `);
    new Chart(document.getElementById('cv-growth'),{ type:'line', data:{ labels:growth.labels, datasets:[{label:'كنائس جديدة',data:growth.values,borderColor:'#2563eb',backgroundColor:'rgba(37,99,235,0.2)',fill:true,tension:0.3}]}});
    new Chart(document.getElementById('cv-rev'),{ type:'bar', data:{ labels:revenue.labels, datasets:[{label:'إيرادات', data:revenue.values, backgroundColor:'#16a34a'}]}});
    new Chart(document.getElementById('cv-feat'),{ type:'doughnut', data:{ labels:Object.keys(feat), datasets:[{ data:Object.values(feat), backgroundColor:['#2563eb','#7c3aed','#16a34a','#f97316','#ef4444','#0ea5e9']}]}});
  }
  render();
})();

/* ===== js/white-label-page.js ===== */
/* ============================================================
   WHITE-LABEL.PAGE.js — Branding management
   ============================================================ */
(function(){
  if (!App.init('white-label', ['super_admin','church_admin'])) return;
  const session = Auth.session();
  const isSuper = session.role==='super_admin';

  function render(selectedCid){
    const churches = DB._raw('churches');
    const cid = selectedCid || (isSuper ? churches[0]?.church_id : session.church_id);
    const b = WhiteLabel.get(cid);
    App.render(`
      <div class="page-header"><div>
        <h1 class="page-title">العلامة التجارية (White-Label)</h1>
        <p class="page-subtitle">تخصيص العلامة، الألوان، الشعار، والنطاق الفرعي لكل كنيسة</p>
      </div></div>
      ${isSuper?`<div class="card mb-3"><label>اختر الكنيسة</label>
        <select id="ch" class="input">${churches.map(c=>`<option value="${c.church_id}" ${c.church_id===cid?'selected':''}>${c.church_name}</option>`).join('')}</select>
      </div>`:''}
      <div class="grid grid-2">
        <div class="card">
          <h3>إعدادات العلامة</h3>
          <label>اسم الترويسة</label><input id="b-header" class="input" value="${b.header_text||''}">
          <label>رسالة الترحيب</label><input id="b-welcome" class="input" value="${b.welcome_message||''}">
          <label>رابط الشعار</label><input id="b-logo" class="input" value="${b.logo_url||''}">
          <label>رابط خلفية الدخول</label><input id="b-login" class="input" value="${b.login_bg||''}">
          <label>اللون الرئيسي</label><input id="b-primary" type="color" class="input" value="${b.primary_color}">
          <label>لون التمييز</label><input id="b-accent" type="color" class="input" value="${b.accent_color}">
          <label>النطاق الفرعي</label>
          <div style="display:flex;gap:.3rem;align-items:center">
            <input id="b-sub" class="input" value="${b.subdomain||''}" placeholder="church1">
            <span class="muted">.platform.com</span>
          </div>
          <div style="margin-top:1rem;display:flex;gap:.5rem">
            <button class="btn btn-ghost" id="save-draft">حفظ مسودة</button>
            <button class="btn btn-primary" id="publish">نشر</button>
          </div>
          <p class="muted" style="margin-top:.5rem">حالة: ${b.published?'<span class="badge green">منشورة</span>':'<span class="badge orange">مسودة</span>'}</p>
        </div>
        <div class="card">
          <h3>المعاينة</h3>
          <div id="preview" style="border:1px solid var(--border);border-radius:12px;overflow:hidden">
            <div id="prev-header" style="background:${b.primary_color};color:#fff;padding:1rem;display:flex;align-items:center;gap:.5rem">
              ${b.logo_url?`<img src="${b.logo_url}" style="height:40px">`:'<i class="fa-solid fa-church" style="font-size:1.5rem"></i>'}
              <div><div id="prev-title" style="font-weight:700">${b.header_text||'منصة الكنيسة'}</div>
              <div id="prev-welcome" style="font-size:.85rem;opacity:.9">${b.welcome_message||''}</div></div>
            </div>
            <div style="padding:1rem">
              <button style="background:${b.accent_color};color:#fff;border:none;padding:.5rem 1rem;border-radius:8px">زر بلون التمييز</button>
              <p class="muted" style="margin-top:.5rem">${b.subdomain?`URL: ${WhiteLabel.subdomainURL(b)}`:'لم يتم تعيين نطاق فرعي'}</p>
            </div>
          </div>
        </div>
      </div>
    `);
    if (isSuper) document.getElementById('ch').onchange = e => render(e.target.value);
    function collect(){
      return {
        header_text: document.getElementById('b-header').value,
        welcome_message: document.getElementById('b-welcome').value,
        logo_url: document.getElementById('b-logo').value,
        login_bg: document.getElementById('b-login').value,
        primary_color: document.getElementById('b-primary').value,
        accent_color: document.getElementById('b-accent').value,
        subdomain: document.getElementById('b-sub').value
      };
    }
    ['b-header','b-welcome','b-logo','b-primary','b-accent','b-sub'].forEach(id => {
      document.getElementById(id).oninput = ()=> render(cid); // live re-render keeps simple
    });
    document.getElementById('save-draft').onclick = ()=>{ WhiteLabel.save(cid, collect(), false); UI.toast('تم الحفظ','success'); };
    document.getElementById('publish').onclick = ()=>{ WhiteLabel.save(cid, collect(), true); UI.toast('تم النشر','success'); render(cid); };
  }
  render();
})();

