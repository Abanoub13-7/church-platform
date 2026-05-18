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
