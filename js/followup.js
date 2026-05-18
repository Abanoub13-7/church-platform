/* ============================================================
   followup.js — Enterprise Follow-up Center (v23)
   ------------------------------------------------------------
   - Tabs: pending / overdue / escalated / completed / all
   - Priorities: low / medium / high / critical
   - Statuses: open / in_progress / escalated / done / cancelled
   - Intel Scan button (uses window.FollowupIntel.scan)
   - Auto-emits TASK_* events on Bus + timeline integration
   ============================================================ */
(function(){
  if (!window.App || !App.init('followup')) return;

  const TBL = 'followups';
  // Some legacy code wrote to 'followup_tasks' — merge transparently
  function unify(){
    try {
      const legacy = DB.all('followup_tasks');
      if (legacy && legacy.length){
        legacy.forEach(t => {
          if (!DB.all(TBL).some(x => x.task_id === t.task_id || x.followup_id === t.task_id)){
            DB.insert(TBL, Object.assign({ followup_id: t.task_id || DB.uuid() }, t));
          }
        });
      }
    } catch(_){}
  }

  let activeTab = 'pending';

  function tasks(){
    try { return DB.all(TBL).slice().sort((a,b)=> new Date(b.created_at||0)-new Date(a.created_at||0)); }
    catch(_){ return []; }
  }
  function isOpen(t){ return ['open','in_progress'].includes(t.status); }
  function isOverdue(t){ return isOpen(t) && t.due_at && new Date(t.due_at) < new Date(); }
  function filtered(){
    const arr = tasks();
    switch(activeTab){
      case 'pending':   return arr.filter(isOpen);
      case 'overdue':   return arr.filter(isOverdue);
      case 'escalated': return arr.filter(t => t.status==='escalated' || (t.escalation_level||0)>0);
      case 'completed': return arr.filter(t => t.status==='done');
      default:          return arr;
    }
  }

  function priBadge(p){
    const map = { critical:'red', high:'orange', urgent:'red', high_priority:'orange', medium:'blue', low:'gray' };
    return `<span class="badge badge-${map[p]||'blue'}">${p||'medium'}</span>`;
  }
  function statBadge(s){
    const map = { done:'green', escalated:'red', in_progress:'blue', open:'orange', cancelled:'gray' };
    return `<span class="badge badge-${map[s]||'blue'}">${s||'open'}</span>`;
  }

  function render(){
    unify();
    try { if (window.RiskEngine && RiskEngine.recalculateAll) RiskEngine.recalculateAll(); } catch(_){}

    const arr = tasks();
    const counts = {
      total: arr.length,
      pending: arr.filter(isOpen).length,
      overdue: arr.filter(isOverdue).length,
      escalated: arr.filter(t => t.status==='escalated' || (t.escalation_level||0)>0).length,
      completed: arr.filter(t => t.status==='done').length
    };
    const list = filtered();

    const tab = (id, label, n, color) => `
      <button class="btn ${activeTab===id?'btn-accent':'btn-ghost'}" onclick="FollowupPage.tab('${id}')">
        ${label} <span class="badge badge-${color||'gray'}" style="margin-inline-start:.35rem">${n}</span>
      </button>`;

    App.render(`
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fa-solid fa-list-check"></i> مركز الافتقاد والمتابعة</h1>
          <p class="page-subtitle">${counts.pending} مهمة مفتوحة · ${counts.overdue} متأخرة · ${counts.escalated} مُصعَّدة</p>
        </div>
        <div style="display:flex;gap:.5rem;flex-wrap:wrap">
          <button class="btn btn-ghost" onclick="FollowupPage.scan()"><i class="fa-solid fa-wand-magic-sparkles"></i> فحص ذكي</button>
          <button class="btn btn-accent" onclick="FollowupPage.create()"><i class="fa-solid fa-plus"></i> مهمة جديدة</button>
        </div>
      </div>

      <div class="grid grid-4 mb-3">
        <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-list"></i></div><div><div class="stat-value">${counts.total}</div><div class="stat-label">إجمالي</div></div></div>
        <div class="stat-card orange"><div class="stat-icon"><i class="fa-solid fa-clock"></i></div><div><div class="stat-value">${counts.pending}</div><div class="stat-label">مفتوحة</div></div></div>
        <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-fire"></i></div><div><div class="stat-value">${counts.escalated}</div><div class="stat-label">مُصعَّدة</div></div></div>
        <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-check"></i></div><div><div class="stat-value">${counts.completed}</div><div class="stat-label">منفذة</div></div></div>
      </div>

      <div class="card">
        <div style="display:flex;gap:.5rem;flex-wrap:wrap;margin-bottom:.75rem">
          ${tab('pending',  'قيد التنفيذ', counts.pending, 'orange')}
          ${tab('overdue',  'متأخرة',       counts.overdue, 'red')}
          ${tab('escalated','مُصعَّدة',     counts.escalated, 'red')}
          ${tab('completed','منفذة',        counts.completed, 'green')}
          ${tab('all',      'الكل',         counts.total, 'gray')}
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>المخدوم/الأسرة</th><th>السبب</th><th>الأولوية</th><th>الحالة</th><th>تصعيد</th><th>الاستحقاق</th><th></th></tr></thead>
          <tbody>${list.length ? list.map(t => {
            const m = t.member_id ? DB.byId('members','member_id',t.member_id) : null;
            const f = t.family_id ? DB.byId('families','family_id',t.family_id) : null;
            const subj = m ? m.full_name : (f ? (f.name||f.family_name||'أسرة') : '—');
            const id = t.followup_id || t.task_id;
            const overdue = isOverdue(t);
            return `<tr>
              <td><b>${subj}</b>${t.source?`<div style="font-size:.7rem;color:#94a3b8">${t.source}</div>`:''}</td>
              <td>${t.reason||'—'}</td>
              <td>${priBadge(t.priority)}</td>
              <td>${statBadge(t.status)}</td>
              <td>${(t.escalation_level||0)>0?`<span class="badge badge-red">L${t.escalation_level}</span>`:'—'}</td>
              <td style="${overdue?'color:#ef4444;font-weight:600':''}">${t.due_at?UI.fmt.relative(t.due_at):'—'}</td>
              <td style="white-space:nowrap">
                ${t.status!=='done'?`<button class="btn btn-ghost btn-sm" title="تصعيد" onclick="FollowupPage.escalate('${id}')"><i class="fa-solid fa-arrow-up" style="color:#ef4444"></i></button>`:''}
                ${t.status!=='done'?`<button class="btn btn-success btn-sm" title="إنهاء" onclick="FollowupPage.complete('${id}')"><i class="fa-solid fa-check"></i></button>`:''}
                <button class="btn btn-ghost btn-sm" title="تسجيل إجراء" onclick="FollowupPage.log('${id}')"><i class="fa-solid fa-edit"></i></button>
              </td>
            </tr>`;
          }).join('') : '<tr><td colspan="7"><div class="empty"><i class="fa-solid fa-check-circle"></i> لا توجد مهام في هذا التبويب</div></td></tr>'}</tbody>
        </table></div>
      </div>
    `);
  }

  function findRow(id){
    return DB.all(TBL).find(t => t.followup_id===id || t.task_id===id);
  }
  function patch(id, p){
    try { DB.update(TBL, 'followup_id', id, p); } catch(_){}
    try { DB.update(TBL, 'task_id',     id, p); } catch(_){}
    try { DB.update('followup_tasks', 'task_id', id, p); } catch(_){}
  }

  window.FollowupPage = {
    tab(id){ activeTab = id; render(); },
    scan(){
      let r = { created:0, scanned:0 };
      try { if (window.FollowupIntel && FollowupIntel.scan) r = FollowupIntel.scan() || r; } catch(_){}
      UI.toast(`الفحص الذكي: ${r.created||0} مهمة جديدة من ${r.scanned||0} أسرة`, 'success');
      render();
    },
    create(){
      const members = DB.all('members');
      const families = DB.all('families');
      const users = DB.all('users');
      UI.modal(`
        <div class="modal-header"><h3>مهمة افتقاد جديدة</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="t-form">
          <div class="form-group"><label class="form-label">الأسرة (اختياري)</label>
            <select class="form-select" name="family_id"><option value="">—</option>${families.map(f=>`<option value="${f.family_id}">${f.name||f.family_name||f.family_id}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">المخدوم (اختياري)</label>
            <select class="form-select" name="member_id"><option value="">—</option>${members.map(m=>`<option value="${m.member_id}">${m.full_name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">السبب</label><input class="form-control" name="reason" required></div>
          <div class="form-group"><label class="form-label">مُسند إلى</label>
            <select class="form-select" name="assigned_to"><option value="">—</option>${users.map(u=>`<option value="${u.user_id}">${u.full_name}</option>`).join('')}</select></div>
          <div class="form-group"><label class="form-label">الأولوية</label>
            <select class="form-select" name="priority"><option value="low">منخفضة</option><option value="medium" selected>متوسطة</option><option value="high">عالية</option><option value="critical">حرجة</option></select></div>
        </form></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="FollowupPage.save()"><i class="fa-solid fa-save"></i> حفظ</button></div>`);
    },
    save(){
      const fd = new FormData(document.getElementById('t-form'));
      const data = Object.fromEntries(fd.entries());
      Object.keys(data).forEach(k=>{ if (!data[k]) delete data[k]; });
      const row = Object.assign({
        followup_id: DB.uuid ? DB.uuid() : Math.random().toString(36).slice(2),
        status:'open', escalation_level:0,
        created_by: (window.Auth && Auth.session && Auth.session().user_id) || null,
        created_at: new Date().toISOString(),
        due_at: new Date(Date.now()+48*36e5).toISOString(),
        source:'manual'
      }, data);
      DB.insert(TBL, row);
      try { window.Bus && Bus.emit((window.Events&&Events.TASK_CREATED)||'task.created', { task: row }); } catch(_){}
      UI.toast('تم إنشاء المهمة','success'); UI.closeModal(); render();
    },
    log(id){
      UI.modal(`<div class="modal-header"><h3>تسجيل إجراء</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="log-form">
          <div class="form-group"><label class="form-label">الإجراء</label>
            <select class="form-select" name="action"><option value="called">اتصال</option><option value="visited">زيارة</option><option value="whatsapp">واتساب</option><option value="no_response">لا يرد</option></select></div>
          <div class="form-group"><label class="form-label">النتيجة</label><textarea class="form-control" name="result"></textarea></div>
        </form></div>
        <div class="modal-footer"><button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="FollowupPage.saveLog('${id}')">حفظ</button></div>`);
    },
    saveLog(id){
      const fd = new FormData(document.getElementById('log-form'));
      const data = Object.fromEntries(fd.entries());
      try { DB.insert('followup_logs', Object.assign({ task_id:id }, data, { performed_by:Auth.session().user_id, performed_at:new Date().toISOString() })); } catch(_){}
      patch(id, { status:'in_progress' });
      UI.toast('تم تسجيل الإجراء','success'); UI.closeModal(); render();
    },
    complete(id){
      patch(id, { status:'done', completed_at:new Date().toISOString() });
      try { window.Bus && Bus.emit((window.Events&&Events.TASK_CLOSED)||'task.closed', { task: findRow(id) }); } catch(_){}
      UI.toast('تم إنهاء المهمة','success'); render();
    },
    escalate(id){
      const t = findRow(id) || {};
      const lvl = (t.escalation_level||0)+1;
      patch(id, { status:'escalated', escalation_level:lvl, escalated_at:new Date().toISOString() });
      try { window.Bus && Bus.emit((window.Events&&Events.TASK_ESCALATED)||'task.escalated', { task: findRow(id) }); } catch(_){}
      try { window.NotificationCenter && NotificationCenter.push({ type:'alert', priority:'high', title:'تصعيد مهمة افتقاد', body:t.reason||'—', link:'followup.html' }); } catch(_){}
      UI.toast('تم تصعيد المهمة','warning'); render();
    }
  };

  render();
})();
