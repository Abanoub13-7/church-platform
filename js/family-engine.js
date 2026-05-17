/* ============================================================
   FAMILY-ENGINE.js — Family-Centered Church Census Core
   Family is the primary entity. Members link via family_id.
   ============================================================ */
(function(){
  function genFamilyId(){
    const year = new Date().getFullYear();
    const list = DB._raw('families') || [];
    const cid  = (window.Auth && Auth.session()) ? Auth.session().church_id : null;
    const scope = list.filter(f => !cid || f.church_id === cid);
    let max = 0;
    scope.forEach(f => {
      const m = /FAM-\d{4}-(\d{4,})$/.exec(f.family_code || '');
      if (m) max = Math.max(max, parseInt(m[1],10));
    });
    return `FAM-${year}-${String(max+1).padStart(4,'0')}`;
  }

  function calcAge(birth){
    return window.Hierarchy ? Hierarchy.ageFromBirth(birth) : null;
  }

  /* Create family + automatically create member records for father/mother/children */
  function createFamily(data){
    const fam = {
      family_id: data.family_id,
      family_code: data.family_code || genFamilyId(),
      family_name: data.family_name || '',
      area: data.area || '',
      city: data.city || '',
      address: data.address || '',
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      primary_phone: data.primary_phone || '',
      secondary_phone: data.secondary_phone || '',
      family_status: data.family_status || 'active',
      notes: data.notes || '',
      registration_date: data.registration_date || new Date().toISOString(),
      father_name: data.father_name || '',
      father_birth_date: data.father_birth_date || null,
      father_phone: data.father_phone || '',
      father_job: data.father_job || '',
      father_spiritual_status: data.father_spiritual_status || '',
      father_notes: data.father_notes || '',
      mother_name: data.mother_name || '',
      mother_birth_date: data.mother_birth_date || null,
      mother_phone: data.mother_phone || '',
      mother_job: data.mother_job || '',
      mother_spiritual_status: data.mother_spiritual_status || '',
      mother_notes: data.mother_notes || '',
      followup_notes: data.followup_notes || '',
      visitation_notes: data.visitation_notes || '',
      special_conditions: data.special_conditions || '',
      emergency_notes: data.emergency_notes || ''
    };
    const saved = DB.insert('families', fam);

    // Create father member
    if (saved.father_name){
      DB.insert('members', {
        full_name: saved.father_name,
        gender: 'male',
        birth_date: saved.father_birth_date,
        phone: saved.father_phone,
        job: saved.father_job,
        family_id: saved.family_id,
        family_role: 'father',
        member_status: 'active',
        age_stage: Hierarchy.stageFromBirth(saved.father_birth_date) || 'adult'
      });
    }
    if (saved.mother_name){
      DB.insert('members', {
        full_name: saved.mother_name,
        gender: 'female',
        birth_date: saved.mother_birth_date,
        phone: saved.mother_phone,
        job: saved.mother_job,
        family_id: saved.family_id,
        family_role: 'mother',
        member_status: 'active',
        age_stage: Hierarchy.stageFromBirth(saved.mother_birth_date) || 'adult'
      });
    }
    // Create children
    (data.children || []).forEach(c => {
      if (!c.full_name) return;
      const birth = c.birth_date || null;
      const stage = Hierarchy.stageFromBirth(birth);
      DB.insert('members', {
        full_name: c.full_name,
        gender: c.gender || 'male',
        birth_date: birth,
        notes: c.notes || '',
        family_id: saved.family_id,
        family_role: 'child',
        school: c.school_year || '',
        member_status: 'active',
        parent_phone: saved.father_phone || saved.mother_phone,
        age_stage: stage || null
      });
    });
    return saved;
  }

  function updateFamily(id, patch){
    return DB.update('families','family_id', id, patch);
  }

  function familyMembers(family_id){
    return DB.filter('members', m => m.family_id === family_id);
  }

  function familyFather(family_id){
    return DB.find('members', m => m.family_id===family_id && m.family_role==='father');
  }
  function familyMother(family_id){
    return DB.find('members', m => m.family_id===family_id && m.family_role==='mother');
  }
  function familyChildren(family_id){
    return DB.filter('members', m => m.family_id===family_id && m.family_role==='child');
  }

  function addChild(family_id, child){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const stage = Hierarchy.stageFromBirth(child.birth_date);
    return DB.insert('members', {
      full_name: child.full_name,
      gender: child.gender || 'male',
      birth_date: child.birth_date || null,
      school: child.school_year || '',
      notes: child.notes || '',
      family_id, family_role:'child',
      member_status:'active',
      parent_phone: fam.father_phone || fam.mother_phone,
      age_stage: stage || null
    });
  }

  /* ----- Family analytics ----- */
  function familyAttendanceRate(family_id, days){
    days = days || 60;
    const members = familyMembers(family_id);
    if (!members.length) return 0;
    const since = Date.now() - days*864e5;
    const sessions = DB.filter('attendance_sessions', s => new Date(s.starts_at).getTime() >= since).length;
    if (!sessions) return 0;
    const records = DB.filter('attendance_records', r =>
      members.some(m => m.member_id === r.member_id) &&
      new Date(r.check_in_at).getTime() >= since
    ).length;
    return Math.min(100, Math.round((records / (sessions * members.length)) * 100));
  }

  function familyLastAttendance(family_id){
    const members = familyMembers(family_id);
    const recs = DB.filter('attendance_records', r => members.some(m => m.member_id === r.member_id));
    if (!recs.length) return null;
    return recs.sort((a,b) => new Date(b.check_in_at) - new Date(a.check_in_at))[0].check_in_at;
  }

  function familiesNeedingVisit(){
    return DB.all('families').filter(f => {
      const last = familyLastAttendance(f.family_id);
      if (!last) return true;
      return (Date.now() - new Date(last).getTime()) > 30*864e5;
    });
  }

  window.Family = {
    genFamilyId, createFamily, updateFamily,
    familyMembers, familyFather, familyMother, familyChildren, addChild,
    familyAttendanceRate, familyLastAttendance, familiesNeedingVisit,
    calcAge
  };
})();
