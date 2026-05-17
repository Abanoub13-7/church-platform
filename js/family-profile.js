/* FAMILY PROFILE PAGE */
(function(){
  if (!App.init('families')) return;
  const params = new URLSearchParams(location.search);
  const fid = params.get('family_id');
  const family = DB.byId('families','family_id', fid);

  if (!family){
    App.render('<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i> الأسرة غير موجودة <a href="families.html" class="btn btn-primary">عودة</a></div>');
    return;
  }

  function memberCardHtml(m, label){
    if (!m){
      return `<div class="card"><div class="kpi-label">${label}</div><div class="text-muted">— غير مسجل —</div></div>`;
    }
    const age = Hierarchy.formatAge(m.birth_date);
    const stage = Hierarchy.stageLabel(m.age_stage);
    const cls = m.service_class_id ? DB.byId('service_classes','class_id', m.service_class_id) : null;
    const servant = m.assigned_servant_id ? DB.byId('users','user_id', m.assigned_servant_id) : null;
    const lastAttRec = DB.filter('attendance_records', r => r.member_id===m.member_id)
                          .sort((a,b)=>new Date(b.check_in_at)-new Date(a.check_in_at))[0];
    return `<div class="card">
      <div class="kpi-label">${label}</div>
      <div style="font-weight:700;font-size:1.1rem">${m.full_name}</div>
      <div class="grid grid-2 mt-1" style="font-size:.9rem">
        <div>العمر: <b>${age}</b></div>
        <div>المرحلة: <b>${stage}</b></div>
        <div>الفصل: <b>${cls?.class_name||'—'}</b></div>
        <div>الخادم: <b>${servant?.full_name||'—'}</b></div>
        <div>الحالة: <span class="badge badge-${m.member_status==='active'?'green':'gray'}">${m.member_status||'—'}</span></div>
        <div>آخر حضور: <b>${lastAttRec?UI.fmt.relative(lastAttRec.check_in_at):'—'}</b></div>
      </div>
    </div>`;
  }

  function render(){
    const father = Family.familyFather(fid);
    const mother = Family.familyMother(fid);
    const children = Family.familyChildren(fid);
    const rate = Family.familyAttendanceRate(fid);
    const lastVisit = Family.familyLastAttendance(fid);

    App.render(`
      <div class="page-header">
        <div>
          <a href="families.html" class="btn btn-ghost btn-sm"><i class="fa-solid fa-arrow-right"></i> العودة</a>
          <h1 class="page-title">${family.family_name} <code style="margin-inline-start:.5rem;font-size:.7em">${family.family_code}</code></h1>
          <p class="page-subtitle">${family.area||'—'} ${family.city?'• '+family.city:''} • ${family.address||''}</p>
        </div>
        <button class="btn btn-accent" onclick="FamilyProfilePage.edit()"><i class="fa-solid fa-pen"></i> تعديل الأسرة</button>
      </div>

      <div class="grid grid-4 mb-2">
        <div class="kpi-card"><div class="kpi-label">عدد الأبناء</div><div class="kpi-value">${children.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">معدل الحضور</div><div class="kpi-value">${rate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">آخر حضور</div><div class="kpi-value" style="font-size:1rem">${lastVisit?UI.fmt.relative(lastVisit):'لا يوجد'}</div></div>
        <div class="kpi-card"><div class="kpi-label">حالة الأسرة</div><div class="kpi-value" style="font-size:1rem">${family.family_status||'—'}</div></div>
      </div>

      <h3 class="mt-2 mb-1"><i class="fa-solid fa-user-group"></i> أفراد الأسرة</h3>
      <div class="grid grid-2 mb-2">
        ${memberCardHtml(father,'الأب')}
        ${memberCardHtml(mother,'الأم')}
      </div>
      <div class="grid grid-3 mb-2">
        ${children.length ? children.map((c,i)=>memberCardHtml(c,'ابن/ابنة ('+(i+1)+')')).join('')
          : '<div class="empty">لا يوجد أبناء مسجلين</div>'}
      </div>
      <div class="card mb-2">
        <button class="btn btn-primary" onclick="FamilyProfilePage.addChild()"><i class="fa-solid fa-plus"></i> إضافة ابن/ابنة</button>
      </div>

      <h3 class="mt-2 mb-1"><i class="fa-solid fa-clipboard-list"></i> الملاحظات والمتابعة</h3>
      <div class="grid grid-2">
        <div class="card"><b>ملاحظات المتابعة:</b><p>${family.followup_notes||'—'}</p></div>
        <div class="card"><b>ملاحظات الافتقاد:</b><p>${family.visitation_notes||'—'}</p></div>
        <div class="card"><b>ظروف خاصة:</b><p>${family.special_conditions||'—'}</p></div>
        <div class="card"><b>طوارئ:</b><p>${family.emergency_notes||'—'}</p></div>
      </div>
    `);
  }

  window.FamilyProfilePage = {
    edit(){ location.href = 'families.html?edit='+fid; },
    addChild(){
      const name = prompt('اسم الابن/الابنة:');
      if (!name) return;
      const gender = confirm('ذكر؟ (إلغاء = أنثى)') ? 'male':'female';
      const birth = prompt('تاريخ الميلاد (YYYY-MM-DD):') || null;
      Family.addChild(fid, { full_name:name, gender, birth_date:birth });
      UI.toast('تمت إضافة الفرد','success');
      render();
    }
  };
  render();
})();
