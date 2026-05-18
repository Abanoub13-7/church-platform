/* Mock data seeded into LocalStorage on first load */
window.MOCK_DATA = {
  churches: [
    { church_id:'ch-001', church_name:'كنيسة السيدة العذراء', church_code:'STM-001', church_logo:'', subscription_plan:'pro', subscription_status:'active', church_admin_id:'usr-001', created_at:'2024-01-15T10:00:00Z' },
    { church_id:'ch-002', church_name:'كنيسة الأنبا أنطونيوس', church_code:'STA-002', church_logo:'', subscription_plan:'basic', subscription_status:'trial', church_admin_id:'usr-010', created_at:'2024-06-20T10:00:00Z' },
    { church_id:'ch-003', church_name:'كنيسة الشهيد مارجرجس', church_code:'STG-003', church_logo:'', subscription_plan:'enterprise', subscription_status:'active', church_admin_id:'usr-020', created_at:'2023-09-01T10:00:00Z' }
  ],

  users: [
    { user_id:'usr-super', church_id:null, full_name:'مدير المنصة', email:'super@platform.local', password_hash:'super123', role:'super_admin', is_active:true, created_at:'2024-01-01T00:00:00Z' },
    { user_id:'usr-001', church_id:'ch-001', member_id:'mem-001', full_name:'الأب يوحنا', email:'admin@church.local', password_hash:'admin123', role:'church_admin', is_active:true, created_at:'2024-01-15T10:00:00Z' },
    { user_id:'usr-002', church_id:'ch-001', member_id:'mem-002', full_name:'مينا عاطف', email:'mina@church.local', password_hash:'mina123', role:'servant', is_active:true, created_at:'2024-02-01T10:00:00Z' },
    { user_id:'usr-003', church_id:'ch-001', member_id:'mem-003', full_name:'مريم سمير', email:'maryam@church.local', password_hash:'maryam123', role:'supervisor', is_active:true, created_at:'2024-02-10T10:00:00Z' },
    { user_id:'usr-004', church_id:'ch-001', full_name:'أمين الخدمة', email:'service@church.local', password_hash:'srv123', role:'service_admin', is_active:true, created_at:'2024-01-20T10:00:00Z' }
  ],

  service_classes: [
    { class_id:'cls-001', church_id:'ch-001', class_name:'الابتدائي - بنين', age_stage:'primary', supervisor_id:'usr-002' },
    { class_id:'cls-002', church_id:'ch-001', class_name:'الإعدادي - بنات', age_stage:'preparatory', supervisor_id:'usr-003' },
    { class_id:'cls-003', church_id:'ch-001', class_name:'الثانوي', age_stage:'secondary', supervisor_id:'usr-003' },
    { class_id:'cls-004', church_id:'ch-001', class_name:'الجامعة', age_stage:'university', supervisor_id:'usr-004' }
  ],

  members: [
    { member_id:'mem-001', church_id:'ch-001', full_name:'الأب يوحنا الكاهن', gender:'male', age_stage:'adult', phone:'01000000001', member_status:'active', qr_code:'QR-MEM-001' },
    { member_id:'mem-002', church_id:'ch-001', full_name:'مينا عاطف', gender:'male', age_stage:'youth', phone:'01000000002', service_class_id:'cls-001', member_status:'active', qr_code:'QR-MEM-002' },
    { member_id:'mem-003', church_id:'ch-001', full_name:'مريم سمير', gender:'female', age_stage:'youth', phone:'01000000003', service_class_id:'cls-002', member_status:'active', qr_code:'QR-MEM-003' },
    { member_id:'mem-004', church_id:'ch-001', full_name:'كيرلس وائل', gender:'male', age_stage:'primary', parent_phone:'01000000004', service_class_id:'cls-001', member_status:'at_risk', qr_code:'QR-MEM-004' },
    { member_id:'mem-005', church_id:'ch-001', full_name:'ماريا جورج', gender:'female', age_stage:'primary', parent_phone:'01000000005', service_class_id:'cls-001', member_status:'active', qr_code:'QR-MEM-005' },
    { member_id:'mem-006', church_id:'ch-001', full_name:'بيشوي ناجي', gender:'male', age_stage:'preparatory', parent_phone:'01000000006', service_class_id:'cls-002', member_status:'new', first_visit_at:new Date(Date.now()-7*864e5).toISOString(), qr_code:'QR-MEM-006' },
    { member_id:'mem-007', church_id:'ch-001', full_name:'يوستينا ميلاد', gender:'female', age_stage:'secondary', phone:'01000000007', service_class_id:'cls-003', member_status:'active', qr_code:'QR-MEM-007' },
    { member_id:'mem-008', church_id:'ch-001', full_name:'مارك سامح', gender:'male', age_stage:'university', phone:'01000000008', service_class_id:'cls-004', member_status:'inactive', qr_code:'QR-MEM-008' }
  ],

  attendance_sessions: [
    { session_id:'ses-001', church_id:'ch-001', activity_type:'mass', title:'قداس الأحد', starts_at:new Date(Date.now()-7*864e5).toISOString(), status:'closed' },
    { session_id:'ses-002', church_id:'ch-001', activity_type:'sunday_school', title:'مدارس الأحد', class_id:'cls-001', starts_at:new Date(Date.now()-7*864e5).toISOString(), status:'closed' },
    { session_id:'ses-003', church_id:'ch-001', activity_type:'sunday_school', title:'مدارس الأحد', class_id:'cls-001', starts_at:new Date(Date.now()-14*864e5).toISOString(), status:'closed' },
    { session_id:'ses-004', church_id:'ch-001', activity_type:'sunday_school', title:'مدارس الأحد', class_id:'cls-001', starts_at:new Date(Date.now()-21*864e5).toISOString(), status:'closed' }
  ],

  attendance_records: [
    { record_id:'rec-001', church_id:'ch-001', session_id:'ses-002', member_id:'mem-005', check_in_at:new Date(Date.now()-7*864e5).toISOString(), check_in_method:'qr', is_late:false },
    { record_id:'rec-002', church_id:'ch-001', session_id:'ses-003', member_id:'mem-005', check_in_at:new Date(Date.now()-14*864e5).toISOString(), check_in_method:'qr', is_late:false }
  ],

  events: [
    { event_id:'evt-001', church_id:'ch-001', title:'مؤتمر الشباب الصيفي', description:'مؤتمر روحي لمدة 3 أيام', event_type:'conference', starts_at:new Date(Date.now()+30*864e5).toISOString(), ends_at:new Date(Date.now()+33*864e5).toISOString(), location:'دير الأنبا بيشوي', capacity:100, reserved_seats:10, vip_seats:5, servant_seats:5, waitlist_capacity:20, overbook_pct:0, price:500, currency:'EGP', has_waiting_list:true, requires_approval:false, auto_close_when_full:true, lifecycle:'reg_open', status:'active', access_rules:{ min_age:14, max_age:35 }, approval_required:true, approved_by:'usr-001', approved_at:new Date(Date.now()-5*864e5).toISOString(), created_by:'usr-001', created_at:new Date(Date.now()-10*864e5).toISOString() },
    { event_id:'evt-002', church_id:'ch-001', title:'رحلة الإسكندرية', description:'رحلة يوم واحد', event_type:'trip', starts_at:new Date(Date.now()+14*864e5).toISOString(), ends_at:new Date(Date.now()+14*864e5+10*36e5).toISOString(), location:'الإسكندرية', capacity:50, reserved_seats:0, vip_seats:0, servant_seats:4, waitlist_capacity:10, overbook_pct:5, price:300, currency:'EGP', has_waiting_list:true, requires_approval:true, auto_close_when_full:true, lifecycle:'reg_open', status:'active', access_rules:{}, approval_required:true, approved_by:'usr-001', approved_at:new Date(Date.now()-3*864e5).toISOString(), created_by:'usr-001', created_at:new Date(Date.now()-7*864e5).toISOString() }
  ],

  event_bookings: [],
  event_templates: [
    { template_id:'tpl-001', church_id:'ch-001', name:'مؤتمر شبابي', event_type:'conference', defaults:{ capacity:100, price:500, duration_hours:72, access_rules:{ min_age:14, max_age:35 }, tasks:[{title:'تجهيز المكان', role:'organizer'},{title:'تنسيق الانتقالات', role:'transport'}], budget_lines:[{category:'transport', label:'حافلات', estimated:5000},{category:'food', label:'وجبات', estimated:8000}] }, created_by:'usr-001', created_at:new Date().toISOString() },
    { template_id:'tpl-002', church_id:'ch-001', name:'رحلة يوم', event_type:'trip', defaults:{ capacity:50, price:300, duration_hours:10, access_rules:{}, tasks:[{title:'حجز الحافلة', role:'transport'}], budget_lines:[{category:'transport', label:'حافلة', estimated:3000}] }, created_by:'usr-001', created_at:new Date().toISOString() }
  ],
  event_tasks: [],
  event_budgets: [],
  event_expenses: [],
  event_timeline: [],
  followup_tasks: [
    { task_id:'tsk-001', church_id:'ch-001', member_id:'mem-004', assigned_to:'usr-002', created_by:'system', reason:'غياب 3 مرات متتالية عن مدارس الأحد', priority:'high', due_at:new Date(Date.now()+2*864e5).toISOString(), status:'open', escalation_level:0, created_at:new Date().toISOString() }
  ],
  followup_logs: [],
  notifications: [
    { notification_id:'ntf-001', church_id:'ch-001', user_id:'usr-002', type:'task', title:'مهمة افتقاد جديدة', body:'كيرلس وائل غاب 3 مرات', is_read:false, created_at:new Date().toISOString() }
  ],
  financial_transactions: [
    { transaction_id:'fin-001', church_id:'ch-001', type:'donation', amount:500, currency:'EGP', category:'عشور', payment_method:'cash', transaction_date:new Date().toISOString() },
    { transaction_id:'fin-002', church_id:'ch-001', type:'event_payment', amount:300, currency:'EGP', event_id:'evt-002', member_id:'mem-007', payment_method:'cash', transaction_date:new Date().toISOString() }
  ],
  servant_assignments: [
    { assignment_id:'asn-001', church_id:'ch-001', user_id:'usr-002', class_id:'cls-001', role:'خادم رئيسي', active:true }
  ],
  member_notes: [],
  member_risk_scores: [],
  workflow_actions: [
    { action_id:'wfa-001', church_id:'ch-001', name:'افتقاد بعد 3 غيابات متتالية', trigger_type:'absence_streak', trigger_config:{ count:3 }, steps:[
      { step:1, action:'create_task', assignTo:'class_servant', priority:'high' },
      { step:2, action:'wait', delay_hours:48 },
      { step:3, action:'escalate', to:'supervisor' },
      { step:4, action:'wait', delay_hours:72 },
      { step:5, action:'escalate', to:'service_admin' }
    ], is_active:true },
    { action_id:'wfa-002', church_id:'ch-001', name:'ترحيب بزائر جديد', trigger_type:'first_visit', trigger_config:{}, steps:[
      { step:1, action:'create_task', assignTo:'class_servant', priority:'medium', note:'متابعة زائر جديد' },
      { step:2, action:'send_whatsapp', template:'welcome' },
      { step:3, action:'wait', delay_hours:168 },
      { step:4, action:'create_task', assignTo:'class_servant', note:'متابعة بعد أسبوع' }
    ], is_active:true }
  ],
  workflow_history: [],
  church_settings: [
    { church_id:'ch-001', timezone:'Africa/Cairo', language:'ar', week_start:'sunday', ai_enabled:true, absence_threshold:3, theme:'auto' }
  ],
  audit_logs: []
};

/* ============================================================
   v5 — Seed for hierarchy (services/stages/groups), supervisors,
   family fields on members, financial workflow.
   Idempotent — only seeds if a table is empty / field missing.
   ============================================================ */
(function(){
  const M = window.MOCK_DATA;
  const cid = 'ch-001';

  // Services
  M.services = M.services || [
    { service_id:'svc-nursery',     church_id:cid, name:'الحضانة',     code:'NUR', active:true, supervisor_id:'usr-003', created_at:new Date().toISOString() },
    { service_id:'svc-primary',     church_id:cid, name:'ابتدائي',     code:'PRI', active:true, supervisor_id:'usr-003', created_at:new Date().toISOString() },
    { service_id:'svc-preparatory', church_id:cid, name:'إعدادي',      code:'PRE', active:true, supervisor_id:'usr-004', created_at:new Date().toISOString() },
    { service_id:'svc-secondary',   church_id:cid, name:'ثانوي',       code:'SEC', active:true, supervisor_id:'usr-004', created_at:new Date().toISOString() },
    { service_id:'svc-university',  church_id:cid, name:'جامعة',       code:'UNI', active:true, supervisor_id:'usr-004', created_at:new Date().toISOString() },
    { service_id:'svc-youth',       church_id:cid, name:'شباب',        code:'YTH', active:true, supervisor_id:'usr-004', created_at:new Date().toISOString() }
  ];

  M.service_stages = M.service_stages || [
    { stage_id:'stg-pri-12', church_id:cid, service_id:'svc-primary',     name:'أولى وثانية ابتدائي',  age_min:6,  age_max:7,  supervisor_id:'usr-003' },
    { stage_id:'stg-pri-34', church_id:cid, service_id:'svc-primary',     name:'ثالثة ورابعة ابتدائي', age_min:8,  age_max:9,  supervisor_id:'usr-003' },
    { stage_id:'stg-pri-56', church_id:cid, service_id:'svc-primary',     name:'خامسة وسادسة ابتدائي', age_min:10, age_max:11, supervisor_id:'usr-003' },
    { stage_id:'stg-pre-12', church_id:cid, service_id:'svc-preparatory', name:'أولى وثانية إعدادي',   age_min:12, age_max:13, supervisor_id:'usr-004' },
    { stage_id:'stg-pre-3',  church_id:cid, service_id:'svc-preparatory', name:'ثالثة إعدادي',         age_min:14, age_max:14, supervisor_id:'usr-004' },
    { stage_id:'stg-sec-all',church_id:cid, service_id:'svc-secondary',   name:'الثانوي العام',         age_min:15, age_max:17, supervisor_id:'usr-004' },
    { stage_id:'stg-uni-all',church_id:cid, service_id:'svc-university',  name:'جامعة',                 age_min:18, age_max:23 },
    { stage_id:'stg-yth-all',church_id:cid, service_id:'svc-youth',       name:'شباب',                  age_min:24, age_max:39 }
  ];

  M.service_groups = M.service_groups || [
    { group_id:'grp-pri12-b', church_id:cid, service_id:'svc-primary', stage_id:'stg-pri-12', name:'بنين', gender:'male' },
    { group_id:'grp-pri12-g', church_id:cid, service_id:'svc-primary', stage_id:'stg-pri-12', name:'بنات', gender:'female' },
    { group_id:'grp-pre-g',   church_id:cid, service_id:'svc-preparatory', stage_id:'stg-pre-12', name:'بنات إعدادي', gender:'female' }
  ];

  // Backfill classes with service/stage refs based on age_stage
  M.service_classes.forEach(c => {
    if (!c.service_id){
      const svc = (M.services.find(s => s.code?.toLowerCase().startsWith((c.age_stage||'').slice(0,3)))) ||
                  (M.services.find(s => (c.age_stage==='primary' && s.service_id==='svc-primary')
                                     || (c.age_stage==='preparatory' && s.service_id==='svc-preparatory')
                                     || (c.age_stage==='secondary' && s.service_id==='svc-secondary')
                                     || (c.age_stage==='university' && s.service_id==='svc-university')));
      if (svc) c.service_id = svc.service_id;
    }
    if (!c.stage_id){
      const stg = M.service_stages.find(s => s.service_id===c.service_id);
      if (stg) c.stage_id = stg.stage_id;
    }
  });

  // Service supervisors
  M.service_supervisors = M.service_supervisors || [
    { sup_id:'ssp-001', church_id:cid, user_id:'usr-003', service_id:'svc-primary',     assigned_at:new Date().toISOString(), active:true },
    { sup_id:'ssp-002', church_id:cid, user_id:'usr-004', service_id:'svc-preparatory', assigned_at:new Date().toISOString(), active:true },
    { sup_id:'ssp-003', church_id:cid, user_id:'usr-004', service_id:'svc-secondary',   assigned_at:new Date().toISOString(), active:true }
  ];

  // Add a dedicated service_supervisor user
  if (!M.users.find(u => u.role === 'service_supervisor')){
    M.users.push({
      user_id:'usr-sup1', church_id:cid, full_name:'الأستاذ صموئيل (مشرف خدمة)',
      email:'supervisor@church.local', password_hash:'sup123',
      role:'service_supervisor', is_active:true, created_at:new Date().toISOString()
    });
    M.service_supervisors.push({
      sup_id:'ssp-100', church_id:cid, user_id:'usr-sup1',
      service_id:'svc-primary', assigned_at:new Date().toISOString(), active:true
    });
  }

  // Add a dedicated financial_manager user
  if (!M.users.find(u => u.role === 'financial_manager')){
    M.users.push({
      user_id:'usr-fin1', church_id:cid, full_name:'الأستاذة مارثا (مديرة مالية)',
      email:'finance@church.local', password_hash:'fin123',
      role:'financial_manager', is_active:true, created_at:new Date().toISOString()
    });
  }

  // Backfill members with birth_date / family / assignments
  const today = new Date();
  function yearsAgo(y, m, d){ return new Date(today.getFullYear()-y, m, d).toISOString().slice(0,10); }
  const seedExtras = {
    'mem-001': { birth_date:yearsAgo(45,3,12), education:'لاهوت', work:'كاهن', join_date:'2010-01-01' },
    'mem-002': { birth_date:yearsAgo(28,5,4),  education:'هندسة', college:'هندسة القاهرة', work:'مهندس', join_date:'2012-09-01' },
    'mem-003': { birth_date:yearsAgo(26,7,22), education:'تربية', work:'مدرسة', join_date:'2013-09-01' },
    'mem-004': { birth_date:yearsAgo(9, (today.getMonth()+1)%12, Math.min(today.getDate()+2,28)),
                 school:'مدرسة المنارة', father_name:'وائل', father_phone:'01000000041', father_job:'محاسب',
                 mother_name:'هدى', mother_phone:'01000000042', area:'فيصل', family_id:'fam-001', birth_order:2, siblings_count:3,
                 assigned_servant_id:'usr-002', supervisor_id:'usr-003' },
    'mem-005': { birth_date:yearsAgo(8, today.getMonth(), today.getDate()),
                 school:'مدرسة المنارة', father_name:'جورج', father_phone:'01000000051',
                 mother_name:'إيريني', mother_phone:'01000000052', area:'فيصل', family_id:'fam-002', birth_order:1, siblings_count:2,
                 assigned_servant_id:'usr-002', supervisor_id:'usr-003' },
    'mem-006': { birth_date:yearsAgo(13,2,9), school:'إعدادي بنين',
                 father_name:'ناجي', father_phone:'01000000061', mother_name:'مارينا', mother_phone:'01000000062',
                 area:'العمرانية', family_id:'fam-003', assigned_servant_id:'usr-003', supervisor_id:'usr-004' },
    'mem-007': { birth_date:yearsAgo(16,10,2), school:'ثانوي بنات', assigned_servant_id:'usr-003', supervisor_id:'usr-004' },
    'mem-008': { birth_date:yearsAgo(20,1,15), college:'تجارة عين شمس', work:'طالب', assigned_servant_id:'usr-004' }
  };
  M.members.forEach(m => {
    const ex = seedExtras[m.member_id];
    if (ex) Object.assign(m, ex);
    // backfill service/stage from class
    const cls = M.service_classes.find(c => c.class_id===m.service_class_id);
    if (cls){ m.service_id = m.service_id || cls.service_id; m.stage_id = m.stage_id || cls.stage_id; }
  });

  // Servant assignments — ensure mina (usr-002) on cls-001, maryam (usr-003) on cls-002
  M.servant_assignments = M.servant_assignments || [];
  function ensureAsn(uid, clsid){
    if (!M.servant_assignments.find(a=>a.user_id===uid && a.class_id===clsid)){
      M.servant_assignments.push({ assignment_id:'asn-'+uid+'-'+clsid, church_id:cid, user_id:uid, class_id:clsid, role:'خادم', active:true });
    }
  }
  ensureAsn('usr-002','cls-001');
  ensureAsn('usr-003','cls-002');

  M.servant_evaluations  = M.servant_evaluations  || [];
  M.financial_requests   = M.financial_requests   || [
    { request_id:'fr-001', church_id:cid, requester_id:'usr-004', type:'event_advance', amount:5000, currency:'EGP',
      purpose:'مقدم رحلة الإسكندرية', related_event_id:'evt-002', status:'financial_review',
      created_at:new Date(Date.now()-2*864e5).toISOString() }
  ];
  M.birthday_reminders   = M.birthday_reminders   || [];
})();


/* ===== FAMILY-CENTERED SYSTEM SEED (Phase 10) ===== */
(function(){
  const M = window.MOCK_DATA;
  const cid = 'ch-001';
  const today = new Date().toISOString();

  M.families = M.families || [
    { family_id:'fam-001', church_id:cid, family_code:'FAM-2026-0001',
      family_name:'عائلة وائل ميخائيل', area:'شبرا', city:'القاهرة',
      address:'٢٥ ش الترعة', primary_phone:'01000000004', secondary_phone:'01000000040',
      family_status:'active', registration_date:'2024-02-01T00:00:00Z',
      father_name:'وائل ميخائيل', father_birth_date:'1978-05-12', father_phone:'01000000040',
      father_job:'مهندس', father_spiritual_status:'منتظم',
      mother_name:'ماري نبيل', mother_birth_date:'1982-09-03', mother_phone:'01000000041',
      mother_job:'معلمة', mother_spiritual_status:'منتظم',
      followup_notes:'أسرة منتظمة', visitation_notes:'زيارة شهرية',
      created_at:today },
    { family_id:'fam-002', church_id:cid, family_code:'FAM-2026-0002',
      family_name:'عائلة جورج رزق', area:'الزيتون', city:'القاهرة',
      address:'١٠ ش الجلاء', primary_phone:'01000000005', secondary_phone:'',
      family_status:'at_risk', registration_date:'2023-09-15T00:00:00Z',
      father_name:'جورج رزق', father_birth_date:'1975-01-20', father_phone:'01000000050',
      father_job:'محاسب', father_spiritual_status:'غير منتظم',
      mother_name:'إيرين فايز', mother_birth_date:'1980-07-11', mother_phone:'01000000051',
      mother_job:'ربة منزل', mother_spiritual_status:'منتظم',
      followup_notes:'تحتاج افتقاد عاجل', visitation_notes:'',
      created_at:today }
  ];

  // Link existing members to families and tag roles
  const link = (mid, fid, role) => {
    const m = (M.members||[]).find(x=>x.member_id===mid);
    if (m){ m.family_id = fid; m.family_role = role; }
  };
  link('mem-004','fam-001','child'); // كيرلس وائل
  link('mem-005','fam-002','child'); // ماريا جورج

  M.pending_transitions = M.pending_transitions || [];
})();
