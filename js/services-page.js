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
