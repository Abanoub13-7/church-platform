/* ============================================================
   SCHEMA v13 — FAMILY INTELLIGENCE SYSTEM (additive, non-breaking)
   Adds:
   - Expanded family entity fields (type, multi-status, geo, risk)
   - Expanded relationship_kind enum + custody/authority fields
   - family_movement_log  (transfers, splits, merges, guardian changes)
   - family_scores        (cached attendance/risk score snapshots)
   Load AFTER data/schema-v12.js
   ============================================================ */
(function(){
  if (!window.SCHEMA){ console.warn('[schema-v13] SCHEMA missing'); return; }
  const S = window.SCHEMA;

  /* ---------- FAMILIES (extended) ---------- */
  if (S.families && S.families.fields){
    const f = S.families.fields;

    // Expand family_status enum (additive)
    if (f.family_status && Array.isArray(f.family_status.values)){
      ['active','inactive','under_followup','high_risk','moved','suspended','archived']
        .forEach(v => { if (!f.family_status.values.includes(v)) f.family_status.values.push(v); });
    }

    Object.assign(f, {
      family_type:       { type:'enum',
        values:['nuclear','single_parent','extended','guardian_based','orphan_care','temporary_custody','special_needs'],
        default:'nuclear' },
      risk_status:       { type:'enum', values:['low','medium','high','critical'], default:'low' },
      spiritual_status:  { type:'enum', values:['unknown','growing','stable','declining','disconnected'], default:'unknown' },
      financial_status:  { type:'enum', values:['unknown','consistent','irregular','dependent','assisted'], default:'unknown' },
      service_status:    { type:'enum', values:['unknown','serving','partial','inactive'], default:'unknown' },
      emergency_status:  { type:'enum', values:['none','watch','active'], default:'none' },
      geo_lat:           { type:'decimal', nullable:true },
      geo_lng:           { type:'decimal', nullable:true },
      photo_url:         { type:'string',  nullable:true },
      primary_guardian_id:   { type:'uuid', ref:'members.member_id', nullable:true },
      secondary_guardian_id: { type:'uuid', ref:'members.member_id', nullable:true },
      last_activity_at:  { type:'datetime', nullable:true }
    });
  }

  /* ---------- FAMILY_RELATIONSHIPS (extended) ---------- */
  if (S.family_relationships && S.family_relationships.fields){
    const rk = S.family_relationships.fields.relationship_kind;
    if (rk && Array.isArray(rk.values)){
      ['grandparent','sibling','foster_parent','step_parent','custodian']
        .forEach(v => { if (!rk.values.includes(v)) rk.values.push(v); });
    }
    Object.assign(S.family_relationships.fields, {
      custody_type:           { type:'enum',
        values:['full','shared','temporary','emergency','foster','none'], default:'none' },
      custody_start:          { type:'date',     nullable:true },
      custody_end:            { type:'date',     nullable:true },
      authority_level:        { type:'enum', values:['none','limited','full','legal'], default:'none' },
      is_emergency_contact:   { type:'boolean',  default:false },
      is_pickup_authorized:   { type:'boolean',  default:false },
      notes:                  { type:'text',     nullable:true }
    });
  }

  /* ---------- FAMILY_MOVEMENT_LOG (new) ---------- */
  S.family_movement_log = { fields:{
    movement_id: { type:'uuid', pk:true },
    church_id:   { type:'uuid', ref:'churches.church_id', required:true },
    family_id:   { type:'uuid', ref:'families.family_id', required:true },
    kind:        { type:'enum',
      values:['transfer','address_change','split','merge','guardian_change','custody_change',
              'service_change','attendance_pattern_change','status_change','member_added','member_removed'] },
    from_value:  { type:'string', nullable:true },
    to_value:    { type:'string', nullable:true },
    related_id:  { type:'uuid',   nullable:true },
    actor_id:    { type:'uuid',   ref:'users.user_id', nullable:true },
    notes:       { type:'text',   nullable:true },
    occurred_at: { type:'datetime' },
    created_at:  { type:'datetime' }
  }};

  /* ---------- FAMILY_SCORES (new — cached) ---------- */
  S.family_scores = { fields:{
    score_id:               { type:'uuid', pk:true },
    church_id:              { type:'uuid', ref:'churches.church_id', required:true },
    family_id:              { type:'uuid', ref:'families.family_id', required:true },
    attendance_weekly_pct:  { type:'int',  default:0 },
    attendance_monthly_pct: { type:'int',  default:0 },
    consistency_score:      { type:'int',  default:0 },
    parent_participation:   { type:'int',  default:0 },
    child_participation:    { type:'int',  default:0 },
    consecutive_absences:   { type:'int',  default:0 },
    engagement_trend:       { type:'enum', values:['rising','stable','declining','unknown'], default:'unknown' },
    attendance_risk:        { type:'int',  default:0 },
    service_risk:           { type:'int',  default:0 },
    financial_risk:         { type:'int',  default:0 },
    followup_risk:          { type:'int',  default:0 },
    stability_risk:         { type:'int',  default:0 },
    risk_total:             { type:'int',  default:0 },
    risk_level:             { type:'enum', values:['low','medium','high','critical'], default:'low' },
    stability_score:        { type:'int',  default:100 },
    computed_at:            { type:'datetime' }
  }, constraints:['UNIQUE(family_id)'] };
})();
