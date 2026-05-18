/* ============================================================
   SCHEMA v14 — FAMILY INTELLIGENCE SYSTEM (Phase 2, additive)
   Adds:
   - family_spiritual_records  (sacraments, prayer, classes, growth)
   - family_serving_assignments (ministry roles per member)
   - family_financial_records  (tithes/donations/assistance)
   - family_emergency_contacts (non-member contacts + comms log)
   - family_custody_legal      (legal custody docs/orders)
   - family_workflow_triggers  (automation rule log)
   - family_ai_insights        (heuristic AI snapshots)
   Load AFTER data/schema-v13.js
   ============================================================ */
(function(){
  if (!window.SCHEMA){ console.warn('[schema-v14] SCHEMA missing'); return; }
  const S = window.SCHEMA;

  S.family_spiritual_records = { fields:{
    record_id:    { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    member_id:    { type:'uuid', ref:'members.member_id', nullable:true },
    kind:         { type:'enum',
      values:['baptism','communion','confession','confirmation','marriage','prayer_life',
              'bible_class','sunday_school','retreat','spiritual_father','other'] },
    status:       { type:'enum', values:['scheduled','completed','overdue','none'], default:'none' },
    score:        { type:'int', default:0 },
    occurred_at:  { type:'date', nullable:true },
    next_due_at:  { type:'date', nullable:true },
    notes:        { type:'text', nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.family_serving_assignments = { fields:{
    assignment_id:{ type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    member_id:    { type:'uuid', ref:'members.member_id', required:true },
    ministry:     { type:'string' },
    role:         { type:'string', nullable:true },
    status:       { type:'enum', values:['active','paused','ended'], default:'active' },
    started_at:   { type:'date', nullable:true },
    ended_at:     { type:'date', nullable:true },
    hours_per_month:{ type:'int', default:0 },
    notes:        { type:'text', nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.family_financial_records = { fields:{
    record_id:    { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    kind:         { type:'enum', values:['tithe','donation','pledge','assistance_in','assistance_out','other'] },
    amount:       { type:'decimal', default:0 },
    currency:     { type:'string', default:'EGP' },
    occurred_at:  { type:'date' },
    method:       { type:'enum', values:['cash','bank','online','in_kind','other'], default:'cash' },
    notes:        { type:'text', nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.family_emergency_contacts = { fields:{
    contact_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    name:         { type:'string' },
    phone:        { type:'string', nullable:true },
    relation:     { type:'string', nullable:true },
    priority:     { type:'int', default:1 },
    is_pickup_authorized:{ type:'boolean', default:false },
    notes:        { type:'text', nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.family_emergency_log = { fields:{
    log_id:       { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    severity:     { type:'enum', values:['info','warn','urgent','critical'], default:'info' },
    channel:      { type:'enum', values:['call','sms','whatsapp','visit','email','in_person'], default:'call' },
    subject:      { type:'string' },
    body:         { type:'text', nullable:true },
    actor_id:     { type:'uuid', ref:'users.user_id', nullable:true },
    occurred_at:  { type:'datetime' }
  }};

  S.family_custody_legal = { fields:{
    custody_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    child_id:     { type:'uuid', ref:'members.member_id', required:true },
    guardian_id:  { type:'uuid', ref:'members.member_id', nullable:true },
    custody_type: { type:'enum', values:['full','shared','temporary','emergency','foster','court_ordered','none'], default:'none' },
    authority_level:{ type:'enum', values:['none','limited','full','legal'], default:'none' },
    doc_ref:      { type:'string', nullable:true },
    doc_url:      { type:'string', nullable:true },
    valid_from:   { type:'date', nullable:true },
    valid_until:  { type:'date', nullable:true },
    status:       { type:'enum', values:['active','expired','revoked','pending'], default:'active' },
    notes:        { type:'text', nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.family_workflow_triggers = { fields:{
    trigger_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    rule:         { type:'string' },
    condition:    { type:'text', nullable:true },
    action:       { type:'string' },
    fired_at:     { type:'datetime' },
    payload:      { type:'json', nullable:true }
  }};

  S.family_ai_insights = { fields:{
    insight_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    category:     { type:'enum', values:['attendance','spiritual','serving','financial','risk','relationships','general'], default:'general' },
    severity:     { type:'enum', values:['info','suggestion','warn','urgent'], default:'info' },
    headline:     { type:'string' },
    detail:       { type:'text', nullable:true },
    confidence:   { type:'int', default:60 },
    computed_at:  { type:'datetime' }
  }};

  console.log('[schema-v14] loaded — Phase 2 family tables registered');
})();
