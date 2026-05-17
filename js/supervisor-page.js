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
