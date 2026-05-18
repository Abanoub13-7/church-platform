/* ============================================================
   services.bundle.js — Enterprise Service Layer + Repositories
                        + Cross-module Event Listeners
   v17 — Service Layer / Event Bus refactor
   ------------------------------------------------------------
   This single bundle exposes the operational architecture:

     Repositories (data access facades over DB):
       window.Repo.Family       window.Repo.Member
       window.Repo.Attendance

     Services (business logic facades, UI calls these):
       window.FamilyService      window.AttendanceService
       window.WorkflowService    window.NotificationService
       window.RiskService        window.AIService
       window.AuthService        window.MemberService

     Listeners (cross-module automation wired to window.Bus):
       Attendance risk -> Risk + Workflow + Notification + AI
       Family risk     -> Workflow task + Notification + Timeline
       Task created    -> Notification
       Family events   -> Timeline touch / AI snapshot

   Services delegate to existing engines (Family, Rel, FamilyRisk,
   FamilyAttendance, FamilyAI, FamilyWorkflows, NotificationsPage,
   FollowupPage, Auth) so existing business logic is preserved.

   No new tech, no framework, no bundler. Load order in HTML:
     db.js -> engines.bundle.js -> schemas -> family-*.js
     -> core.eventbus.js -> services.bundle.js -> page scripts.
   ============================================================ */
(function(){
  if (!window.DB) return;
  if (window.FamilyService) return; // idempotent

  const Bus    = window.Bus    || { emit:function(){}, on:function(){return function(){}} };
  const Events = window.Events || {};

  /* ====================================================
     1) REPOSITORIES — thin data-access wrappers
     ==================================================== */
  const FamilyRepo = {
    all(){ return DB.findAll('families') || []; },
    byId(id){ return DB.find('families', { family_id: id })[0] || null; },
    insert(row){ return DB.insert('families', row); },
    update(id, patch){ return DB.update('families', id, patch); },
    remove(id){ return DB.remove ? DB.remove('families', 'family_id', id) : null; },
    members(family_id){
      return (window.Family && Family.familyMembers)
        ? Family.familyMembers(family_id)
        : (DB.find('members', { family_id }) || []);
    }
  };

  const MemberRepo = {
    all(){ return DB.findAll('members') || []; },
    byId(id){ return DB.find('members', { member_id: id })[0] || null; },
    insert(row){ return DB.insert('members', row); },
    update(id, patch){ return DB.update('members', id, patch); }
  };

  const AttendanceRepo = {
    all(){ return DB.findAll('attendance_records') || []; },
    byMember(member_id){ return DB.find('attendance_records', { member_id }) || []; },
    byFamily(family_id){
      const mIds = new Set(FamilyRepo.members(family_id).map(m => m.member_id));
      return AttendanceRepo.all().filter(r => mIds.has(r.member_id));
    },
    insert(row){ return DB.insert('attendance_records', row); }
  };

  window.Repo = { Family: FamilyRepo, Member: MemberRepo, Attendance: AttendanceRepo };

  /* ====================================================
     2) AUTH SERVICE — thin façade over window.Auth
     ==================================================== */
  const AuthService = {
    session(){ return (window.Auth && Auth.session && Auth.session()) || null; },
    userId(){ const s = this.session(); return s && s.user_id || null; },
    churchId(){ const s = this.session(); return s && s.church_id || null; },
    isAuthenticated(){ return !!this.session(); }
  };

  /* ====================================================
     3) MEMBER SERVICE
     ==================================================== */
  const MemberService = {
    create(data){
      const row = MemberRepo.insert(Object.assign({
        created_at: new Date().toISOString(),
        church_id: AuthService.churchId()
      }, data || {}));
      return row;
    },
    update(id, patch){ return MemberRepo.update(id, patch || {}); },
    get(id){ return MemberRepo.byId(id); },
    list(){ return MemberRepo.all(); }
  };

  /* ====================================================
     4) FAMILY SERVICE — façade over window.Family + Rel
     ==================================================== */
  function delegate(obj, method, ...args){
    return (obj && typeof obj[method] === 'function') ? obj[method](...args) : null;
  }

  const FamilyService = {
    /* CRUD */
    create(data)        { return delegate(window.Family, 'create', data)
                              || FamilyRepo.insert(Object.assign({ created_at:new Date().toISOString() }, data)); },
    update(id, patch)   { return delegate(window.Family, 'update', id, patch)
                              || FamilyRepo.update(id, patch); },
    delete(id)          { return delegate(window.Family, 'archive', id)
                              || FamilyRepo.update(id, { family_status: 'archived' }); },
    get(id)             { return FamilyRepo.byId(id); },
    list()              { return FamilyRepo.all(); },

    /* Membership / linking */
    linkMemberToFamily(family_id, member_id, role){
      MemberRepo.update(member_id, { family_id });
      if (role && window.Rel && Rel.add) Rel.add(family_id, member_id, role);
      Bus.emit(Events.FAMILY_UPDATED, { family: FamilyRepo.byId(family_id) });
      return true;
    },
    transferMember(member_id, target_family_id){
      const m = MemberRepo.byId(member_id);
      const src = m && m.family_id;
      MemberRepo.update(member_id, { family_id: target_family_id });
      if (src) FamilyService.touch(src);
      FamilyService.touch(target_family_id);
      return true;
    },

    /* Lifecycle / movement */
    mergeFamilies(source_id, target_id){ return delegate(window.Family, 'merge', source_id, target_id); },
    splitFamily(family_id, member_ids, new_family_data){ return delegate(window.Family, 'split', family_id, member_ids, new_family_data); },
    transferChurch(family_id, to_church_id, reason){ return delegate(window.Family, 'transferChurch', family_id, to_church_id, reason); },
    setStatus(family_id, status){ return delegate(window.Family, 'setStatus', family_id, status); },
    touch(family_id){ return delegate(window.Family, 'touch', family_id); },

    /* Intelligence */
    calculateFamilyRisk(family_id){ return RiskService.calculateFamilyRisk(family_id); },
    calculateFamilyHealth(family_id){
      const att = AttendanceService.getFamilyAttendanceScore(family_id);
      const risk = RiskService.calculateFamilyRisk(family_id);
      const riskScore = (risk && typeof risk.score === 'number') ? risk.score : 0;
      const attScore  = (att  && typeof att.score  === 'number') ? att.score  : 0;
      return Math.max(0, Math.min(100, Math.round(attScore * 0.6 + (100 - riskScore) * 0.4)));
    },
    generateFamilyTimeline(family_id){
      return DB.find('family_movement_log', { family_id }) || [];
    }
  };

  /* ====================================================
     5) ATTENDANCE SERVICE
     ==================================================== */
  const AttendanceService = {
    markAttendance(data){
      const row = AttendanceRepo.insert(Object.assign({
        attended_at: new Date().toISOString(),
        recorded_by: AuthService.userId()
      }, data || {}));
      // Domain events fire via DB bridge; risk detection runs in listeners.
      return row;
    },
    detectAbsenceRisk(family_id){
      const score = this.getFamilyAttendanceScore(family_id);
      if (score && typeof score.score === 'number' && score.score < 40){
        Bus.emit(Events.ATTENDANCE_RISK_DETECTED, { family_id, score });
        return true;
      }
      return false;
    },
    calculateAttendanceTrend(family_id){
      return (window.FamilyAttendance && FamilyAttendance.trend)
        ? FamilyAttendance.trend(family_id) : null;
    },
    generateAttendanceInsights(family_id){
      return (window.FamilyAttendance && FamilyAttendance.insights)
        ? FamilyAttendance.insights(family_id) : [];
    },
    getFamilyAttendanceScore(family_id){
      if (window.FamilyAttendance && FamilyAttendance.score) return FamilyAttendance.score(family_id);
      // Fallback: % attended of last 8 weeks
      const recs = AttendanceRepo.byFamily(family_id);
      if (!recs.length) return { score: 0, samples: 0 };
      const attended = recs.filter(r => r.status === 'present' || r.attended === true).length;
      return { score: Math.round((attended / recs.length) * 100), samples: recs.length };
    }
  };

  /* ====================================================
     6) WORKFLOW SERVICE
     ==================================================== */
  const WorkflowService = {
    createTask(data){
      const row = DB.insert('followup_tasks', Object.assign({
        status:'open',
        priority: 'normal',
        created_at: new Date().toISOString(),
        created_by: AuthService.userId()
      }, data || {}));
      Bus.emit(Events.TASK_CREATED, { task: row });
      return row;
    },
    assignTask(task_id, user_id){
      const row = DB.update('followup_tasks', task_id, { assigned_to: user_id });
      Bus.emit(Events.TASK_ASSIGNED, { task: row });
      return row;
    },
    escalateTask(task_id, level){
      const row = DB.update('followup_tasks', task_id, {
        priority: level || 'high',
        escalated_at: new Date().toISOString()
      });
      Bus.emit(Events.TASK_ESCALATED, { task: row });
      return row;
    },
    closeTask(task_id, resolution){
      const row = DB.update('followup_tasks', task_id, {
        status:'closed',
        closed_at: new Date().toISOString(),
        resolution: resolution || null
      });
      Bus.emit(Events.TASK_CLOSED, { task: row });
      return row;
    },
    generateFollowup(family_id, reason, priority){
      return this.createTask({
        family_id,
        type: 'family_followup',
        reason: reason || 'auto',
        priority: priority || 'normal'
      });
    },
    triggerWorkflow(name, payload){
      Bus.emit('workflow.trigger.' + name, payload || {});
      if (window.FamilyWorkflows && typeof FamilyWorkflows.run === 'function'){
        try { FamilyWorkflows.run(name, payload); } catch(_){}
      }
    }
  };

  /* ====================================================
     7) NOTIFICATION SERVICE
     ==================================================== */
  const NotificationService = {
    sendNotification(payload){
      const row = DB.insert('notifications', Object.assign({
        created_at: new Date().toISOString(),
        status: 'sent',
        severity: 'info'
      }, payload || {}));
      // DB bridge will emit NOTIFICATION_SENT
      return row;
    },
    sendCriticalAlert(payload){
      return this.sendNotification(Object.assign({ severity:'critical' }, payload || {}));
    },
    scheduleNotification(payload, sendAt){
      return DB.insert('notifications', Object.assign({
        created_at: new Date().toISOString(),
        status: 'scheduled',
        scheduled_for: sendAt
      }, payload || {}));
    },
    retryNotification(id){
      return DB.update('notifications', id, {
        status: 'sent',
        retried_at: new Date().toISOString()
      });
    }
  };

  /* ====================================================
     8) RISK SERVICE — façade over window.FamilyRisk
     ==================================================== */
  const RiskService = {
    calculateFamilyRisk(family_id){
      if (window.FamilyRisk && FamilyRisk.compute) return FamilyRisk.compute(family_id);
      if (window.FamilyRisk && FamilyRisk.calculate) return FamilyRisk.calculate(family_id);
      return { score: 0, level: 'low' };
    },
    calculateAttendanceRisk(family_id){
      const s = AttendanceService.getFamilyAttendanceScore(family_id);
      const score = s ? (100 - (s.score || 0)) : 0;
      return { score, level: score >= 70 ? 'critical' : score >= 50 ? 'high' : score >= 30 ? 'medium' : 'low' };
    },
    calculateEngagementRisk(family_id){
      const trend = AttendanceService.calculateAttendanceTrend(family_id);
      const slope = trend && typeof trend.slope === 'number' ? trend.slope : 0;
      const score = slope < -0.2 ? 80 : slope < 0 ? 50 : 20;
      return { score, level: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low' };
    },
    calculateFinancialRisk(family_id){
      if (window.FamilyFinancial && FamilyFinancial.risk) return FamilyFinancial.risk(family_id);
      return { score: 0, level: 'low' };
    },
    recalculateAll(){
      if (window.FamilyRisk && FamilyRisk.recalculateAll) return FamilyRisk.recalculateAll();
      (FamilyRepo.all() || []).forEach(f => this.calculateFamilyRisk(f.family_id));
    }
  };

  /* ====================================================
     9) AI SERVICE — Operational Intelligence (heuristics)
     ==================================================== */
  const AIService = {
    predictDisengagement(family_id){
      const att = AttendanceService.getFamilyAttendanceScore(family_id);
      const trend = AttendanceService.calculateAttendanceTrend(family_id);
      const slope = trend && trend.slope || 0;
      const base = att && att.score != null ? att.score : 50;
      const prob = Math.max(0, Math.min(100, Math.round((100 - base) + (slope < 0 ? -slope * 50 : 0))));
      return { probability: prob, level: prob >= 70 ? 'high' : prob >= 40 ? 'medium' : 'low' };
    },
    detectHighRiskFamily(family_id){
      const r = RiskService.calculateFamilyRisk(family_id);
      return r && (r.level === 'high' || r.level === 'critical');
    },
    generateRecommendations(family_id){
      const recs = [];
      const r = RiskService.calculateFamilyRisk(family_id);
      if (r && (r.level === 'high' || r.level === 'critical'))
        recs.push({ type:'followup', reason:'high_risk', priority:'high' });
      const att = AttendanceService.getFamilyAttendanceScore(family_id);
      if (att && att.score < 40)
        recs.push({ type:'pastoral_visit', reason:'low_attendance', priority:'high' });
      if (recs.length) Bus.emit(Events.AI_RECOMMENDATION_CREATED, { family_id, recommendations: recs });
      return recs;
    },
    analyzeServiceHealth(){
      const fams = FamilyRepo.all();
      const high = fams.filter(f => f.risk_status === 'high' || f.risk_status === 'critical').length;
      return {
        total_families: fams.length,
        high_risk: high,
        health_pct: fams.length ? Math.round(((fams.length - high) / fams.length) * 100) : 100
      };
    },
    generateOperationalInsights(){
      const insights = [];
      const h = this.analyzeServiceHealth();
      if (h.health_pct < 70) insights.push({ severity:'warning', text:'Overall family health below threshold', data: h });
      return insights;
    }
  };

  /* ====================================================
     10) EXPOSE SERVICES
     ==================================================== */
  window.AuthService         = AuthService;
  window.MemberService       = MemberService;
  window.FamilyService       = FamilyService;
  window.AttendanceService   = AttendanceService;
  window.WorkflowService     = WorkflowService;
  window.NotificationService = NotificationService;
  window.RiskService         = RiskService;
  window.AIService           = AIService;

  /* ====================================================
     11) CROSS-MODULE LISTENERS — reactive automation
     ==================================================== */

  // Attendance marked -> evaluate absence risk for the family
  Bus.on(Events.ATTENDANCE_MARKED, function(p){
    try {
      const rec = p && p.record; if (!rec) return;
      const m = rec.member_id && MemberRepo.byId(rec.member_id);
      const fid = m && m.family_id; if (!fid) return;
      FamilyService.touch(fid);
      AttendanceService.detectAbsenceRisk(fid);
    } catch(_){}
  });

  // Attendance risk -> follow-up + notification + AI analysis
  Bus.on(Events.ATTENDANCE_RISK_DETECTED, function(p){
    if (!p || !p.family_id) return;
    WorkflowService.generateFollowup(p.family_id, 'attendance_risk', 'high');
    NotificationService.sendNotification({
      type:'attendance_risk',
      family_id: p.family_id,
      severity:'warning',
      message:'Family attendance dropped below threshold'
    });
    AIService.generateRecommendations(p.family_id);
  });

  // Family risk changed (engines emit this via Bus directly when wired,
  // or we recompute on FAMILY_UPDATED below).
  Bus.on(Events.FAMILY_RISK_CHANGED, function(p){
    if (!p || !p.family_id) return;
    if (p.level === 'high' || p.level === 'critical'){
      WorkflowService.generateFollowup(p.family_id, 'high_risk', 'high');
      NotificationService.sendCriticalAlert({
        type:'family_high_risk',
        family_id: p.family_id,
        message: 'Family escalated to ' + p.level + ' risk'
      });
    }
  });

  // Task created -> notify assignee (if any)
  Bus.on(Events.TASK_CREATED, function(p){
    const t = p && p.task; if (!t) return;
    if (t.assigned_to){
      NotificationService.sendNotification({
        type:'task_assigned',
        user_id: t.assigned_to,
        task_id: t.followup_id || t.task_id || t.id,
        family_id: t.family_id || null,
        message: 'New follow-up task assigned'
      });
    }
  });

  // Family lifecycle -> bump activity + opportunistic AI snapshot
  Bus.on(Events.FAMILY_UPDATED, function(p){
    const f = p && p.family; if (!f || !f.family_id) return;
    try { AIService.generateRecommendations(f.family_id); } catch(_){}
  });

  // Family movements (split/merge/transfer) -> notification
  function movementNotice(label){
    return function(p){
      const log = p && p.log; if (!log) return;
      NotificationService.sendNotification({
        type: 'family_' + label,
        family_id: log.family_id,
        message: 'Family ' + label + ' recorded'
      });
    };
  }
  Bus.on(Events.FAMILY_SPLIT,       movementNotice('split'));
  Bus.on(Events.FAMILY_MERGED,      movementNotice('merged'));
  Bus.on(Events.FAMILY_TRANSFERRED, movementNotice('transferred'));
  Bus.on(Events.GUARDIAN_CHANGED,   movementNotice('guardian_changed'));

})();
