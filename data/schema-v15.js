/* ============================================================
   SCHEMA v15 — ENTERPRISE ATTENDANCE ECOSYSTEM (additive)
   Domains: Liturgies | Meetings | Sunday School | Events |
            Visitors | QR Sessions | Attendance Intelligence
   Load AFTER data/schema-v14.js
   ============================================================ */
(function(){
  if (!window.SCHEMA){ console.warn('[schema-v15] SCHEMA missing'); return; }
  const S = window.SCHEMA;

  /* --- Liturgies --- */
  S.liturgies = { fields:{
    liturgy_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    title:        { type:'string', required:true },
    liturgy_type: { type:'enum',
      values:['friday','sunday','feast','holiday','fasting','memorial','special','custom'],
      default:'custom' },
    recurrence:   { type:'enum', values:['none','weekly_friday','weekly_sunday'], default:'none' },
    starts_at:    { type:'datetime', required:true },
    ends_at:      { type:'datetime', nullable:true },
    session_id:   { type:'uuid', ref:'attendance_sessions.session_id', nullable:true },
    created_by:   { type:'uuid', nullable:true },
    notes:        { type:'text', nullable:true },
    created_at:   { type:'datetime' }
  }};

  /* --- Meetings --- */
  S.meetings = { fields:{
    meeting_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    title:        { type:'string', required:true },
    meeting_type: { type:'enum',
      values:['youth','university_graduates','servants','men','women',
              'secondary','preparatory','kids','custom'], default:'custom' },
    recurrence:   { type:'enum',
      values:['none','weekly','biweekly','monthly'], default:'weekly' },
    weekday:      { type:'int', nullable:true }, // 0=Sun..6=Sat
    starts_at:    { type:'datetime', required:true },
    ends_at:      { type:'datetime', nullable:true },
    session_id:   { type:'uuid', ref:'attendance_sessions.session_id', nullable:true },
    service_stage:{ type:'string', nullable:true },
    leaders:      { type:'json', nullable:true },
    created_by:   { type:'uuid', nullable:true },
    created_at:   { type:'datetime' }
  }};

  /* --- Sunday School (auto-Friday, Nursery → Secondary) --- */
  S.sunday_school_sessions = { fields:{
    ss_id:        { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    stage:        { type:'enum', values:['nursery','primary','preparatory','secondary'], required:true },
    occurs_on:    { type:'date', required:true },
    session_id:   { type:'uuid', ref:'attendance_sessions.session_id', nullable:true },
    teacher_id:   { type:'uuid', nullable:true },
    created_at:   { type:'datetime' }
  }};

  /* --- Visitors --- */
  S.visitors = { fields:{
    visitor_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', nullable:true },
    full_name:    { type:'string', required:true },
    phone:        { type:'string', nullable:true },
    invited_by:   { type:'uuid', ref:'members.member_id', nullable:true },
    home_church:  { type:'string', nullable:true },
    visit_count:  { type:'int', default:0 },
    first_visit_at:{type:'datetime', nullable:true },
    last_visit_at:{ type:'datetime', nullable:true },
    notes:        { type:'text', nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.visitor_attendance = { fields:{
    record_id:    { type:'uuid', pk:true },
    church_id:    { type:'uuid', nullable:true },
    visitor_id:   { type:'uuid', ref:'visitors.visitor_id', required:true },
    session_id:   { type:'uuid', ref:'attendance_sessions.session_id', required:true },
    attended_at:  { type:'datetime' },
    created_at:   { type:'datetime' }
  }};

  /* --- QR Attendance Sessions (rotating tokens) --- */
  S.qr_attendance_sessions = { fields:{
    qr_id:        { type:'uuid', pk:true },
    church_id:    { type:'uuid', nullable:true },
    session_id:   { type:'uuid', ref:'attendance_sessions.session_id', required:true },
    token:        { type:'string', required:true },
    rotates_every_sec:{ type:'int', default:30 },
    expires_at:   { type:'datetime', required:true },
    status:       { type:'enum', values:['active','expired','closed'], default:'active' },
    created_by:   { type:'uuid', nullable:true },
    created_at:   { type:'datetime' }
  }};

  /* --- Extended attendance record metadata (spiritual participation) --- */
  S.attendance_spiritual_marks = { fields:{
    mark_id:      { type:'uuid', pk:true },
    church_id:    { type:'uuid', nullable:true },
    record_id:    { type:'uuid', ref:'attendance_records.record_id', required:true },
    member_id:    { type:'uuid', ref:'members.member_id', required:true },
    communion:    { type:'bool', default:false },
    confession:   { type:'bool', default:false },
    created_at:   { type:'datetime' }
  }};

  /* --- Attendance Intelligence Insights --- */
  S.attendance_intelligence = { fields:{
    insight_id:   { type:'uuid', pk:true },
    church_id:    { type:'uuid', nullable:true },
    category:     { type:'enum',
      values:['family_decline','member_disengagement','servant_inactive',
              'risky_family','ministry_drop','recommendation'] },
    severity:     { type:'enum', values:['info','suggestion','warn','urgent'], default:'info' },
    family_id:    { type:'uuid', nullable:true },
    member_id:    { type:'uuid', nullable:true },
    headline:     { type:'string' },
    detail:       { type:'text', nullable:true },
    confidence:   { type:'int', default:60 },
    detected_at:  { type:'datetime' },
    created_at:   { type:'datetime' }
  }};
})();
