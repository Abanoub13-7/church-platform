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
