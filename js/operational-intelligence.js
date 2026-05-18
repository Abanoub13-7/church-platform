/* ============================================================
   operational-intelligence.js  —  v21
   Enterprise Operational Intelligence Layer
   ------------------------------------------------------------
   Bundles 5 lightweight engines into a single file (file budget):
     • Timeline Engine          (window.Timeline)
     • Follow-up Intelligence   (window.FollowupIntel)
     • Notification Center      (window.NotificationCenter)
     • Rule Engine              (window.RuleEngine)
     • Central Calendar Engine  (window.Calendar)
   All engines:
     - integrate with window.Bus / Events
     - register additive schema (no migration needed)
     - fail safe; never throw at module load
     - idempotent (safe to load multiple times)
   ============================================================ */
(function(){
  if (window.__OPINTEL_LOADED__) return;
  window.__OPINTEL_LOADED__ = true;

  const Bus    = window.Bus;
  const Events = window.Events || {};
  const DB     = window.DB;
  if (!DB){ try{console.warn('[opintel] DB missing');}catch(_){ } return; }

  /* ---------- schema (additive) ---------- */
  try {
    if (window.SCHEMA){
      const S = window.SCHEMA;
      if (!S.timeline_events) S.timeline_events = { fields:{
        event_id:{type:'uuid',pk:true}, church_id:{type:'uuid',nullable:true},
        domain:{type:'string'}, kind:{type:'string'}, severity:{type:'string',default:'info'},
        actor_id:{type:'uuid',nullable:true},
        family_id:{type:'uuid',nullable:true}, member_id:{type:'uuid',nullable:true},
        ref_table:{type:'string',nullable:true}, ref_id:{type:'string',nullable:true},
        title:{type:'string'}, detail:{type:'text',nullable:true},
        icon:{type:'string',nullable:true}, color:{type:'string',nullable:true},
        occurred_at:{type:'datetime'}, created_at:{type:'datetime'}
      }};
      if (!S.rules) S.rules = { fields:{
        rule_id:{type:'uuid',pk:true}, name:{type:'string'}, category:{type:'string'},
        trigger:{type:'string'}, conditions:{type:'json',nullable:true},
        actions:{type:'json'}, priority:{type:'int',default:5},
        enabled:{type:'bool',default:true}, created_at:{type:'datetime'}
      }};
      if (!S.calendar_events) S.calendar_events = { fields:{
        ce_id:{type:'uuid',pk:true}, church_id:{type:'uuid',nullable:true},
        category:{type:'enum',values:['liturgy','meeting','sunday_school','event','followup','service'],default:'event'},
        title:{type:'string'}, color:{type:'string',nullable:true}, icon:{type:'string',nullable:true},
        starts_at:{type:'datetime'}, ends_at:{type:'datetime',nullable:true},
        recurrence:{type:'string',default:'none'}, source_table:{type:'string',nullable:true},
        source_id:{type:'string',nullable:true}, created_at:{type:'datetime'}
      }};
    }
  } catch(_){}

  /* DB helpers ------------------------------------------------ */
  const uuid = () => (DB.uuid ? DB.uuid() :
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c=>{
      const r=Math.random()*16|0; return (c==='x'?r:(r&0x3|0x8)).toString(16);
    }));
  const now = () => new Date().toISOString();
  const all = t => { try { return DB.all ? DB.all(t) : (DB.findAll ? DB.findAll(t) : []); } catch(_){ return []; } };
  const insert = (t,row) => { try { return DB.insert(t,row); } catch(_){ return null; } };

  /* =====================================================
     TIMELINE ENGINE
     ===================================================== */
  const Timeline = {
    log(evt){
      if (!evt) return null;
      const row = Object.assign({
        event_id: uuid(),
        domain: 'system', kind: 'event', severity:'info',
        title:'حدث', detail:null,
        occurred_at: now(), created_at: now()
      }, evt);
      insert('timeline_events', row);
      try { Bus && Bus.emit('timeline.event.created', { event: row }); } catch(_){}
      return row;
    },
    forFamily(family_id, limit){
      const list = all('timeline_events')
        .filter(e => e.family_id === family_id)
        .sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
      return limit ? list.slice(0, limit) : list;
    },
    forMember(member_id, limit){
      const list = all('timeline_events')
        .filter(e => e.member_id === member_id)
        .sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
      return limit ? list.slice(0, limit) : list;
    },
    recent(limit){
      return all('timeline_events')
        .sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at))
        .slice(0, limit||50);
    },
    filter(opts){
      opts = opts || {};
      return all('timeline_events').filter(e =>
        (!opts.domain   || e.domain   === opts.domain) &&
        (!opts.kind     || e.kind     === opts.kind) &&
        (!opts.severity || e.severity === opts.severity) &&
        (!opts.family_id|| e.family_id=== opts.family_id) &&
        (!opts.member_id|| e.member_id=== opts.member_id)
      ).sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
    },
    renderHTML(events, opts){
      opts = opts || {};
      if (!events || !events.length){
        return '<div class="empty" style="padding:1rem;color:var(--text3,#888)">لا توجد أحداث بعد</div>';
      }
      const fmt = window.UI && UI.fmt && UI.fmt.relative
        ? UI.fmt.relative
        : (d => new Date(d).toLocaleString('ar-EG'));
      const sevColor = s => ({info:'#3b82f6',warn:'#f59e0b',urgent:'#ef4444',success:'#10b981'})[s] || '#64748b';
      const items = events.map(e => `
        <div style="display:flex;gap:.75rem;padding:.75rem;border-bottom:1px solid var(--border,#eee)">
          <div style="width:32px;height:32px;border-radius:50%;background:${e.color||sevColor(e.severity)}22;color:${e.color||sevColor(e.severity)};display:flex;align-items:center;justify-content:center;flex-shrink:0">
            <i class="fa-solid fa-${e.icon||'circle'}"></i>
          </div>
          <div style="flex:1;min-width:0">
            <div style="font-weight:600">${e.title||''}</div>
            ${e.detail?`<div style="color:var(--text2,#555);font-size:.85rem;margin-top:.15rem">${e.detail}</div>`:''}
            <div style="color:var(--text3,#888);font-size:.72rem;margin-top:.2rem">${fmt(e.occurred_at)} · ${e.domain||''}</div>
          </div>
        </div>`).join('');
      return `<div class="timeline-list">${items}</div>`;
    }
  };
  window.Timeline = Timeline;

  /* Bridge: Event Bus → Timeline ------------------------------ */
  function bind(evt, mapper){
    if (!Bus) return;
    try { Bus.on(evt, p => { try { const t = mapper(p); if (t) Timeline.log(t); } catch(_){} }); } catch(_){}
  }
  bind(Events.FAMILY_CREATED, p => ({ domain:'family', kind:'created', icon:'house-user', severity:'success',
    family_id:p&&p.family&&p.family.family_id, title:'تم إنشاء أسرة جديدة', detail:p&&p.family&&p.family.name }));
  bind(Events.FAMILY_TRANSFERRED, p => ({ domain:'family', kind:'transferred', icon:'right-left',
    family_id:p&&p.log&&p.log.family_id, title:'نقل أسرة بين الكنائس' }));
  bind(Events.FAMILY_SPLIT, p => ({ domain:'family', kind:'split', icon:'code-branch',
    family_id:p&&p.log&&p.log.family_id, title:'انقسام أسرة' }));
  bind(Events.FAMILY_MERGED, p => ({ domain:'family', kind:'merged', icon:'code-merge',
    family_id:p&&p.log&&p.log.family_id, title:'دمج أسرة' }));
  bind(Events.GUARDIAN_CHANGED, p => ({ domain:'family', kind:'guardian_changed', icon:'user-shield',
    family_id:p&&p.log&&p.log.family_id, title:'تغيير الولي/الوصي' }));
  bind(Events.FAMILY_RISK_CHANGED, p => ({ domain:'family', kind:'risk_changed', icon:'gauge-high',
    severity:'warn', family_id:p&&p.family_id, title:'تغير مستوى المخاطر للأسرة',
    detail:p&&p.level?('المستوى: '+p.level):'' }));
  bind(Events.ATTENDANCE_MARKED, p => {
    const r = p && p.record; if (!r) return null;
    return { domain:'attendance', kind:'marked', icon:'check', severity:'success',
      member_id:r.member_id, family_id:r.family_id||null,
      title:'تسجيل حضور', detail:r.session_id?('الجلسة: '+r.session_id):'' };
  });
  bind(Events.MEMBER_ABSENT, p => ({ domain:'attendance', kind:'absent', icon:'user-clock',
    severity:'warn', member_id:p&&p.member_id, family_id:p&&p.family_id,
    title:'غياب متكرر', detail:p&&p.weeks?(p.weeks+' أسابيع متتالية'):'' }));
  bind(Events.FAMILY_INACTIVE, p => ({ domain:'attendance', kind:'family_inactive', icon:'house-circle-exclamation',
    severity:'urgent', family_id:p&&p.family_id, title:'أسرة خاملة' }));
  bind(Events.TASK_CREATED, p => ({ domain:'followup', kind:'task_created', icon:'list-check',
    family_id:p&&p.task&&p.task.family_id, member_id:p&&p.task&&p.task.member_id,
    title:'مهمة افتقاد جديدة', detail:p&&p.task&&p.task.reason }));
  bind(Events.TASK_ESCALATED, p => ({ domain:'followup', kind:'task_escalated', icon:'fire',
    severity:'urgent', family_id:p&&p.task&&p.task.family_id, title:'تصعيد مهمة افتقاد' }));
  bind(Events.TASK_CLOSED, p => ({ domain:'followup', kind:'task_closed', icon:'check-double',
    severity:'success', family_id:p&&p.task&&p.task.family_id, title:'إغلاق مهمة افتقاد' }));
  bind(Events.NOTIFICATION_SENT, p => ({ domain:'notification', kind:'sent', icon:'bell',
    title:(p&&p.notification&&p.notification.title)||'إشعار جديد' }));

  /* =====================================================
     FOLLOW-UP INTELLIGENCE
     ===================================================== */
  const FollowupIntel = {
    PRIORITY: { LOW:'low', MEDIUM:'medium', HIGH:'high', CRITICAL:'critical' },
    _has(family_id, reason){
      return all('followups').some(t =>
        t.family_id === family_id && t.reason === reason &&
        ['open','in_progress','escalated'].includes(t.status));
    },
    create(opts){
      opts = opts || {};
      if (opts.family_id && opts.reason && this._has(opts.family_id, opts.reason)) return null;
      const row = Object.assign({
        followup_id: uuid(),
        status:'open', escalation_level:0, priority:'medium',
        created_at: now()
      }, opts);
      insert('followups', row);
      try { Bus && Bus.emit(Events.TASK_CREATED, { task: row }); } catch(_){}
      Timeline.log({ domain:'followup', kind:'auto_created', icon:'wand-magic-sparkles',
        severity: row.priority==='critical'?'urgent':'info',
        family_id: row.family_id, member_id: row.member_id,
        title:'افتقاد ذكي مُقترح', detail: row.reason });
      NotificationCenter.push({
        type:'followup', priority: row.priority,
        title:'مهمة افتقاد مقترحة',
        body: row.reason || 'تم اكتشاف حاجة لمتابعة',
        link:'followup.html', family_id: row.family_id
      });
      return row;
    },
    scan(){
      const out = { created:0, scanned:0 };
      try {
        const families = all('families');
        out.scanned = families.length;
        const today = new Date();

        families.forEach(f => {
          // attendance decline (uses FamilyAttendance if available)
          let weeksAbsent = 0;
          try {
            if (window.FamilyAttendance && window.FamilyAttendance.consecutiveAbsence)
              weeksAbsent = window.FamilyAttendance.consecutiveAbsence(f.family_id) || 0;
          } catch(_){}
          if (weeksAbsent >= 4){
            const t = this.create({
              family_id: f.family_id, reason:`غياب الأسرة لمدة ${weeksAbsent} أسابيع متتالية`,
              priority: weeksAbsent >= 8 ? this.PRIORITY.CRITICAL : this.PRIORITY.HIGH,
              source:'intel:attendance_decline'
            });
            if (t) out.created++;
          }

          // children active but parents inactive
          try {
            const members = all('members').filter(m => m.family_id === f.family_id);
            const recs = all('attendance_records');
            const recent = recs.filter(r => (new Date() - new Date(r.created_at||r.attended_at||0)) < 21*864e5);
            const parents = members.filter(m => /father|mother|guardian|parent/i.test(m.role||''));
            const children = members.filter(m => /child|son|daughter/i.test(m.role||''));
            const pAct = parents.some(p => recent.some(r => r.member_id === p.member_id));
            const cAct = children.some(c => recent.some(r => r.member_id === c.member_id));
            if (children.length && parents.length && cAct && !pAct){
              const t = this.create({
                family_id: f.family_id, reason:'الأطفال يحضرون بينما الوالدان غائبان',
                priority: this.PRIORITY.HIGH, source:'intel:parent_disengagement'
              });
              if (t) out.created++;
            }
          } catch(_){}

          // risk escalation
          try {
            if (f.risk_status === 'critical' || f.risk_status === 'high'){
              const t = this.create({
                family_id: f.family_id, reason:`أسرة في مستوى مخاطر ${f.risk_status}`,
                priority: f.risk_status==='critical'?this.PRIORITY.CRITICAL:this.PRIORITY.HIGH,
                source:'intel:risk_escalation'
              });
              if (t) out.created++;
            }
          } catch(_){}
        });

        // inactive servants (30d)
        try {
          const recs = all('attendance_records');
          const servants = all('members').filter(m => /servant|leader|teacher|deacon/i.test(m.role||''));
          servants.forEach(s => {
            const last = recs.filter(r => r.member_id === s.member_id)
              .sort((a,b)=> new Date(b.created_at||0)-new Date(a.created_at||0))[0];
            const days = last ? Math.floor((today - new Date(last.created_at||last.attended_at||0))/864e5) : 999;
            if (days >= 30){
              this.create({
                member_id: s.member_id, family_id: s.family_id||null,
                reason:`خادم خامل منذ ${days} يومًا`,
                priority: this.PRIORITY.MEDIUM, source:'intel:servant_inactive'
              });
            }
          });
        } catch(_){}
      } catch(_){}
      return out;
    },
    pending(){ return all('followups').filter(t => ['open','in_progress'].includes(t.status)); },
    overdue(){
      return all('followups').filter(t => {
        if (!['open','in_progress'].includes(t.status)) return false;
        if (!t.due_at) return false;
        return new Date(t.due_at) < new Date();
      });
    },
    escalated(){ return all('followups').filter(t => t.status==='escalated' || (t.escalation_level||0) > 0); }
  };
  window.FollowupIntel = FollowupIntel;

  /* =====================================================
     NOTIFICATION CENTER
     ===================================================== */
  const NotificationCenter = {
    PRIORITY: ['low','medium','high','critical'],
    push(n){
      n = n || {};
      let userId = null;
      try { userId = (window.Auth && Auth.session && Auth.session().user_id) || null; } catch(_){}
      const row = Object.assign({
        notification_id: uuid(),
        user_id: userId,
        type: n.type || 'info',
        priority: n.priority || 'medium',
        title: n.title || 'إشعار',
        body: n.body || '',
        link: n.link || null,
        is_read: false,
        created_at: now()
      }, n);
      // dedupe last 5 min
      const recent = all('notifications')
        .filter(x => x.user_id === userId && x.title === row.title && x.body === row.body)
        .filter(x => (new Date() - new Date(x.created_at)) < 5*60*1000);
      if (recent.length) return recent[0];
      insert('notifications', row);
      try { Bus && Bus.emit(Events.NOTIFICATION_SENT, { notification: row }); } catch(_){}
      return row;
    },
    unread(){
      let uid = null; try{ uid = Auth.session().user_id; }catch(_){}
      return all('notifications').filter(n => !n.is_read && n.user_id === uid);
    },
    grouped(){
      const out = { critical:[], high:[], medium:[], low:[] };
      this.unread().forEach(n => { (out[n.priority]||out.medium).push(n); });
      return out;
    }
  };
  window.NotificationCenter = NotificationCenter;

  /* =====================================================
     RULE ENGINE
     ===================================================== */
  const RuleEngine = {
    _registry: [],
    register(rule){
      if (!rule || !rule.trigger || !rule.action) return;
      this._registry.push(Object.assign({ enabled:true, priority:5 }, rule));
      try { if (Bus) Bus.on(rule.trigger, p => this._run(rule, p)); } catch(_){}
    },
    _run(rule, payload){
      if (!rule.enabled) return;
      try {
        if (rule.when && !rule.when(payload)) return;
        rule.action(payload);
      } catch(err){ try{console.warn('[rule]',rule.name,err);}catch(_){} }
    },
    list(){ return this._registry.slice(); },
    enable(name, on){ this._registry.forEach(r => { if (r.name===name) r.enabled = !!on; }); }
  };
  window.RuleEngine = RuleEngine;

  /* Default rules ------------------------------------------- */
  RuleEngine.register({
    name:'family_absent_4w_creates_followup',
    trigger: Events.FAMILY_INACTIVE,
    action: p => p && p.family_id && FollowupIntel.create({
      family_id: p.family_id, reason:'أسرة خاملة - تم الاكتشاف تلقائياً',
      priority: FollowupIntel.PRIORITY.HIGH, source:'rule:family_inactive'
    })
  });
  RuleEngine.register({
    name:'risk_change_notifies_admin',
    trigger: Events.FAMILY_RISK_CHANGED,
    when: p => p && (p.level==='high' || p.level==='critical'),
    action: p => NotificationCenter.push({
      type:'alert', priority: p.level==='critical'?'critical':'high',
      title:'تصاعد مخاطر أسرة',
      body:`الأسرة ${p.family_id} وصلت إلى مستوى ${p.level}`,
      link:'family-profile.html?family_id='+(p.family_id||'')
    })
  });
  RuleEngine.register({
    name:'task_escalated_notifies_supervisor',
    trigger: Events.TASK_ESCALATED,
    action: p => NotificationCenter.push({
      type:'workflow', priority:'high',
      title:'تصعيد مهمة افتقاد',
      body:(p&&p.task&&p.task.reason)||'مهمة افتقاد تم تصعيدها',
      link:'followup.html'
    })
  });
  RuleEngine.register({
    name:'member_absent_creates_alert',
    trigger: Events.MEMBER_ABSENT,
    when: p => p && (p.weeks||0) >= 3,
    action: p => NotificationCenter.push({
      type:'alert', priority:'medium',
      title:'غياب متكرر',
      body:`عضو غائب لـ ${p.weeks} أسابيع`, link:'attendance.html'
    })
  });

  /* =====================================================
     CENTRAL CALENDAR ENGINE
     ===================================================== */
  const CAT_META = {
    liturgy:       { color:'#7c3aed', icon:'church',         label:'قداس' },
    meeting:       { color:'#0ea5e9', icon:'people-group',   label:'اجتماع' },
    sunday_school: { color:'#f59e0b', icon:'book-open',      label:'مدارس أحد' },
    event:         { color:'#10b981', icon:'calendar-day',   label:'حدث' },
    followup:      { color:'#ef4444', icon:'user-clock',     label:'افتقاد' },
    service:       { color:'#64748b', icon:'hands-praying',  label:'خدمة' }
  };
  const Calendar = {
    CATEGORIES: CAT_META,
    add(evt){
      const row = Object.assign({
        ce_id: uuid(), category:'event', title:'حدث',
        starts_at: now(), recurrence:'none', created_at: now()
      }, evt||{});
      const meta = CAT_META[row.category] || CAT_META.event;
      row.color = row.color || meta.color;
      row.icon  = row.icon  || meta.icon;
      insert('calendar_events', row);
      try { Bus && Bus.emit('calendar.event.created', { event: row }); } catch(_){}
      return row;
    },
    rebuild(){
      // rebuild union view from source tables — non-destructive: only adds missing
      const existing = new Set(all('calendar_events').map(e => (e.source_table||'')+':'+(e.source_id||'')));
      const seed = (cat, table, key, mapper) => {
        all(table).forEach(r => {
          const sig = table+':'+r[key];
          if (existing.has(sig)) return;
          this.add(Object.assign({ category:cat, source_table:table, source_id:r[key] }, mapper(r)));
        });
      };
      try { seed('liturgy','liturgies','liturgy_id', r => ({
        title:r.title||'قداس', starts_at:r.starts_at, ends_at:r.ends_at, recurrence:r.recurrence||'none' })); }catch(_){}
      try { seed('meeting','meetings','meeting_id', r => ({
        title:r.title||'اجتماع', starts_at:r.starts_at, ends_at:r.ends_at, recurrence:r.recurrence||'weekly' })); }catch(_){}
      try { seed('sunday_school','sunday_school_sessions','ss_id', r => ({
        title:'مدارس أحد - '+(r.stage||''), starts_at:r.occurs_on })); }catch(_){}
      try { seed('event','events','event_id', r => ({
        title:r.title||r.name||'حدث', starts_at:r.starts_at||r.date||r.created_at })); }catch(_){}
      try { seed('followup','followups','followup_id', r => ({
        title:'افتقاد: '+(r.reason||''), starts_at:r.due_at||r.created_at })); }catch(_){}
    },
    inRange(from, to, opts){
      opts = opts || {};
      const f = new Date(from), t = new Date(to);
      return all('calendar_events').filter(e => {
        const d = new Date(e.starts_at);
        if (isNaN(d)) return false;
        if (d < f || d > t) return false;
        if (opts.category && e.category !== opts.category) return false;
        return true;
      }).sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at));
    },
    month(year, monthIndex, opts){
      const from = new Date(year, monthIndex, 1);
      const to   = new Date(year, monthIndex+1, 0, 23,59,59);
      return this.inRange(from, to, opts);
    },
    week(date, opts){
      const d = new Date(date); const day = d.getDay();
      const from = new Date(d); from.setDate(d.getDate()-day); from.setHours(0,0,0,0);
      const to = new Date(from); to.setDate(from.getDate()+6); to.setHours(23,59,59,0);
      return this.inRange(from, to, opts);
    },
    day(date, opts){
      const d = new Date(date);
      const from = new Date(d); from.setHours(0,0,0,0);
      const to   = new Date(d); to.setHours(23,59,59,0);
      return this.inRange(from, to, opts);
    }
  };
  window.Calendar = Calendar;
  // Initial union view
  try { Calendar.rebuild(); } catch(_){}

  /* =====================================================
     Auto-extend Family Profile with Timeline tab (safe)
     ===================================================== */
  try {
    if (document.body && document.body.dataset && document.body.dataset.page === 'family-profile'){
      document.addEventListener('DOMContentLoaded', () => {
        try {
          const params = new URLSearchParams(location.search);
          const fid = params.get('family_id') || params.get('id');
          if (!fid) return;
          const host = document.querySelector('[data-family-timeline]') ||
                       document.querySelector('main') || document.body;
          if (!host || document.getElementById('op-timeline-block')) return;
          const block = document.createElement('section');
          block.id = 'op-timeline-block';
          block.className = 'card';
          block.style.marginTop = '1rem';
          block.innerHTML = `<div style="padding:.75rem 1rem;border-bottom:1px solid var(--border,#eee);font-weight:700">
              <i class="fa-solid fa-clock-rotate-left"></i> الخط الزمني للأسرة
            </div>${Timeline.renderHTML(Timeline.forFamily(fid, 30))}`;
          host.appendChild(block);
        } catch(_){}
      });
    }
  } catch(_){}

  /* Run an initial proactive scan (deferred so DB seed is ready) */
  try { setTimeout(()=>{ try{ FollowupIntel.scan(); }catch(_){} }, 1500); } catch(_){}

  try { console.info('[opintel] v21 loaded — Timeline, FollowupIntel, NotificationCenter, RuleEngine, Calendar'); } catch(_){}
})();

/* ============================================================
   v24 — Operational Intelligence Finalization Addendum
   Adds (additive, idempotent):
     • window.PermissionResolver  — central resolver wrapper
     • window.App.safePanel       — error-isolated UI mount helper
     • Notification grouping + dedupe helpers
     • Extra default rules (servant inactivity, missed meetings)
     • Calendar recurrence expansion (weekly/monthly virtual events)
     • Auto re-scan & periodic calendar rebuild
   ============================================================ */
(function(){
  if (window.__OPINTEL_V24__) return;
  window.__OPINTEL_V24__ = true;

  /* ---------- Central Permission Resolver ---------- */
  const PermissionResolver = {
    can(cap){
      try { return window.Permissions && Permissions.can ? Permissions.can(cap) : true; }
      catch(_){ return false; }
    },
    canSeePage(pageId){
      try { return window.Permissions && Permissions.canSeePage ? Permissions.canSeePage(pageId) : true; }
      catch(_){ return true; }
    },
    role(){ try { return (window.Auth && Auth.session() || {}).role || null; } catch(_){ return null; } },
    isAdmin(){ const r = this.role(); return r==='church_admin' || r==='service_admin'; },
    isSupervisor(){ const r = this.role(); return ['service_supervisor','supervisor','servant_leader'].includes(r); },
    isFinance(){ const r = this.role(); return r==='finance' || r==='financial_manager'; },
    isSuper(){ return this.role() === 'super_admin'; },
    /** assert(cap) - returns true/false silently; for guarding UI actions */
    assert(cap){ const ok = this.can(cap); if (!ok) try{ window.UI && UI.toast && UI.toast('لا تملك صلاحية لهذا الإجراء','warning'); }catch(_){ } return ok; }
  };
  window.PermissionResolver = PermissionResolver;

  /* ---------- App.safePanel — error-isolated mounting ---------- */
  window.App = window.App || {};
  if (!window.App.safe){
    window.App.safe = function(label, fn){
      try { return fn(); }
      catch(e){ try{ console.error('[safe:'+label+']', e);}catch(_){} return null; }
    };
  }
  if (!window.App.safePanel){
    window.App.safePanel = function(host, label, fn){
      if (!host) return;
      try { return fn(host); }
      catch(e){
        try{ console.error('[safePanel:'+label+']', e);}catch(_){}
        try {
          host.innerHTML = `<div class="card" style="padding:1rem;border:1px dashed #fca5a5;background:#fef2f2;color:#991b1b;border-radius:.5rem">
            <strong><i class="fa-solid fa-triangle-exclamation"></i> تعذر تحميل القسم</strong>
            <div style="opacity:.7;font-size:.85em;margin-top:.25rem">${label||''}</div>
          </div>`;
        } catch(_){}
      }
    };
  }

  /* ---------- Notification grouping + dedupe ---------- */
  if (window.NotificationCenter){
    const NC = window.NotificationCenter;
    if (!NC.grouped){
      NC.grouped = function(){
        const list = (NC.list ? NC.list() : []) || [];
        const groups = {};
        list.forEach(n => {
          const k = (n.priority||'low')+':'+(n.type||'info');
          (groups[k] = groups[k] || { key:k, priority:n.priority, type:n.type, items:[] }).items.push(n);
        });
        const order = { critical:0, high:1, medium:2, low:3 };
        return Object.values(groups).sort((a,b)=>(order[a.priority]||9)-(order[b.priority]||9));
      };
    }
    if (!NC.unreadCount){
      NC.unreadCount = function(){ try { return (NC.list()||[]).filter(n => !n.is_read).length; } catch(_){ return 0; } };
    }
  }

  /* ---------- Extra default rules ---------- */
  try {
    if (window.RuleEngine && window.RuleEngine.register){
      const RE = window.RuleEngine;
      const Events = window.Events || {};
      RE.register({
        name:'servant_inactive_30d',
        trigger: Events.SERVANT_INACTIVE || 'servant.inactive',
        when: p => p && (p.days||0) >= 30,
        action: p => {
          try { window.NotificationCenter && NotificationCenter.push({
            type:'alert', priority:'high', title:'خادم غير نشط',
            body:`خادم بدون نشاط منذ ${p.days} يوم`, link:'services.html' }); } catch(_){}
        }
      });
      RE.register({
        name:'meeting_missed_repeated',
        trigger: Events.MEETING_MISSED || 'meeting.missed',
        when: p => p && (p.count||0) >= 2,
        action: p => {
          try { window.NotificationCenter && NotificationCenter.push({
            type:'reminder', priority:'medium', title:'اجتماعات فائتة',
            body:`تم تفويت ${p.count} اجتماعات`, link:'attendance.html' }); } catch(_){}
        }
      });
    }
  } catch(_){}

  /* ---------- Calendar recurrence expansion ---------- */
  try {
    if (window.Calendar && !window.Calendar.expand){
      window.Calendar.expand = function(from, to, opts){
        const base = window.Calendar.inRange(from, to, opts) || [];
        const out = base.slice();
        const F = new Date(from), T = new Date(to);
        (window.DB && DB.all ? DB.all('calendar_events') : []).forEach(e => {
          if (!e.recurrence || e.recurrence === 'none') return;
          const start = new Date(e.starts_at);
          if (isNaN(start)) return;
          let step = 0;
          if (e.recurrence === 'weekly') step = 7*864e5;
          else if (e.recurrence === 'monthly') step = 30*864e5;
          else if (e.recurrence === 'daily') step = 864e5;
          if (!step) return;
          for (let d = new Date(start.getTime()+step); d <= T; d = new Date(d.getTime()+step)){
            if (d < F) continue;
            out.push(Object.assign({}, e, { ce_id: e.ce_id+'_r'+d.getTime(), starts_at: d.toISOString(), _virtual:true }));
          }
        });
        return out.sort((a,b)=> new Date(a.starts_at)-new Date(b.starts_at));
      };
    }
  } catch(_){}

  /* ---------- Periodic refresh (low-impact) ---------- */
  try {
    if (!window.__OPINTEL_INTERVAL__){
      window.__OPINTEL_INTERVAL__ = setInterval(()=>{
        try { window.FollowupIntel && FollowupIntel.scan && FollowupIntel.scan(); } catch(_){}
        try { window.Calendar && Calendar.rebuild && Calendar.rebuild(); } catch(_){}
      }, 5 * 60 * 1000); // every 5 min
    }
  } catch(_){}

  try { console.info('[opintel] v24 finalization loaded'); } catch(_){}
})();

/* ============================================================
   v25 — Orchestration & Stabilization Refactor
   Additive, idempotent. No new files.
   ------------------------------------------------------------
   - Bus hardening: listener dedupe + scoped registries
   - Central State (window.State) with safe get/set/subscribe
   - Attendance Orchestrator (window.AttendanceOrchestrator)
   - Auto Timeline hooks: families/attendance/followup/workflows/risk
   - Notification Pipeline: queue + dedupe window + escalate
   ============================================================ */
(function(){
  if (window.__OPINTEL_V25__) return;
  window.__OPINTEL_V25__ = true;

  /* ---------- Bus hardening ---------- */
  try {
    const Bus = window.Bus;
    if (Bus && Bus.on && !Bus.__hardened){
      const origOn = Bus.on.bind(Bus);
      const seen = new WeakMap();   // handler -> Set(event)
      Bus.on = function(event, handler){
        if (typeof handler !== 'function') return function(){};
        let evts = seen.get(handler);
        if (!evts){ evts = new Set(); seen.set(handler, evts); }
        if (evts.has(event)) return function(){};      // dedupe
        evts.add(event);
        return origOn(event, handler);
      };
      Bus.scope = function(label){
        const offs = [];
        return {
          on(ev, h){ const off = Bus.on(ev, h); offs.push(off); return off; },
          dispose(){ offs.forEach(f => { try{ f && f(); }catch(_){ } }); offs.length = 0; }
        };
      };
      Bus.__hardened = true;
    }
  } catch(_){}

  /* ---------- Central State ---------- */
  if (!window.State){
    const store = Object.create(null);
    const subs  = Object.create(null);
    window.State = {
      get(k, d){ return (k in store) ? store[k] : d; },
      set(k, v){
        const prev = store[k]; if (prev === v) return v;
        store[k] = v;
        const list = subs[k]; if (!list) return v;
        list.slice().forEach(fn => { try{ fn(v, prev); }catch(_){ } });
        return v;
      },
      patch(k, partial){
        const cur = store[k] || {};
        return this.set(k, Object.assign({}, cur, partial||{}));
      },
      subscribe(k, fn){
        const list = subs[k] || (subs[k] = []);
        if (list.indexOf(fn) === -1) list.push(fn);
        return () => { const i = list.indexOf(fn); if (i>=0) list.splice(i,1); };
      },
      keys(){ return Object.keys(store); }
    };
  }

  /* ---------- Attendance Orchestrator ---------- */
  if (!window.AttendanceOrchestrator){
    const Bus    = window.Bus;
    const Events = window.Events || {};
    const DB     = window.DB;
    const recentKeys = new Map(); // sig -> ts (dedupe 3s window)
    function sig(rec){
      return [rec.member_id||'', rec.family_id||'', rec.session_id||rec.event_id||'', rec.occurred_on||rec.date||''].join('|');
    }
    function dedupe(rec){
      const k = sig(rec), t = Date.now();
      // sweep
      if (recentKeys.size > 500){ for (const [kk,tt] of recentKeys){ if (t-tt > 10000) recentKeys.delete(kk); } }
      if (recentKeys.has(k) && (t - recentKeys.get(k)) < 3000) return true;
      recentKeys.set(k, t);
      return false;
    }
    window.AttendanceOrchestrator = {
      record(rec){
        if (!rec) return null;
        if (dedupe(rec)) return null;
        let row = null;
        try { row = DB && DB.insert ? DB.insert('attendance_records', Object.assign({ recorded_at: new Date().toISOString() }, rec)) : rec; } catch(_){}
        try { Bus && Bus.emit(Events.ATTENDANCE_MARKED || 'attendance.marked', { record: row||rec }); } catch(_){}
        try { window.Timeline && Timeline.log({
          domain:'attendance', kind:'recorded', title:'تسجيل حضور',
          member_id: rec.member_id||null, family_id: rec.family_id||null,
          ref_table:'attendance_records', ref_id: (row && (row.id||row.attendance_id))||null
        }); } catch(_){}
        return row;
      },
      processQR(payload){
        // payload: { member_id, session_id, ... }
        return this.record(Object.assign({ source:'qr' }, payload||{}));
      }
    };
  }

  /* ---------- Auto Timeline hooks ---------- */
  try {
    const Bus = window.Bus, Events = window.Events || {}, TL = window.Timeline;
    if (Bus && TL && !window.__TL_HOOKS__){
      window.__TL_HOOKS__ = true;
      const link = (evt, mapper) => Bus.on(evt, p => { try { TL.log(mapper(p||{})); } catch(_){ } });
      link(Events.FAMILY_CREATED,       p => ({ domain:'family', kind:'created',     title:'إنشاء أسرة',       family_id:p.family && p.family.family_id }));
      link(Events.FAMILY_UPDATED,       p => ({ domain:'family', kind:'updated',     title:'تحديث أسرة',       family_id:p.family_id || (p.family && p.family.family_id) }));
      link(Events.FAMILY_RISK_CHANGED,  p => ({ domain:'risk',   kind:'changed', severity:p.level||'info', title:'تغيّر مستوى خطر الأسرة', family_id:p.family_id }));
      link(Events.FAMILY_TRANSFERRED,   p => ({ domain:'family', kind:'transferred', title:'نقل أسرة',         family_id:p.family_id }));
      link(Events.GUARDIAN_CHANGED,     p => ({ domain:'family', kind:'guardian',    title:'تغيير ولي الأمر', family_id:p.family_id }));
      link(Events.TASK_CREATED,         p => ({ domain:'followup', kind:'created',   title:'إنشاء مهمة افتقاد', ref_table:'followups', ref_id:p.task && (p.task.followup_id||p.task.id) }));
      link(Events.TASK_CLOSED,          p => ({ domain:'followup', kind:'closed',    title:'إنهاء مهمة افتقاد', ref_table:'followups', ref_id:p.task && (p.task.followup_id||p.task.id) }));
      link(Events.TASK_ESCALATED,       p => ({ domain:'followup', kind:'escalated', severity:'high', title:'تصعيد افتقاد', ref_table:'followups', ref_id:p.task && (p.task.followup_id||p.task.id) }));
      link(Events.FOLLOWUP_OVERDUE,     p => ({ domain:'followup', kind:'overdue',   severity:'medium', title:'افتقاد متأخر', ref_id:p.task && (p.task.followup_id||p.task.id) }));
      link(Events.NOTIFICATION_SENT,    p => ({ domain:'notification', kind:'sent',  title:p.title||'إشعار' }));
    }
  } catch(_){}

  /* ---------- Notification Pipeline (queue + dedupe + escalate) ---------- */
  try {
    const NC = window.NotificationCenter;
    if (NC && !NC.__pipeline){
      const queue = [];
      const dedupe = new Map(); // hash -> ts
      const HASH_WINDOW = 60 * 1000; // 1 min
      const origPush = NC.push ? NC.push.bind(NC) : null;
      function hash(n){ return [n.type||'', n.priority||'', n.title||'', n.body||'', n.link||''].join('|'); }
      NC.enqueue = function(n){
        if (!n) return null;
        const h = hash(n), t = Date.now();
        // sweep
        if (dedupe.size > 200){ for (const [k,v] of dedupe){ if (t-v > HASH_WINDOW) dedupe.delete(k); } }
        if (dedupe.has(h) && (t - dedupe.get(h)) < HASH_WINDOW) return null;
        dedupe.set(h, t);
        queue.push(n);
        return origPush ? origPush(n) : n;
      };
      // wrap push to go through queue
      if (origPush){
        NC.push = function(n){ return NC.enqueue(n); };
      }
      NC.queueLength = function(){ return queue.length; };
      NC.escalate = function(n){
        const priorities = ['low','medium','high','critical'];
        const idx = Math.max(0, priorities.indexOf(n.priority||'low'));
        const next = priorities[Math.min(idx+1, priorities.length-1)];
        return NC.enqueue(Object.assign({}, n, { priority: next, title: '⚠ ' + (n.title||'تصعيد') }));
      };
      NC.__pipeline = true;
    }
  } catch(_){}

  try { console.info('[opintel] v25 orchestration loaded'); } catch(_){}
})();
