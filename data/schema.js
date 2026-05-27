/* ============================================================
   CHURCH MEGA PLATFORM — DATABASE SCHEMA
   Multi-Tenant SaaS Architecture
   كل جدول يحتوي على church_id لعزل البيانات
   ============================================================ */

window.SCHEMA = {

  /* ===== CHURCHES (Tenant Root) ===== */
  churches: {
    fields: {
      church_id:           { type: 'uuid', pk: true },
      church_name:         { type: 'string', required: true },
      church_code:         { type: 'string', unique: true },
      church_logo:         { type: 'string' },
      subscription_plan:   { type: 'enum', values: ['free','basic','pro','enterprise'] },
      subscription_status: { type: 'enum', values: ['active','trial','suspended','cancelled'] },
      subscription_expires_at: { type: 'datetime' },
      church_admin_id:     { type: 'uuid', ref: 'users.user_id' },
      created_at:          { type: 'datetime' }
    }
  },

  /* ===== USERS (Login Accounts Only) ===== */
  users: {
    fields: {
      user_id:       { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id', nullable: true }, // optional link
      full_name:     { type: 'string', required: true },
      email:         { type: 'string', unique: true },
      phone:         { type: 'string' },
      password_hash: { type: 'string' },
      role:          { type: 'enum', values: ['super_admin','church_admin','service_admin','servant','supervisor','finance','viewer'] },
      permissions:   { type: 'json' }, // granular overrides
      is_active:     { type: 'boolean', default: true },
      last_login:    { type: 'datetime' },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== MEMBERS (Served People — May NOT have login) ===== */
  members: {
    fields: {
      member_id:           { type: 'uuid', pk: true },
      church_id:           { type: 'uuid', ref: 'churches.church_id', required: true },
      full_name:           { type: 'string', required: true },
      gender:              { type: 'enum', values: ['male','female'] },
      birth_date:          { type: 'date' },
      age_stage:           { type: 'enum', values: ['nursery','kg','primary','preparatory','secondary','university','youth','adult','senior'] },
      phone:               { type: 'string' },
      parent_phone:        { type: 'string' },
      address:             { type: 'string' },
      spiritual_father:    { type: 'string' },
      confession_status:   { type: 'enum', values: ['regular','irregular','none'] },
      service_class_id:    { type: 'uuid', ref: 'service_classes.class_id' },
      school:              { type: 'string' },
      university:          { type: 'string' },
      job:                 { type: 'string' },
      health_notes:        { type: 'text' },
      notes:               { type: 'text' },
      qr_code:             { type: 'string', unique: true },
      member_status:       { type: 'enum', values: ['active','inactive','new','at_risk','left'] },
      first_visit_at:      { type: 'datetime' },
      created_at:          { type: 'datetime' }
    }
  },

  /* ===== SERVICE CLASSES ===== */
  service_classes: {
    fields: {
      class_id:       { type: 'uuid', pk: true },
      church_id:      { type: 'uuid', ref: 'churches.church_id', required: true },
      class_name:     { type: 'string' },
      age_stage:      { type: 'string' },
      supervisor_id:  { type: 'uuid', ref: 'users.user_id' },
      created_at:     { type: 'datetime' }
    }
  },

  /* ===== SERVANT ASSIGNMENTS ===== */
  servant_assignments: {
    fields: {
      assignment_id: { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      user_id:       { type: 'uuid', ref: 'users.user_id' },
      class_id:      { type: 'uuid', ref: 'service_classes.class_id' },
      role:          { type: 'string' },
      assigned_at:   { type: 'datetime' },
      active:        { type: 'boolean', default: true }
    }
  },

  /* ===== ATTENDANCE SESSIONS (any activity) ===== */
  attendance_sessions: {
    fields: {
      session_id:    { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      activity_type: { type: 'enum', values: [
        'mass','meeting','sunday_school','conference','trip','retreat',
        'service','choir','bible_study','youth_activity','servants_meeting',
        'confession','individual_followup'
      ]},
      title:         { type: 'string' },
      class_id:      { type: 'uuid', ref: 'service_classes.class_id', nullable: true },
      event_id:      { type: 'uuid', ref: 'events.event_id', nullable: true },
      starts_at:     { type: 'datetime' },
      ends_at:       { type: 'datetime' },
      late_after_min:{ type: 'int', default: 15 },
      created_by:    { type: 'uuid', ref: 'users.user_id' },
      status:        { type: 'enum', values: ['scheduled','open','closed'] }
    }
  },

  /* ===== ATTENDANCE RECORDS ===== */
  attendance_records: {
    fields: {
      record_id:     { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      session_id:    { type: 'uuid', ref: 'attendance_sessions.session_id' },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      check_in_at:   { type: 'datetime' },
      check_in_method:{ type: 'enum', values: ['qr','manual','group','family','face'] },
      is_late:       { type: 'boolean' },
      checked_by:    { type: 'uuid', ref: 'users.user_id' },
      notes:         { type: 'string' }
    },
    constraints: ['UNIQUE(session_id, member_id)'] // duplicate prevention
  },

  /* ===== EVENTS (Enterprise) ===== */
  events: {
    fields: {
      event_id:        { type: 'uuid', pk: true },
      church_id:       { type: 'uuid', ref: 'churches.church_id', required: true },
      title:           { type: 'string' },
      description:     { type: 'text' },
      event_type:      { type: 'string' }, // conference|retreat|meeting|class|course|trip|camp|prayer|ministry|servant
      starts_at:       { type: 'datetime' },
      ends_at:         { type: 'datetime' },
      location:        { type: 'string' },
      capacity:        { type: 'int' },
      reserved_seats:  { type: 'int', default: 0 },     // VIP+servant reserved
      vip_seats:       { type: 'int', default: 0 },
      servant_seats:   { type: 'int', default: 0 },
      waitlist_capacity:{ type: 'int', default: 0 },    // 0 = unlimited
      overbook_pct:    { type: 'int', default: 0 },     // smart overbooking ratio
      price:           { type: 'decimal' },
      currency:        { type: 'string', default: 'EGP' },
      has_waiting_list:{ type: 'boolean', default: true },
      requires_approval:{ type: 'boolean', default: false },
      auto_close_when_full:{ type: 'boolean', default: true },
      registration_opens_at: { type: 'datetime', nullable: true },
      registration_closes_at:{ type: 'datetime', nullable: true },
      // Lifecycle: draft → review → published → reg_open → reg_closed → ongoing → completed → archived
      lifecycle:       { type: 'enum', values: ['draft','review','published','reg_open','reg_closed','ongoing','completed','archived'], default: 'draft' },
      // Operational status — derived but cached: draft|pending_approval|published|active|full|waitlist|completed|cancelled|archived
      status:          { type: 'enum', values: ['draft','pending_approval','published','active','full','waitlist','completed','cancelled','archived'], default: 'draft' },
      // Access rules (role-based event access)
      access_rules:    { type: 'json', default: {} }, // { roles:[], min_age, max_age, gender, ministries:[], classes:[], min_attendance_rate, min_serving_level }
      // Template + budget links
      template_id:     { type: 'uuid', ref: 'event_templates.template_id', nullable: true },
      budget_id:       { type: 'uuid', ref: 'event_budgets.budget_id', nullable: true },
      treasury_id:     { type: 'uuid', ref: 'treasuries.treasury_id', nullable: true },
      // Workflow + approval
      approval_required:{ type: 'boolean', default: false },
      approved_by:     { type: 'uuid', ref: 'users.user_id', nullable: true },
      approved_at:     { type: 'datetime', nullable: true },
      cancelled_reason:{ type: 'string', nullable: true },
      created_by:      { type: 'uuid', ref: 'users.user_id' },
      updated_at:      { type: 'datetime', nullable: true },
      created_at:      { type: 'datetime' }
    }
  },

  /* ===== EVENT BOOKINGS / REGISTRATIONS ===== */
  event_bookings: {
    fields: {
      booking_id:      { type: 'uuid', pk: true },
      church_id:       { type: 'uuid', ref: 'churches.church_id', required: true },
      event_id:        { type: 'uuid', ref: 'events.event_id' },
      member_id:       { type: 'uuid', ref: 'members.member_id' },
      // Lifecycle: pending → approved → rejected → waiting → confirmed → attended | no_show | cancelled
      booking_status:  { type: 'enum', values: ['pending','approved','rejected','confirmed','waiting','cancelled','attended','no_show'] },
      waitlist_position:{ type: 'int', nullable: true },
      seat_class:      { type: 'enum', values: ['regular','vip','servant','reserved'], default: 'regular' },
      bus_number:      { type: 'string', nullable: true },
      room_number:     { type: 'string', nullable: true },
      payment_status:  { type: 'enum', values: ['unpaid','partial','paid','refunded'] },
      amount_paid:     { type: 'decimal', default: 0 },
      qr_ticket:       { type: 'string' },           // unique ticket code
      reservation_code:{ type: 'string' },           // human-readable code
      checked_in_at:   { type: 'datetime', nullable: true },
      approved_by:     { type: 'uuid', nullable: true },
      approved_at:     { type: 'datetime', nullable: true },
      rejected_reason: { type: 'string', nullable: true },
      notes:           { type: 'text', nullable: true },
      created_at:      { type: 'datetime' }
    }
  },

  /* ===== EVENT TEMPLATES (reusable blueprints) ===== */
  event_templates: {
    fields: {
      template_id:     { type: 'uuid', pk: true },
      church_id:       { type: 'uuid', ref: 'churches.church_id', required: true },
      name:            { type: 'string' },
      event_type:      { type: 'string' },
      defaults:        { type: 'json' }, // { capacity, price, duration_hours, access_rules, tasks:[], budget_lines:[] }
      created_by:      { type: 'uuid', ref: 'users.user_id' },
      created_at:      { type: 'datetime' }
    }
  },

  /* ===== EVENT TASKS (organizer / volunteer assignments) ===== */
  event_tasks: {
    fields: {
      task_id:         { type: 'uuid', pk: true },
      church_id:       { type: 'uuid', ref: 'churches.church_id', required: true },
      event_id:        { type: 'uuid', ref: 'events.event_id' },
      title:           { type: 'string' },
      role:            { type: 'string' }, // organizer|servant|volunteer|transport|attendance|finance
      assigned_to:     { type: 'uuid', ref: 'users.user_id', nullable: true },
      due_at:          { type: 'datetime', nullable: true },
      status:          { type: 'enum', values: ['open','in_progress','done','escalated','cancelled'], default: 'open' },
      escalation_level:{ type: 'int', default: 0 },
      completed_at:    { type: 'datetime', nullable: true },
      created_at:      { type: 'datetime' }
    }
  },

  /* ===== EVENT BUDGETS ===== */
  event_budgets: {
    fields: {
      budget_id:       { type: 'uuid', pk: true },
      church_id:       { type: 'uuid', ref: 'churches.church_id', required: true },
      event_id:        { type: 'uuid', ref: 'events.event_id' },
      estimated_total: { type: 'decimal', default: 0 },
      approved_total:  { type: 'decimal', default: 0 },
      actual_total:    { type: 'decimal', default: 0 },
      lines:           { type: 'json', default: [] }, // [{ category, label, estimated, actual }]
      approval_status: { type: 'enum', values: ['draft','pending','approved','rejected'], default: 'draft' },
      approved_by:     { type: 'uuid', nullable: true },
      approved_at:     { type: 'datetime', nullable: true },
      created_at:      { type: 'datetime' }
    }
  },

  /* ===== EVENT EXPENSES (links to financial_transactions) ===== */
  event_expenses: {
    fields: {
      expense_id:      { type: 'uuid', pk: true },
      church_id:       { type: 'uuid', ref: 'churches.church_id', required: true },
      event_id:        { type: 'uuid', ref: 'events.event_id' },
      category:        { type: 'string' }, // transport|food|equipment|activity|service|other
      label:           { type: 'string' },
      amount:          { type: 'decimal' },
      transaction_id:  { type: 'uuid', ref: 'financial_transactions.transaction_id', nullable: true },
      status:          { type: 'enum', values: ['pending','approved','rejected','paid'], default: 'pending' },
      created_by:      { type: 'uuid', ref: 'users.user_id' },
      created_at:      { type: 'datetime' }
    }
  },

  /* ===== EVENT TIMELINE (immutable event log) ===== */
  event_timeline: {
    fields: {
      entry_id:        { type: 'uuid', pk: true },
      church_id:       { type: 'uuid', ref: 'churches.church_id', required: true },
      event_id:        { type: 'uuid', ref: 'events.event_id' },
      member_id:       { type: 'uuid', nullable: true },
      action:          { type: 'string' }, // created|approved|published|registration_opened|registered|waitlisted|promoted|approved_reg|rejected_reg|checked_in|cancelled|completed|archived|expense_added|task_assigned
      actor_id:        { type: 'uuid', nullable: true },
      meta:            { type: 'json', default: {} },
      created_at:      { type: 'datetime' }
    }
  },

  /* ===== FOLLOWUP TASKS ===== */
  followup_tasks: {
    fields: {
      task_id:       { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      assigned_to:   { type: 'uuid', ref: 'users.user_id' },
      created_by:    { type: 'string' }, // 'system' or user_id
      reason:        { type: 'string' }, // e.g. "3 consecutive absences"
      priority:      { type: 'enum', values: ['low','medium','high','urgent'] },
      due_at:        { type: 'datetime' },
      status:        { type: 'enum', values: ['open','in_progress','done','escalated','cancelled'] },
      escalation_level:{ type: 'int', default: 0 },
      workflow_id:   { type: 'uuid', ref: 'workflow_history.workflow_id', nullable: true },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== FOLLOWUP LOGS ===== */
  followup_logs: {
    fields: {
      log_id:        { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      task_id:       { type: 'uuid', ref: 'followup_tasks.task_id' },
      action:        { type: 'enum', values: ['called','visited','whatsapp','no_response','completed','escalated'] },
      result:        { type: 'text' },
      performed_by:  { type: 'uuid', ref: 'users.user_id' },
      performed_at:  { type: 'datetime' }
    }
  },

  /* ===== NOTIFICATIONS ===== */
  notifications: {
    fields: {
      notification_id:{ type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      user_id:       { type: 'uuid', ref: 'users.user_id' },
      type:          { type: 'enum', values: ['info','warning','alert','task','workflow','ai_insight'] },
      title:         { type: 'string' },
      body:          { type: 'text' },
      link:          { type: 'string' },
      is_read:       { type: 'boolean', default: false },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== FINANCIAL TRANSACTIONS ===== */
  financial_transactions: {
    fields: {
      transaction_id:{ type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      type:          { type: 'enum', values: ['donation','tithe','event_payment','expense','salary','other'] },
      amount:        { type: 'decimal' },
      currency:      { type: 'string', default: 'EGP' },
      category:      { type: 'string' },
      description:   { type: 'text' },
      member_id:     { type: 'uuid', ref: 'members.member_id', nullable: true },
      event_id:      { type: 'uuid', ref: 'events.event_id', nullable: true },
      payment_method:{ type: 'enum', values: ['cash','bank','online','other'] },
      recorded_by:   { type: 'uuid', ref: 'users.user_id' },
      transaction_date:{ type: 'datetime' }
    }
  },

  /* ===== MEMBER NOTES ===== */
  member_notes: {
    fields: {
      note_id:       { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      note_type:     { type: 'enum', values: ['spiritual','social','health','general','confidential'] },
      content:       { type: 'text' },
      visibility:    { type: 'enum', values: ['public','servants','admin','confessor_only'] },
      created_by:    { type: 'uuid', ref: 'users.user_id' },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== MEMBER RISK SCORES (AI) ===== */
  member_risk_scores: {
    fields: {
      score_id:      { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      member_id:     { type: 'uuid', ref: 'members.member_id' },
      risk_level:    { type: 'enum', values: ['low','medium','high','critical'] },
      score:         { type: 'int' }, // 0-100
      factors:       { type: 'json' }, // breakdown of contributing factors
      recommendation:{ type: 'text' },
      computed_at:   { type: 'datetime' }
    }
  },

  /* ===== WORKFLOW ACTIONS (rule definitions) ===== */
  workflow_actions: {
    fields: {
      action_id:     { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      name:          { type: 'string' },
      trigger_type:  { type: 'enum', values: [
        'absence_streak','first_visit','servant_inactive','event_full',
        'low_attendance','risk_change','manual'
      ]},
      trigger_config:{ type: 'json' },
      steps:         { type: 'json' }, // array of {action, delay, assignTo, ...}
      is_active:     { type: 'boolean', default: true },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== WORKFLOW HISTORY ===== */
  workflow_history: {
    fields: {
      workflow_id:   { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      action_id:     { type: 'uuid', ref: 'workflow_actions.action_id' },
      target_type:   { type: 'enum', values: ['member','user','event','task'] },
      target_id:     { type: 'uuid' },
      current_step:  { type: 'int', default: 0 },
      status:        { type: 'enum', values: ['running','completed','failed','escalated','cancelled'] },
      log:           { type: 'json' }, // array of step results
      started_at:    { type: 'datetime' },
      completed_at:  { type: 'datetime', nullable: true }
    }
  },

  /* ===== CHURCH SETTINGS ===== */
  church_settings: {
    fields: {
      church_id:           { type: 'uuid', pk: true, ref: 'churches.church_id' },
      timezone:            { type: 'string', default: 'Africa/Cairo' },
      language:            { type: 'string', default: 'ar' },
      week_start:          { type: 'string', default: 'sunday' },
      whatsapp_enabled:    { type: 'boolean' },
      whatsapp_api_key:    { type: 'string' },
      ai_enabled:          { type: 'boolean', default: true },
      absence_threshold:   { type: 'int', default: 3 },
      risk_recalc_interval:{ type: 'string', default: 'daily' },
      theme:               { type: 'enum', values: ['light','dark','auto'] }
    }
  },

  /* ===== AUDIT LOGS ===== */
  audit_logs: {
    fields: {
      log_id:        { type: 'uuid', pk: true },
      church_id:     { type: 'uuid', ref: 'churches.church_id', required: true },
      user_id:       { type: 'uuid', ref: 'users.user_id' },
      action:        { type: 'string' }, // 'create','update','delete','login','export'
      entity_type:   { type: 'string' },
      entity_id:     { type: 'uuid' },
      changes:       { type: 'json' },
      ip_address:    { type: 'string' },
      user_agent:    { type: 'string' },
      created_at:    { type: 'datetime' }
    }
  },

  /* ===== PHASE 1 ADDITIONS ===== */
  audit_logs: {
    fields: {
      log_id:    { type:'uuid', pk:true },
      church_id: { type:'uuid', ref:'churches.church_id', nullable:true },
      user_id:   { type:'uuid', ref:'users.user_id', nullable:true },
      user_name: { type:'string' }, role:{ type:'string' },
      action:    { type:'string', required:true },
      meta:      { type:'json' },
      severity:  { type:'enum', values:['info','success','warning','critical'] },
      impersonator_id:{ type:'uuid', nullable:true },
      created_at:{ type:'datetime' }
    }
  },
  feature_flags: {
    fields: {
      flag_id:          { type:'uuid', pk:true },
      church_id:        { type:'uuid', ref:'churches.church_id', required:true },
      disabled_modules: { type:'json' } // string[]
    }
  },
  subscription_plans: {
    fields: {
      plan_key:    { type:'string', pk:true },
      label:       { type:'string' },
      max_members: { type:'number' },
      max_users:   { type:'number' },
      storage_mb:  { type:'number' },
      features:    { type:'json' }
    }
  },
  custom_roles: {
    fields: {
      role_id:      { type:'uuid', pk:true },
      church_id:    { type:'uuid', ref:'churches.church_id', nullable:true },
      role_key:     { type:'string', unique:true },
      label:        { type:'string' },
      capabilities: { type:'json' }, // string[] of canX
      is_active:    { type:'boolean', default:true },
      created_at:   { type:'datetime' }
    }
  },
  platform_notifications: {
    fields: {
      notification_id:{ type:'uuid', pk:true },
      title:{ type:'string', required:true }, body:{ type:'text' },
      type:{ type:'enum', values:['info','maintenance','alert','update'] },
      target:{ type:'string' }, // 'all' or church_id
      created_by:{ type:'uuid', ref:'users.user_id' },
      created_at:{ type:'datetime' }
    }
  },

  /* ===== PHASE 2 — Enterprise finance ===== */
  treasuries: {
    fields: {
      treasury_id:{ type:'uuid', pk:true }, church_id:{ type:'uuid', ref:'churches.church_id' },
      account_key:{ type:'string' }, code:{ type:'string' }, name:{ type:'string' },
      type:{ type:'enum', values:['asset','income','expense','equity'] },
      balance:{ type:'decimal', default:0 },
      created_at:{ type:'datetime' }, updated_at:{ type:'datetime', nullable:true }
    }
  },
  ledger_entries: {
    fields: {
      entry_id:{ type:'uuid', pk:true }, church_id:{ type:'uuid', ref:'churches.church_id' },
      transaction_id:{ type:'uuid', ref:'financial_transactions.transaction_id' },
      treasury_id:{ type:'uuid', ref:'treasuries.treasury_id' },
      account_key:{ type:'string' }, period_id:{ type:'string' },
      debit:{ type:'decimal', default:0 }, credit:{ type:'decimal', default:0 },
      description:{ type:'text' }, created_at:{ type:'datetime' }
    }
  },
  fin_periods: {
    fields: {
      period_id:{ type:'string', pk:true }, church_id:{ type:'uuid', ref:'churches.church_id' },
      status:{ type:'enum', values:['open','closed'], default:'open' },
      opened_at:{ type:'datetime' }, closed_at:{ type:'datetime', nullable:true },
      closed_by:{ type:'uuid', ref:'users.user_id', nullable:true }
    }
  },
  fin_insights: {
    fields: {
      kind:{ type:'string' }, severity:{ type:'enum', values:['info','warning','critical'] },
      msg:{ type:'text' }, church_id:{ type:'uuid', ref:'churches.church_id' },
      computed_at:{ type:'datetime' }
    }
  }
};

/* ============================================================
   v5 — CHURCH SERVICE HIERARCHY + FAMILY + FINANCE WORKFLOW
   Extends the schema above with new tables and member fields.
   ============================================================ */
(function(){
  const S = window.SCHEMA;

  /* ----- Hierarchical service tree ----- */
  S.services = { fields: {
    service_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    name:{ type:'string', required:true },            // ابتدائي / إعدادي / ثانوي / جامعة / شباب / مدارس أحد
    code:{ type:'string' },
    description:{ type:'text' },
    supervisor_id:{ type:'uuid', ref:'users.user_id', nullable:true },
    active:{ type:'boolean', default:true },
    created_at:{ type:'datetime' }
  }};

  S.service_stages = { fields: {
    stage_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    service_id:{ type:'uuid', ref:'services.service_id', required:true },
    name:{ type:'string', required:true },            // أولى وثانية ابتدائي
    age_min:{ type:'int' },
    age_max:{ type:'int' },
    supervisor_id:{ type:'uuid', ref:'users.user_id', nullable:true },
    created_at:{ type:'datetime' }
  }};

  S.service_groups = { fields: {
    group_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    service_id:{ type:'uuid', ref:'services.service_id' },
    stage_id:{ type:'uuid', ref:'service_stages.stage_id' },
    name:{ type:'string', required:true },            // مجموعة بنين / بنات
    gender:{ type:'enum', values:['male','female','mixed'], default:'mixed' },
    leader_id:{ type:'uuid', ref:'users.user_id', nullable:true },
    created_at:{ type:'datetime' }
  }};

  /* ----- Extend service_classes with hierarchy refs ----- */
  Object.assign(S.service_classes.fields, {
    service_id:{ type:'uuid', ref:'services.service_id', nullable:true },
    stage_id:{ type:'uuid', ref:'service_stages.stage_id', nullable:true },
    group_id:{ type:'uuid', ref:'service_groups.group_id', nullable:true }
  });

  /* ----- Extend members with full profile + family + education ----- */
  Object.assign(S.members.fields, {
    nickname:{ type:'string', nullable:true },
    join_date:{ type:'date', nullable:true },
    spiritual_notes:{ type:'text', nullable:true },
    special_needs:{ type:'text', nullable:true },
    assigned_servant_id:{ type:'uuid', ref:'users.user_id', nullable:true },
    supervisor_id:{ type:'uuid', ref:'users.user_id', nullable:true },
    service_id:{ type:'uuid', ref:'services.service_id', nullable:true },
    stage_id:{ type:'uuid', ref:'service_stages.stage_id', nullable:true },
    group_id:{ type:'uuid', ref:'service_groups.group_id', nullable:true },
    // education / work
    education:{ type:'string', nullable:true },
    college:{ type:'string', nullable:true },
    work:{ type:'string', nullable:true },
    // family linking
    family_id:{ type:'uuid', nullable:true },
    father_name:{ type:'string', nullable:true },
    father_phone:{ type:'string', nullable:true },
    father_job:{ type:'string', nullable:true },
    father_spiritual_status:{ type:'string', nullable:true },
    mother_name:{ type:'string', nullable:true },
    mother_phone:{ type:'string', nullable:true },
    mother_job:{ type:'string', nullable:true },
    mother_spiritual_status:{ type:'string', nullable:true },
    area:{ type:'string', nullable:true },
    family_notes:{ type:'text', nullable:true },
    siblings_count:{ type:'int', nullable:true },
    birth_order:{ type:'int', nullable:true }
  });
  // phone is optional for kids; parent_phone REQUIRED for kids enforced in form/logic
  if (S.members.fields.phone) S.members.fields.phone.required = false;

  /* ----- Add `service_supervisor` role to users enum ----- */
  const roleField = S.users.fields.role;
  if (roleField && !roleField.values.includes('service_supervisor')){
    roleField.values.push('service_supervisor');
  }

  /* ----- Service Supervisor assignments ----- */
  S.service_supervisors = { fields: {
    sup_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    user_id:{ type:'uuid', ref:'users.user_id', required:true },
    service_id:{ type:'uuid', ref:'services.service_id' },
    stage_id:{ type:'uuid', ref:'service_stages.stage_id', nullable:true },
    assigned_at:{ type:'datetime' },
    active:{ type:'boolean', default:true }
  }};

  /* ----- Servant evaluation by supervisor ----- */
  S.servant_evaluations = { fields: {
    eval_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    servant_id:{ type:'uuid', ref:'users.user_id', required:true },
    supervisor_id:{ type:'uuid', ref:'users.user_id', required:true },
    period:{ type:'string' },                         // 2026-Q1
    attendance_score:{ type:'int' },                  // 0..10
    visitation_score:{ type:'int' },
    spiritual_score:{ type:'int' },
    teamwork_score:{ type:'int' },
    overall:{ type:'int' },
    notes:{ type:'text' },
    created_at:{ type:'datetime' }
  }};

  /* ----- Financial workflow ----- */
  S.financial_requests = { fields: {
    request_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    requester_id:{ type:'uuid', ref:'users.user_id' },
    type:{ type:'enum', values:['payment','donation','expense','reimbursement','event_advance'] },
    amount:{ type:'decimal', required:true },
    currency:{ type:'string', default:'EGP' },
    purpose:{ type:'text' },
    related_event_id:{ type:'uuid', ref:'events.event_id', nullable:true },
    // Workflow: draft → submitted → financial_review → approved/rejected → admin_review → final
    status:{ type:'enum', values:[
      'draft','submitted','financial_review','approved','rejected','admin_review','final_approved','paid','cancelled'
    ], default:'draft'},
    financial_reviewer_id:{ type:'uuid', nullable:true },
    financial_reviewed_at:{ type:'datetime', nullable:true },
    financial_notes:{ type:'text', nullable:true },
    admin_reviewer_id:{ type:'uuid', nullable:true },
    admin_reviewed_at:{ type:'datetime', nullable:true },
    admin_notes:{ type:'text', nullable:true },
    created_at:{ type:'datetime' }
  }};

  /* ----- Birthday reminders (computed cache) ----- */
  S.birthday_reminders = { fields: {
    reminder_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id' },
    member_id:{ type:'uuid', ref:'members.member_id' },
    upcoming_at:{ type:'date' },
    notified_servant:{ type:'boolean', default:false },
    created_at:{ type:'datetime' }
  }};
})();


/* ===== FAMILY-CENTERED SYSTEM (Phase 10) ===== */
(function(){
  const S = window.SCHEMA;
  S.families = { fields: {
    family_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    family_code:{ type:'string', unique:true }, // FAM-YYYY-NNNN
    family_name:{ type:'string', required:true },
    area:{ type:'string' },
    city:{ type:'string' },
    address:{ type:'string' },
    latitude:{ type:'decimal', nullable:true },
    longitude:{ type:'decimal', nullable:true },
    primary_phone:{ type:'string' },
    secondary_phone:{ type:'string' },
    family_status:{ type:'enum', values:['active','inactive','at_risk'], default:'active' },
    registration_date:{ type:'datetime' },
    notes:{ type:'text' },
    father_name:{ type:'string' },
    father_birth_date:{ type:'date' },
    father_phone:{ type:'string' },
    father_job:{ type:'string' },
    father_spiritual_status:{ type:'string' },
    father_notes:{ type:'text' },
    mother_name:{ type:'string' },
    mother_birth_date:{ type:'date' },
    mother_phone:{ type:'string' },
    mother_job:{ type:'string' },
    mother_spiritual_status:{ type:'string' },
    mother_notes:{ type:'text' },
    followup_notes:{ type:'text' },
    visitation_notes:{ type:'text' },
    special_conditions:{ type:'text' },
    emergency_notes:{ type:'text' },
    created_at:{ type:'datetime' }
  }};

  // Add family linkage to members schema
  if (S.members && S.members.fields){
    S.members.fields.family_id   = { type:'uuid', ref:'families.family_id', nullable:true };
    S.members.fields.family_role = { type:'enum', values:['father','mother','child','other'], nullable:true };
  }

  S.pending_transitions = { fields: {
    transition_id:{ type:'uuid', pk:true },
    church_id:{ type:'uuid', ref:'churches.church_id', required:true },
    member_id:{ type:'uuid', ref:'members.member_id', required:true },
    family_id:{ type:'uuid', ref:'families.family_id', nullable:true },
    current_stage:{ type:'string', nullable:true },
    suggested_stage:{ type:'string' },
    current_class_id:{ type:'uuid', nullable:true },
    suggested_class_id:{ type:'uuid', nullable:true },
    approved_class_id:{ type:'uuid', nullable:true },
    approved_servant_id:{ type:'uuid', nullable:true },
    reason:{ type:'string' },
    age_years:{ type:'int' },
    status:{ type:'enum', values:['pending','approved','rejected'], default:'pending' },
    reviewer_id:{ type:'uuid', nullable:true },
    reviewed_at:{ type:'datetime', nullable:true },
    reject_reason:{ type:'string', nullable:true },
    created_at:{ type:'datetime' }
  }};
})();

/* ============================================================
   MERGED SCHEMAS (v12..v15) — previously separate files
   Consolidated for file-count discipline. Loaded as part of schema.js.
   ============================================================ */

/* ----- schema-v12 ----- */
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

/* ----- schema-v13 ----- */
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

/* ----- schema-v14 ----- */
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

/* ----- schema-v15 ----- */
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
