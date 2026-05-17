/* MEMBERS — full v5 profile (family, education, auto-age/stage, scoped) */
(function(){
  if (!App.init('members')) return;

  const session = Auth.session();
  let filter = { q:'', service:'', stage:'', class:'', status:'' };

  function classes(){ return Hierarchy.scopedClasses(session); }
  function services(){ return DB.all('services'); }
  function stages(){ return DB.all('service_stages'); }

  function visibleMembers(){
    return Hierarchy.scopedMembers(session).filter(m => {
      if (filter.q && !(m.full_name||'').includes(filter.q) &&
          !(m.phone||'').includes(filter.q) &&
          !(m.parent_phone||'').includes(filter.q) &&
          !(m.father_phone||'').includes(filter.q)) return false;
      if (filter.service && m.service_id !== filter.service) return false;
      if (filter.stage && m.stage_id !== filter.stage && m.age_stage !== filter.stage) return false;
      if (filter.class && m.service_class_id !== filter.class) return false;
      if (filter.status && m.member_status !== filter.status) return false;
      return true;
    });
  }

  function render(){
    const members = visibleMembers();
    const scope = Hierarchy.getScope(session);
    const scopeBadge = scope.all
      ? '<span class="badge badge-blue">عرض كامل (مدير)</span>'
      : `<span class="badge badge-orange">نطاق محدود: ${scope.classes.length} فصل / ${scope.services.length} خدمة</span>`;

    App.render(`
      <div class="page-header">
        <div>
          <h1 class="page-title">المخدومين</h1>
          <p class="page-subtitle">${members.length} مخدوم — ${scopeBadge}</p>
        </div>
        ${Permissions.can('canManageMembers')?`
          <button class="btn btn-accent" onclick="MembersPage.showForm()"><i class="fa-solid fa-plus"></i> مخدوم جديد</button>`:''}
      </div>

      <div class="card mb-2">
        <div class="grid grid-4">
          <input class="form-control" placeholder="بحث: اسم / هاتف / هاتف ولي الأمر" value="${filter.q}" oninput="MembersPage.setFilter('q', this.value)">
          <select class="form-select" onchange="MembersPage.setFilter('service', this.value)">
            <option value="">كل الخدمات</option>
            ${services().map(s=>`<option value="${s.service_id}" ${filter.service===s.service_id?'selected':''}>${s.name}</option>`).join('')}
          </select>
          <select class="form-select" onchange="MembersPage.setFilter('stage', this.value)">
            <option value="">كل المراحل</option>
            ${stages().filter(st=>!filter.service||st.service_id===filter.service).map(st=>`<option value="${st.stage_id}" ${filter.stage===st.stage_id?'selected':''}>${st.name}</option>`).join('')}
          </select>
          <select class="form-select" onchange="MembersPage.setFilter('class', this.value)">
            <option value="">كل الفصول</option>
            ${classes().map(c=>`<option value="${c.class_id}" ${filter.class===c.class_id?'selected':''}>${c.class_name}</option>`).join('')}
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>الاسم</th><th>العمر</th><th>المرحلة</th><th>الفصل</th>
            <th>الهاتف</th><th>ولي الأمر</th><th>الخادم</th><th>الحالة</th><th></th>
          </tr></thead>
          <tbody>${members.length ? members.map(rowHtml).join('') :
            '<tr><td colspan="9"><div class="empty"><i class="fa-solid fa-users-slash"></i>لا يوجد مخدومين في نطاقك</div></td></tr>'}</tbody>
        </table>
      </div>
    `);
  }

  function rowHtml(m){
    const cls = DB.byId('service_classes','class_id', m.service_class_id);
    const servant = m.assigned_servant_id ? DB.byId('users','user_id', m.assigned_servant_id) : null;
    const age = Hierarchy.formatAge(m.birth_date);
    const stage = m.stage_id ? (DB.byId('service_stages','stage_id', m.stage_id)?.name) : Hierarchy.stageLabel(m.age_stage);
    return `<tr>
      <td><b>${m.full_name}</b>${m.nickname?` <span class="text-muted">(${m.nickname})</span>`:''}</td>
      <td>${age}</td>
      <td>${stage||'—'}</td>
      <td>${cls?.class_name||'—'}</td>
      <td dir="ltr">${m.phone||'—'}</td>
      <td dir="ltr">${m.parent_phone||m.father_phone||m.mother_phone||'—'}</td>
      <td>${servant?.full_name||'—'}</td>
      <td><span class="badge badge-${statusBadge(m.member_status)}">${statusLabel(m.member_status)}</span></td>
      <td>
        <button class="btn btn-ghost btn-sm" onclick="MembersPage.profile('${m.member_id}')" title="عرض"><i class="fa-solid fa-eye"></i></button>
        ${Permissions.can('canEditMembers')?`<button class="btn btn-ghost btn-sm" onclick="MembersPage.edit('${m.member_id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button>`:''}
        <button class="btn btn-ghost btn-sm" onclick="MembersPage.qr('${m.member_id}')" title="QR"><i class="fa-solid fa-qrcode"></i></button>
      </td>
    </tr>`;
  }

  function statusLabel(s){ return ({active:'نشط',inactive:'غير نشط',new:'جديد',at_risk:'في خطر',left:'غادر'})[s]||s||'—'; }
  function statusBadge(s){ return ({active:'green',inactive:'gray',new:'blue',at_risk:'red',left:'gray'})[s]||'gray'; }

  /* ---------- Full profile form ---------- */
  function formHtml(m){
    m = m || {};
    const svc = services(), stg = stages();
    const allClasses = DB.all('service_classes');
    const servants = DB.filter('users', u => ['servant','servant_leader','service_supervisor','supervisor'].includes(u.role));
    return `
      <div class="modal-header">
        <h3>${m.member_id?'تعديل بيانات: '+m.full_name:'مخدوم جديد'}</h3>
        <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="max-height:75vh;overflow:auto">
        <form id="member-form" onsubmit="event.preventDefault();MembersPage.save('${m.member_id||''}')">

        <h4 class="mt-1 mb-1"><i class="fa-solid fa-id-card"></i> البيانات الأساسية</h4>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">الاسم الكامل *</label>
            <input class="form-control" name="full_name" value="${m.full_name||''}" required></div>
          <div class="form-group"><label class="form-label">اللقب / اسم الشهرة</label>
            <input class="form-control" name="nickname" value="${m.nickname||''}"></div>
        </div>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">النوع</label>
            <select class="form-select" name="gender">
              <option value="male" ${m.gender==='male'?'selected':''}>ذكر</option>
              <option value="female" ${m.gender==='female'?'selected':''}>أنثى</option></select></div>
          <div class="form-group"><label class="form-label">تاريخ الميلاد</label>
            <input type="date" class="form-control" name="birth_date" value="${m.birth_date||''}" oninput="MembersPage.recalcAge(this.value)"></div>
          <div class="form-group"><label class="form-label">العمر (يحسب تلقائياً)</label>
            <input id="auto-age" class="form-control" readonly value="${Hierarchy.formatAge(m.birth_date)}"></div>
        </div>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">تاريخ الانضمام</label>
            <input type="date" class="form-control" name="join_date" value="${m.join_date||''}"></div>
          <div class="form-group"><label class="form-label">الحالة</label>
            <select class="form-select" name="member_status">
              ${['active','new','at_risk','inactive','left'].map(s=>`<option value="${s}" ${m.member_status===s?'selected':''}>${statusLabel(s)}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">الأب الروحي</label>
            <input class="form-control" name="spiritual_father" value="${m.spiritual_father||''}"></div>
        </div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-sitemap"></i> الخدمة والهيكل</h4>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">الخدمة</label>
            <select class="form-select" name="service_id">
              <option value="">—</option>
              ${svc.map(s=>`<option value="${s.service_id}" ${m.service_id===s.service_id?'selected':''}>${s.name}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">المرحلة</label>
            <select class="form-select" name="stage_id">
              <option value="">—</option>
              ${stg.map(s=>`<option value="${s.stage_id}" ${m.stage_id===s.stage_id?'selected':''}>${s.name}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">الفصل</label>
            <select class="form-select" name="service_class_id">
              <option value="">—</option>
              ${allClasses.map(c=>`<option value="${c.class_id}" ${m.service_class_id===c.class_id?'selected':''}>${c.class_name}</option>`).join('')}
            </select></div>
        </div>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">الخادم المسؤول</label>
            <select class="form-select" name="assigned_servant_id">
              <option value="">—</option>
              ${servants.filter(s=>['servant','servant_leader'].includes(s.role)).map(s=>`<option value="${s.user_id}" ${m.assigned_servant_id===s.user_id?'selected':''}>${s.full_name}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">المشرف</label>
            <select class="form-select" name="supervisor_id">
              <option value="">—</option>
              ${servants.filter(s=>['service_supervisor','supervisor','servant_leader'].includes(s.role)).map(s=>`<option value="${s.user_id}" ${m.supervisor_id===s.user_id?'selected':''}>${s.full_name}</option>`).join('')}
            </select></div>
        </div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-phone"></i> بيانات الاتصال</h4>
        <div class="grid grid-2">
          <div class="form-group">
            <label class="form-label">هاتف المخدوم <span class="text-muted">(اختياري للأطفال)</span></label>
            <input class="form-control" name="phone" value="${m.phone||''}" dir="ltr">
          </div>
          <div class="form-group">
            <label class="form-label">هاتف ولي الأمر <span class="text-danger" id="parent-req">*</span></label>
            <input class="form-control" name="parent_phone" value="${m.parent_phone||''}" dir="ltr">
          </div>
        </div>
        <div class="form-group"><label class="form-label">العنوان</label>
          <input class="form-control" name="address" value="${m.address||''}"></div>
        <div class="form-group"><label class="form-label">المنطقة</label>
          <input class="form-control" name="area" value="${m.area||''}"></div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-people-roof"></i> بيانات الأسرة</h4>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">اسم الأب</label>
            <input class="form-control" name="father_name" value="${m.father_name||''}"></div>
          <div class="form-group"><label class="form-label">هاتف الأب</label>
            <input class="form-control" name="father_phone" value="${m.father_phone||''}" dir="ltr"></div>
        </div>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">عمل الأب</label>
            <input class="form-control" name="father_job" value="${m.father_job||''}"></div>
          <div class="form-group"><label class="form-label">حالة الأب الروحية</label>
            <select class="form-select" name="father_spiritual_status">
              <option value="">—</option>
              ${['منتظم','غير منتظم','غير معروف','متنيح'].map(v=>`<option ${m.father_spiritual_status===v?'selected':''}>${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">اسم الأم</label>
            <input class="form-control" name="mother_name" value="${m.mother_name||''}"></div>
          <div class="form-group"><label class="form-label">هاتف الأم</label>
            <input class="form-control" name="mother_phone" value="${m.mother_phone||''}" dir="ltr"></div>
        </div>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">عمل الأم</label>
            <input class="form-control" name="mother_job" value="${m.mother_job||''}"></div>
          <div class="form-group"><label class="form-label">حالة الأم الروحية</label>
            <select class="form-select" name="mother_spiritual_status">
              <option value="">—</option>
              ${['منتظم','غير منتظم','غير معروف','متنيح'].map(v=>`<option ${m.mother_spiritual_status===v?'selected':''}>${v}</option>`).join('')}
            </select></div>
        </div>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">عدد الإخوة</label>
            <input type="number" min="0" class="form-control" name="siblings_count" value="${m.siblings_count||''}"></div>
          <div class="form-group"><label class="form-label">ترتيب المخدوم</label>
            <input type="number" min="1" class="form-control" name="birth_order" value="${m.birth_order||''}"></div>
          <div class="form-group"><label class="form-label">معرف الأسرة (لربط الإخوة)</label>
            <input class="form-control" name="family_id" value="${m.family_id||''}"></div>
        </div>
        <div class="form-group"><label class="form-label">ملاحظات الأسرة</label>
          <textarea class="form-control" name="family_notes">${m.family_notes||''}</textarea></div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-graduation-cap"></i> التعليم والعمل</h4>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">المرحلة الدراسية</label>
            <input class="form-control" name="education" value="${m.education||''}"></div>
          <div class="form-group"><label class="form-label">المدرسة</label>
            <input class="form-control" name="school" value="${m.school||''}"></div>
        </div>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">الكلية / الجامعة</label>
            <input class="form-control" name="college" value="${m.college||m.university||''}"></div>
          <div class="form-group"><label class="form-label">العمل</label>
            <input class="form-control" name="work" value="${m.work||m.job||''}"></div>
        </div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-notes-medical"></i> ملاحظات وصحة</h4>
        <div class="form-group"><label class="form-label">ملاحظات روحية</label>
          <textarea class="form-control" name="spiritual_notes">${m.spiritual_notes||''}</textarea></div>
        <div class="form-group"><label class="form-label">ملاحظات صحية</label>
          <textarea class="form-control" name="health_notes">${m.health_notes||''}</textarea></div>
        <div class="form-group"><label class="form-label">احتياجات خاصة</label>
          <textarea class="form-control" name="special_needs">${m.special_needs||''}</textarea></div>
        <div class="form-group"><label class="form-label">ملاحظات عامة</label>
          <textarea class="form-control" name="notes">${m.notes||''}</textarea></div>
        </form>
      </div>
      <div class="modal-footer">
        <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
        <button class="btn btn-accent" onclick="MembersPage.save('${m.member_id||''}')"><i class="fa-solid fa-save"></i> حفظ</button>
      </div>
    `;
  }

  window.MembersPage = {
    setFilter(k,v){ filter[k]=v; if (k==='service') filter.stage=''; render(); },
    showForm(m){ UI.modal(formHtml(m)); },
    edit(id){ UI.modal(formHtml(DB.byId('members','member_id',id))); },
    recalcAge(birth){
      const el = document.getElementById('auto-age');
      if (el) el.value = Hierarchy.formatAge(birth);
    },

    save(id){
      const form = document.getElementById('member-form');
      const data = Object.fromEntries(new FormData(form).entries());
      Object.keys(data).forEach(k => { if (data[k]==='') data[k]=null; });

      if (!data.full_name) return UI.toast('الاسم مطلوب','error');

      // Auto-derive stage from birth_date if missing
      if (data.birth_date && !data.age_stage){
        data.age_stage = Hierarchy.stageFromBirth(data.birth_date);
      }

      // Phone logic — kids (under 14 or stage nursery/kg/primary/preparatory) MUST have guardian phone
      const age = data.birth_date ? Hierarchy.ageFromBirth(data.birth_date) : null;
      const isKid = (age && age.years < 14) ||
                    ['nursery','kg','primary','preparatory'].includes(data.age_stage);
      if (isKid && !data.parent_phone && !data.father_phone && !data.mother_phone){
        return UI.toast('للأطفال: هاتف ولي الأمر (الأب/الأم) مطلوب','error');
      }
      // adults must have at least one phone
      if (!isKid && !data.phone && !data.parent_phone){
        return UI.toast('رقم هاتف واحد على الأقل مطلوب','error');
      }

      // Inherit service/stage from class if provided
      if (data.service_class_id){
        const cls = DB.byId('service_classes','class_id', data.service_class_id);
        if (cls){
          data.service_id = data.service_id || cls.service_id;
          data.stage_id   = data.stage_id   || cls.stage_id;
        }
      }

      if (id){
        DB.update('members','member_id', id, data);
        UI.toast('تم تحديث بيانات المخدوم','success');
      } else {
        data.qr_code = data.qr_code || ('QR-'+Date.now());
        data.member_status = data.member_status || 'new';
        DB.insert('members', data);
        UI.toast('تمت إضافة المخدوم','success');
      }
      UI.closeModal();
      render();
    },

    profile(id){
      const m = DB.byId('members','member_id',id);
      if (!Permissions.canAccessMember(m)){
        return UI.toast('هذا المخدوم خارج نطاق صلاحياتك','error');
      }
      const stats = window.Attendance ? Attendance.memberStats(id,90) : {rate:0,attended:0};
      const risk = DB.find('member_risk_scores', s => s.member_id===id);
      const tasks = DB.filter('followup_tasks', t => t.member_id===id);
      const family = Hierarchy.familyOf(m);
      const servant = m.assigned_servant_id ? DB.byId('users','user_id', m.assigned_servant_id) : null;
      const supervisor = m.supervisor_id ? DB.byId('users','user_id', m.supervisor_id) : null;
      const cls = m.service_class_id ? DB.byId('service_classes','class_id', m.service_class_id) : null;
      UI.modal(`
        <div class="modal-header">
          <h3>${m.full_name} ${m.nickname?`<span class="text-muted">(${m.nickname})</span>`:''}</h3>
          <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button>
        </div>
        <div class="modal-body" style="max-height:75vh;overflow:auto">
          <div class="grid grid-3 mb-2">
            <div class="stat-card"><div class="stat-icon"><i class="fa-solid fa-cake-candles"></i></div>
              <div><div class="stat-value">${Hierarchy.formatAge(m.birth_date)}</div><div class="stat-label">العمر</div></div></div>
            <div class="stat-card green"><div class="stat-icon"><i class="fa-solid fa-percent"></i></div>
              <div><div class="stat-value">${stats.rate||0}%</div><div class="stat-label">الالتزام (90 يوم)</div></div></div>
            <div class="stat-card red"><div class="stat-icon"><i class="fa-solid fa-triangle-exclamation"></i></div>
              <div><div class="stat-value">${risk?.score||0}</div><div class="stat-label">درجة الخطر</div></div></div>
          </div>

          <h4>الخدمة</h4>
          <table class="table mb-2">
            <tr><td>الفصل</td><td>${cls?.class_name||'—'}</td></tr>
            <tr><td>المرحلة</td><td>${Hierarchy.stageLabel(m.age_stage)}</td></tr>
            <tr><td>الخادم</td><td>${servant?.full_name||'—'}</td></tr>
            <tr><td>المشرف</td><td>${supervisor?.full_name||'—'}</td></tr>
          </table>

          <h4>الأسرة</h4>
          <table class="table mb-2">
            <tr><td>الأب</td><td>${m.father_name||'—'} <span dir="ltr">${m.father_phone||''}</span></td></tr>
            <tr><td>الأم</td><td>${m.mother_name||'—'} <span dir="ltr">${m.mother_phone||''}</span></td></tr>
            <tr><td>العنوان</td><td>${m.address||'—'} ${m.area?`(${m.area})`:''}</td></tr>
            <tr><td>الإخوة</td><td>${family.length} ${family.length?': '+family.map(f=>f.full_name).join('، '):''}</td></tr>
          </table>

          <h4>التعليم/العمل</h4>
          <table class="table mb-2">
            <tr><td>المدرسة</td><td>${m.school||'—'}</td></tr>
            <tr><td>الكلية</td><td>${m.college||m.university||'—'}</td></tr>
            <tr><td>العمل</td><td>${m.work||m.job||'—'}</td></tr>
          </table>

          ${m.spiritual_notes?`<h4>ملاحظات روحية</h4><div class="card mb-2">${m.spiritual_notes}</div>`:''}
          ${m.health_notes?`<h4>ملاحظات صحية</h4><div class="card mb-2">${m.health_notes}</div>`:''}
          ${m.special_needs?`<h4>احتياجات خاصة</h4><div class="card mb-2">${m.special_needs}</div>`:''}
        </div>
        <div class="modal-footer">
          ${Permissions.can('canEditMembers')?`<button class="btn btn-ghost" onclick="MembersPage.edit('${id}')"><i class="fa-solid fa-pen"></i> تعديل</button>`:''}
          <button class="btn btn-accent" onclick="MembersPage.qr('${id}')"><i class="fa-solid fa-qrcode"></i> QR</button>
        </div>
      `);
    },

    qr(id){
      const m = DB.byId('members','member_id',id);
      UI.modal(`<div class="modal-header"><h3>QR — ${m.full_name}</h3>
        <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body" style="text-align:center">
          <div id="qr-box" style="display:inline-block;padding:1rem;background:#fff"></div>
          <div class="text-muted mt-1">${m.qr_code||''}</div>
        </div>`);
      setTimeout(()=>{
        if (window.QRCode) new QRCode(document.getElementById('qr-box'), { text: m.qr_code||m.member_id, width:200, height:200 });
      }, 50);
    }
  };

  render();
})();
