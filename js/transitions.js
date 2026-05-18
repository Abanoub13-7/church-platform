/* TRANSITIONS PAGE — Supervisor Approval Queue */
(function(){
  if (!App.init('transitions')) return;

  function render(){
    StageEngine.scanTransitions();
    const pending = DB.filter('pending_transitions', t => t.status==='pending');
    const reviewed = DB.filter('pending_transitions', t => t.status!=='pending')
                      .sort((a,b)=>new Date(b.reviewed_at||0)-new Date(a.reviewed_at||0)).slice(0,20);

    App.render(`
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fa-solid fa-arrow-right-arrow-left"></i> اقتراحات نقل المراحل</h1>
          <p class="page-subtitle">${pending.length} اقتراح يحتاج موافقة المشرف</p>
        </div>
        <button class="btn btn-ghost" onclick="TransitionsPage.rescan()"><i class="fa-solid fa-rotate"></i> فحص الآن</button>
      </div>

      <h3 class="mt-2 mb-1">قائمة الاقتراحات</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>المخدوم</th><th>الأسرة</th><th>العمر</th>
            <th>المرحلة الحالية</th><th>المرحلة المقترحة</th>
            <th>الفصل المقترح</th><th>الخادم</th><th>السبب</th><th></th>
          </tr></thead>
          <tbody>${pending.length ? pending.map(rowHtml).join('') :
            '<tr><td colspan="9"><div class="empty"><i class="fa-solid fa-check-double"></i>لا توجد اقتراحات معلقة</div></td></tr>'}</tbody>
        </table>
      </div>

      <h3 class="mt-2 mb-1">سجل آخر القرارات</h3>
      <div class="table-wrap">
        <table class="table">
          <thead><tr><th>المخدوم</th><th>القرار</th><th>المراجع</th><th>التاريخ</th><th>السبب/الملاحظة</th></tr></thead>
          <tbody>${reviewed.length ? reviewed.map(t=>{
            const m = DB.byId('members','member_id', t.member_id);
            const u = t.reviewer_id ? DB.byId('users','user_id', t.reviewer_id) : null;
            return `<tr>
              <td>${m?.full_name||'—'}</td>
              <td><span class="badge badge-${t.status==='approved'?'green':'red'}">${t.status}</span></td>
              <td>${u?.full_name||'—'}</td>
              <td>${UI.fmt.dateTime(t.reviewed_at)}</td>
              <td>${t.reject_reason||t.reason||''}</td></tr>`;
          }).join('') : '<tr><td colspan="5"><div class="empty">لا يوجد سجل</div></td></tr>'}</tbody>
        </table>
      </div>
    `);
  }

  function rowHtml(t){
    const m = DB.byId('members','member_id', t.member_id);
    const fam = t.family_id ? DB.byId('families','family_id', t.family_id) : null;
    const classes = DB.filter('service_classes', c => c.age_stage===t.suggested_stage);
    const classSel = `<select id="cls-${t.transition_id}" class="form-select form-select-sm">
      <option value="">— اختياري —</option>
      ${classes.map(c=>`<option value="${c.class_id}">${c.class_name}</option>`).join('')}
    </select>`;
    const servants = DB.filter('users', u => ['servant','servant_leader'].includes(u.role));
    const servSel = `<select id="srv-${t.transition_id}" class="form-select form-select-sm">
      <option value="">— اختياري —</option>
      ${servants.map(u=>`<option value="${u.user_id}">${u.full_name}</option>`).join('')}
    </select>`;
    return `<tr>
      <td><b>${m?.full_name||'—'}</b></td>
      <td>${fam?`<a href="family-profile.html?family_id=${fam.family_id}">${fam.family_code}</a>`:'—'}</td>
      <td>${t.age_years} سنة</td>
      <td>${Hierarchy.stageLabel(t.current_stage)||'—'}</td>
      <td><span class="badge badge-blue">${Hierarchy.stageLabel(t.suggested_stage)}</span></td>
      <td>${classSel}</td>
      <td>${servSel}</td>
      <td style="font-size:.85em">${t.reason}</td>
      <td>
        <button class="btn btn-success btn-sm" onclick="TransitionsPage.approve('${t.transition_id}')"><i class="fa-solid fa-check"></i></button>
        <button class="btn btn-danger btn-sm" onclick="TransitionsPage.reject('${t.transition_id}')"><i class="fa-solid fa-xmark"></i></button>
      </td>
    </tr>`;
  }

  window.TransitionsPage = {
    rescan(){ StageEngine.scanTransitions(); UI.toast('تم فحص النظام','info'); render(); },
    approve(id){
      const cls = document.getElementById('cls-'+id)?.value || null;
      const srv = document.getElementById('srv-'+id)?.value || null;
      StageEngine.approve(id, { class_id:cls, servant_id:srv });
      UI.toast('تمت الموافقة','success'); render();
    },
    reject(id){
      const r = prompt('سبب الرفض (اختياري):') || '';
      StageEngine.reject(id, r);
      UI.toast('تم الرفض','info'); render();
    }
  };
  render();
})();
