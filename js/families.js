/* FAMILIES PAGE — list + create + profile (Family-Centered System) */
(function(){
  if (!App.init('families')) return;
  let filter = { q:'', area:'', status:'' };
  let editing = null;
  let childrenBuffer = [];

  function visible(){
    return DB.all('families').filter(f => {
      if (filter.q){
        const q = filter.q;
        if (!(f.family_name||'').includes(q) &&
            !(f.family_code||'').includes(q) &&
            !(f.father_name||'').includes(q) &&
            !(f.mother_name||'').includes(q) &&
            !(f.primary_phone||'').includes(q)) return false;
      }
      if (filter.area && f.area !== filter.area) return false;
      if (filter.status && f.family_status !== filter.status) return false;
      return true;
    });
  }

  function render(){
    const families = visible();
    const allFams = DB.all('families');
    const totalMembers = DB.count('members', m => m.family_id);
    const needVisit = Family.familiesNeedingVisit().length;
    const areas = [...new Set(allFams.map(f=>f.area).filter(Boolean))];

    App.render(`
      <div class="page-header">
        <div>
          <h1 class="page-title"><i class="fa-solid fa-people-roof"></i> الأسر</h1>
          <p class="page-subtitle">${families.length} أسرة — ${totalMembers} فرد — ${needVisit} تحتاج افتقاد</p>
        </div>
        <button class="btn btn-accent" onclick="FamiliesPage.showForm()"><i class="fa-solid fa-plus"></i> أسرة جديدة</button>
      </div>

      <div class="grid grid-4 mb-2">
        <div class="kpi-card"><div class="kpi-label">إجمالي الأسر</div><div class="kpi-value">${allFams.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">إجمالي الأفراد</div><div class="kpi-value">${totalMembers}</div></div>
        <div class="kpi-card"><div class="kpi-label">تحتاج افتقاد</div><div class="kpi-value text-danger">${needVisit}</div></div>
        <div class="kpi-card"><div class="kpi-label">أسر نشطة</div><div class="kpi-value text-success">${allFams.filter(f=>f.family_status==='active').length}</div></div>
      </div>

      <div class="card mb-2">
        <div class="grid grid-3">
          <input class="form-control" placeholder="بحث: اسم الأسرة / كود / هاتف" value="${filter.q}" oninput="FamiliesPage.setFilter('q', this.value)">
          <select class="form-select" onchange="FamiliesPage.setFilter('area', this.value)">
            <option value="">كل المناطق</option>
            ${areas.map(a=>`<option value="${a}" ${filter.area===a?'selected':''}>${a}</option>`).join('')}
          </select>
          <select class="form-select" onchange="FamiliesPage.setFilter('status', this.value)">
            <option value="">كل الحالات</option>
            <option value="active" ${filter.status==='active'?'selected':''}>نشطة</option>
            <option value="inactive" ${filter.status==='inactive'?'selected':''}>غير نشطة</option>
            <option value="at_risk" ${filter.status==='at_risk'?'selected':''}>تحتاج متابعة</option>
          </select>
        </div>
      </div>

      <div class="table-wrap">
        <table class="table">
          <thead><tr>
            <th>الكود</th><th>اسم الأسرة</th><th>الأب</th><th>الأم</th>
            <th>الأبناء</th><th>المنطقة</th><th>الهاتف</th><th>الحضور</th><th>الحالة</th><th></th>
          </tr></thead>
          <tbody>${families.length ? families.map(rowHtml).join('') :
            '<tr><td colspan="10"><div class="empty"><i class="fa-solid fa-house-circle-xmark"></i>لا توجد أسر</div></td></tr>'}</tbody>
        </table>
      </div>
    `);
  }

  function rowHtml(f){
    const children = Family.familyChildren(f.family_id).length;
    const rate = Family.familyAttendanceRate(f.family_id);
    const badge = f.family_status==='active' ? 'green' : f.family_status==='at_risk' ? 'red' : 'gray';
    return `<tr>
      <td><code>${f.family_code}</code></td>
      <td><b>${f.family_name||'—'}</b></td>
      <td>${f.father_name||'—'}</td>
      <td>${f.mother_name||'—'}</td>
      <td>${children}</td>
      <td>${f.area||'—'}</td>
      <td dir="ltr">${f.primary_phone||'—'}</td>
      <td>${rate}%</td>
      <td><span class="badge badge-${badge}">${f.family_status||'—'}</span></td>
      <td>
        <a class="btn btn-ghost btn-sm" href="family-profile.html?family_id=${f.family_id}" title="ملف الأسرة"><i class="fa-solid fa-eye"></i></a>
        <button class="btn btn-ghost btn-sm" onclick="FamiliesPage.edit('${f.family_id}')" title="تعديل"><i class="fa-solid fa-pen"></i></button>
      </td>
    </tr>`;
  }

  /* --- Form --- */
  function showForm(f){
    editing = f || null;
    childrenBuffer = [];
    if (editing){
      childrenBuffer = Family.familyChildren(editing.family_id).map(c => ({
        full_name:c.full_name, gender:c.gender, birth_date:c.birth_date,
        school_year:c.school, notes:c.notes, member_id:c.member_id
      }));
    }
    UI.modal(formHtml());
    renderChildrenList();
  }

  function formHtml(){
    const f = editing || {};
    const code = f.family_code || (window.Family ? Family.genFamilyId() : '—');
    return `
      <div class="modal-header">
        <h3>${editing?'تعديل أسرة: '+f.family_name:'أسرة جديدة'} <code style="margin-inline-start:.5rem">${code}</code></h3>
        <button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button>
      </div>
      <div class="modal-body" style="max-height:78vh;overflow:auto">
        <form id="family-form" onsubmit="event.preventDefault();FamiliesPage.save()">

        <h4 class="mt-1 mb-1"><i class="fa-solid fa-house"></i> بيانات الأسرة الأساسية</h4>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">اسم الأسرة *</label>
            <input class="form-control" name="family_name" value="${f.family_name||''}" required></div>
          <div class="form-group"><label class="form-label">حالة الأسرة</label>
            <select class="form-select" name="family_status">
              <option value="active" ${f.family_status==='active'?'selected':''}>نشطة</option>
              <option value="inactive" ${f.family_status==='inactive'?'selected':''}>غير نشطة</option>
              <option value="at_risk" ${f.family_status==='at_risk'?'selected':''}>تحتاج متابعة</option>
            </select></div>
        </div>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">المنطقة</label>
            <input class="form-control" name="area" value="${f.area||''}"></div>
          <div class="form-group"><label class="form-label">المدينة</label>
            <input class="form-control" name="city" value="${f.city||''}"></div>
          <div class="form-group"><label class="form-label">العنوان التفصيلي</label>
            <input class="form-control" name="address" value="${f.address||''}"></div>
        </div>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">هاتف رئيسي</label>
            <input class="form-control" name="primary_phone" value="${f.primary_phone||''}" dir="ltr"></div>
          <div class="form-group"><label class="form-label">هاتف بديل</label>
            <input class="form-control" name="secondary_phone" value="${f.secondary_phone||''}" dir="ltr"></div>
          <div class="form-group"><label class="form-label">تاريخ التسجيل</label>
            <input type="date" class="form-control" name="registration_date" value="${(f.registration_date||'').slice(0,10)}"></div>
        </div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-person"></i> بيانات الأب</h4>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">الاسم</label>
            <input class="form-control" name="father_name" value="${f.father_name||''}"></div>
          <div class="form-group"><label class="form-label">تاريخ الميلاد</label>
            <input type="date" class="form-control" name="father_birth_date" value="${f.father_birth_date||''}"></div>
          <div class="form-group"><label class="form-label">هاتف</label>
            <input class="form-control" name="father_phone" value="${f.father_phone||''}" dir="ltr"></div>
        </div>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">المهنة</label>
            <input class="form-control" name="father_job" value="${f.father_job||''}"></div>
          <div class="form-group"><label class="form-label">الحالة الروحية</label>
            <select class="form-select" name="father_spiritual_status">
              <option value="">—</option>
              ${['منتظم','غير منتظم','غير معروف','متنيح'].map(v=>`<option ${f.father_spiritual_status===v?'selected':''}>${v}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">ملاحظات</label>
            <input class="form-control" name="father_notes" value="${f.father_notes||''}"></div>
        </div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-person-dress"></i> بيانات الأم</h4>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">الاسم</label>
            <input class="form-control" name="mother_name" value="${f.mother_name||''}"></div>
          <div class="form-group"><label class="form-label">تاريخ الميلاد</label>
            <input type="date" class="form-control" name="mother_birth_date" value="${f.mother_birth_date||''}"></div>
          <div class="form-group"><label class="form-label">هاتف</label>
            <input class="form-control" name="mother_phone" value="${f.mother_phone||''}" dir="ltr"></div>
        </div>
        <div class="grid grid-3">
          <div class="form-group"><label class="form-label">المهنة</label>
            <input class="form-control" name="mother_job" value="${f.mother_job||''}"></div>
          <div class="form-group"><label class="form-label">الحالة الروحية</label>
            <select class="form-select" name="mother_spiritual_status">
              <option value="">—</option>
              ${['منتظم','غير منتظم','غير معروف','متنيح'].map(v=>`<option ${f.mother_spiritual_status===v?'selected':''}>${v}</option>`).join('')}
            </select></div>
          <div class="form-group"><label class="form-label">ملاحظات</label>
            <input class="form-control" name="mother_notes" value="${f.mother_notes||''}"></div>
        </div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-children"></i> الأبناء
          <button type="button" class="btn btn-ghost btn-sm" onclick="FamiliesPage.addChildRow()"><i class="fa-solid fa-plus"></i> إضافة</button>
        </h4>
        <div id="children-list"></div>

        <h4 class="mt-2 mb-1"><i class="fa-solid fa-clipboard-list"></i> ملاحظات الأسرة</h4>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">ملاحظات متابعة</label>
            <textarea class="form-control" name="followup_notes" rows="2">${f.followup_notes||''}</textarea></div>
          <div class="form-group"><label class="form-label">ملاحظات الافتقاد</label>
            <textarea class="form-control" name="visitation_notes" rows="2">${f.visitation_notes||''}</textarea></div>
        </div>
        <div class="grid grid-2">
          <div class="form-group"><label class="form-label">ظروف خاصة</label>
            <textarea class="form-control" name="special_conditions" rows="2">${f.special_conditions||''}</textarea></div>
          <div class="form-group"><label class="form-label">طوارئ</label>
            <textarea class="form-control" name="emergency_notes" rows="2">${f.emergency_notes||''}</textarea></div>
        </div>
        <div class="form-group"><label class="form-label">ملاحظات عامة</label>
          <textarea class="form-control" name="notes" rows="2">${f.notes||''}</textarea></div>

        <div class="modal-footer">
          <button type="button" class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button type="submit" class="btn btn-primary"><i class="fa-solid fa-save"></i> حفظ الأسرة</button>
        </div>
        </form>
      </div>`;
  }

  function renderChildrenList(){
    const div = document.getElementById('children-list');
    if (!div) return;
    div.innerHTML = childrenBuffer.length ? childrenBuffer.map((c,i)=>`
      <div class="card mb-1" style="background:var(--surface-2,#f9f9f9)">
        <div class="grid grid-4">
          <input class="form-control" placeholder="الاسم" value="${c.full_name||''}" oninput="FamiliesPage.editChild(${i},'full_name',this.value)">
          <select class="form-select" onchange="FamiliesPage.editChild(${i},'gender',this.value)">
            <option value="male" ${c.gender==='male'?'selected':''}>ذكر</option>
            <option value="female" ${c.gender==='female'?'selected':''}>أنثى</option>
          </select>
          <input type="date" class="form-control" value="${c.birth_date||''}" oninput="FamiliesPage.editChild(${i},'birth_date',this.value)">
          <input class="form-control" placeholder="المرحلة الدراسية" value="${c.school_year||''}" oninput="FamiliesPage.editChild(${i},'school_year',this.value)">
        </div>
        <div class="grid grid-2 mt-1">
          <input class="form-control" placeholder="ملاحظات" value="${c.notes||''}" oninput="FamiliesPage.editChild(${i},'notes',this.value)">
          <button type="button" class="btn btn-ghost btn-sm" onclick="FamiliesPage.removeChild(${i})"><i class="fa-solid fa-trash"></i> حذف</button>
        </div>
      </div>`).join('') : '<p class="text-muted">لا يوجد أبناء. اضغط "إضافة" لإدخال ابن/ابنة.</p>';
  }

  function save(){
    const form = document.getElementById('family-form');
    const fd = new FormData(form);
    const data = {};
    fd.forEach((v,k)=>data[k]=v);
    data.children = childrenBuffer;

    if (editing){
      Family.updateFamily(editing.family_id, data);
      UI.toast('تم تحديث الأسرة','success');
    } else {
      const f = Family.createFamily(data);
      UI.toast('تم إنشاء الأسرة: '+f.family_code,'success');
    }
    UI.closeModal();
    render();
  }

  window.FamiliesPage = {
    setFilter(k,v){ filter[k]=v; render(); },
    showForm, edit(id){ showForm(DB.byId('families','family_id', id)); },
    save,
    addChildRow(){ childrenBuffer.push({}); renderChildrenList(); },
    editChild(i,k,v){ childrenBuffer[i][k]=v; },
    removeChild(i){ childrenBuffer.splice(i,1); renderChildrenList(); }
  };

  render();
})();
