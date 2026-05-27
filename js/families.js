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

/* ============================================================
   MERGED FAMILY MODULES (Family Intelligence System)
   Was: family-core/relationships/attendance/risk/spiritual/
        serving/financial/emergency/custody/movement-ui/workflows/ai
   ============================================================ */

/* ----- family-core ----- */
/* ============================================================
   family-core.js — Family Entity Lifecycle (additive)
   Extends window.Family with enterprise CRUD + lifecycle helpers.
   Depends on: DB, Auth, window.Family (from engines.bundle.js)
   ============================================================ */
(function(){
  if (!window.DB) return;
  const F = window.Family = window.Family || {};

  const FAMILY_STATUSES = ['active','inactive','under_followup','high_risk','moved','suspended','archived'];
  const FAMILY_TYPES    = ['nuclear','single_parent','extended','guardian_based','orphan_care','temporary_custody','special_needs'];

  function actorId(){ return (window.Auth && Auth.session()?.user_id) || null; }
  function nowISO(){ return new Date().toISOString(); }

  function logMovement(family_id, kind, from_value, to_value, related_id, notes){
    return DB.insert('family_movement_log', {
      family_id, kind,
      from_value: from_value==null ? null : String(from_value),
      to_value:   to_value==null   ? null : String(to_value),
      related_id: related_id || null,
      actor_id:   actorId(),
      notes:      notes || null,
      occurred_at: nowISO()
    });
  }

  function touch(family_id){
    if (!family_id) return;
    DB.update('families', family_id, { last_activity_at: nowISO() });
  }

  function setStatus(family_id, status, notes){
    if (!FAMILY_STATUSES.includes(status)) throw new Error('invalid family status: '+status);
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const prev = fam.family_status;
    const out = DB.update('families', family_id, { family_status: status, last_activity_at: nowISO() });
    if (prev !== status) logMovement(family_id, 'status_change', prev, status, null, notes);
    return out;
  }

  function setType(family_id, type){
    if (!FAMILY_TYPES.includes(type)) throw new Error('invalid family type: '+type);
    return DB.update('families', family_id, { family_type: type, last_activity_at: nowISO() });
  }

  function archive(family_id, notes){
    return setStatus(family_id, 'archived', notes || 'archived');
  }

  /* ----- Guardians (designations on the family record) ----- */
  function setPrimaryGuardian(family_id, member_id){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const prev = fam.primary_guardian_id || null;
    const out = DB.update('families', family_id, { primary_guardian_id: member_id, last_activity_at: nowISO() });
    if (prev !== member_id) logMovement(family_id, 'guardian_change', prev, member_id, member_id, 'primary guardian set');
    return out;
  }
  function setSecondaryGuardian(family_id, member_id){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const prev = fam.secondary_guardian_id || null;
    const out = DB.update('families', family_id, { secondary_guardian_id: member_id, last_activity_at: nowISO() });
    if (prev !== member_id) logMovement(family_id, 'guardian_change', prev, member_id, member_id, 'secondary guardian set');
    return out;
  }

  /* ----- Transfers / splits / merges ----- */
  function transferChurch(family_id, to_church_id, notes){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const from = fam.church_id;
    // Move family and all linked members
    DB.update('families', family_id, { church_id: to_church_id, last_activity_at: nowISO() });
    (window.Family.familyMembers ? Family.familyMembers(family_id) : [])
      .forEach(m => DB.update('members', m.member_id, { church_id: to_church_id }));
    logMovement(family_id, 'transfer', from, to_church_id, null, notes);
    return DB.byId('families','family_id', family_id);
  }

  function split(family_id, member_ids_to_move, new_family_data){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam || !Array.isArray(member_ids_to_move) || !member_ids_to_move.length) return null;
    const created = DB.insert('families', Object.assign({
      family_code: F.genFamilyId ? F.genFamilyId() : null,
      family_name: (new_family_data && new_family_data.family_name) || (fam.family_name+' (فرع)'),
      family_status:'active',
      family_type: fam.family_type || 'nuclear',
      area: fam.area, city: fam.city,
      registration_date: nowISO()
    }, new_family_data || {}));
    member_ids_to_move.forEach(mid => {
      DB.update('members', mid, { family_id: created.family_id });
      // mirror existing relationship into the new family if any exists
      const rels = DB.filter('family_relationships', r => r.family_id===family_id && r.member_id===mid);
      rels.forEach(r => DB.insert('family_relationships', Object.assign({}, r, { rel_id: undefined, family_id: created.family_id })));
    });
    logMovement(family_id, 'split', family_id, created.family_id, created.family_id,
      member_ids_to_move.length+' members moved');
    logMovement(created.family_id, 'split', family_id, created.family_id, family_id, 'created from split');
    touch(family_id); touch(created.family_id);
    return created;
  }

  function merge(source_family_id, target_family_id, notes){
    const src = DB.byId('families','family_id', source_family_id);
    const tgt = DB.byId('families','family_id', target_family_id);
    if (!src || !tgt || src.family_id===tgt.family_id) return null;
    (F.familyMembers ? F.familyMembers(source_family_id) : [])
      .forEach(m => DB.update('members', m.member_id, { family_id: target_family_id }));
    DB.filter('family_relationships', r => r.family_id===source_family_id)
      .forEach(r => DB.update('family_relationships', r.rel_id, { family_id: target_family_id }));
    setStatus(source_family_id, 'archived', notes || 'merged into '+target_family_id);
    logMovement(target_family_id, 'merge', source_family_id, target_family_id, source_family_id, notes||null);
    touch(target_family_id);
    return DB.byId('families','family_id', target_family_id);
  }

  /* ----- Address change (logged) ----- */
  function changeAddress(family_id, patch){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const before = [fam.area, fam.city, fam.address].filter(Boolean).join(' / ');
    const after  = [patch.area || fam.area, patch.city || fam.city, patch.address || fam.address].filter(Boolean).join(' / ');
    const out = DB.update('families', family_id, Object.assign({ last_activity_at: nowISO() }, patch));
    if (before !== after) logMovement(family_id, 'address_change', before, after);
    return out;
  }

  Object.assign(F, {
    FAMILY_STATUSES, FAMILY_TYPES,
    setStatus, setType, archive, touch,
    setPrimaryGuardian, setSecondaryGuardian,
    transferChurch, split, merge, changeAddress,
    logMovement,
    movementLog(family_id){
      return DB.filter('family_movement_log', { family_id })
               .sort((a,b)=> new Date(b.occurred_at) - new Date(a.occurred_at));
    }
  });
})();

/* ----- family-relationships ----- */
/* ============================================================
   family-relationships.js — Member Linking & Relationship Engine
   Provides window.Rel for graph-like family relationship queries.
   Backed by the family_relationships table (schema-v12 + v13).
   ============================================================ */
(function(){
  if (!window.DB) return;

  const KINDS = ['father','mother','son','daughter','grandparent','guardian',
                 'relative','sibling','foster_parent','step_parent','custodian'];
  const PARENT_KINDS    = ['father','mother','guardian','foster_parent','step_parent','custodian','grandparent'];
  const GUARDIAN_KINDS  = ['father','mother','guardian','foster_parent','step_parent','custodian'];
  const CHILD_KINDS     = ['son','daughter'];

  function list(family_id){
    return DB.filter('family_relationships', { family_id });
  }
  function byMember(member_id){
    return DB.filter('family_relationships', { member_id });
  }

  function add(family_id, member_id, kind, opts){
    if (!KINDS.includes(kind)) throw new Error('invalid relationship_kind: '+kind);
    opts = opts || {};
    // dedupe: same family + member + kind
    const dup = DB.find('family_relationships', r =>
      r.family_id===family_id && r.member_id===member_id && r.relationship_kind===kind);
    if (dup) return DB.update('family_relationships', dup.rel_id, opts);
    const row = DB.insert('family_relationships', Object.assign({
      family_id, member_id, relationship_kind: kind,
      is_primary: !!opts.is_primary,
      custody_type: opts.custody_type || 'none',
      custody_start: opts.custody_start || null,
      custody_end:   opts.custody_end   || null,
      authority_level: opts.authority_level || (GUARDIAN_KINDS.includes(kind) ? 'full' : 'none'),
      is_emergency_contact: !!opts.is_emergency_contact,
      is_pickup_authorized: !!opts.is_pickup_authorized,
      notes: opts.notes || null
    }, opts));
    if (window.Family && Family.touch) Family.touch(family_id);
    return row;
  }

  function remove(rel_id){
    const r = DB.byId('family_relationships','rel_id', rel_id);
    if (!r) return false;
    const ok = DB.remove('family_relationships', rel_id);
    if (ok && window.Family && Family.touch) Family.touch(r.family_id);
    return ok;
  }

  /* ----- Queries ----- */
  function guardiansOf(member_id){
    const rels = byMember(member_id);
    if (!rels.length) return [];
    const famIds = [...new Set(rels.map(r => r.family_id))];
    const guardians = [];
    famIds.forEach(fid => {
      list(fid).forEach(r => {
        if (r.member_id !== member_id && GUARDIAN_KINDS.includes(r.relationship_kind)){
          if (!guardians.find(g => g.member_id===r.member_id))
            guardians.push({ member_id:r.member_id, kind:r.relationship_kind, rel:r });
        }
      });
    });
    return guardians;
  }
  function childrenOf(member_id){
    const rels = byMember(member_id).filter(r => GUARDIAN_KINDS.includes(r.relationship_kind));
    if (!rels.length) return [];
    const out = [];
    rels.forEach(r => {
      list(r.family_id).forEach(x => {
        if (x.member_id !== member_id && CHILD_KINDS.includes(x.relationship_kind)){
          if (!out.find(c => c.member_id===x.member_id))
            out.push({ member_id:x.member_id, kind:x.relationship_kind, rel:x });
        }
      });
    });
    return out;
  }
  function siblingsOf(member_id){
    const rels = byMember(member_id).filter(r => CHILD_KINDS.includes(r.relationship_kind));
    if (!rels.length) return [];
    const out = [];
    rels.forEach(r => {
      list(r.family_id).forEach(x => {
        if (x.member_id !== member_id && CHILD_KINDS.includes(x.relationship_kind)){
          if (!out.find(s => s.member_id===x.member_id))
            out.push({ member_id:x.member_id, kind:x.relationship_kind, rel:x });
        }
      });
    });
    return out;
  }

  /**
   * Build a relationship graph node list for a family, fed from both
   * (a) explicit family_relationships rows  AND
   * (b) implicit family_role on members records (legacy data).
   */
  function graph(family_id){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const members = window.Family && Family.familyMembers
      ? Family.familyMembers(family_id)
      : DB.filter('members', { family_id });

    const explicit = list(family_id);
    const byMid = new Map();
    members.forEach(m => byMid.set(m.member_id, {
      member: m, kinds: new Set(), authority: 'none',
      is_primary:false, is_emergency:false, is_pickup:false,
      custody_type:'none', rels:[]
    }));

    explicit.forEach(r => {
      const n = byMid.get(r.member_id);
      if (!n) return;
      n.kinds.add(r.relationship_kind);
      n.rels.push(r);
      if (r.is_primary) n.is_primary = true;
      if (r.is_emergency_contact) n.is_emergency = true;
      if (r.is_pickup_authorized) n.is_pickup = true;
      if (r.custody_type && r.custody_type !== 'none') n.custody_type = r.custody_type;
      if (r.authority_level && r.authority_level !== 'none') n.authority = r.authority_level;
    });

    // Inject implicit kinds from legacy family_role
    byMid.forEach(n => {
      const role = n.member.family_role;
      if (role === 'father' && !n.kinds.has('father')) n.kinds.add('father');
      else if (role === 'mother' && !n.kinds.has('mother')) n.kinds.add('mother');
      else if (role === 'child' && !n.kinds.has('son') && !n.kinds.has('daughter')){
        n.kinds.add(n.member.gender === 'female' ? 'daughter' : 'son');
      }
    });

    const nodes = [...byMid.values()].map(n => ({
      member_id: n.member.member_id,
      name: n.member.full_name,
      gender: n.member.gender,
      birth_date: n.member.birth_date,
      kinds: [...n.kinds],
      role_class: classifyRole([...n.kinds]),
      is_primary: n.is_primary,
      is_emergency: n.is_emergency,
      is_pickup: n.is_pickup,
      custody_type: n.custody_type,
      authority: n.authority
    }));

    // Edges: every guardian → every child within this family
    const guardians = nodes.filter(n => n.role_class === 'guardian');
    const children  = nodes.filter(n => n.role_class === 'child');
    const edges = [];
    guardians.forEach(g => children.forEach(c => {
      edges.push({ from:g.member_id, to:c.member_id, kind: edgeKind(g, c) });
    }));
    return { family: fam, nodes, edges, guardians, children };
  }

  function classifyRole(kinds){
    if (kinds.some(k => GUARDIAN_KINDS.includes(k))) return 'guardian';
    if (kinds.some(k => CHILD_KINDS.includes(k)))    return 'child';
    if (kinds.includes('sibling') || kinds.includes('relative') || kinds.includes('grandparent')) return 'relative';
    return 'other';
  }
  function edgeKind(g, c){
    if (g.custody_type === 'foster' || g.kinds.includes('foster_parent')) return 'foster';
    if (g.custody_type === 'temporary' || g.custody_type === 'emergency') return 'custody';
    if (g.kinds.includes('guardian') || g.kinds.includes('custodian'))    return 'guardian';
    if (g.kinds.includes('step_parent')) return 'step';
    return 'biological';
  }

  /* ----- Issue detection ----- */
  function detectIssues(family_id){
    const g = graph(family_id);
    if (!g) return [];
    const issues = [];
    const now = Date.now();

    // child(ren) without guardians
    if (g.children.length && !g.guardians.length){
      issues.push({ level:'critical', code:'no_guardian',
        message:'يوجد أبناء بدون أي وليّ مسجل', count:g.children.length });
    }
    // disconnected member (no kinds derivable)
    g.nodes.filter(n => !n.kinds.length).forEach(n => {
      issues.push({ level:'medium', code:'disconnected',
        message:'عضو غير مربوط بدور في الأسرة: '+n.name, member_id:n.member_id });
    });
    // missing primary guardian designation
    if (g.guardians.length && !g.guardians.some(x => x.is_primary)){
      issues.push({ level:'low', code:'no_primary_guardian',
        message:'لم يتم تحديد وليّ رئيسي للأسرة' });
    }
    // expired custody
    g.nodes.forEach(n => {
      n.kinds.forEach(_ => {
        const rels = byMember(n.member_id).filter(r => r.family_id===family_id);
        rels.forEach(r => {
          if (r.custody_end && new Date(r.custody_end).getTime() < now){
            issues.push({ level:'high', code:'expired_custody',
              message:'انتهت صلاحية الحضانة: '+n.name, member_id:n.member_id, rel_id:r.rel_id });
          }
        });
      });
    });
    // emergency contact missing
    if (g.children.length && !g.nodes.some(n => n.is_emergency)){
      issues.push({ level:'medium', code:'no_emergency_contact',
        message:'لا يوجد جهة اتصال طوارئ معتمدة' });
    }
    return issues;
  }

  window.Rel = {
    KINDS, PARENT_KINDS, GUARDIAN_KINDS, CHILD_KINDS,
    list, byMember, add, remove,
    guardiansOf, childrenOf, siblingsOf,
    graph, detectIssues
  };
})();

/* ----- family-attendance ----- */
/* ============================================================
   family-attendance.js — Family Attendance Intelligence
   Aggregates attendance_records for entire families.
   Exposes window.FamilyAttendance + extends window.Family.attendance.
   ============================================================ */
(function(){
  if (!window.DB) return;

  const DAY  = 864e5;
  const WEEK = 7 * DAY;

  function fMembers(family_id){
    return window.Family && Family.familyMembers
      ? Family.familyMembers(family_id)
      : DB.filter('members', { family_id });
  }

  function memberRecords(member_id, sinceMs){
    return DB.filter('attendance_records', r =>
      r.member_id === member_id &&
      new Date(r.check_in_at).getTime() >= sinceMs
    );
  }

  function sessionsSince(sinceMs){
    return DB.filter('attendance_sessions', s =>
      new Date(s.starts_at || s.date || s.created_at).getTime() >= sinceMs);
  }

  function pct(part, whole){
    if (!whole) return 0;
    return Math.max(0, Math.min(100, Math.round((part/whole)*100)));
  }

  /* ----- Core aggregate metrics ----- */
  function metrics(family_id){
    const members = fMembers(family_id);
    const now = Date.now();
    const weeklyCut  = now - 7*DAY;
    const monthlyCut = now - 30*DAY;
    const trendCut   = now - 56*DAY; // 8 weeks

    const weekSessions  = sessionsSince(weeklyCut).length  || 1;
    const monthSessions = sessionsSince(monthlyCut).length || 1;

    const weekRecs   = members.reduce((s,m)=> s + memberRecords(m.member_id, weeklyCut).length, 0);
    const monthRecs  = members.reduce((s,m)=> s + memberRecords(m.member_id, monthlyCut).length, 0);

    const weekly_pct  = members.length ? pct(weekRecs,  weekSessions  * members.length) : 0;
    const monthly_pct = members.length ? pct(monthRecs, monthSessions * members.length) : 0;

    // parent / child split
    const parents  = members.filter(m => m.family_role === 'father' || m.family_role === 'mother');
    const children = members.filter(m => m.family_role === 'child');
    const parentRecs  = parents.reduce((s,m)=>  s + memberRecords(m.member_id, monthlyCut).length, 0);
    const childRecs   = children.reduce((s,m)=> s + memberRecords(m.member_id, monthlyCut).length, 0);
    const parent_participation = parents.length  ? pct(parentRecs, monthSessions * parents.length)  : 0;
    const child_participation  = children.length ? pct(childRecs,  monthSessions * children.length) : 0;

    // consistency: stddev-ish proxy — % of weeks in last 8 with at least 1 attendance
    const buckets = new Array(8).fill(0);
    members.forEach(m => memberRecords(m.member_id, trendCut).forEach(r => {
      const w = Math.floor((now - new Date(r.check_in_at).getTime())/WEEK);
      if (w>=0 && w<8) buckets[w]++;
    }));
    const activeWeeks = buckets.filter(b => b>0).length;
    const consistency_score = pct(activeWeeks, 8);

    // consecutive absences (weeks from most recent backwards with zero records)
    let consecutive_absences = 0;
    for (let i=0;i<8;i++){ if (buckets[i]===0) consecutive_absences++; else break; }

    // trend: compare last 4 weeks vs prior 4 weeks
    const recent = buckets.slice(0,4).reduce((a,b)=>a+b,0);
    const prior  = buckets.slice(4,8).reduce((a,b)=>a+b,0);
    let engagement_trend = 'stable';
    if (recent === 0 && prior === 0) engagement_trend = 'unknown';
    else if (recent > prior * 1.15) engagement_trend = 'rising';
    else if (recent < prior * 0.85) engagement_trend = 'declining';

    // flag: inactive guardians but children active
    const inactiveGuardiansActiveChildren =
      parents.length>0 && parentRecs === 0 && childRecs > 0;
    const fullFamilyAbsence = monthRecs === 0;

    return {
      family_id,
      weekly_pct, monthly_pct,
      consistency_score,
      parent_participation, child_participation,
      consecutive_absences, engagement_trend,
      buckets,
      flags: {
        inactive_guardians_active_children: inactiveGuardiansActiveChildren,
        full_family_absence: fullFamilyAbsence,
        declining: engagement_trend === 'declining'
      },
      computed_at: new Date().toISOString()
    };
  }

  /* ----- Heatmap (weeks × members) — returns plain HTML ----- */
  function heatmapHtml(family_id, weeks){
    weeks = weeks || 12;
    const members = fMembers(family_id);
    const now = Date.now();
    const cells = members.map(m => {
      const recs = memberRecords(m.member_id, now - weeks*WEEK);
      const arr = new Array(weeks).fill(0);
      recs.forEach(r => {
        const w = Math.floor((now - new Date(r.check_in_at).getTime())/WEEK);
        if (w>=0 && w<weeks) arr[w]++;
      });
      return { name:m.full_name, arr };
    });
    const shade = n => n===0 ? '#e5e7eb' : n===1 ? '#bbf7d0' : n===2 ? '#4ade80' : '#16a34a';
    const head = `<th></th>` + Array.from({length:weeks}, (_,i)=>`<th style="font-size:.65rem;color:#888">w-${weeks-i}</th>`).join('');
    const rows = cells.map(c =>
      `<tr><td style="font-weight:600;white-space:nowrap">${c.name}</td>` +
      c.arr.slice().reverse().map(v =>
        `<td title="${v} حضور" style="padding:2px"><div style="width:14px;height:14px;border-radius:3px;background:${shade(v)}"></div></td>`
      ).join('') + `</tr>`
    ).join('');
    if (!cells.length) return '<div class="empty">لا يوجد أفراد</div>';
    return `<div style="overflow:auto"><table style="border-collapse:collapse"><thead><tr>${head}</tr></thead><tbody>${rows}</tbody></table></div>`;
  }

  /* ----- Cache write ----- */
  function recompute(family_id){
    const m = metrics(family_id);
    const existing = DB.find('family_scores', { family_id });
    const patch = {
      attendance_weekly_pct:  m.weekly_pct,
      attendance_monthly_pct: m.monthly_pct,
      consistency_score:      m.consistency_score,
      parent_participation:   m.parent_participation,
      child_participation:    m.child_participation,
      consecutive_absences:   m.consecutive_absences,
      engagement_trend:       m.engagement_trend,
      computed_at:            m.computed_at
    };
    if (existing) DB.update('family_scores', existing.score_id, patch);
    else          DB.insert('family_scores', Object.assign({ family_id }, patch));
    return m;
  }

  function recomputeAll(){
    const fams = DB.findAll('families');
    fams.forEach(f => recompute(f.family_id));
    return fams.length;
  }

  window.FamilyAttendance = { metrics, heatmapHtml, recompute, recomputeAll };
  if (window.Family) window.Family.attendance = window.FamilyAttendance;

  /* Auto-recompute on attendance writes */
  if (DB.on){
    DB.on((op, table, row) => {
      if (table !== 'attendance_records' || op !== 'insert' || !row) return;
      const member = DB.byId('members','member_id', row.member_id);
      if (member && member.family_id){
        try { recompute(member.family_id); } catch(_){}
        try { window.FamilyRisk && FamilyRisk.recompute(member.family_id); } catch(_){}
      }
    });
  }
})();

/* ----- family-risk ----- */
/* ============================================================
   family-risk.js — Family Risk Intelligence Engine
   Composite score from attendance / service / financial / followup / stability.
   Updates families.risk_status, raises notifications, creates followups.
   ============================================================ */
(function(){
  if (!window.DB) return;

  const LEVEL_THRESHOLDS = { medium:30, high:55, critical:80 };

  function levelFor(score){
    if (score >= LEVEL_THRESHOLDS.critical) return 'critical';
    if (score >= LEVEL_THRESHOLDS.high)     return 'high';
    if (score >= LEVEL_THRESHOLDS.medium)   return 'medium';
    return 'low';
  }

  function fMembers(family_id){
    return window.Family && Family.familyMembers
      ? Family.familyMembers(family_id)
      : DB.filter('members', { family_id });
  }

  /* ---------- Sub-scores ---------- */

  function attendanceRisk(family_id){
    const m = window.FamilyAttendance
      ? FamilyAttendance.metrics(family_id)
      : null;
    if (!m) return { score:0, reasons:[] };
    let s = 0; const reasons = [];
    if (m.flags.full_family_absence)    { s += 35; reasons.push('غياب كامل للأسرة هذا الشهر'); }
    if (m.consecutive_absences >= 4)    { s += 25; reasons.push('غياب متتالٍ '+m.consecutive_absences+' أسابيع'); }
    else if (m.consecutive_absences>=2) { s += 12; reasons.push('غياب متتالٍ '+m.consecutive_absences+' أسابيع'); }
    if (m.engagement_trend === 'declining') { s += 15; reasons.push('انخفاض حاد في الحضور'); }
    if (m.flags.inactive_guardians_active_children) {
      s += 18; reasons.push('الأولياء غير حاضرين بينما الأبناء يحضرون');
    }
    if (m.monthly_pct < 25 && !m.flags.full_family_absence){
      s += 10; reasons.push('معدل حضور شهري منخفض ('+m.monthly_pct+'%)');
    }
    return { score: Math.min(60, s), reasons };
  }

  function followupRisk(family_id){
    const members = fMembers(family_id);
    if (!members.length) return { score:0, reasons:[] };
    const tasks = DB.filter('followups', t =>
      members.some(m => m.member_id===t.member_id) &&
      ['open','in_progress','pending','escalated'].includes(t.status));
    const unresolved = tasks.length;
    const escalated = tasks.filter(t => t.status==='escalated' || (t.escalation_level||0) > 0).length;
    let s = 0; const reasons = [];
    if (unresolved >= 3) { s += 15; reasons.push(unresolved+' مهام افتقاد غير محلولة'); }
    else if (unresolved >= 1) { s += 6; reasons.push(unresolved+' مهام مفتوحة'); }
    if (escalated > 0)  { s += 10; reasons.push(escalated+' مهام مُصعَّدة'); }
    return { score: Math.min(25, s), reasons };
  }

  function serviceRisk(family_id){
    const members = fMembers(family_id);
    if (!members.length) return { score:0, reasons:[] };
    const adults = members.filter(m => m.age_stage === 'adult' || m.age_stage === 'youth');
    if (!adults.length) return { score:0, reasons:[] };
    const servingAdults = adults.filter(m => m.is_servant || m.service_role || m.assigned_servant_id).length;
    let s = 0; const reasons = [];
    if (servingAdults === 0) { s += 8; reasons.push('لا يوجد أي خادم نشط في الأسرة'); }
    return { score: Math.min(15, s), reasons };
  }

  function financialRisk(family_id){
    let s = 0; const reasons = [];
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return { score:0, reasons:[] };
    const members = fMembers(family_id);
    const since = Date.now() - 180*864e5; // 6 months
    const tx = DB.filter('financial_transactions', t =>
      t.type === 'donation' &&
      members.some(m => m.member_id === t.member_id) &&
      new Date(t.transaction_date || t.created_at || 0).getTime() >= since
    );
    // Optional: legacy support_requests / assistance flags
    const assisted = (fam.financial_status === 'assisted' || fam.financial_status === 'dependent');
    if (!tx.length && !assisted) { s += 6; reasons.push('لا توجد مساهمات خلال 6 أشهر'); }
    if (assisted) { s += 4; reasons.push('أسرة تتلقى دعمًا — يلزم متابعة'); }
    return { score: Math.min(15, s), reasons };
  }

  function stabilityRisk(family_id){
    let s = 0; const reasons = [];
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return { score:0, reasons:[] };
    const issues = window.Rel ? Rel.detectIssues(family_id) : [];
    issues.forEach(i => {
      if (i.level === 'critical') s += 18;
      else if (i.level === 'high') s += 10;
      else if (i.level === 'medium') s += 5;
      else s += 2;
      reasons.push(i.message);
    });
    // recent movement churn
    const recentMovements = DB.filter('family_movement_log', l =>
      l.family_id === family_id &&
      Date.now() - new Date(l.occurred_at).getTime() < 60*864e5).length;
    if (recentMovements >= 3){ s += 8; reasons.push('تغيرات متعددة في الأسرة مؤخرًا'); }
    return { score: Math.min(35, s), reasons };
  }

  /* ---------- Compose ---------- */
  function recompute(family_id){
    const att = attendanceRisk(family_id);
    const fu  = followupRisk(family_id);
    const sv  = serviceRisk(family_id);
    const fn  = financialRisk(family_id);
    const st  = stabilityRisk(family_id);
    const total = Math.min(100, att.score + fu.score + sv.score + fn.score + st.score);
    const level = levelFor(total);
    const stability_score = Math.max(0, 100 - st.score*2);

    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;

    DB.update('families', family_id, { risk_status: level });

    const existing = DB.find('family_scores', { family_id });
    const patch = {
      attendance_risk: att.score,
      service_risk:    sv.score,
      financial_risk:  fn.score,
      followup_risk:   fu.score,
      stability_risk:  st.score,
      risk_total:      total,
      risk_level:      level,
      stability_score, computed_at: new Date().toISOString()
    };
    if (existing) DB.update('family_scores', existing.score_id, patch);
    else          DB.insert('family_scores', Object.assign({ family_id }, patch));

    const reasons = [].concat(att.reasons, fu.reasons, sv.reasons, fn.reasons, st.reasons);

    if (level === 'high' || level === 'critical'){
      ensureFamilyFollowup(family_id, level, reasons);
      raiseNotification(fam, level, reasons);
    }

    return { family_id, total, level, stability_score, sub:{att,fu,sv,fn,st}, reasons };
  }

  function ensureFamilyFollowup(family_id, level, reasons){
    const members = fMembers(family_id);
    if (!members.length) return;
    const anchor = members.find(m => m.family_role==='father')
                || members.find(m => m.family_role==='mother')
                || members[0];
    if (!anchor) return;
    const reason = (level==='critical' ? 'أسرة عالية الخطورة' : 'أسرة بحاجة متابعة') +
                   ' — ' + (reasons[0] || '');
    const existing = DB.find('followups', t =>
      t.member_id === anchor.member_id &&
      ['open','in_progress','pending','escalated'].includes(t.status) &&
      typeof t.reason === 'string' && t.reason.indexOf('أسرة') === 0
    );
    if (existing){
      DB.update('followups', existing.task_id, {
        priority: level==='critical'?'urgent':'high',
        reason
      });
      return existing;
    }
    return DB.insert('followups', {
      member_id: anchor.member_id,
      family_id,
      reason,
      status:'pending',
      priority: level==='critical' ? 'urgent' : 'high',
      auto_generated:true,
      source:'family_risk',
      created_by: (window.Auth && Auth.session()?.user_id) || null,
      due_at: new Date(Date.now() + 48*36e5).toISOString()
    });
  }

  function raiseNotification(fam, level, reasons){
    const s = window.Auth && Auth.session();
    if (!s) return;
    // dedupe: skip if same unread alert exists for the same family
    const dup = DB.find('notifications', n =>
      !n.is_read && n.user_id===s.user_id &&
      n.type==='alert' && n.link && n.link.indexOf(fam.family_id) >= 0);
    if (dup) return;
    DB.insert('notifications', {
      user_id: s.user_id,
      title: (level==='critical' ? '⚠️ أسرة حرجة: ' : '⚠️ أسرة عالية الخطورة: ') + (fam.family_name||fam.family_code),
      body: reasons.slice(0,3).join(' — ') || 'يلزم متابعة',
      type:'alert',
      priority: level==='critical' ? 'critical' : 'high',
      link: 'family-profile.html?family_id='+fam.family_id,
      is_read:false
    });
  }

  function recomputeAll(){
    const fams = DB.findAll('families');
    const out = { total:fams.length, high:0, critical:0 };
    fams.forEach(f => {
      const r = recompute(f.family_id);
      if (r && r.level === 'high') out.high++;
      if (r && r.level === 'critical') out.critical++;
    });
    return out;
  }

  function topAt(n, minLevel){
    n = n || 5;
    const order = { critical:4, high:3, medium:2, low:1 };
    const min = order[minLevel || 'high'];
    return DB.findAll('families')
      .map(f => {
        const sc = DB.find('family_scores', { family_id:f.family_id });
        return { fam:f, score: sc?.risk_total || 0, level: sc?.risk_level || f.risk_status || 'low' };
      })
      .filter(x => (order[x.level]||1) >= min)
      .sort((a,b)=> b.score - a.score)
      .slice(0, n);
  }

  window.FamilyRisk = {
    LEVEL_THRESHOLDS, levelFor,
    recompute, recomputeAll, topAt,
    attendanceRisk, followupRisk, serviceRisk, financialRisk, stabilityRisk
  };
  if (window.Family) window.Family.risk = window.FamilyRisk;
})();

/* ----- family-spiritual ----- */
/* family-spiritual.js — Section 6: Spiritual life engine */
(function(){
  if (!window.DB){ console.warn('[family-spiritual] DB missing'); return; }
  const T='family_spiritual_records';
  const Spiritual = {
    add(rec){
      const row = Object.assign({
        record_id: DB.uuid(), created_at: new Date().toISOString(),
        status:'completed', score:0
      }, rec);
      DB.insert(T, row); this._touch(rec.family_id); return row;
    },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    summary(family_id){
      const rows=this.listByFamily(family_id);
      const completed=rows.filter(r=>r.status==='completed').length;
      const overdue=rows.filter(r=>r.status==='overdue' || (r.next_due_at && r.next_due_at < new Date().toISOString().slice(0,10) && r.status!=='completed')).length;
      const score = Math.max(0, Math.min(100, 50 + completed*5 - overdue*10));
      let status='unknown';
      if (rows.length===0) status='unknown';
      else if (score>=75) status='growing';
      else if (score>=55) status='stable';
      else if (score>=35) status='declining';
      else status='disconnected';
      return { total:rows.length, completed, overdue, score, status };
    },
    _touch(family_id){
      const s=this.summary(family_id);
      DB.update('families',{family_id},{spiritual_status:s.status, last_activity_at:new Date().toISOString()});
    }
  };
  window.Spiritual = Spiritual;
})();

/* ----- family-serving ----- */
/* family-serving.js — Section 7: Serving / ministry engine */
(function(){
  if (!window.DB){ console.warn('[family-serving] DB missing'); return; }
  const T='family_serving_assignments';
  const Serving = {
    assign(rec){
      const row = Object.assign({
        assignment_id: DB.uuid(), created_at:new Date().toISOString(),
        status:'active', hours_per_month:0
      }, rec);
      DB.insert(T,row); this._touch(rec.family_id); return row;
    },
    end(assignment_id, ended_at){
      DB.update(T,{assignment_id},{status:'ended', ended_at: ended_at||new Date().toISOString().slice(0,10)});
    },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id);
    },
    summary(family_id){
      const rows=this.listByFamily(family_id);
      const active=rows.filter(r=>r.status==='active');
      const ministries=[...new Set(active.map(r=>r.ministry))];
      const totalHours=active.reduce((s,r)=>s+(+r.hours_per_month||0),0);
      let status='unknown';
      if (rows.length===0) status='unknown';
      else if (active.length===0) status='inactive';
      else if (active.length>=2 || totalHours>=8) status='serving';
      else status='partial';
      return { total:rows.length, active:active.length, ministries, totalHours, status };
    },
    _touch(family_id){
      const s=this.summary(family_id);
      DB.update('families',{family_id},{service_status:s.status});
    }
  };
  window.Serving = Serving;
})();

/* ----- family-financial ----- */
/* family-financial.js — Section 8: Financial engine (read/aggregate) */
(function(){
  if (!window.DB){ console.warn('[family-financial] DB missing'); return; }
  const T='family_financial_records';
  const Financial = {
    record(rec){
      const row = Object.assign({
        record_id:DB.uuid(), created_at:new Date().toISOString(),
        amount:0, currency:'EGP', method:'cash',
        occurred_at:new Date().toISOString().slice(0,10)
      }, rec);
      DB.insert(T,row); this._touch(rec.family_id); return row;
    },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    summary(family_id){
      const rows=this.listByFamily(family_id);
      const now=new Date();
      const cutoff=new Date(now.getFullYear(),now.getMonth()-5,1).toISOString().slice(0,10);
      const recent=rows.filter(r=>r.occurred_at>=cutoff);
      const monthly={};
      recent.forEach(r=>{
        const k=(r.occurred_at||'').slice(0,7);
        const sign = (r.kind==='assistance_out')?-1:1;
        monthly[k]=(monthly[k]||0)+sign*(+r.amount||0);
      });
      const months=Object.keys(monthly).sort();
      const values=months.map(m=>monthly[m]);
      const totalIn=recent.filter(r=>r.kind!=='assistance_out').reduce((s,r)=>s+(+r.amount||0),0);
      const assistance=recent.filter(r=>r.kind==='assistance_out').reduce((s,r)=>s+(+r.amount||0),0);
      // consistency: % months with any contribution out of last 6
      const last6=[];
      for (let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1);
        last6.push(d.toISOString().slice(0,7)); }
      const active=last6.filter(m=>(monthly[m]||0)>0).length;
      const consistencyPct=Math.round(active/6*100);
      let status='unknown';
      if (recent.length===0) status='unknown';
      else if (assistance>totalIn) status='assisted';
      else if (consistencyPct>=80) status='consistent';
      else if (consistencyPct>=40) status='irregular';
      else status='dependent';
      return { totalIn, assistance, months:last6, values:last6.map(m=>monthly[m]||0), consistencyPct, status };
    },
    _touch(family_id){
      const s=this.summary(family_id);
      DB.update('families',{family_id},{financial_status:s.status});
    }
  };
  window.Financial = Financial;
})();

/* ----- family-emergency ----- */
/* family-emergency.js — Section 10: Emergency contacts + comms log */
(function(){
  if (!window.DB){ console.warn('[family-emergency] DB missing'); return; }
  const TC='family_emergency_contacts', TL='family_emergency_log';
  const Emergency = {
    addContact(c){
      const row=Object.assign({contact_id:DB.uuid(),created_at:new Date().toISOString(),priority:1,is_pickup_authorized:false},c);
      DB.insert(TC,row); return row;
    },
    removeContact(contact_id){ DB.remove(TC,{contact_id}); },
    contactsOf(family_id){
      return (DB.select(TC)||[]).filter(c=>c.family_id===family_id)
        .sort((a,b)=>(a.priority||9)-(b.priority||9));
    },
    log(rec){
      const row=Object.assign({
        log_id:DB.uuid(), occurred_at:new Date().toISOString(),
        severity:'info', channel:'call'
      }, rec);
      DB.insert(TL,row);
      if (row.severity==='urgent'||row.severity==='critical'){
        DB.update('families',{family_id:rec.family_id},{emergency_status:'active'});
      }
      return row;
    },
    logsOf(family_id){
      return (DB.select(TL)||[]).filter(l=>l.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    broadcast(family_id, subject, body, channel){
      // Pure JS broadcast — logs every contact; integrators wire real SMS/WhatsApp later
      const contacts=this.contactsOf(family_id);
      contacts.forEach(c=>{
        this.log({family_id, severity:'urgent', channel:channel||'sms',
          subject, body:`${body}\n→ ${c.name} (${c.phone||'-'})`});
      });
      return contacts.length;
    },
    clear(family_id){
      DB.update('families',{family_id},{emergency_status:'none'});
    }
  };
  window.Emergency = Emergency;
})();

/* ----- family-custody ----- */
/* family-custody.js — Section 9: Legal custody records */
(function(){
  if (!window.DB){ console.warn('[family-custody] DB missing'); return; }
  const T='family_custody_legal';
  const Custody = {
    add(rec){
      const row=Object.assign({
        custody_id:DB.uuid(), created_at:new Date().toISOString(),
        status:'active', custody_type:'none', authority_level:'none'
      }, rec);
      DB.insert(T,row);
      DB.insert('family_movement_log',{
        movement_id:DB.uuid(), church_id:rec.church_id, family_id:rec.family_id,
        kind:'custody_change', from_value:null, to_value:row.custody_type,
        related_id:row.child_id, notes:row.notes||null,
        occurred_at:new Date().toISOString(), created_at:new Date().toISOString()
      });
      return row;
    },
    update(custody_id, patch){ DB.update(T,{custody_id},patch); },
    revoke(custody_id){ DB.update(T,{custody_id},{status:'revoked'}); },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id);
    },
    activeFor(child_id){
      const today=new Date().toISOString().slice(0,10);
      return (DB.select(T)||[]).filter(r=>
        r.child_id===child_id && r.status==='active' &&
        (!r.valid_until || r.valid_until>=today));
    },
    expiringSoon(family_id, days){
      const d=days||30;
      const limit=new Date(Date.now()+d*864e5).toISOString().slice(0,10);
      const today=new Date().toISOString().slice(0,10);
      return this.listByFamily(family_id).filter(r=>
        r.status==='active' && r.valid_until && r.valid_until>=today && r.valid_until<=limit);
    },
    issues(family_id){
      const out=[];
      this.listByFamily(family_id).forEach(r=>{
        const today=new Date().toISOString().slice(0,10);
        if (r.status==='active' && r.valid_until && r.valid_until<today){
          out.push({custody_id:r.custody_id, type:'expired', child_id:r.child_id});
        }
        if (r.custody_type==='temporary' && !r.valid_until){
          out.push({custody_id:r.custody_id, type:'temporary_no_end', child_id:r.child_id});
        }
      });
      return out;
    }
  };
  window.Custody = Custody;
})();

/* ----- family-movement-ui ----- */
/* family-movement-ui.js — Section 11: Movement audit UI helpers */
(function(){
  if (!window.DB){ console.warn('[family-movement-ui] DB missing'); return; }
  const KIND_LABEL_AR = {
    transfer:'نقل بين كنائس', address_change:'تغيير عنوان',
    split:'انفصال', merge:'دمج', guardian_change:'تغيير وصي',
    custody_change:'تغيير حضانة', service_change:'تغيير خدمة',
    attendance_pattern_change:'تغير نمط الحضور', status_change:'تغيير حالة',
    member_added:'إضافة فرد', member_removed:'إزالة فرد'
  };
  const MovementUI = {
    timeline(family_id){
      return (DB.select('family_movement_log')||[])
        .filter(m=>m.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    label(kind){ return KIND_LABEL_AR[kind]||kind; },
    renderHTML(family_id){
      const rows=this.timeline(family_id);
      if (!rows.length) return '<div class="muted">لا يوجد سجل حركات.</div>';
      return `<ul class="movement-timeline" style="list-style:none;padding:0">
        ${rows.map(r=>`
          <li style="border-right:3px solid #c79a3a;padding:8px 12px;margin:6px 0;background:#fff8e7;border-radius:6px">
            <div style="font-weight:bold">${MovementUI.label(r.kind)}</div>
            <div style="font-size:.85em;color:#666">
              ${r.from_value?('من: '+r.from_value+' '):''}${r.to_value?('إلى: '+r.to_value):''}
            </div>
            ${r.notes?`<div style="font-size:.85em">${r.notes}</div>`:''}
            <div style="font-size:.75em;color:#999">${(r.occurred_at||'').replace('T',' ').slice(0,16)}</div>
          </li>`).join('')}
      </ul>`;
    }
  };
  window.MovementUI = MovementUI;
})();

/* ----- family-workflows ----- */
/* family-workflows.js — Section 13: Automated workflow triggers */
(function(){
  if (!window.DB){ console.warn('[family-workflows] DB missing'); return; }
  const T='family_workflow_triggers';

  function fire(family_id, rule, action, payload){
    const fam=(DB.select('families')||[]).find(f=>f.family_id===family_id);
    if (!fam) return;
    DB.insert(T,{trigger_id:DB.uuid(), church_id:fam.church_id, family_id,
      rule, action, fired_at:new Date().toISOString(), payload:payload||null});
    if (action==='create_followup' && window.DB.select('followup_tasks')!==undefined){
      DB.insert('followup_tasks',{
        task_id:DB.uuid(), church_id:fam.church_id, family_id,
        title:payload?.title || rule, priority:payload?.priority || 'medium',
        status:'open', created_at:new Date().toISOString()
      });
    }
    if (action==='notify' && window.DB.select('notifications')!==undefined){
      DB.insert('notifications',{
        notification_id:DB.uuid(), church_id:fam.church_id, family_id,
        type:payload?.type||'family_workflow', title:payload?.title||rule,
        body:payload?.body||'', severity:payload?.severity||'info',
        created_at:new Date().toISOString()
      });
    }
  }

  const Rules = [
    { id:'financial_drop',
      check(fid){ if (!window.Financial) return null;
        const s=Financial.summary(fid);
        if (s.status==='irregular' || s.status==='dependent')
          return {title:'انخفاض ملحوظ في العطاء — متابعة برعاية', priority:'medium', severity:'warn'};
        return null;
      }, action:'create_followup' },
    { id:'service_inactive',
      check(fid){ if (!window.Serving) return null;
        const s=Serving.summary(fid);
        if (s.status==='inactive')
          return {title:'الأسرة غير منخرطة في الخدمة — اقتراح خدمة مناسبة', priority:'low', severity:'info'};
        return null;
      }, action:'create_followup' },
    { id:'spiritual_decline',
      check(fid){ if (!window.Spiritual) return null;
        const s=Spiritual.summary(fid);
        if (s.status==='declining' || s.status==='disconnected')
          return {title:'تراجع روحي — تواصل من أب الاعتراف', priority:'high', severity:'warn'};
        return null;
      }, action:'create_followup' },
    { id:'custody_expiring',
      check(fid){ if (!window.Custody) return null;
        const e=Custody.expiringSoon(fid,30);
        if (e.length) return {title:`وثيقة حضانة على وشك الانتهاء (${e.length})`, severity:'warn', priority:'high'};
        return null;
      }, action:'notify' },
    { id:'emergency_active',
      check(fid){ const f=(DB.select('families')||[]).find(x=>x.family_id===fid);
        if (f && f.emergency_status==='active')
          return {title:'حالة طارئة نشطة', severity:'urgent'};
        return null;
      }, action:'notify' }
  ];

  function runAll(family_id){
    Rules.forEach(r=>{ try{
      const p=r.check(family_id); if (p) fire(family_id, r.id, r.action, p);
    }catch(e){ console.warn('[workflows]',r.id,e); } });
  }

  function runAllFamilies(){
    (DB.select('families')||[]).forEach(f=>runAll(f.family_id));
  }

  // Hook on inserts to relevant tables
  if (DB.on){
    ['family_financial_records','family_serving_assignments','family_spiritual_records',
     'family_custody_legal','family_emergency_log']
      .forEach(t=>DB.on('insert',t,row=>{ if (row && row.family_id) runAll(row.family_id); }));
  }

  window.FamilyWorkflows = { fire, runAll, runAllFamilies, Rules };
})();

/* ----- family-ai ----- */
/* family-ai.js — Section 14: AI insights layer (heuristic, offline) */
(function(){
  if (!window.DB){ console.warn('[family-ai] DB missing'); return; }
  const T='family_ai_insights';

  function push(family_id, church_id, ins){
    DB.insert(T, Object.assign({
      insight_id:DB.uuid(), church_id, family_id,
      computed_at:new Date().toISOString(), confidence:65
    }, ins));
  }

  function compute(family_id){
    const fam=(DB.select('families')||[]).find(f=>f.family_id===family_id);
    if (!fam) return [];
    // Clear previous snapshot
    (DB.select(T)||[]).filter(i=>i.family_id===family_id).forEach(i=>DB.remove(T,{insight_id:i.insight_id}));
    const out=[];
    function add(o){ push(family_id, fam.church_id, o); out.push(o); }

    if (window.FamilyAttendance){
      const a=FamilyAttendance.summary(family_id);
      if (a.consecutive_absences>=3) add({category:'attendance',severity:'urgent',
        headline:`غياب متتالي ${a.consecutive_absences} مرات`,
        detail:'يُنصح بزيارة بيتيّة عاجلة وتفعيل خدمة رعوية مكثفة.', confidence:85});
      else if (a.engagement_trend==='declining') add({category:'attendance',severity:'warn',
        headline:'تراجع تدريجي في الحضور', detail:'تواصل ودي + دعوة للأنشطة القادمة.', confidence:70});
      else if (a.attendance_monthly_pct>=80) add({category:'attendance',severity:'info',
        headline:'عائلة منتظمة الحضور', detail:'مرشحة لخدمة قيادية أو رعاية أسرة أخرى.', confidence:75});
    }
    if (window.Spiritual){
      const s=Spiritual.summary(family_id);
      if (s.status==='disconnected') add({category:'spiritual',severity:'urgent',
        headline:'انقطاع روحي واضح', detail:'إسناد أب اعتراف وبرنامج عودة تدريجي.', confidence:80});
      else if (s.overdue>0) add({category:'spiritual',severity:'suggestion',
        headline:`${s.overdue} استحقاق روحي متأخر`, detail:'جدولة الأسرار/الدروس المتأخرة.', confidence:70});
    }
    if (window.Serving){
      const s=Serving.summary(family_id);
      if (s.status==='inactive') add({category:'serving',severity:'suggestion',
        headline:'لا توجد خدمة نشطة', detail:'اقترح خدمات تناسب أعمار ومواهب الأعضاء.', confidence:65});
      else if (s.active>=3) add({category:'serving',severity:'info',
        headline:`عائلة خادمة بقوة (${s.active} مهام)`,
        detail:'انتبه لخطر الإرهاق — راجع توزيع الأعباء.', confidence:60});
    }
    if (window.Financial){
      const f=Financial.summary(family_id);
      if (f.status==='dependent' || f.status==='assisted') add({category:'financial',severity:'warn',
        headline:'الأسرة في وضع يحتاج دعم', detail:'فعّل لجنة المحبة + متابعة شهرية سرية.', confidence:75});
      else if (f.status==='consistent') add({category:'financial',severity:'info',
        headline:'عطاء منتظم', detail:'يمكن دعوتهم لرعاية مالية لأسرة أخرى.', confidence:60});
    }
    if (window.Custody){
      const issues=Custody.issues(family_id);
      if (issues.length) add({category:'risk',severity:'urgent',
        headline:`مشاكل حضانة (${issues.length})`, detail:'مراجعة وثائق الحضانة المنتهية/غير المكتملة.', confidence:90});
    }
    if (window.Rel){
      const probs=Rel.detectIssues(family_id);
      if (probs.length) add({category:'relationships',severity:'warn',
        headline:`مشاكل بنية أسرية (${probs.length})`,
        detail:'أعضاء بدون أوصياء أو علاقات ناقصة — راجع شجرة العائلة.', confidence:80});
    }
    if (fam.risk_status==='critical') add({category:'risk',severity:'urgent',
      headline:'الأسرة في خطر حرج', detail:'فعّل بروتوكول الرعاية الطارئة الشامل.', confidence:95});

    if (out.length===0) add({category:'general',severity:'info',
      headline:'الوضع العام مستقر', detail:'لا توجد إشارات تستدعي تدخلاً الآن.', confidence:55});
    return out;
  }

  function listByFamily(family_id){
    return (DB.select(T)||[]).filter(i=>i.family_id===family_id)
      .sort((a,b)=>(b.computed_at||'').localeCompare(a.computed_at||''));
  }

  function computeAll(){ (DB.select('families')||[]).forEach(f=>compute(f.family_id)); }

  window.FamilyAI = { compute, computeAll, listByFamily };
})();
