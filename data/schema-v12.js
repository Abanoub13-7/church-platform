/* ============================================================
   SCHEMA v12 — PHASE 1–6 ENHANCEMENTS (additive, non-breaking)
   - Families: relationships table + visitations + expanded status
   - Hierarchy: grades + small_groups
   - Attendance: status enum + expectations roster + offline queue
                 + anti-fraud fields (geo / device / ip)
   - Spiritual: sacraments, milestones, mentorships, journeys
   - Follow-up: expanded action enum + outcomes + journey steps
   Load AFTER data/schema.js in every HTML page.
   ============================================================ */
(function () {
  if (!window.SCHEMA) {
    console.warn('[schema-v12] window.SCHEMA missing — load data/schema.js first');
    return;
  }
  const S = window.SCHEMA;

  /* ---------- FAMILIES (Phase 1+2) ---------- */
  S.family_relationships = { fields: {
    rel_id:           { type:'uuid', pk:true },
    church_id:        { type:'uuid', ref:'churches.church_id', required:true },
    family_id:        { type:'uuid', ref:'families.family_id', required:true },
    member_id:        { type:'uuid', ref:'members.member_id', required:true },
    relationship_kind:{ type:'enum', values:['father','mother','son','daughter','relative','guardian'] },
    is_primary:       { type:'boolean', default:false },
    created_at:       { type:'datetime' }
  }, constraints: ['UNIQUE(family_id, member_id, relationship_kind)'] };

  S.family_visitations = { fields: {
    visit_id:     { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    family_id:    { type:'uuid', ref:'families.family_id', required:true },
    performed_by: { type:'uuid', ref:'users.user_id' },
    performed_at: { type:'datetime' },
    outcome:      { type:'enum', values:['completed','partial','no_answer','rescheduled','emergency'] },
    notes:        { type:'text' },
    created_at:   { type:'datetime' }
  }};

  // Expand family_status enum (additive: keep old values, add new)
  if (S.families && S.families.fields && S.families.fields.family_status) {
    const f = S.families.fields.family_status;
    ['new','high_risk','needs_visitation','spiritually_disconnected'].forEach(v => {
      if (!f.values.includes(v)) f.values.push(v);
    });
  }

  // Add primary parent FKs on families (replaces string-only father_name/mother_name)
  if (S.families && S.families.fields) {
    Object.assign(S.families.fields, {
      father_member_id: { type:'uuid', ref:'members.member_id', nullable:true },
      mother_member_id: { type:'uuid', ref:'members.member_id', nullable:true }
    });
  }

  /* ---------- HIERARCHY (Phase 3) ---------- */
  S.service_grades = { fields: {
    grade_id:     { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    stage_id:     { type:'uuid', ref:'service_stages.stage_id', required:true },
    name:         { type:'string', required:true },          // e.g. "Grade 1"
    age_min:      { type:'int', nullable:true },
    age_max:      { type:'int', nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.service_small_groups = { fields: {
    small_group_id:{ type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    class_id:     { type:'uuid', ref:'service_classes.class_id', required:true },
    name:         { type:'string', required:true },
    leader_id:    { type:'uuid', ref:'users.user_id', nullable:true },
    created_at:   { type:'datetime' }
  }};

  // Add grade_id + small_group_id to classes and members (additive)
  if (S.service_classes && S.service_classes.fields) {
    Object.assign(S.service_classes.fields, {
      grade_id: { type:'uuid', ref:'service_grades.grade_id', nullable:true }
    });
  }
  if (S.members && S.members.fields) {
    Object.assign(S.members.fields, {
      grade_id:       { type:'uuid', ref:'service_grades.grade_id', nullable:true },
      small_group_id: { type:'uuid', ref:'service_small_groups.small_group_id', nullable:true }
    });
  }

  /* ---------- ATTENDANCE (Phase 4) ---------- */
  if (S.attendance_records && S.attendance_records.fields) {
    Object.assign(S.attendance_records.fields, {
      status:             { type:'enum',
                            values:['present','late','excused','online','served','visitor','partial','absent'],
                            default:'present' },
      location_lat:       { type:'decimal', nullable:true },
      location_lng:       { type:'decimal', nullable:true },
      device_id:          { type:'string',  nullable:true },
      device_fingerprint: { type:'string',  nullable:true },
      ip_hash:            { type:'string',  nullable:true },
      excuse_reason:      { type:'string',  nullable:true },
      partial_minutes:    { type:'int',     nullable:true }
    });
  }

  S.attendance_session_expectations = { fields: {
    expect_id:  { type:'uuid', pk:true },
    church_id:  { type:'uuid', ref:'churches.church_id', required:true },
    session_id: { type:'uuid', ref:'attendance_sessions.session_id', required:true },
    member_id:  { type:'uuid', ref:'members.member_id', required:true },
    created_at: { type:'datetime' }
  }, constraints: ['UNIQUE(session_id, member_id)'] };

  S.attendance_offline_queue = { fields: {
    local_id:   { type:'string', pk:true },
    church_id:  { type:'uuid', ref:'churches.church_id', required:true },
    session_id: { type:'uuid', ref:'attendance_sessions.session_id', required:true },
    member_id:  { type:'uuid', ref:'members.member_id', required:true },
    payload:    { type:'json' },
    queued_at:  { type:'datetime' },
    synced_at:  { type:'datetime', nullable:true },
    error:      { type:'string',   nullable:true }
  }};

  // Add geofence + late-window settings on church_settings
  if (S.church_settings && S.church_settings.fields) {
    Object.assign(S.church_settings.fields, {
      geofence_lat:        { type:'decimal', nullable:true },
      geofence_lng:        { type:'decimal', nullable:true },
      geofence_radius_m:   { type:'int',     default: 500 },
      attendance_window_min:{ type:'int',    default: 30 } // allow ±N min around session
    });
  }

  /* ---------- SPIRITUAL (Phase 5) ---------- */
  S.sacraments = { fields: {
    sacrament_id: { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    member_id:    { type:'uuid', ref:'members.member_id', required:true },
    kind:         { type:'enum', values:['baptism','chrismation','first_communion','marriage','ordination','confession'] },
    date:         { type:'date' },
    performed_by: { type:'string', nullable:true },
    location:     { type:'string', nullable:true },
    notes:        { type:'text',   nullable:true },
    created_at:   { type:'datetime' }
  }};

  S.spiritual_milestones = { fields: {
    milestone_id:{ type:'uuid', pk:true },
    church_id:   { type:'uuid', ref:'churches.church_id', required:true },
    member_id:   { type:'uuid', ref:'members.member_id', required:true },
    kind:        { type:'string' }, // confession_streak | retreat | ministry_start | bible_study_complete | leadership ...
    date:        { type:'date' },
    notes:       { type:'text', nullable:true },
    created_at:  { type:'datetime' }
  }};

  S.mentorships = { fields: {
    mentorship_id:  { type:'uuid', pk:true },
    church_id:      { type:'uuid', ref:'churches.church_id', required:true },
    mentor_user_id: { type:'uuid', ref:'users.user_id',   required:true },
    mentee_member_id:{type:'uuid', ref:'members.member_id', required:true },
    started_at:     { type:'datetime' },
    ended_at:       { type:'datetime', nullable:true },
    status:         { type:'enum', values:['active','paused','completed','transferred'], default:'active' },
    notes:          { type:'text', nullable:true }
  }};

  S.discipleship_journeys = { fields: {
    journey_id: { type:'uuid', pk:true },
    church_id:  { type:'uuid', ref:'churches.church_id', required:true },
    member_id:  { type:'uuid', ref:'members.member_id', required:true },
    stage:      { type:'enum', values:['seeker','new_believer','growing','serving','leading'] },
    entered_at: { type:'datetime' },
    notes:      { type:'text', nullable:true }
  }};

  /* ---------- FOLLOW-UP (Phase 6) ---------- */
  if (S.followup_logs && S.followup_logs.fields && S.followup_logs.fields.action) {
    const a = S.followup_logs.fields.action;
    ['meeting','prayer_session','online_followup','counseling','emergency'].forEach(v => {
      if (!a.values.includes(v)) a.values.push(v);
    });
  }

  if (S.followup_tasks && S.followup_tasks.fields) {
    Object.assign(S.followup_tasks.fields, {
      outcome: { type:'enum',
                 values:['responded','no_response','needs_escalation','recovered','re_engaged','transferred','inactive','emergency'],
                 nullable:true }
    });
  }

  S.member_journey_steps = { fields: {
    step_id:      { type:'uuid', pk:true },
    church_id:    { type:'uuid', ref:'churches.church_id', required:true },
    member_id:    { type:'uuid', ref:'members.member_id', required:true },
    step:         { type:'enum', values:[
      'new','welcome','initial_followup','service_integration','small_group',
      'spiritual_eval','regular','leadership'
    ]},
    entered_at:   { type:'datetime' },
    completed_at: { type:'datetime', nullable:true },
    owner_user_id:{ type:'uuid', ref:'users.user_id', nullable:true },
    notes:        { type:'text', nullable:true }
  }};

  /* ---------- Bootstrap empty collections in storage ---------- */
  if (window.DB && typeof DB._raw === 'function') {
    [
      'family_relationships','family_visitations',
      'service_grades','service_small_groups',
      'attendance_session_expectations','attendance_offline_queue',
      'sacraments','spiritual_milestones','mentorships','discipleship_journeys',
      'member_journey_steps'
    ].forEach(t => { if (!DB._raw(t)) { try { DB._setRaw && DB._setRaw(t, []); } catch(e){} } });
  }

  window.SCHEMA_VERSION = 12;
})();
