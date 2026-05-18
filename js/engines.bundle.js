/* Bundled engines */

/* === ai-engine.js === */
/* ============================================================
   AI-ENGINE.js — Behavior Analysis & Risk Score
   يحلل سلوك كل عضو ويُنتج Risk Score حقيقي
   ============================================================ */
(function(){
  const FACTORS = {
    ATTENDANCE_DROP: { weight: 35, label:'انخفاض الحضور' },
    LONG_INACTIVITY: { weight: 25, label:'فترة عدم نشاط طويلة' },
    NO_SERVING:      { weight: 15, label:'عدم المشاركة في الخدمة' },
    NO_EVENTS:       { weight: 10, label:'عدم حضور الفعاليات' },
    NO_FOLLOWUP_RESP:{ weight: 10, label:'عدم الاستجابة للافتقاد' },
    FAMILY_INACTIVE: { weight:  5, label:'عدم نشاط العائلة' }
  };

  function daysSince(iso){
    if (!iso) return Infinity;
    return Math.floor((Date.now() - new Date(iso).getTime())/86400000);
  }

  function analyzeMember(member){
    const factors = {};
    let score = 0;

    // 1) Attendance records
    const records = DB.filter('attendance_records', r => r.member_id === member.member_id);
    const sessions = DB.all('attendance_sessions');

    // last attendance
    const lastRecord = records.sort((a,b)=> new Date(b.check_in_at)-new Date(a.check_in_at))[0];
    const daysSinceLast = lastRecord ? daysSince(lastRecord.check_in_at) : 999;

    if (daysSinceLast > 60){ factors.LONG_INACTIVITY = FACTORS.LONG_INACTIVITY.weight; score += factors.LONG_INACTIVITY; }
    else if (daysSinceLast > 30){ factors.LONG_INACTIVITY = FACTORS.LONG_INACTIVITY.weight*0.6; score += factors.LONG_INACTIVITY; }
    else if (daysSinceLast > 14){ factors.LONG_INACTIVITY = FACTORS.LONG_INACTIVITY.weight*0.3; score += factors.LONG_INACTIVITY; }

    // attendance drop: compare last 30 days vs previous 30 days
    const now = Date.now();
    const last30 = records.filter(r => (now - new Date(r.check_in_at).getTime()) <= 30*864e5).length;
    const prev30 = records.filter(r => {
      const d = now - new Date(r.check_in_at).getTime();
      return d > 30*864e5 && d <= 60*864e5;
    }).length;
    if (prev30 > 0 && last30 < prev30){
      const drop = (prev30 - last30) / prev30;
      if (drop >= 0.6){ factors.ATTENDANCE_DROP = FACTORS.ATTENDANCE_DROP.weight; score += factors.ATTENDANCE_DROP; }
      else if (drop >= 0.3){ factors.ATTENDANCE_DROP = FACTORS.ATTENDANCE_DROP.weight*0.6; score += factors.ATTENDANCE_DROP; }
    } else if (prev30 === 0 && last30 === 0){
      factors.ATTENDANCE_DROP = FACTORS.ATTENDANCE_DROP.weight*0.5; score += factors.ATTENDANCE_DROP;
    }

    // 2) Serving: is this member also a servant (linked user)?
    const linkedUser = DB.find('users', u => u.member_id === member.member_id);
    if (linkedUser && ['servant','supervisor'].includes(linkedUser.role)){
      const servingSessions = sessions.filter(s => ['service','sunday_school','servants_meeting'].includes(s.activity_type));
      const served = records.filter(r => servingSessions.some(s => s.session_id===r.session_id)).length;
      if (served === 0){ factors.NO_SERVING = FACTORS.NO_SERVING.weight; score += factors.NO_SERVING; }
    }

    // 3) Events
    const bookings = DB.filter('event_bookings', b => b.member_id === member.member_id);
    if (bookings.length === 0){ factors.NO_EVENTS = FACTORS.NO_EVENTS.weight*0.5; score += factors.NO_EVENTS; }

    // 4) Follow-up response: open follow-up tasks without logs
    const openTasks = DB.filter('followup_tasks', t => t.member_id===member.member_id && t.status!=='done');
    if (openTasks.length > 0){
      const logs = DB.filter('followup_logs', l => openTasks.some(t=>t.task_id===l.task_id));
      const responsiveLogs = logs.filter(l => ['called','visited','whatsapp'].includes(l.action) && l.result);
      if (logs.length > 0 && responsiveLogs.length === 0){
        factors.NO_FOLLOWUP_RESP = FACTORS.NO_FOLLOWUP_RESP.weight;
        score += factors.NO_FOLLOWUP_RESP;
      }
    }

    score = Math.min(100, Math.round(score));
    const level = score >= 75 ? 'critical' : score >= 50 ? 'high' : score >= 25 ? 'medium' : 'low';

    const recommendations = [];
    if (factors.LONG_INACTIVITY) recommendations.push('إنشاء افتقاد عاجل — لم يحضر منذ '+daysSinceLast+' يوم');
    if (factors.ATTENDANCE_DROP) recommendations.push('انخفاض حضور ملحوظ — تواصل من خادم الفصل');
    if (factors.NO_SERVING) recommendations.push('تشجيع المخدوم على المشاركة في الخدمة');
    if (factors.NO_FOLLOWUP_RESP) recommendations.push('تصعيد للمشرف — لا يستجيب للافتقاد');

    return { score, level, factors, recommendations, daysSinceLast, last30, prev30 };
  }

  function recomputeAll(){
    const members = DB.all('members');
    members.forEach(m => {
      const result = analyzeMember(m);
      const existing = DB.find('member_risk_scores', s => s.member_id === m.member_id);
      const data = {
        member_id: m.member_id,
        church_id: m.church_id,
        risk_level: result.level,
        score: result.score,
        factors: result.factors,
        recommendation: result.recommendations.join(' • '),
        computed_at: new Date().toISOString()
      };
      if (existing) DB.update('member_risk_scores','score_id',existing.score_id, data);
      else DB.insert('member_risk_scores', data);

      // auto-update member_status for at-risk
      if (result.level === 'critical' || result.level === 'high'){
        if (m.member_status !== 'at_risk' && m.member_status !== 'inactive'){
          DB.update('members','member_id',m.member_id,{ member_status:'at_risk' });
        }
      }
    });
  }

  function insights(){
    recomputeAll();
    const scores = DB.all('member_risk_scores');
    const members = DB.all('members');
    const out = [];

    scores.filter(s => s.risk_level==='critical').forEach(s => {
      const m = members.find(x=>x.member_id===s.member_id);
      if (m) out.push({ type:'critical', icon:'fa-exclamation-triangle', title:m.full_name, body:s.recommendation });
    });

    // class with lowest attendance
    const classes = DB.all('service_classes');
    classes.forEach(c => {
      const classMembers = members.filter(m => m.service_class_id===c.class_id);
      if (classMembers.length === 0) return;
      const atRisk = classMembers.filter(m => {
        const s = scores.find(s=>s.member_id===m.member_id);
        return s && ['high','critical'].includes(s.risk_level);
      });
      if (atRisk.length / classMembers.length > 0.4){
        out.push({ type:'warning', icon:'fa-chart-line', title:'الفصل: '+c.class_name, body:`${atRisk.length} من ${classMembers.length} مخدوم في خطر — يحتاج مراجعة` });
      }
    });

    return out;
  }

  window.AIEngine = { analyzeMember, recomputeAll, insights, FACTORS };
})();


/* === workflow-engine.js === */
/* ============================================================
   WORKFLOW-ENGINE.js — Trigger-based automation
   Triggers → Steps → Escalation → History
   ============================================================ */
(function(){

  /* === TRIGGER DETECTORS === */
  const Detectors = {
    // Detect members with N consecutive absences in a recurring activity
    absence_streak(config){
      const threshold = config.count || 3;
      const members = DB.all('members');
      const found = [];
      const sundayClasses = DB.filter('attendance_sessions', s => s.activity_type==='sunday_school');
      // group sessions by class, sorted desc
      const byClass = {};
      sundayClasses.forEach(s => {
        const k = s.class_id || 'none';
        (byClass[k] = byClass[k] || []).push(s);
      });
      Object.values(byClass).forEach(list => list.sort((a,b)=> new Date(b.starts_at)-new Date(a.starts_at)));

      members.forEach(m => {
        if (!m.service_class_id) return;
        const sessions = (byClass[m.service_class_id]||[]).slice(0, threshold);
        if (sessions.length < threshold) return;
        const attended = sessions.filter(s => DB.find('attendance_records', r => r.session_id===s.session_id && r.member_id===m.member_id));
        if (attended.length === 0){
          // check not already running workflow for this trigger+member
          const existing = DB.find('workflow_history', w => w.target_id===m.member_id && w.status==='running' && w.action_id);
          if (!existing) found.push(m);
        }
      });
      return found;
    },
    first_visit(){
      const recent = DB.filter('members', m => m.first_visit_at && (Date.now() - new Date(m.first_visit_at).getTime()) < 7*864e5);
      return recent.filter(m => !DB.find('workflow_history', w => w.target_id===m.member_id && w.action_id));
    },
    servant_inactive(config){
      const days = config.days || 30;
      const servants = DB.filter('users', u => ['servant','supervisor'].includes(u.role) && u.member_id);
      const out = [];
      servants.forEach(u => {
        const last = DB.filter('attendance_records', r => r.member_id===u.member_id)
          .sort((a,b)=> new Date(b.check_in_at)-new Date(a.check_in_at))[0];
        if (!last || (Date.now() - new Date(last.check_in_at).getTime()) > days*864e5){
          out.push({ user:u, days: last ? Math.floor((Date.now()-new Date(last.check_in_at))/864e5) : 999 });
        }
      });
      return out;
    },
    event_full(){
      return DB.filter('events', e => {
        if (e.status === 'full') return false;
        if (!e.capacity) return false;
        const booked = DB.count('event_bookings', b => b.event_id===e.event_id && ['confirmed','attended'].includes(b.booking_status));
        return booked >= e.capacity;
      });
    }
  };

  /* === STEP EXECUTORS === */
  const Executors = {
    create_task(step, ctx){
      const member = ctx.member;
      const classServant = member?.service_class_id
        ? DB.find('servant_assignments', a => a.class_id===member.service_class_id && a.active)
        : null;
      const assignTo = step.assignTo === 'class_servant'
        ? classServant?.user_id
        : step.assignTo === 'supervisor'
          ? DB.find('service_classes', c => c.class_id===member?.service_class_id)?.supervisor_id
          : step.assignTo === 'service_admin'
            ? DB.find('users', u => u.role==='service_admin')?.user_id
            : step.assignTo;

      const task = DB.insert('followup_tasks', {
        member_id: member?.member_id,
        assigned_to: assignTo,
        created_by: 'system',
        reason: ctx.reason,
        priority: step.priority || 'medium',
        due_at: new Date(Date.now() + 48*36e5).toISOString(),
        status: 'open',
        escalation_level: ctx.escalation_level || 0,
        workflow_id: ctx.workflow_id
      });
      Notify.toUser(assignTo, 'task','مهمة افتقاد جديدة', ctx.reason, 'followup.html');
      return { taskId: task.task_id, assignTo };
    },
    escalate(step, ctx){
      ctx.escalation_level = (ctx.escalation_level||0) + 1;
      ctx.reason = '⚠️ تصعيد ['+ctx.escalation_level+']: '+(ctx.reason||'');
      return Executors.create_task({ ...step, assignTo: step.to }, ctx);
    },
    send_whatsapp(step, ctx){
      const member = ctx.member;
      const template = step.template || 'default';
      const messages = {
        welcome: `سلام ونعمة 🌹\nأهلاً بك ${member?.full_name} في كنيستنا. سعداء بانضمامك ونتمنى لقاءك دائماً.`,
        absence: `سلام ونعمة 🌹\n${member?.full_name}، افتقدناك في الفصل. نتمنى رؤيتك قريباً.`,
        default: `سلام ونعمة 🌹 ${member?.full_name}`
      };
      const msg = messages[template] || messages.default;
      // log only — actual WhatsApp send is in whatsapp.js
      return { whatsapp_queued: true, message: msg, to: member?.phone || member?.parent_phone };
    },
    wait(step){ return { waited_hours: step.delay_hours }; },
    notify(step, ctx){
      Notify.toUser(step.to, 'workflow','إشعار Workflow', ctx.reason, 'workflows.html');
      return { notified: step.to };
    }
  };

  /* === RUNNER === */
  function runAction(action){
    const triggered = (Detectors[action.trigger_type] || (()=>[]))(action.trigger_config||{});
    triggered.forEach(target => {
      const member = target.member_id ? target : (target.user ? DB.find('members', m => m.member_id===target.user.member_id) : target);
      const wf = DB.insert('workflow_history', {
        action_id: action.action_id,
        target_type: 'member',
        target_id: member?.member_id,
        current_step: 0,
        status: 'running',
        log: [],
        started_at: new Date().toISOString()
      });
      const ctx = {
        member,
        reason: action.name,
        workflow_id: wf.workflow_id,
        escalation_level: 0
      };
      // execute step 1 immediately; wait steps are simulated by scheduling
      executeStep(action, wf, ctx, 0);
    });
  }

  function executeStep(action, wf, ctx, stepIdx){
    if (stepIdx >= action.steps.length){
      DB.update('workflow_history','workflow_id',wf.workflow_id,{ status:'completed', completed_at:new Date().toISOString() });
      return;
    }
    const step = action.steps[stepIdx];
    const exec = Executors[step.action];
    let result = { skipped:true };
    if (exec){
      try{ result = exec(step, ctx); }
      catch(e){ result = { error: e.message }; }
    }
    const log = wf.log || [];
    log.push({ step:stepIdx+1, action:step.action, at:new Date().toISOString(), result });
    DB.update('workflow_history','workflow_id',wf.workflow_id,{ log, current_step:stepIdx+1 });

    if (step.action === 'wait' && step.delay_hours){
      // demo: shorten wait to 3 seconds per simulated 24h, max 6s
      const ms = Math.min(6000, (step.delay_hours/24)*3000);
      setTimeout(()=> executeStep(action, wf, ctx, stepIdx+1), ms);
    } else {
      executeStep(action, wf, ctx, stepIdx+1);
    }
  }

  function runAll(){
    const actions = DB.filter('workflow_actions', a => a.is_active);
    actions.forEach(runAction);
  }

  /* === NOTIFY HELPER === */
  const Notify = {
    toUser(userId, type, title, body, link){
      if (!userId) return;
      const user = DB._raw('users').find(u => u.user_id===userId);
      if (!user) return;
      DB.insert('notifications', {
        church_id: user.church_id,
        user_id: userId, type, title, body, link, is_read:false
      });
    }
  };

  window.WorkflowEngine = { runAll, runAction, Detectors, Executors };
  window.Notify = Notify;
})();


/* === finance-engine.js === */
/* ============================================================
   FINANCE-ENGINE.js — Phase 2 Enterprise Financial Core
   ------------------------------------------------------------
   Adds enterprise primitives on top of the existing
   `financial_transactions` table WITHOUT breaking it:

     • Chart of accounts (income / expense / treasury / equity)
     • Double-entry ledger (debit + credit balanced)
     • Treasuries (multiple cash/bank accounts) with running balance
     • Financial periods (month/year, open/closed)
     • Transaction status: draft → pending → approved → locked
                                                  ↘ rejected
                                                  ↘ reversed
     • Approval chains (multi-level, escalation, history)
     • Reversal entries (no destructive edits on locked txns)
     • Treasury history / inflow-outflow analytics
     • Smart financial insights (unusual spend, budget breach, decline)
     • Authorization: blocks self-approval + permission checks
     • All writes feed Audit + Security event log
   ------------------------------------------------------------
   Storage: piggy-backs on the existing localStorage DB by adding
   new logical tables: ledger_entries, treasuries, fin_periods,
   approval_steps, fin_insights. We DO NOT change the legacy
   `financial_transactions` schema — we extend rows with new fields
   (status, locked, approval_chain, reversal_of, period_id).
   ============================================================ */
(function(){
  if (!window.DB) return;

  /* ---------- bootstrap aux tables ---------- */
  function ensure(table, seed){
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    if (!Array.isArray(all[table])){
      all[table] = seed || [];
      localStorage.setItem('church_db_v1', JSON.stringify(all));
    }
  }
  ensure('treasuries');
  ensure('ledger_entries');
  ensure('fin_periods');
  ensure('approval_steps');
  ensure('fin_insights');

  /* ---------- chart of accounts ----------
     A minimal but real CoA. Each transaction type is mapped to a
     debit account and a credit account.                            */
  const COA = {
    cash:        { code:'1000', name:'الخزينة النقدية',  type:'asset'   },
    bank:        { code:'1010', name:'الحساب البنكي',    type:'asset'   },
    donations:   { code:'4000', name:'تبرعات',           type:'income'  },
    tithes:      { code:'4010', name:'عشور',             type:'income'  },
    event_inc:   { code:'4020', name:'إيرادات فعاليات',  type:'income'  },
    salaries:    { code:'5000', name:'رواتب الخدمة',     type:'expense' },
    expenses:    { code:'5010', name:'مصروفات تشغيلية',  type:'expense' },
    other_inc:   { code:'4900', name:'إيرادات أخرى',     type:'income'  },
    other_exp:   { code:'5900', name:'مصروفات أخرى',     type:'expense' }
  };

  // tx_type → { debit_account, credit_account, direction }
  const ENTRY_MAP = {
    donation:      { dr:'cash',     cr:'donations', dir:'in'  },
    tithe:         { dr:'cash',     cr:'tithes',    dir:'in'  },
    event_payment: { dr:'cash',     cr:'event_inc', dir:'in'  },
    expense:       { dr:'expenses', cr:'cash',      dir:'out' },
    salary:        { dr:'salaries', cr:'cash',      dir:'out' },
    other_in:      { dr:'cash',     cr:'other_inc', dir:'in'  },
    other_out:     { dr:'other_exp',cr:'cash',      dir:'out' }
  };

  /* ---------- periods ---------- */
  function periodIdForDate(iso){
    const d = new Date(iso || Date.now());
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}`;
  }
  function ensurePeriod(periodId){
    const existing = DB._raw('fin_periods').find(p=> p.period_id===periodId);
    if (existing) return existing;
    const row = {
      period_id: periodId,
      church_id: (Auth.session()||{}).church_id || null,
      status: 'open',
      opened_at: new Date().toISOString(),
      closed_at: null,
      closed_by: null
    };
    DB.insert('fin_periods', row);
    return row;
  }
  function isPeriodLocked(periodId){
    const p = DB._raw('fin_periods').find(x=> x.period_id===periodId);
    return p && p.status === 'closed';
  }
  function closePeriod(periodId){
    if (!window.Security || !Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.fin_periods||[]).findIndex(p=> p.period_id===periodId);
    if (idx<0) return { ok:false, error:'فترة غير موجودة' };
    all.fin_periods[idx].status = 'closed';
    all.fin_periods[idx].closed_at = new Date().toISOString();
    all.fin_periods[idx].closed_by = Auth.session().user_id;
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    Audit.log('finance.period_closed', { period_id:periodId });
    Security.logEvent('finance.period_closed', { period_id:periodId, severity:'warning' });
    return { ok:true };
  }
  function reopenPeriod(periodId){
    if (!Security.requireCap('canManageFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.fin_periods||[]).findIndex(p=> p.period_id===periodId);
    if (idx<0) return { ok:false, error:'فترة غير موجودة' };
    all.fin_periods[idx].status = 'open';
    all.fin_periods[idx].reopened_at = new Date().toISOString();
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    Audit.log('finance.period_reopened', { period_id:periodId, severity:'warning' });
    Security.logEvent('finance.period_reopened', { period_id:periodId, severity:'warning' });
    return { ok:true };
  }

  /* ---------- treasuries ---------- */
  function ensureTreasury(key){
    const cid = (Auth.session()||{}).church_id;
    let t = DB._raw('treasuries').find(x=> x.account_key===key && x.church_id===cid);
    if (t) return t;
    const meta = COA[key]; if (!meta) return null;
    t = {
      treasury_id: 'trs-'+Math.random().toString(36).slice(2,10),
      church_id: cid,
      account_key: key,
      code: meta.code, name: meta.name, type: meta.type,
      balance: 0, created_at: new Date().toISOString()
    };
    DB.insert('treasuries', t);
    return t;
  }
  function adjustTreasury(key, delta){
    const t = ensureTreasury(key); if (!t) return;
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.treasuries||[]).findIndex(x=> x.treasury_id===t.treasury_id);
    if (idx<0) return;
    all.treasuries[idx].balance = (+all.treasuries[idx].balance||0) + delta;
    all.treasuries[idx].updated_at = new Date().toISOString();
    localStorage.setItem('church_db_v1', JSON.stringify(all));
  }
  function treasuryHistory(treasuryId){
    const tr = DB._raw('treasuries').find(x=> x.treasury_id===treasuryId);
    if (!tr) return [];
    return DB._raw('ledger_entries')
      .filter(e => e.treasury_id===treasuryId)
      .sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
  }

  /* ---------- ledger ---------- */
  function postLedger(txn){
    const map = ENTRY_MAP[txn.type]; if (!map) return;
    const cid = txn.church_id;
    const drT = ensureTreasury(map.dr);
    const crT = ensureTreasury(map.cr);
    const periodId = periodIdForDate(txn.transaction_date);
    const base = {
      church_id: cid,
      transaction_id: txn.transaction_id,
      period_id: periodId,
      created_at: new Date().toISOString()
    };
    DB.insert('ledger_entries', { ...base, treasury_id:drT.treasury_id, account_key:map.dr, debit: +txn.amount||0, credit:0, description: txn.description||'' });
    DB.insert('ledger_entries', { ...base, treasury_id:crT.treasury_id, account_key:map.cr, debit: 0, credit: +txn.amount||0, description: txn.description||'' });
    // treasury impact only on cash/bank-style asset accounts
    if (COA[map.dr]?.type === 'asset') adjustTreasury(map.dr,  +txn.amount||0);
    if (COA[map.cr]?.type === 'asset') adjustTreasury(map.cr, -(+txn.amount||0));
  }

  /* ---------- transactions API ---------- */
  function createTransaction(input){
    if (!Security.requireCap('canManageFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const session = Auth.session();
    const periodId = periodIdForDate(input.transaction_date);
    if (isPeriodLocked(periodId)) return { ok:false, error:'الفترة المالية مقفلة' };
    ensurePeriod(periodId);

    const amount = Math.abs(+input.amount || 0);
    if (amount <= 0) return { ok:false, error:'المبلغ غير صالح' };

    const txn = {
      type: input.type,
      amount,
      currency: input.currency || 'EGP',
      category: input.category || '',
      description: input.description || '',
      member_id: input.member_id || null,
      event_id: input.event_id || null,
      payment_method: input.payment_method || 'cash',
      recorded_by: session.user_id,
      transaction_date: input.transaction_date || new Date().toISOString(),
      // new fields
      status: 'pending',                // draft|pending|approved|rejected|reversed
      locked: false,
      period_id: periodId,
      approval_chain: [],
      reversal_of: null
    };
    const row = DB.insert('financial_transactions', txn);
    Audit.log('finance.txn_created', { id: row.transaction_id, type:txn.type, amount });
    return { ok:true, txn: row };
  }

  function _findTxn(id){
    return DB._raw('financial_transactions').find(t=> t.transaction_id===id);
  }
  function _patchTxn(id, patch){
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    const idx = (all.financial_transactions||[]).findIndex(t=> t.transaction_id===id);
    if (idx<0) return null;
    all.financial_transactions[idx] = { ...all.financial_transactions[idx], ...patch, updated_at: new Date().toISOString() };
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    return all.financial_transactions[idx];
  }

  function approveTransaction(id, note){
    if (!Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const s = Auth.session();
    const t = _findTxn(id); if (!t) return { ok:false, error:'غير موجود' };
    if (t.locked) return { ok:false, error:'مقفلة بالفعل' };
    if (t.status === 'rejected') return { ok:false, error:'تم الرفض' };
    // self-approval block
    if (t.recorded_by === s.user_id){
      Security.logEvent('finance.self_approval_blocked', { id, user:s.user_id, severity:'warning' });
      return { ok:false, error:'لا يمكن اعتماد معاملة سجلتها بنفسك' };
    }
    if (isPeriodLocked(t.period_id || periodIdForDate(t.transaction_date))) return { ok:false, error:'الفترة مقفلة' };
    const chain = (t.approval_chain || []).slice();
    chain.push({ step: chain.length+1, by: s.user_id, name: s.full_name, role: s.role, action:'approved', note: note||'', at: new Date().toISOString() });
    const patched = _patchTxn(id, { status:'approved', locked:true, approval_chain: chain, approved_at:new Date().toISOString(), approved_by:s.user_id });
    // post to ledger ONLY on first approval
    if (patched && !chain.some(c=> c.action==='posted')){
      postLedger(patched);
      chain.push({ step: chain.length+1, by:s.user_id, name:s.full_name, role:s.role, action:'posted', at: new Date().toISOString() });
      _patchTxn(id, { approval_chain: chain });
    }
    Audit.log('finance.txn_approved', { id, before:{status:t.status}, after:{status:'approved'} });
    Security.logEvent('finance.txn_approved', { id, amount:t.amount });
    return { ok:true };
  }

  function rejectTransaction(id, reason){
    if (!Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const s = Auth.session();
    const t = _findTxn(id); if (!t) return { ok:false, error:'غير موجود' };
    if (t.locked) return { ok:false, error:'مقفلة، استخدم العكس' };
    const chain = (t.approval_chain || []).slice();
    chain.push({ step: chain.length+1, by:s.user_id, name:s.full_name, role:s.role, action:'rejected', note: reason||'', at: new Date().toISOString() });
    _patchTxn(id, { status:'rejected', approval_chain: chain, rejected_at:new Date().toISOString(), rejection_reason: reason||'' });
    Audit.log('finance.txn_rejected', { id, reason });
    return { ok:true };
  }

  function reverseTransaction(id, reason){
    if (!Security.requireCap('canApproveFinance')) return { ok:false, error:'صلاحية غير كافية' };
    const s = Auth.session();
    const t = _findTxn(id); if (!t || !t.locked) return { ok:false, error:'يجب أن تكون المعاملة معتمدة ومقفلة' };
    if (t.reversed_by) return { ok:false, error:'تم عكسها بالفعل' };
    if (isPeriodLocked(t.period_id || periodIdForDate(t.transaction_date))) return { ok:false, error:'الفترة مقفلة' };
    // create mirror txn with inverted entry direction
    const map = ENTRY_MAP[t.type]; if (!map) return { ok:false, error:'نوع غير قابل للعكس' };
    const inverseTypeByDir = (map.dir === 'in') ? 'other_out' : 'other_in';
    const reversal = {
      type: inverseTypeByDir,
      amount: t.amount,
      currency: t.currency,
      category: 'عكس قيد',
      description: `عكس المعاملة ${t.transaction_id} — ${reason||''}`,
      member_id: t.member_id, event_id: t.event_id,
      payment_method: t.payment_method,
      recorded_by: s.user_id,
      transaction_date: new Date().toISOString(),
      status: 'approved', locked: true,
      period_id: periodIdForDate(new Date().toISOString()),
      reversal_of: t.transaction_id,
      approval_chain: [{ step:1, by:s.user_id, name:s.full_name, role:s.role, action:'reversed', note: reason||'', at:new Date().toISOString() }]
    };
    const row = DB.insert('financial_transactions', reversal);
    postLedger(row);
    _patchTxn(id, { status:'reversed', reversed_by: row.transaction_id, reversed_at:new Date().toISOString(), reversal_reason: reason||'' });
    Audit.log('finance.txn_reversed', { id, reversal_id: row.transaction_id, reason });
    Security.logEvent('finance.txn_reversed', { id, severity:'warning' });
    return { ok:true, reversal: row };
  }

  /* ---------- analytics / insights ---------- */
  function computeInsights(){
    const txns = DB.all('financial_transactions');
    const now = Date.now();
    const last30 = txns.filter(t=> (now - new Date(t.transaction_date)) < 30*864e5 && t.status==='approved');
    const prev30 = txns.filter(t=> { const d = now - new Date(t.transaction_date); return d>=30*864e5 && d<60*864e5 && t.status==='approved'; });
    const expense = arr => arr.filter(t=>['expense','salary','other_out'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    const income  = arr => arr.filter(t=>['donation','tithe','event_payment','other_in'].includes(t.type)).reduce((s,t)=>s+(+t.amount||0),0);
    const insights = [];

    const exp1 = expense(last30), exp0 = expense(prev30);
    if (exp0>0 && exp1 > exp0 * 1.4) insights.push({ kind:'unusual_spending', severity:'warning', msg:`المصروفات ارتفعت ${Math.round((exp1/exp0-1)*100)}% مقارنة بالشهر السابق` });

    const inc1 = income(last30), inc0 = income(prev30);
    if (inc0>0 && inc1 < inc0 * 0.7) insights.push({ kind:'income_drop', severity:'warning', msg:`الدخل انخفض ${Math.round((1-inc1/inc0)*100)}% مقارنة بالشهر السابق` });

    DB._raw('treasuries').forEach(tr=>{
      if (tr.balance < 0) insights.push({ kind:'treasury_negative', severity:'critical', msg:`الخزينة "${tr.name}" سالبة (${tr.balance})` });
      const lastMove = DB._raw('ledger_entries').filter(e=> e.treasury_id===tr.treasury_id).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))[0];
      if (lastMove && (now - new Date(lastMove.created_at)) > 90*864e5) insights.push({ kind:'inactive_treasury', severity:'info', msg:`الخزينة "${tr.name}" بدون حركة منذ ${Math.floor((now-new Date(lastMove.created_at))/864e5)} يوم` });
    });

    // persist (replace)
    const all = JSON.parse(localStorage.getItem('church_db_v1') || '{}');
    all.fin_insights = insights.map(i=>({ ...i, church_id:(Auth.session()||{}).church_id, computed_at:new Date().toISOString() }));
    localStorage.setItem('church_db_v1', JSON.stringify(all));
    return insights;
  }

  /* ---------- reports ---------- */
  function periodReport(periodId){
    const txns = DB.all('financial_transactions').filter(t=> (t.period_id || periodIdForDate(t.transaction_date)) === periodId && t.status==='approved');
    const byCat = {};
    let income=0, expense=0;
    txns.forEach(t=>{
      const isExp = ['expense','salary','other_out'].includes(t.type);
      if (isExp) expense += +t.amount||0; else income += +t.amount||0;
      const k = (isExp?'مصروف:':'دخل:') + (t.category||t.type);
      byCat[k] = (byCat[k]||0) + (+t.amount||0);
    });
    return { periodId, income, expense, net: income-expense, byCategory: byCat, count: txns.length };
  }

  /* ---------- exportable CSV ---------- */
  function exportLedgerCSV(){
    const rows = DB.all('ledger_entries').sort((a,b)=> new Date(a.created_at)-new Date(b.created_at));
    const head = ['date','transaction_id','period','account','debit','credit','description'];
    const lines = [head.join(',')].concat(rows.map(r=>[
      r.created_at, r.transaction_id, r.period_id, r.account_key, r.debit, r.credit,
      JSON.stringify(r.description||'')
    ].join(',')));
    return lines.join('\n');
  }

  window.FinanceEngine = {
    COA, ENTRY_MAP,
    createTransaction, approveTransaction, rejectTransaction, reverseTransaction,
    closePeriod, reopenPeriod, ensurePeriod, periodIdForDate, isPeriodLocked,
    treasuryHistory, postLedger,
    computeInsights, periodReport, exportLedgerCSV,
    listTreasuries(){ return DB.all('treasuries'); },
    listPeriods(){ return DB._raw('fin_periods').filter(p => !Auth.session() || p.church_id === Auth.session().church_id).sort((a,b)=> b.period_id.localeCompare(a.period_id)); },
    listInsights(){ return DB._raw('fin_insights').filter(i=> !Auth.session() || i.church_id===Auth.session().church_id); }
  };

  // run insights periodically
  if (typeof window !== 'undefined' && Auth.session()){
    try{ computeInsights(); }catch(_){}
  }
})();


/* === notifications-engine.js === */
/* ============================================================
   NOTIFICATIONS-ENGINE.js — Phase 3 Smart Alerts
   ------------------------------------------------------------
   Generates intelligent operational alerts and inserts them
   into the `notifications` table. Idempotent: each alert has a
   stable `dedupe_key` to avoid spamming.

   Triggers:
     • Attendance drop  (member attended < 50% of last 4 weeks vs prior month)
     • Overdue follow-up tasks
     • Pending finance approvals (notifies approvers)
     • Inactive servants (no logged action 30+ days)
     • Workflow bottlenecks (history.status === 'running' > 7 days)
     • Smart financial insights → broadcast to finance role
   ============================================================ */
(function(){
  if (!window.DB) return;

  const PRIORITY = { low:1, medium:2, high:3, critical:4 };

  function exists(key){
    return DB._raw('notifications').some(n => n.dedupe_key === key && !n.is_read);
  }
  function notify({ user_id, type='alert', title, body, link, priority='medium', dedupe_key }){
    if (dedupe_key && exists(dedupe_key)) return null;
    const cid = (Auth.session()||{}).church_id;
    return DB.insert('notifications', {
      church_id: cid, user_id, type, title, body: body||'',
      link: link||'', is_read:false,
      priority, dedupe_key: dedupe_key || null,
      created_at: new Date().toISOString()
    });
  }

  function recipientsByRoles(roles){
    return DB.all('users').filter(u => roles.includes(u.role) && u.is_active).map(u=> u.user_id);
  }

  function runAttendanceDropAlerts(){
    const now = Date.now();
    const recs = DB.all('attendance_records') || [];
    const members = DB.all('members') || [];
    members.forEach(m => {
      const last30 = recs.filter(r=> r.member_id===m.member_id && (now-new Date(r.attended_at||r.created_at))<30*864e5).length;
      const prev30 = recs.filter(r=> { const d = now-new Date(r.attended_at||r.created_at); return d>=30*864e5 && d<60*864e5 && r.member_id===m.member_id; }).length;
      if (prev30 >= 3 && last30 <= Math.floor(prev30*0.4)){
        const supervisors = recipientsByRoles(['servant_leader','supervisor','church_admin']);
        supervisors.forEach(uid => notify({
          user_id: uid, type:'alert', priority:'high',
          title:`انخفاض حضور: ${m.full_name}`,
          body:`حضر ${last30} مرة آخر شهر مقابل ${prev30} في الشهر السابق`,
          link:`members.html?id=${m.member_id}`,
          dedupe_key:`att_drop:${m.member_id}:${new Date().toISOString().slice(0,10)}`
        }));
      }
    });
  }

  function runOverdueTaskAlerts(){
    const now = Date.now();
    (DB.all('followup_tasks')||[]).forEach(t=>{
      if (t.status === 'done' || t.status === 'closed') return;
      if (!t.due_at) return;
      if (new Date(t.due_at).getTime() < now){
        notify({
          user_id: t.assigned_to,
          type:'task', priority:'high',
          title:'مهمة افتقاد متأخرة',
          body: t.title || 'مهمة افتقاد بحاجة للمتابعة',
          link:'followup.html',
          dedupe_key:`overdue:${t.task_id}`
        });
      }
    });
  }

  function runPendingApprovals(){
    const pending = (DB.all('financial_transactions')||[]).filter(t=> t.status === 'pending');
    if (!pending.length) return;
    const approvers = recipientsByRoles(['church_admin','financial_manager','finance']);
    pending.forEach(t=>{
      approvers.forEach(uid=>{
        if (uid === t.recorded_by) return; // can't self-approve
        notify({
          user_id: uid, type:'workflow', priority:'high',
          title:'معاملة مالية بانتظار الاعتماد',
          body:`${t.type} — ${t.amount} ${t.currency||'EGP'}`,
          link:'finance.html',
          dedupe_key:`fin_pending:${t.transaction_id}:${uid}`
        });
      });
    });
  }

  function runFinanceInsights(){
    if (!window.FinanceEngine) return;
    try{ FinanceEngine.computeInsights(); }catch(_){}
    const ins = (window.FinanceEngine && FinanceEngine.listInsights()) || [];
    const targets = recipientsByRoles(['church_admin','financial_manager','finance']);
    ins.forEach((i,idx)=>{
      targets.forEach(uid=> notify({
        user_id: uid, type:'ai_insight',
        priority: i.severity==='critical'?'critical':i.severity==='warning'?'high':'medium',
        title:'تنبيه مالي ذكي',
        body: i.msg,
        link:'finance.html',
        dedupe_key:`fin_ins:${i.kind}:${uid}:${new Date().toISOString().slice(0,10)}`
      }));
    });
  }

  function runWorkflowBottlenecks(){
    const now = Date.now();
    const hist = DB.all('workflow_history') || [];
    hist.filter(h=> h.status==='running' && (now-new Date(h.started_at))>7*864e5).forEach(h=>{
      const admins = recipientsByRoles(['church_admin','service_admin']);
      admins.forEach(uid=> notify({
        user_id: uid, type:'alert', priority:'medium',
        title:'Workflow متوقف',
        body:`مرّ أكثر من 7 أيام دون إكمال`,
        link:'workflows.html',
        dedupe_key:`wf_stuck:${h.history_id||h.id||h.action_id+':'+h.target_id}`
      }));
    });
  }

  function runAll(){
    const s = Auth.session(); if (!s || s.role==='super_admin') return;
    try{ runAttendanceDropAlerts(); }catch(_){}
    try{ runOverdueTaskAlerts(); }catch(_){}
    try{ runPendingApprovals(); }catch(_){}
    try{ runFinanceInsights(); }catch(_){}
    try{ runWorkflowBottlenecks(); }catch(_){}
  }

  window.NotificationsEngine = {
    runAll, notify, PRIORITY,
    /** Member journey timeline — concise chronological events. */
    memberTimeline(memberId){
      const events = [];
      const m = DB.byId('members','member_id', memberId);
      if (m) events.push({ at:m.created_at, kind:'registered', label:'تسجيل في الكنيسة' });
      (DB.all('attendance_records')||[]).filter(r=>r.member_id===memberId).forEach(r=>{
        events.push({ at: r.attended_at||r.created_at, kind:'attendance', label:'حضور قداس/اجتماع' });
      });
      (DB.all('followup_tasks')||[]).filter(t=>t.member_id===memberId).forEach(t=>{
        events.push({ at: t.created_at, kind:'followup', label:`مهمة افتقاد: ${t.title||''}` });
        if (t.completed_at) events.push({ at: t.completed_at, kind:'followup_done', label:'إنهاء مهمة افتقاد' });
      });
      (DB.all('member_notes')||[]).filter(n=>n.member_id===memberId).forEach(n=>{
        events.push({ at: n.created_at, kind:'note', label:`ملاحظة: ${(n.content||'').slice(0,60)}` });
      });
      return events.sort((a,b)=> new Date(a.at) - new Date(b.at));
    }
  };

  if (Auth.session()) try{ runAll(); }catch(_){}
})();


/* === analytics-engine.js === */
/* ============================================================
   ANALYTICS-ENGINE.js — Operational intelligence layer
   Church health, risk detection, scorecards, cross-module insights
   ============================================================ */
(function(){
  const cache = Perf?.Cache;

  function _val(n){ return isFinite(n) ? Math.round(n) : 0; }

  function attendanceTrend(days){
    days = days || 60;
    const cutoff = Date.now() - days*864e5;
    const recs = DB.filter('attendance_records', r => new Date(r.check_in_at).getTime() >= cutoff);
    const byDay = {};
    recs.forEach(r => {
      const d = new Date(r.check_in_at).toISOString().slice(0,10);
      byDay[d] = (byDay[d]||0) + 1;
    });
    const labels = Object.keys(byDay).sort();
    return { labels, values: labels.map(l=>byDay[l]) };
  }

  function attendanceStability(){
    const t = attendanceTrend(60).values;
    if (t.length < 4) return 70;
    const half = Math.floor(t.length/2);
    const a = avg(t.slice(0,half)), b = avg(t.slice(half));
    if (a === 0) return 60;
    const delta = (b-a)/a;
    return Math.max(0, Math.min(100, 80 + delta*120));
  }
  function avg(a){ return a.reduce((s,x)=>s+x,0)/(a.length||1); }

  function workflowEfficiency(){
    const h = DB.all('workflow_history');
    if (!h.length) return 75;
    const done = h.filter(x => x.status==='completed').length;
    const failed = h.filter(x => x.status==='failed').length;
    const total = h.length;
    const eff = (done/total)*100 - (failed/total)*30;
    return Math.max(0, Math.min(100, eff));
  }
  function followupCompletion(){
    const f = DB.all('followups') || [];
    if (!f.length) return 80;
    const done = f.filter(x => x.status==='completed' || x.is_resolved).length;
    return (done / f.length) * 100;
  }
  function servantActivity(){
    const servants = DB.filter('users', u => ['servant','servant_leader','supervisor'].includes(u.role));
    if (!servants.length) return 75;
    const active = servants.filter(u => {
      if (!u.member_id) return false;
      const recent = DB.filter('attendance_records', r => r.member_id===u.member_id && (Date.now()-new Date(r.check_in_at).getTime())<30*864e5);
      return recent.length > 0;
    }).length;
    return (active/servants.length)*100;
  }
  function financialStability(){
    if (!window.FinanceEngine || !FinanceEngine.totals) return 80;
    try{
      const t = FinanceEngine.totals();
      if (!t) return 80;
      if (t.income <= 0) return 60;
      const ratio = t.income > 0 ? Math.min(1, (t.income - t.expense)/t.income) : 0;
      return Math.max(20, Math.min(100, 60 + ratio*40));
    } catch(_){ return 75; }
  }

  function churchHealth(){
    return Perf.Cache.get('analytics:health', 15000, () => {
      const parts = {
        attendance: attendanceStability(),
        workflow:   workflowEfficiency(),
        followup:   followupCompletion(),
        servants:   servantActivity(),
        finance:    financialStability()
      };
      const score = _val((parts.attendance*0.25 + parts.workflow*0.2 + parts.followup*0.2 + parts.servants*0.2 + parts.finance*0.15));
      return { score, parts };
    });
  }

  function risks(){
    const out = [];
    const t = attendanceTrend(60).values;
    if (t.length >= 6){
      const a = avg(t.slice(0,Math.floor(t.length/2))), b = avg(t.slice(Math.floor(t.length/2)));
      if (a>0 && (b-a)/a < -0.15) out.push({ kind:'attendance', sev:'high', msg:'انخفاض ملحوظ في الحضور خلال الفترة الأخيرة', delta: Math.round(((b-a)/a)*100)+'%' });
    }
    const inactive = DB.filter('users', u => ['servant','servant_leader'].includes(u.role)).filter(u => {
      if (!u.member_id) return true;
      const r = DB.filter('attendance_records', x => x.member_id===u.member_id);
      if (!r.length) return true;
      const last = r.sort((x,y)=> new Date(y.check_in_at)-new Date(x.check_in_at))[0];
      return (Date.now()-new Date(last.check_in_at).getTime()) > 45*864e5;
    });
    if (inactive.length) out.push({ kind:'servants', sev:inactive.length>3?'high':'medium', msg:`${inactive.length} خادم غير نشط لأكثر من 45 يوم`, list: inactive.slice(0,5).map(x=>x.full_name) });

    const blocked = DB.filter('workflow_history', h => h.status==='failed' || h.status==='escalated');
    if (blocked.length > 2) out.push({ kind:'workflows', sev:'high', msg:`${blocked.length} workflow متعثر أو مصعّد` });

    try {
      const t2 = FinanceEngine?.totals?.();
      if (t2 && t2.expense > t2.income && t2.income>0) out.push({ kind:'finance', sev:'critical', msg:'المصروفات تجاوزت الإيرادات في الفترة الحالية' });
    } catch(_){}

    const drop = DB.filter('members', m => {
      const r = DB.filter('attendance_records', x => x.member_id===m.member_id).sort((x,y)=> new Date(y.check_in_at)-new Date(x.check_in_at));
      if (!r.length) return false;
      return (Date.now()-new Date(r[0].check_in_at).getTime()) > 45*864e5;
    });
    if (drop.length > 5) out.push({ kind:'members', sev:'medium', msg:`${drop.length} مخدوم متغيب أكثر من 45 يوم — يحتاج افتقاد` });

    return out;
  }

  function insights(){
    const out = [];
    const h = churchHealth();
    if (h.score < 60) out.push({ icon:'fa-triangle-exclamation', sev:'critical', text:'مؤشر صحة الكنيسة منخفض — راجع المخاطر الحرجة' });
    else if (h.score < 75) out.push({ icon:'fa-bell', sev:'high', text:'مؤشر صحة الكنيسة في المنطقة الصفراء' });
    else out.push({ icon:'fa-circle-check', sev:'low', text:'الكنيسة في حالة تشغيلية صحية' });

    Object.entries(h.parts).forEach(([k,v]) => {
      if (v < 55) out.push({ icon:'fa-arrow-down', sev:'high', text:`أداء قسم "${labelOf(k)}" منخفض (${_val(v)}%)` });
    });
    return out;
  }
  function labelOf(k){ return ({attendance:'الحضور',workflow:'الـ Workflows',followup:'الافتقاد',servants:'نشاط الخدام',finance:'الماليات'})[k]||k; }

  function ministryScorecard(){
    const classes = DB.all('classes') || [];
    return classes.map(c => {
      const sessions = DB.filter('attendance_sessions', s => s.class_id===c.class_id);
      const recs = DB.filter('attendance_records', r => sessions.find(s => s.session_id===r.session_id));
      const score = sessions.length ? Math.min(100, (recs.length/sessions.length)*8) : 0;
      return { name:c.name||c.class_id, sessions:sessions.length, attendances:recs.length, score:_val(score) };
    }).sort((a,b)=>b.score-a.score);
  }

  function servantScorecard(){
    const servants = DB.filter('users', u => ['servant','servant_leader'].includes(u.role));
    return servants.map(s => {
      const completedFollowups = DB.filter('followups', f => f.assigned_to===s.user_id && (f.status==='completed'||f.is_resolved)).length;
      const open = DB.filter('followups', f => f.assigned_to===s.user_id && f.status!=='completed' && !f.is_resolved).length;
      const score = _val(Math.min(100, completedFollowups*8 - open*3 + 50));
      return { name:s.full_name, completed:completedFollowups, open, score };
    }).sort((a,b)=>b.score-a.score);
  }

  window.AnalyticsEngine = {
    attendanceTrend, churchHealth, risks, insights,
    ministryScorecard, servantScorecard,
    workflowEfficiency, followupCompletion, servantActivity, financialStability
  };
})();


/* === event-engine.js === */
/* ============================================================
   EVENT-ENGINE.js — Enterprise Event Core
   Lifecycle • Status • Types • Templates • Access • Capacity
   ============================================================ */
(function(){

  /* === EVENT TYPES === */
  const TYPES = {
    conference: { label:'مؤتمر',     icon:'fa-microphone-lines', requires_approval:true,  default_capacity:100 },
    retreat:    { label:'خلوة',      icon:'fa-tree',             requires_approval:true,  default_capacity:80  },
    meeting:    { label:'اجتماع',    icon:'fa-people-group',     requires_approval:false, default_capacity:30  },
    class:      { label:'فصل',       icon:'fa-chalkboard-user',  requires_approval:false, default_capacity:25  },
    course:     { label:'دورة',      icon:'fa-graduation-cap',   requires_approval:true,  default_capacity:40  },
    trip:       { label:'رحلة',      icon:'fa-bus',              requires_approval:true,  default_capacity:50  },
    camp:       { label:'مخيم',      icon:'fa-campground',       requires_approval:true,  default_capacity:60  },
    prayer:     { label:'اجتماع صلاة',icon:'fa-hands-praying',   requires_approval:false, default_capacity:40  },
    ministry:   { label:'نشاط خدمة', icon:'fa-hand-holding-heart',requires_approval:false,default_capacity:30  },
    servant:    { label:'اجتماع خدام',icon:'fa-user-tie',        requires_approval:true,  default_capacity:25  }
  };

  /* === LIFECYCLE === */
  const LIFECYCLE = ['draft','review','published','reg_open','reg_closed','ongoing','completed','archived'];
  const LIFECYCLE_LABELS = {
    draft:'مسودة', review:'مراجعة', published:'منشور',
    reg_open:'التسجيل مفتوح', reg_closed:'التسجيل مغلق',
    ongoing:'جاري التنفيذ', completed:'اكتمل', archived:'مؤرشف'
  };
  const STATUS_LABELS = {
    draft:'مسودة', pending_approval:'بانتظار الاعتماد', published:'منشور',
    active:'نشط', full:'مكتمل', waitlist:'قائمة انتظار',
    completed:'اكتمل', cancelled:'ملغي', archived:'مؤرشف'
  };
  const STATUS_COLORS = {
    draft:'gray', pending_approval:'orange', published:'blue',
    active:'green', full:'red', waitlist:'orange',
    completed:'blue', cancelled:'red', archived:'gray'
  };

  /* === LIFECYCLE TRANSITIONS === */
  const ALLOWED = {
    draft:       ['review','published','cancelled'],
    review:      ['published','draft','cancelled'],
    published:   ['reg_open','cancelled','archived'],
    reg_open:    ['reg_closed','ongoing','cancelled'],
    reg_closed:  ['ongoing','reg_open','cancelled'],
    ongoing:     ['completed','cancelled'],
    completed:   ['archived'],
    archived:    [],
    cancelled:   ['archived']
  };

  function canTransition(from, to){ return (ALLOWED[from] || []).includes(to); }

  function transition(eventId, to, actor){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) throw new Error('event not found');
    if (!canTransition(ev.lifecycle, to)) {
      throw new Error(`انتقال غير مسموح: ${ev.lifecycle} → ${to}`);
    }
    const from = ev.lifecycle;
    const patch = { lifecycle: to, updated_at: new Date().toISOString() };
    // map lifecycle → status
    if (to === 'reg_open') patch.status = 'active';
    if (to === 'reg_closed') patch.status = 'published';
    if (to === 'ongoing') patch.status = 'active';
    if (to === 'completed') patch.status = 'completed';
    if (to === 'archived') patch.status = 'archived';
    if (to === 'cancelled') patch.status = 'cancelled';
    if (to === 'review') patch.status = 'pending_approval';
    if (to === 'published') patch.status = 'published';
    DB.update('events','event_id',eventId, patch);

    EventTimeline.log(eventId, `lifecycle:${from}→${to}`, { from, to });
    Audit.log('event.transition', { event_id:eventId, from, to });

    // notify + workflows
    if (window.EventNotificationEngine) {
      EventNotificationEngine.onLifecycleChange(eventId, from, to);
    }
    if (window.EventWorkflowEngine) {
      EventWorkflowEngine.onLifecycleChange(eventId, from, to);
    }
    return DB.byId('events','event_id',eventId);
  }

  /* === STATUS RECOMPUTE (derived from bookings + capacity) === */
  function recomputeStatus(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;
    if (['draft','cancelled','archived','completed'].includes(ev.lifecycle)) return;
    const bookings = DB.filter('event_bookings', b=> b.event_id===eventId);
    const confirmed = bookings.filter(b => ['confirmed','approved','attended'].includes(b.booking_status)).length;
    const waiting   = bookings.filter(b => b.booking_status==='waiting').length;
    const cap = capacity(ev);
    let status = ev.status;
    if (confirmed >= cap && waiting>0) status = 'waitlist';
    else if (confirmed >= cap) status = 'full';
    else if (ev.lifecycle === 'reg_open') status = 'active';
    if (status !== ev.status) DB.update('events','event_id',eventId,{ status });

    // auto-close when full
    if (ev.auto_close_when_full && confirmed >= cap && ev.lifecycle === 'reg_open' && !ev.has_waiting_list) {
      try { transition(eventId,'reg_closed'); } catch(_){}
    }
  }

  /* === CAPACITY === */
  function capacity(ev){
    const overbook = Math.floor((ev.capacity||0) * (ev.overbook_pct||0)/100);
    return (ev.capacity||0) + overbook;
  }
  function capacityBreakdown(ev){
    const bookings = DB.filter('event_bookings', b=> b.event_id===ev.event_id);
    const confirmed = bookings.filter(b => ['confirmed','approved','attended'].includes(b.booking_status));
    return {
      total: capacity(ev),
      regular: confirmed.filter(b=>b.seat_class==='regular').length,
      vip:     confirmed.filter(b=>b.seat_class==='vip').length,
      servant: confirmed.filter(b=>b.seat_class==='servant').length,
      reserved:confirmed.filter(b=>b.seat_class==='reserved').length,
      confirmed: confirmed.length,
      waiting: bookings.filter(b=>b.booking_status==='waiting').length,
      pending: bookings.filter(b=>b.booking_status==='pending').length,
      attended: bookings.filter(b=>b.booking_status==='attended').length,
      no_show:  bookings.filter(b=>b.booking_status==='no_show').length,
      cancelled:bookings.filter(b=>b.booking_status==='cancelled').length,
      fill_pct: capacity(ev) ? Math.min(100, Math.round(confirmed.length/capacity(ev)*100)) : 0
    };
  }
  function isFull(ev){ return capacityBreakdown(ev).confirmed >= capacity(ev); }

  /* === ROLE-BASED ACCESS === */
  function canMemberRegister(ev, member){
    const r = ev.access_rules || {};
    if (r.min_age && member.age && member.age < r.min_age) return { ok:false, reason:`الحد الأدنى للعمر: ${r.min_age}` };
    if (r.max_age && member.age && member.age > r.max_age) return { ok:false, reason:`الحد الأقصى للعمر: ${r.max_age}` };
    if (r.gender && member.gender && member.gender !== r.gender) return { ok:false, reason:'مقصور على جنس محدد' };
    if (r.ministries?.length && !r.ministries.includes(member.ministry_id)) return { ok:false, reason:'غير مخصص لخدمتك' };
    if (r.classes?.length && !r.classes.includes(member.service_class_id)) return { ok:false, reason:'غير مخصص لفصلك' };
    if (r.min_attendance_rate && (member.attendance_rate||0) < r.min_attendance_rate) return { ok:false, reason:`نسبة حضور أقل من ${r.min_attendance_rate}%` };
    if (r.min_serving_level && (member.serving_level||0) < r.min_serving_level) return { ok:false, reason:'مستوى الخدمة غير كافٍ' };
    return { ok:true };
  }

  /* === TEMPLATES === */
  function createFromTemplate(templateId, overrides){
    const tpl = DB.byId('event_templates','template_id',templateId);
    if (!tpl) throw new Error('template not found');
    const def = tpl.defaults || {};
    const starts = overrides.starts_at || new Date(Date.now()+7*864e5).toISOString();
    const ends = new Date(new Date(starts).getTime() + (def.duration_hours||3)*36e5).toISOString();
    const ev = DB.insert('events', {
      title: overrides.title || tpl.name,
      description: overrides.description || '',
      event_type: tpl.event_type,
      starts_at: starts, ends_at: ends,
      location: overrides.location || '',
      capacity: def.capacity || 50,
      reserved_seats:0, vip_seats:0, servant_seats:0,
      waitlist_capacity: def.waitlist_capacity||0,
      overbook_pct:0,
      price: def.price || 0, currency:'EGP',
      has_waiting_list:true,
      requires_approval: !!def.requires_approval,
      auto_close_when_full:true,
      lifecycle:'draft', status:'draft',
      access_rules: def.access_rules || {},
      template_id: templateId,
      approval_required: (TYPES[tpl.event_type]||{}).requires_approval || false,
      created_by: (Auth.session()||{}).user_id
    });
    // create default tasks
    (def.tasks||[]).forEach(t => DB.insert('event_tasks', { event_id:ev.event_id, title:t.title, role:t.role, status:'open' }));
    // create budget skeleton
    if (def.budget_lines?.length) {
      const lines = def.budget_lines.map(l => ({ ...l, actual:0 }));
      const total = lines.reduce((s,l)=>s+(+l.estimated||0),0);
      const b = DB.insert('event_budgets', { event_id:ev.event_id, estimated_total:total, approved_total:0, actual_total:0, lines, approval_status:'draft' });
      DB.update('events','event_id',ev.event_id,{ budget_id: b.budget_id });
    }
    EventTimeline.log(ev.event_id,'created_from_template',{ template_id: templateId });
    Audit.log('event.create_from_template',{ event_id:ev.event_id, template_id:templateId });
    return ev;
  }

  /* === CREATE / APPROVE === */
  function create(data){
    const typ = TYPES[data.event_type] || {};
    const ev = DB.insert('events', Object.assign({
      lifecycle:'draft', status:'draft',
      reserved_seats:0, vip_seats:0, servant_seats:0,
      waitlist_capacity:0, overbook_pct:0,
      currency:'EGP', has_waiting_list:true,
      auto_close_when_full:true,
      access_rules:{},
      approval_required: typ.requires_approval || false,
      requires_approval: !!data.requires_approval,
      created_by:(Auth.session()||{}).user_id
    }, data));
    EventTimeline.log(ev.event_id,'created',{ title:ev.title });
    Audit.log('event.create',{ event_id:ev.event_id });
    return ev;
  }

  function approve(eventId){
    const s = Auth.session();
    DB.update('events','event_id',eventId,{ approved_by:s.user_id, approved_at:new Date().toISOString() });
    EventTimeline.log(eventId,'approved',{ by:s.user_id });
    Audit.log('event.approve',{ event_id:eventId });
    return transition(eventId,'published');
  }

  function cancel(eventId, reason){
    DB.update('events','event_id',eventId,{ cancelled_reason: reason||'' });
    EventTimeline.log(eventId,'cancelled',{ reason });
    Audit.log('event.cancel',{ event_id:eventId, reason });
    if (window.EventNotificationEngine) EventNotificationEngine.onCancelled(eventId, reason);
    return transition(eventId,'cancelled');
  }

  /* === TIMELINE HELPER === */
  const EventTimeline = {
    log(eventId, action, meta){
      const s = Auth.session() || {};
      DB.insert('event_timeline', {
        event_id:eventId, action, actor_id:s.user_id||null,
        member_id: meta?.member_id || null,
        meta: meta||{}
      });
    },
    forEvent(eventId){
      return DB.filter('event_timeline', t => t.event_id===eventId).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    },
    forMember(memberId){
      return DB.filter('event_timeline', t => t.member_id===memberId).sort((a,b)=> new Date(b.created_at)-new Date(a.created_at));
    }
  };

  window.EventEngine = {
    TYPES, LIFECYCLE, LIFECYCLE_LABELS, STATUS_LABELS, STATUS_COLORS,
    canTransition, transition, recomputeStatus,
    capacity, capacityBreakdown, isFull, canMemberRegister,
    createFromTemplate, create, approve, cancel
  };
  window.EventTimeline = EventTimeline;
})();


/* === registration-engine.js === */
/* ============================================================
   REGISTRATION-ENGINE.js — Smart Registration / Approval / Waitlist
   ============================================================ */
(function(){

  function ticketCode(){
    return 'TKT-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2,6).toUpperCase();
  }
  function reservationCode(){
    return 'R-' + Math.random().toString(36).slice(2,8).toUpperCase();
  }

  /* === ELIGIBILITY === */
  function checkEligibility(eventId, memberId){
    const ev = DB.byId('events','event_id',eventId);
    const m  = DB.byId('members','member_id',memberId);
    if (!ev || !m) return { ok:false, reason:'بيانات غير صحيحة' };
    if (!['reg_open','published'].includes(ev.lifecycle)) return { ok:false, reason:'التسجيل غير متاح حالياً' };
    if (ev.registration_closes_at && new Date(ev.registration_closes_at) < new Date()) return { ok:false, reason:'انتهى موعد التسجيل' };
    if (ev.registration_opens_at && new Date(ev.registration_opens_at) > new Date()) return { ok:false, reason:'لم يبدأ التسجيل بعد' };
    const dup = DB.find('event_bookings', b => b.event_id===eventId && b.member_id===memberId && !['cancelled','rejected','no_show'].includes(b.booking_status));
    if (dup) return { ok:false, reason:'تم التسجيل مسبقاً' };
    return EventEngine.canMemberRegister(ev, m);
  }

  /* === REGISTER === */
  function register(eventId, memberId, opts){
    opts = opts || {};
    const elig = checkEligibility(eventId, memberId);
    if (!elig.ok) throw new Error(elig.reason);
    const ev = DB.byId('events','event_id',eventId);
    const cap = EventEngine.capacityBreakdown(ev);
    const full = cap.confirmed >= EventEngine.capacity(ev);

    let booking_status, waitlist_position = null;
    if (ev.requires_approval) {
      booking_status = 'pending';
    } else if (full) {
      if (!ev.has_waiting_list) throw new Error('الفعالية مكتملة');
      const wlSize = DB.count('event_bookings', b=> b.event_id===eventId && b.booking_status==='waiting');
      if (ev.waitlist_capacity && wlSize >= ev.waitlist_capacity) throw new Error('قائمة الانتظار مكتملة');
      booking_status = 'waiting';
      waitlist_position = wlSize + 1;
    } else {
      booking_status = 'confirmed';
    }

    const booking = DB.insert('event_bookings', {
      event_id: eventId, member_id: memberId,
      booking_status, waitlist_position,
      seat_class: opts.seat_class || 'regular',
      payment_status: ev.price > 0 ? 'unpaid' : 'paid',
      amount_paid: 0,
      qr_ticket: ticketCode(),
      reservation_code: reservationCode(),
      notes: opts.notes || ''
    });

    EventTimeline.log(eventId, booking_status === 'waiting' ? 'waitlisted' : (booking_status==='pending'?'registered_pending':'registered'),
      { member_id: memberId, booking_id: booking.booking_id, position: waitlist_position });
    Audit.log('event.register',{ event_id:eventId, member_id:memberId, status:booking_status });

    EventEngine.recomputeStatus(eventId);

    if (window.EventNotificationEngine) {
      EventNotificationEngine.onRegistered(booking, ev);
    }
    if (window.EventWorkflowEngine) {
      EventWorkflowEngine.onRegistered(booking, ev);
    }
    return booking;
  }

  /* === APPROVE / REJECT === */
  function approveBooking(bookingId, notes){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) throw new Error('booking not found');
    const ev = DB.byId('events','event_id',b.event_id);
    const cap = EventEngine.capacityBreakdown(ev);
    const full = cap.confirmed >= EventEngine.capacity(ev);
    const newStatus = full && ev.has_waiting_list ? 'waiting' : 'confirmed';
    const wl_pos = newStatus==='waiting' ? (DB.count('event_bookings', x=> x.event_id===b.event_id && x.booking_status==='waiting')+1) : null;
    DB.update('event_bookings','booking_id',bookingId,{
      booking_status:newStatus, waitlist_position:wl_pos,
      approved_by:(Auth.session()||{}).user_id, approved_at:new Date().toISOString(),
      notes: notes ? ((b.notes||'')+'\n'+notes) : b.notes
    });
    EventTimeline.log(b.event_id,'approved_reg',{ member_id:b.member_id, booking_id:bookingId });
    Audit.log('event.booking.approve',{ booking_id:bookingId });
    EventEngine.recomputeStatus(b.event_id);
    if (window.EventNotificationEngine) EventNotificationEngine.onApproved(b, ev);
    return DB.byId('event_bookings','booking_id',bookingId);
  }

  function rejectBooking(bookingId, reason){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) throw new Error('booking not found');
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'rejected', rejected_reason: reason||'' });
    EventTimeline.log(b.event_id,'rejected_reg',{ member_id:b.member_id, booking_id:bookingId, reason });
    Audit.log('event.booking.reject',{ booking_id:bookingId, reason });
    if (window.EventNotificationEngine) EventNotificationEngine.onRejected(b, reason);
    return DB.byId('event_bookings','booking_id',bookingId);
  }

  /* === CANCEL — auto promotes top of waitlist === */
  function cancelBooking(bookingId, reason){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) return;
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'cancelled', notes:(b.notes||'')+'\nإلغاء: '+(reason||'') });
    EventTimeline.log(b.event_id,'cancelled_reg',{ member_id:b.member_id, booking_id:bookingId, reason });
    Audit.log('event.booking.cancel',{ booking_id:bookingId });
    promoteWaitlist(b.event_id);
    EventEngine.recomputeStatus(b.event_id);
  }

  /* === AUTO PROMOTE WAITLIST === */
  function promoteWaitlist(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;
    const cap = EventEngine.capacity(ev);
    let confirmed = DB.count('event_bookings', b=> b.event_id===eventId && ['confirmed','approved','attended'].includes(b.booking_status));
    const waiting = DB.filter('event_bookings', b=> b.event_id===eventId && b.booking_status==='waiting')
      .sort((a,b)=> (a.waitlist_position||0)-(b.waitlist_position||0));
    const promoted = [];
    for (const w of waiting) {
      if (confirmed >= cap) break;
      DB.update('event_bookings','booking_id',w.booking_id,{ booking_status:'confirmed', waitlist_position:null });
      EventTimeline.log(eventId,'promoted',{ member_id:w.member_id, booking_id:w.booking_id });
      Audit.log('event.booking.promote',{ booking_id:w.booking_id });
      if (window.EventNotificationEngine) EventNotificationEngine.onPromoted(w, ev);
      promoted.push(w);
      confirmed++;
    }
    // re-number waitlist
    DB.filter('event_bookings', b=> b.event_id===eventId && b.booking_status==='waiting')
      .sort((a,b)=> (a.waitlist_position||0)-(b.waitlist_position||0))
      .forEach((b,i)=> DB.update('event_bookings','booking_id',b.booking_id,{ waitlist_position:i+1 }));
    return promoted;
  }

  /* === CHECK-IN === */
  function checkIn(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) throw new Error('booking not found');
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'attended', checked_in_at:new Date().toISOString() });
    EventTimeline.log(b.event_id,'checked_in',{ member_id:b.member_id, booking_id:bookingId });
    Audit.log('event.checkin',{ booking_id:bookingId });
    return DB.byId('event_bookings','booking_id',bookingId);
  }

  function markNoShow(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) return;
    DB.update('event_bookings','booking_id',bookingId,{ booking_status:'no_show' });
    EventTimeline.log(b.event_id,'no_show',{ member_id:b.member_id, booking_id:bookingId });
    promoteWaitlist(b.event_id);
  }

  window.RegistrationEngine = {
    ticketCode, reservationCode,
    checkEligibility, register,
    approveBooking, rejectBooking, cancelBooking,
    promoteWaitlist, checkIn, markNoShow
  };
})();


/* === ticket-engine.js === */
/* ============================================================
   TICKET-ENGINE.js — Ticket + QR + Pass generation
   Uses qrcodejs (already loaded in page) when available.
   ============================================================ */
(function(){

  function ticketUrl(booking){
    // Encoded data the scanner page can verify
    return JSON.stringify({ t:'ticket', tk: booking.qr_ticket, ev: booking.event_id, m: booking.member_id, rc: booking.reservation_code });
  }

  function render(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    if (!b) return '';
    const ev = DB.byId('events','event_id', b.event_id);
    const m  = DB.byId('members','member_id', b.member_id) || { full_name:'—' };
    const statusBadge = `<span class="badge badge-${b.booking_status==='confirmed'?'green':b.booking_status==='waiting'?'orange':b.booking_status==='pending'?'blue':'gray'}">${b.booking_status}</span>`;
    return `
      <div class="ticket-pass">
        <div class="ticket-head">
          <div>
            <div class="text-muted" style="font-size:.75rem">تذكرة دخول</div>
            <h3 style="margin:.2rem 0">${ev?.title||'—'}</h3>
            <div class="text-muted">${ev ? UI.fmt.dateTime(ev.starts_at) : ''}</div>
            <div class="text-muted">${ev?.location||''}</div>
          </div>
          ${statusBadge}
        </div>
        <div class="ticket-body">
          <div>
            <div class="text-muted" style="font-size:.75rem">المخدوم</div>
            <div style="font-weight:600">${m.full_name}</div>
            <div class="text-muted" style="font-size:.85rem;margin-top:.4rem">كود الحجز</div>
            <div style="font-family:monospace;font-weight:700">${b.reservation_code||'—'}</div>
            ${b.seat_class && b.seat_class!=='regular' ? `<div class="mt-1"><span class="badge badge-blue">${b.seat_class}</span></div>`:''}
            ${b.waitlist_position ? `<div class="mt-1 text-muted">في الانتظار رقم #${b.waitlist_position}</div>`:''}
          </div>
          <div id="qr-${bookingId}" class="ticket-qr"></div>
        </div>
        <div class="ticket-foot text-muted">${b.qr_ticket}</div>
      </div>
      <style>
        .ticket-pass{border:2px dashed var(--border);border-radius:14px;padding:1rem;background:linear-gradient(135deg, var(--bg1), var(--bg2))}
        .ticket-head{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:.6rem;border-bottom:1px dashed var(--border)}
        .ticket-body{display:grid;grid-template-columns:1fr auto;gap:1rem;align-items:center;padding:.8rem 0}
        .ticket-qr{width:140px;height:140px;display:flex;align-items:center;justify-content:center;background:#fff;border-radius:8px}
        .ticket-foot{text-align:center;font-family:monospace;font-size:.75rem;border-top:1px dashed var(--border);padding-top:.4rem}
      </style>
    `;
  }

  function attachQr(bookingId){
    const b = DB.byId('event_bookings','booking_id',bookingId);
    const el = document.getElementById('qr-'+bookingId);
    if (!el || !b || !window.QRCode) return;
    el.innerHTML = '';
    new QRCode(el, { text: ticketUrl(b), width:128, height:128, correctLevel: QRCode.CorrectLevel.M });
  }

  function verify(scanPayload){
    try {
      const d = JSON.parse(scanPayload);
      if (d.t !== 'ticket') return { ok:false, reason:'كود غير معروف' };
      const b = DB.find('event_bookings', x => x.qr_ticket === d.tk && x.event_id === d.ev);
      if (!b) return { ok:false, reason:'تذكرة غير موجودة' };
      return { ok:true, booking:b };
    } catch(_) { return { ok:false, reason:'كود تالف' }; }
  }

  window.TicketEngine = { render, attachQr, verify, ticketUrl };
})();


/* === event-workflow-engine.js === */
/* ============================================================
   EVENT-WORKFLOW-ENGINE.js — Event lifecycle → Workflows / Tasks
   Hooks into WorkflowEngine and Permissions
   ============================================================ */
(function(){

  function assignTask({ event_id, title, role, assigned_to, due_at }){
    return DB.insert('event_tasks', {
      event_id, title, role,
      assigned_to: assigned_to||null,
      due_at: due_at || null,
      status:'open', escalation_level:0
    });
  }

  function completeTask(taskId){
    DB.update('event_tasks','task_id',taskId,{ status:'done', completed_at:new Date().toISOString() });
    Audit.log('event.task.complete',{ task_id:taskId });
  }

  function escalateOverdueTasks(){
    const now = Date.now();
    DB.filter('event_tasks', t => t.status==='open' && t.due_at && new Date(t.due_at).getTime() < now)
      .forEach(t => {
        const lvl = (t.escalation_level||0)+1;
        DB.update('event_tasks','task_id',t.task_id,{ escalation_level:lvl, status: lvl>=3?'escalated':'open' });
        if (window.EventNotificationEngine) EventNotificationEngine.onTaskOverdue(t);
      });
  }

  /* === LIFECYCLE HOOKS === */
  function onLifecycleChange(eventId, from, to){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;

    if (to === 'review') {
      // notify church admins for approval
      DB.filter('users', u => ['church_admin','service_admin'].includes(u.role)).forEach(u =>
        Notify.toUser(u.user_id,'approval','اعتماد فعالية مطلوب',`فعالية ${ev.title} بانتظار الاعتماد`,'events.html'));
    }
    if (to === 'published' || to === 'reg_open') {
      // ensure default tasks exist from template
      const tpl = ev.template_id ? DB.byId('event_templates','template_id',ev.template_id) : null;
      if (tpl?.defaults?.tasks) {
        tpl.defaults.tasks.forEach(t => {
          if (!DB.find('event_tasks', x => x.event_id===eventId && x.title===t.title)) {
            assignTask({ event_id:eventId, title:t.title, role:t.role });
          }
        });
      }
    }
    if (to === 'completed') {
      // Mark no-shows + trigger follow-up workflow for absentees
      const bookings = DB.filter('event_bookings', b => b.event_id===eventId);
      bookings.filter(b => ['confirmed','approved'].includes(b.booking_status))
        .forEach(b => DB.update('event_bookings','booking_id',b.booking_id,{ booking_status:'no_show' }));
      // create follow-up tasks for no-shows
      bookings.filter(b => b.booking_status==='no_show').forEach(b => {
        DB.insert('followup_tasks', {
          member_id: b.member_id,
          assigned_to: null,
          created_by: 'event-engine',
          reason: `لم يحضر فعالية: ${ev.title}`,
          priority:'medium',
          due_at: new Date(Date.now()+3*864e5).toISOString(),
          status:'open', escalation_level:0
        });
      });
    }
  }

  /* === REGISTRATION HOOKS === */
  function onRegistered(booking, ev){
    // Assign servant follow-up for new registrations
    const servants = DB.filter('users', u => ['servant','servant_leader','supervisor'].includes(u.role));
    if (servants.length) {
      const s = servants[Math.floor(Math.random()*servants.length)];
      assignTask({
        event_id: ev.event_id,
        title: `متابعة تسجيل: ${(DB.byId('members','member_id',booking.member_id)||{}).full_name||''}`,
        role: 'servant',
        assigned_to: s.user_id,
        due_at: new Date(Date.now()+2*864e5).toISOString()
      });
    }
  }

  /* === APPROVAL CHAIN === */
  function requestEventApproval(eventId){
    return EventEngine.transition(eventId,'review');
  }
  function requestBudgetApproval(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev || !ev.budget_id) throw new Error('لا توجد ميزانية');
    DB.update('event_budgets','budget_id',ev.budget_id,{ approval_status:'pending' });
    DB.filter('users', u => ['church_admin','finance','financial_manager'].includes(u.role)).forEach(u =>
      Notify.toUser(u.user_id,'approval','اعتماد ميزانية فعالية',`${ev.title}`,'events.html'));
    Audit.log('event.budget.submit',{ event_id:eventId });
  }
  function approveBudget(budgetId){
    const b = DB.byId('event_budgets','budget_id',budgetId);
    if (!b) return;
    DB.update('event_budgets','budget_id',budgetId,{
      approval_status:'approved',
      approved_total: b.estimated_total,
      approved_by:(Auth.session()||{}).user_id,
      approved_at:new Date().toISOString()
    });
    Audit.log('event.budget.approve',{ budget_id:budgetId });
  }

  window.EventWorkflowEngine = {
    assignTask, completeTask, escalateOverdueTasks,
    onLifecycleChange, onRegistered,
    requestEventApproval, requestBudgetApproval, approveBudget
  };
})();


/* === event-notification-engine.js === */
/* ============================================================
   EVENT-NOTIFICATION-ENGINE.js — Event-specific notifications
   Wraps NotificationsEngine.notify and Notify.toUser
   ============================================================ */
(function(){

  function notify(user_id, opts){
    if (window.NotificationsEngine?.notify) {
      return NotificationsEngine.notify(Object.assign({ user_id }, opts));
    }
    if (window.Notify?.toUser) {
      return Notify.toUser(user_id, opts.type||'info', opts.title, opts.body, opts.link);
    }
  }

  function broadcastToRoles(roles, opts){
    DB.filter('users', u => roles.includes(u.role) && u.is_active!==false).forEach(u => notify(u.user_id, opts));
  }

  function memberUser(memberId){
    return DB.find('users', u => u.member_id === memberId);
  }

  /* === LIFECYCLE === */
  function onLifecycleChange(eventId, from, to){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return;
    if (to === 'reg_open') {
      broadcastToRoles(['servant','servant_leader','supervisor','church_admin'], {
        type:'event', priority:'medium',
        title:`فُتح التسجيل: ${ev.title}`, body:UI.fmt.dateTime(ev.starts_at),
        link:'events.html', dedupe_key:`ev_open:${eventId}`
      });
    }
    if (to === 'ongoing') {
      broadcastToRoles(['servant','servant_leader','supervisor'], {
        type:'event', priority:'medium',
        title:`بدأت الفعالية: ${ev.title}`, body:ev.location||'',
        link:'events.html', dedupe_key:`ev_start:${eventId}`
      });
    }
    if (to === 'completed') {
      broadcastToRoles(['church_admin','servant_leader'], {
        type:'event', priority:'low',
        title:`اكتملت الفعالية: ${ev.title}`,
        body:`جاهزة لمراجعة الحضور والمتابعة`,
        link:'events.html', dedupe_key:`ev_done:${eventId}`
      });
    }
  }

  function onCancelled(eventId, reason){
    const ev = DB.byId('events','event_id',eventId);
    DB.filter('event_bookings', b => b.event_id===eventId && !['cancelled','rejected'].includes(b.booking_status))
      .forEach(b => {
        const u = memberUser(b.member_id);
        if (u) notify(u.user_id, { type:'alert', priority:'high',
          title:`أُلغيت الفعالية: ${ev.title}`,
          body: reason || 'تم إلغاء الفعالية. سيتم التواصل بخصوص أي مبالغ مدفوعة.',
          link:'events.html' });
      });
  }

  /* === BOOKING === */
  function onRegistered(booking, ev){
    const u = memberUser(booking.member_id);
    if (!u) return;
    const msg = booking.booking_status === 'pending' ? 'تم استلام طلبك وبانتظار الاعتماد'
              : booking.booking_status === 'waiting' ? `أنت في قائمة الانتظار #${booking.waitlist_position}`
              : `تم تأكيد حجزك — كود: ${booking.reservation_code}`;
    notify(u.user_id, { type:'event', priority:'medium', title:`تسجيل: ${ev.title}`, body:msg, link:'events.html' });
  }
  function onApproved(booking, ev){
    const u = memberUser(booking.member_id);
    if (u) notify(u.user_id, { type:'event', priority:'high', title:`تم اعتماد تسجيلك: ${ev.title}`, body:`كود الحجز: ${booking.reservation_code}`, link:'events.html' });
  }
  function onRejected(booking, reason){
    const u = memberUser(booking.member_id);
    const ev = DB.byId('events','event_id',booking.event_id);
    if (u) notify(u.user_id, { type:'event', priority:'medium', title:`تعذر اعتماد تسجيلك: ${ev?.title||''}`, body:reason||'يرجى التواصل مع الخدام', link:'events.html' });
  }
  function onPromoted(booking, ev){
    const u = memberUser(booking.member_id);
    if (u) notify(u.user_id, { type:'event', priority:'high', title:`تمت ترقيتك من قائمة الانتظار: ${ev.title}`, body:`كود: ${booking.reservation_code}`, link:'events.html' });
  }

  /* === TASKS === */
  function onTaskOverdue(task){
    if (task.assigned_to) notify(task.assigned_to, { type:'task', priority:'high', title:`مهمة فعالية متأخرة`, body:task.title, link:'events.html' });
  }

  /* === REMINDERS (call on a schedule / page load) === */
  function runReminders(){
    const now = Date.now();
    // 24h before event
    DB.all('events').forEach(ev => {
      if (!['reg_open','reg_closed','published','ongoing','active'].includes(ev.status)) return;
      const ms = new Date(ev.starts_at).getTime() - now;
      if (ms > 0 && ms < 25*36e5) {
        DB.filter('event_bookings', b => b.event_id===ev.event_id && ['confirmed','approved'].includes(b.booking_status))
          .forEach(b => {
            const u = memberUser(b.member_id);
            if (u) notify(u.user_id, { type:'reminder', priority:'medium', title:`تذكير: ${ev.title} غداً`, body:UI.fmt.dateTime(ev.starts_at), link:'events.html', dedupe_key:`ev_rem24:${ev.event_id}:${b.member_id}` });
          });
      }
      // capacity alert at 90% full
      const cap = EventEngine.capacityBreakdown(ev);
      if (cap.fill_pct >= 90 && cap.fill_pct < 100) {
        broadcastToRoles(['church_admin','servant_leader'], {
          type:'alert', priority:'high',
          title:`اقتراب اكتمال: ${ev.title} (${cap.fill_pct}%)`,
          body:`${cap.confirmed}/${EventEngine.capacity(ev)} حجز`,
          link:'events.html', dedupe_key:`ev_cap90:${ev.event_id}`
        });
      }
      // registration closing in 24h
      if (ev.registration_closes_at) {
        const cms = new Date(ev.registration_closes_at).getTime() - now;
        if (cms > 0 && cms < 25*36e5) {
          broadcastToRoles(['servant','servant_leader','supervisor'], {
            type:'reminder', priority:'medium',
            title:`يغلق التسجيل قريباً: ${ev.title}`,
            body:UI.fmt.dateTime(ev.registration_closes_at),
            link:'events.html', dedupe_key:`ev_regclose:${ev.event_id}`
          });
        }
      }
    });
  }

  window.EventNotificationEngine = {
    onLifecycleChange, onCancelled,
    onRegistered, onApproved, onRejected, onPromoted,
    onTaskOverdue, runReminders
  };
})();


/* === event-analytics.js === */
/* ============================================================
   EVENT-ANALYTICS.js — Capacity, velocity, attendance, finance
   ============================================================ */
(function(){

  function eventMetrics(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return null;
    const cap = EventEngine.capacityBreakdown(ev);
    const bookings = DB.filter('event_bookings', b => b.event_id===eventId);
    const total = bookings.length;
    const attended = cap.attended;
    const expected = cap.confirmed + cap.pending;
    const noShow = cap.no_show;
    const attendanceRate = (attended+noShow) ? Math.round(attended/(attended+noShow)*100) : null;

    // Registration velocity (last 7 days)
    const now = Date.now();
    const last7 = bookings.filter(b => (now - new Date(b.created_at).getTime()) < 7*864e5).length;
    const prev7 = bookings.filter(b => { const d = now-new Date(b.created_at).getTime(); return d>=7*864e5 && d<14*864e5; }).length;
    const velocityChange = prev7 ? Math.round((last7-prev7)/prev7*100) : null;

    return {
      ev, cap, total, attended, noShow, expected, attendanceRate,
      fillPct: cap.fill_pct, velocity7d: last7, velocityChange,
      cancellations: cap.cancelled
    };
  }

  function overview(){
    const events = DB.all('events');
    const active = events.filter(e => ['active','reg_open','published','full','waitlist'].includes(e.status) || ['reg_open','reg_closed','ongoing','published'].includes(e.lifecycle));
    const completed = events.filter(e => e.status==='completed');
    const cancelled = events.filter(e => e.status==='cancelled');
    const pending   = events.filter(e => e.status==='pending_approval');
    const totalBookings = DB.all('event_bookings').length;
    const totalAttended = DB.count('event_bookings', b => b.booking_status==='attended');
    const totalWaiting  = DB.count('event_bookings', b => b.booking_status==='waiting');
    const totalPending  = DB.count('event_bookings', b => b.booking_status==='pending');

    return {
      events_total: events.length,
      events_active: active.length,
      events_completed: completed.length,
      events_cancelled: cancelled.length,
      events_pending: pending.length,
      bookings_total: totalBookings,
      bookings_attended: totalAttended,
      bookings_waiting: totalWaiting,
      bookings_pending: totalPending,
      avg_fill: events.length ? Math.round(events.reduce((s,e)=> s+EventEngine.capacityBreakdown(e).fill_pct,0)/events.length) : 0
    };
  }

  function financialSummary(eventId){
    const ev = DB.byId('events','event_id',eventId);
    if (!ev) return null;
    const bookings = DB.filter('event_bookings', b => b.event_id===eventId && b.booking_status!=='cancelled' && b.booking_status!=='rejected');
    const revenue = bookings.reduce((s,b)=> s+(+b.amount_paid||0), 0);
    const expected = bookings.length * (+ev.price||0);
    const expenses = DB.filter('event_expenses', e => e.event_id===eventId && e.status!=='rejected').reduce((s,e)=> s+(+e.amount||0),0);
    const budget = ev.budget_id ? DB.byId('event_budgets','budget_id',ev.budget_id) : null;
    return {
      revenue, expected_revenue: expected, expenses,
      net: revenue - expenses,
      budget_estimated: budget?.estimated_total||0,
      budget_approved: budget?.approved_total||0,
      budget_utilization: budget?.estimated_total ? Math.round(expenses/budget.estimated_total*100) : 0
    };
  }

  function popularityRanking(){
    const events = DB.all('events');
    return events.map(e => ({
      event_id:e.event_id, title:e.title,
      registrations: DB.count('event_bookings', b=> b.event_id===e.event_id && !['cancelled','rejected'].includes(b.booking_status)),
      fill: EventEngine.capacityBreakdown(e).fill_pct
    })).sort((a,b)=> b.registrations - a.registrations);
  }

  function memberHistory(memberId){
    const bookings = DB.filter('event_bookings', b => b.member_id===memberId);
    return bookings.map(b => ({
      booking: b,
      event: DB.byId('events','event_id', b.event_id)
    })).sort((a,b)=> new Date(b.event?.starts_at||0) - new Date(a.event?.starts_at||0));
  }

  window.EventAnalytics = { eventMetrics, overview, financialSummary, popularityRanking, memberHistory };
})();


/* === billing-engine.js === */
/* ============================================================
   BILLING-ENGINE.js  —  Phase 1 + 2
   Subscription plans · subscriptions · invoices · payments
   trial · renewals · grace · feature restrictions · history
   ------------------------------------------------------------
   Pure localStorage. Drop-in replaceable by REST later.
   ============================================================ */
(function(){
  const TABLES = [
    'subscription_plans','subscriptions','invoices','invoice_payments',
    'subscription_history','billing_notices'
  ];
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function save(all){ localStorage.setItem('church_db_v1', JSON.stringify(all)); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3); }
  function days(n){ return n*864e5; }
  function now(){ return new Date().toISOString(); }

  /* ----------- Seed defaults ----------- */
  function ensureTables(){
    const all = root();
    TABLES.forEach(t => { if (!Array.isArray(all[t])) all[t]=[]; });

    if (!all.subscription_plans.length){
      all.subscription_plans = [
        plan('free','Free','مجاني',          0,    0,   {users:5,  servants:3,  members:50,   storage_mb:100,  events:5,   workflows:5,   analytics:false, finance:false, ai:false, notifications:true}),
        plan('starter','Starter','أساسي',     150,  1500,{users:15, servants:10, members:300,  storage_mb:500,  events:25,  workflows:25,  analytics:true,  finance:true,  ai:false, notifications:true}),
        plan('growth','Growth','نمو',         400,  4000,{users:50, servants:30, members:1500, storage_mb:2000, events:200, workflows:100, analytics:true,  finance:true,  ai:true,  notifications:true}),
        plan('enterprise','Enterprise','مؤسسي',1200, 12000,{users:9999,servants:9999,members:99999,storage_mb:20000,events:9999,workflows:9999,analytics:true,finance:true,ai:true,notifications:true})
      ];
    }
    save(all);
    // Ensure each church has a subscription record
    const all2 = root();
    const subs = all2.subscriptions;
    (all2.churches||[]).forEach(ch => {
      if (!subs.find(s => s.church_id===ch.church_id)){
        subs.push(makeSub(ch));
      }
    });
    save(all2);
  }

  function plan(key,label,labelAr,monthly,yearly,limits){
    return { plan_id:'pln-'+key, plan_key:key, label, label_ar:labelAr,
      price_monthly:monthly, price_yearly:yearly, currency:'EGP', limits, active:true, created_at:now() };
  }

  function makeSub(ch){
    const planKey = ch.subscription_plan || 'free';
    const status  = ch.subscription_status || 'trial';
    const startedAt = ch.created_at || now();
    const trialEnds = new Date(new Date(startedAt).getTime()+days(14)).toISOString();
    const periodEnds = ch.subscription_expires_at || new Date(Date.now()+days(30)).toISOString();
    return {
      subscription_id: uid('sub'),
      church_id: ch.church_id,
      plan_key: planKey,
      billing_cycle: 'monthly',
      status: status==='active'?'active':(status==='trial'?'trial':status),
      started_at: startedAt,
      trial_ends_at: trialEnds,
      current_period_start: startedAt,
      current_period_end: periodEnds,
      grace_until: null,
      cancel_requested: false,
      auto_renew: true,
      created_at: now()
    };
  }

  /* ----------- Public API ----------- */
  const Billing = {
    /* PLANS */
    listPlans(){ ensureTables(); return root().subscription_plans||[]; },
    getPlan(key){ return Billing.listPlans().find(p=>p.plan_key===key); },
    upsertPlan(p){
      const all = root(); all.subscription_plans = all.subscription_plans||[];
      const i = all.subscription_plans.findIndex(x=>x.plan_key===p.plan_key);
      if (i>=0) all.subscription_plans[i] = { ...all.subscription_plans[i], ...p };
      else all.subscription_plans.push({ ...p, plan_id:uid('pln'), created_at:now() });
      save(all);
      Audit?.log('billing.plan_upserted',{ plan_key:p.plan_key });
    },

    /* SUBSCRIPTIONS */
    listSubscriptions(){ ensureTables(); return root().subscriptions||[]; },
    getByChurch(cid){ return Billing.listSubscriptions().find(s=>s.church_id===cid); },
    changePlan(cid, planKey, cycle){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid);
      if (!s) return null;
      const old = { plan_key:s.plan_key, billing_cycle:s.billing_cycle };
      s.plan_key = planKey; s.billing_cycle = cycle || s.billing_cycle;
      const dur = s.billing_cycle==='yearly'?365:30;
      s.current_period_start = now();
      s.current_period_end   = new Date(Date.now()+days(dur)).toISOString();
      s.status='active'; s.grace_until=null;
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'plan_change',
        from:old, to:{plan_key:planKey, billing_cycle:s.billing_cycle}, at:now() });
      // also update church row
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch){ ch.subscription_plan=planKey; ch.subscription_status='active';
        ch.subscription_expires_at=s.current_period_end; }
      save(all);
      Billing.generateInvoice(cid);
      Audit?.log('billing.plan_change', { church_id:cid, plan_key:planKey, cycle:s.billing_cycle });
      return s;
    },
    setStatus(cid, status, reason){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      s.status = status;
      if (status==='grace_period') s.grace_until = new Date(Date.now()+days(7)).toISOString();
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'status_change',
        to:status, reason:reason||null, at:now() });
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch) ch.subscription_status = status==='grace_period'?'active':status;
      save(all);
      Audit?.log('billing.status_change', { church_id:cid, status, reason });
      return s;
    },
    renew(cid){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      const dur = s.billing_cycle==='yearly'?365:30;
      s.current_period_start = now();
      s.current_period_end   = new Date(Date.now()+days(dur)).toISOString();
      s.status='active'; s.grace_until=null;
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'renew', at:now() });
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch){ ch.subscription_status='active'; ch.subscription_expires_at=s.current_period_end; }
      save(all);
      Billing.generateInvoice(cid);
      Audit?.log('billing.renewed',{church_id:cid});
      return s;
    },
    cancel(cid, reason){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      s.cancel_requested = true; s.auto_renew=false; s.status='cancelled';
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'cancel', reason, at:now() });
      const ch = all.churches.find(c=>c.church_id===cid);
      if (ch) ch.subscription_status='cancelled';
      save(all);
      Audit?.log('billing.cancelled',{church_id:cid,reason});
      return s;
    },
    startTrial(cid, ndays){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      s.status='trial';
      s.trial_ends_at = new Date(Date.now()+days(ndays||14)).toISOString();
      all.subscription_history.push({ history_id:uid('hst'), church_id:cid, action:'trial_start', at:now() });
      save(all); return s;
    },

    /* INVOICES */
    listInvoices(){ ensureTables(); return root().invoices||[]; },
    invoicesByChurch(cid){ return Billing.listInvoices().filter(i=>i.church_id===cid); },
    generateInvoice(cid){
      const all = root();
      const s = all.subscriptions.find(x=>x.church_id===cid); if (!s) return null;
      const p = (all.subscription_plans||[]).find(x=>x.plan_key===s.plan_key); if (!p) return null;
      const amount = s.billing_cycle==='yearly' ? p.price_yearly : p.price_monthly;
      if (amount<=0) return null;
      const ch = all.churches.find(c=>c.church_id===cid);
      const inv = {
        invoice_id: uid('inv'),
        invoice_number: 'INV-'+Date.now().toString(36).toUpperCase(),
        church_id: cid,
        church_name: ch?.church_name,
        subscription_id: s.subscription_id,
        plan_key: s.plan_key,
        billing_cycle: s.billing_cycle,
        amount, currency:'EGP',
        issued_at: now(),
        due_at: new Date(Date.now()+days(7)).toISOString(),
        status: 'pending', // pending|submitted|under_review|approved|rejected|overdue|paid
        notes: '',
        items: [{ desc:`اشتراك ${p.label_ar||p.label} - ${s.billing_cycle==='yearly'?'سنوي':'شهري'}`, qty:1, unit:amount, total:amount }],
        created_at: now()
      };
      all.invoices.push(inv);
      save(all);
      Audit?.log('billing.invoice_generated',{ church_id:cid, invoice_id:inv.invoice_id, amount });
      return inv;
    },

    /* PAYMENTS */
    submitPayment(invId, payload){
      // payload: { method, reference, proof_url, notes, amount }
      const all = root();
      const inv = all.invoices.find(i=>i.invoice_id===invId); if (!inv) return null;
      const pay = {
        payment_id: uid('pay'),
        invoice_id: invId,
        church_id: inv.church_id,
        amount: payload.amount||inv.amount,
        method: payload.method||'bank_transfer',
        reference: payload.reference||'',
        proof_url: payload.proof_url||'',
        proof_name: payload.proof_name||'',
        notes: payload.notes||'',
        status: 'submitted', // submitted|approved|rejected
        submitted_at: now(),
        submitted_by: Auth?.session()?.user_id,
        reviewed_at:null, reviewed_by:null, review_notes:''
      };
      all.invoice_payments.push(pay);
      inv.status = 'submitted';
      save(all);
      Audit?.log('billing.payment_submitted',{ invoice_id:invId, payment_id:pay.payment_id });
      return pay;
    },
    reviewPayment(payId, decision, notes){
      const all = root();
      const p = all.invoice_payments.find(x=>x.payment_id===payId); if (!p) return null;
      p.status = decision; // approved | rejected
      p.reviewed_at = now();
      p.reviewed_by = Auth?.session()?.user_id;
      p.review_notes = notes||'';
      const inv = all.invoices.find(i=>i.invoice_id===p.invoice_id);
      if (inv){
        inv.status = decision==='approved' ? 'paid' : 'rejected';
        if (decision==='approved'){
          const sub = all.subscriptions.find(s=>s.subscription_id===inv.subscription_id);
          if (sub){
            sub.status='active'; sub.grace_until=null;
            const dur = sub.billing_cycle==='yearly'?365:30;
            sub.current_period_start = now();
            sub.current_period_end = new Date(Date.now()+days(dur)).toISOString();
            const ch = all.churches.find(c=>c.church_id===sub.church_id);
            if (ch){ ch.subscription_status='active'; ch.subscription_expires_at=sub.current_period_end; }
            all.subscription_history.push({ history_id:uid('hst'), church_id:sub.church_id, action:'payment_approved', invoice_id:inv.invoice_id, at:now() });
          }
        }
      }
      save(all);
      Audit?.log('billing.payment_reviewed',{ payment_id:payId, decision });
      return p;
    },
    paymentsByInvoice(invId){ ensureTables(); return root().invoice_payments.filter(p=>p.invoice_id===invId); },
    allPayments(){ ensureTables(); return root().invoice_payments||[]; },

    /* HISTORY */
    history(cid){
      ensureTables();
      return (root().subscription_history||[]).filter(h=> !cid || h.church_id===cid)
        .sort((a,b)=>b.at.localeCompare(a.at));
    },

    /* AUTOMATIC LIFECYCLE — call on every page load */
    runLifecycle(){
      ensureTables();
      const all = root();
      const n = Date.now();
      let changed=false;
      (all.subscriptions||[]).forEach(s => {
        // trial expiry
        if (s.status==='trial' && s.trial_ends_at && n > new Date(s.trial_ends_at).getTime()){
          s.status='pending_payment'; changed=true;
          all.billing_notices.push(notice(s.church_id,'trial_expired','انتهت الفترة التجريبية'));
        }
        // overdue invoice → grace period
        if (s.status==='active' && s.current_period_end && n > new Date(s.current_period_end).getTime()){
          s.status='grace_period';
          s.grace_until = new Date(n+days(7)).toISOString();
          changed=true;
          all.billing_notices.push(notice(s.church_id,'grace_started','بدأت فترة السماح — جدد الاشتراك خلال 7 أيام'));
        }
        // grace expired → suspended
        if (s.status==='grace_period' && s.grace_until && n > new Date(s.grace_until).getTime()){
          s.status='suspended'; changed=true;
          const ch = all.churches.find(c=>c.church_id===s.church_id);
          if (ch) ch.subscription_status='suspended';
          all.billing_notices.push(notice(s.church_id,'suspended','تم تعليق الاشتراك لعدم السداد'));
        }
        // renewal reminder (3 days before end)
        if (s.status==='active' && s.current_period_end){
          const left = new Date(s.current_period_end).getTime() - n;
          if (left>0 && left < days(3)){
            const exists = (all.billing_notices||[]).some(x=>x.church_id===s.church_id && x.type==='renewal_reminder' &&
              (Date.now()-new Date(x.at).getTime() < days(2)));
            if (!exists) all.billing_notices.push(notice(s.church_id,'renewal_reminder','اشتراكك على وشك الانتهاء'));
          }
        }
        // mark overdue invoices
        (all.invoices||[]).filter(i=>i.church_id===s.church_id && ['pending','submitted','under_review'].includes(i.status))
          .forEach(i => {
            if (n > new Date(i.due_at).getTime() && i.status==='pending'){
              i.status='overdue'; changed=true;
            }
          });
      });
      if (changed) save(all);
    },

    notices(cid){ ensureTables(); return (root().billing_notices||[]).filter(n=>!cid||n.church_id===cid).sort((a,b)=>b.at.localeCompare(a.at)); },

    /* FEATURE & LIMIT GUARDS */
    isFeatureAllowed(cid, feature){
      const s = Billing.getByChurch(cid); if (!s) return true;
      if (['suspended','cancelled','expired'].includes(s.status)) return false;
      const p = Billing.getPlan(s.plan_key); if (!p) return true;
      const f = p.limits||{};
      if (feature in f) return !!f[feature];
      return true;
    },
    isReadOnly(cid){
      const s = Billing.getByChurch(cid); if (!s) return false;
      return ['suspended','expired'].includes(s.status);
    },
    limit(cid, key){
      const s = Billing.getByChurch(cid); if (!s) return Infinity;
      const p = Billing.getPlan(s.plan_key); if (!p) return Infinity;
      return p.limits?.[key] ?? Infinity;
    },

    /* METRICS */
    metrics(){
      const subs = Billing.listSubscriptions();
      const plans = Billing.listPlans();
      const invs = Billing.listInvoices();
      let mrr=0, arr=0;
      subs.filter(s=>s.status==='active').forEach(s => {
        const p = plans.find(x=>x.plan_key===s.plan_key); if (!p) return;
        if (s.billing_cycle==='yearly'){ arr += p.price_yearly; mrr += p.price_yearly/12; }
        else { mrr += p.price_monthly; arr += p.price_monthly*12; }
      });
      const overdue = invs.filter(i=>i.status==='overdue').length;
      const pendingReview = Billing.allPayments().filter(p=>p.status==='submitted').length;
      const activeSubs = subs.filter(s=>s.status==='active').length;
      const trialSubs  = subs.filter(s=>s.status==='trial').length;
      const suspendedSubs = subs.filter(s=>['suspended','cancelled','expired'].includes(s.status)).length;
      return { mrr:Math.round(mrr), arr:Math.round(arr), overdue, pendingReview, activeSubs, trialSubs, suspendedSubs };
    }
  };
  function notice(cid,type,msg){ return { notice_id: uid('not'), church_id:cid, type, message:msg, at:now(), read:false }; }

  ensureTables();
  window.Billing = Billing;
})();


/* === support-engine.js === */
/* ============================================================
   SUPPORT-ENGINE.js  —  Phase 6
   Tickets · workflow · assignments · analytics · KB
   ============================================================ */
(function(){
  function root(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function save(a){ localStorage.setItem('church_db_v1', JSON.stringify(a)); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9); }
  function now(){ return new Date().toISOString(); }
  function ensure(){
    const a=root();
    ['support_tickets','ticket_messages','kb_articles','ticket_assignments'].forEach(t=>{ if(!Array.isArray(a[t])) a[t]=[]; });
    if (!a.kb_articles.length){
      a.kb_articles = [
        kb('بداية الاستخدام','onboarding','# مرحباً بك\n\nاتبع الخطوات أدناه لإعداد كنيستك على المنصة.'),
        kb('كيف أضيف مخدوماً جديداً؟','faq','افتح صفحة المخدومين ثم اضغط "إضافة جديد"...'),
        kb('استكشاف أخطاء تسجيل الدخول','troubleshooting','تأكد من تفعيل الحساب والمتصفح يدعم localStorage.'),
        kb('دليل الاشتراكات','guide','تعرف على خطط الاشتراك وكيفية الترقية والتجديد.')
      ];
    }
    save(a);
  }
  function kb(title,cat,body){ return { article_id:uid('kb'), title, category:cat, body, views:0, created_at:now() }; }

  const Support = {
    /* TICKETS */
    list(filter){
      ensure();
      const s = Auth?.session?.();
      let rows = root().support_tickets||[];
      if (s && s.role!=='super_admin') rows = rows.filter(r=>r.church_id===s.church_id);
      if (filter?.status) rows = rows.filter(r=>r.status===filter.status);
      if (filter?.priority) rows = rows.filter(r=>r.priority===filter.priority);
      if (filter?.church_id) rows = rows.filter(r=>r.church_id===filter.church_id);
      return rows.sort((a,b)=>b.created_at.localeCompare(a.created_at));
    },
    get(id){ ensure(); return (root().support_tickets||[]).find(t=>t.ticket_id===id); },
    create({ subject, body, type, priority, church_id }){
      ensure();
      const s = Auth?.session?.();
      const all = root();
      const t = {
        ticket_id: uid('tkt'), ticket_number:'TKT-'+Date.now().toString(36).toUpperCase(),
        church_id: church_id || s?.church_id,
        subject, type:type||'support', // support|bug|feature
        priority: priority||'normal',  // low|normal|high|urgent
        status: 'open',                // open|pending|escalated|resolved|closed
        created_by: s?.user_id, created_by_name: s?.full_name,
        assigned_to: null, assigned_team: null,
        created_at: now(), updated_at: now()
      };
      all.support_tickets.push(t);
      if (body){
        all.ticket_messages.push({ msg_id:uid('msg'), ticket_id:t.ticket_id, body, author_id:s?.user_id, author_name:s?.full_name, internal:false, created_at: now() });
      }
      save(all);
      Audit?.log('support.ticket_created',{ ticket_id:t.ticket_id, subject });
      return t;
    },
    addMessage(tid, body, internal){
      const s = Auth?.session?.();
      const all = root();
      all.ticket_messages.push({ msg_id:uid('msg'), ticket_id:tid, body, author_id:s?.user_id, author_name:s?.full_name, internal:!!internal, created_at: now() });
      const t = all.support_tickets.find(x=>x.ticket_id===tid);
      if (t){ t.updated_at = now(); if (t.status==='resolved') t.status='pending'; }
      save(all);
    },
    messages(tid){ ensure(); return (root().ticket_messages||[]).filter(m=>m.ticket_id===tid).sort((a,b)=>a.created_at.localeCompare(b.created_at)); },
    setStatus(tid, status){
      const all = root();
      const t = all.support_tickets.find(x=>x.ticket_id===tid); if (!t) return;
      t.status = status;
      if (status==='resolved'||status==='closed') t.closed_at = now();
      t.updated_at = now();
      save(all);
      Audit?.log('support.ticket_status',{ ticket_id:tid, status });
    },
    assign(tid, team, user_id){
      const all = root();
      const t = all.support_tickets.find(x=>x.ticket_id===tid); if (!t) return;
      t.assigned_team = team; t.assigned_to = user_id; t.updated_at = now();
      all.ticket_assignments.push({ id:uid('asg'), ticket_id:tid, team, user_id, at:now() });
      save(all);
      Audit?.log('support.ticket_assigned',{ ticket_id:tid, team, user_id });
    },

    /* ANALYTICS */
    metrics(){
      const rows = root().support_tickets||[];
      const open = rows.filter(r=>['open','pending','escalated'].includes(r.status)).length;
      const resolved = rows.filter(r=>['resolved','closed'].includes(r.status));
      const escalated = rows.filter(r=>r.status==='escalated').length;
      let avgHours = 0;
      if (resolved.length){
        avgHours = resolved.reduce((s,r)=> s + ((new Date(r.closed_at||r.updated_at) - new Date(r.created_at))/3600000), 0) / resolved.length;
      }
      const total = rows.length;
      const satisfaction = total ? Math.round((resolved.length/total)*100) : 0;
      return { open, total, escalated, avgHours: +avgHours.toFixed(1), satisfaction, resolved: resolved.length };
    },

    /* KB */
    kbList(category){
      ensure();
      let rows = root().kb_articles||[];
      if (category) rows = rows.filter(r=>r.category===category);
      return rows.sort((a,b)=>a.title.localeCompare(b.title));
    },
    kbGet(id){ const r = (root().kb_articles||[]).find(a=>a.article_id===id); if (r){ const all=root(); const x=all.kb_articles.find(a=>a.article_id===id); x.views=(x.views||0)+1; save(all);} return r; },
    kbUpsert({ article_id, title, category, body }){
      ensure();
      const all = root();
      if (article_id){
        const r = all.kb_articles.find(a=>a.article_id===article_id);
        if (r){ r.title=title; r.category=category; r.body=body; r.updated_at=now(); save(all); return r; }
      }
      const r = kb(title,category,body); all.kb_articles.push(r); save(all);
      return r;
    },
    kbDelete(id){ const all=root(); all.kb_articles = (all.kb_articles||[]).filter(a=>a.article_id!==id); save(all); }
  };
  ensure();
  window.Support = Support;
})();


/* === backup-engine.js === */
/* ============================================================
   BACKUP-ENGINE.js  —  Phase 7
   Snapshots · restore · module backups · tenant backups · audit
   ============================================================ */
(function(){
  const BK_KEY='church_backups_v1';
  function loadAll(){ try{ return JSON.parse(localStorage.getItem(BK_KEY)||'[]'); }catch(_){ return []; } }
  function saveAll(list){ localStorage.setItem(BK_KEY, JSON.stringify(list)); }
  function dbRoot(){ return JSON.parse(localStorage.getItem('church_db_v1')||'{}'); }
  function uid(p){ return p+'-'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-3); }
  function now(){ return new Date().toISOString(); }

  function pruneByTenant(snapshot, cid){
    const out = {};
    Object.keys(snapshot).forEach(table => {
      if (!Array.isArray(snapshot[table])){ out[table]=snapshot[table]; return; }
      out[table] = snapshot[table].filter(r=>r.church_id===cid);
    });
    return out;
  }
  function pickModule(snapshot, tables){
    const out = {};
    tables.forEach(t => { out[t]=snapshot[t]||[]; });
    return out;
  }

  const MODULES = {
    finance: ['financial_transactions','treasuries','event_budgets','invoices','invoice_payments'],
    events:  ['events','event_bookings','event_templates'],
    members: ['members','service_classes','servant_assignments'],
    attendance: ['attendance_sessions','attendance_records'],
    workflows: ['workflows','workflow_instances'],
    notifications: ['notifications','platform_notifications'],
    billing: ['subscriptions','subscription_plans','invoices','invoice_payments','subscription_history','billing_notices']
  };

  const Backup = {
    list(){ return loadAll().sort((a,b)=>b.created_at.localeCompare(a.created_at)); },
    listForChurch(cid){ return Backup.list().filter(b=>!b.church_id||b.church_id===cid); },

    create({ label, type, church_id, module_key }){
      const snap = dbRoot();
      let data;
      if (type==='tenant' && church_id) data = pruneByTenant(snap, church_id);
      else if (type==='module' && module_key) data = pickModule(snap, MODULES[module_key]||[]);
      else { type='full'; data = snap; }

      const blob = JSON.stringify(data);
      const rec = {
        backup_id: uid('bkp'),
        label: label || `${type==='full'?'Full':type==='tenant'?'Tenant':'Module'} backup`,
        type, church_id: church_id||null, module_key: module_key||null,
        size_kb: +(blob.length/1024).toFixed(1),
        data_b64: btoa(unescape(encodeURIComponent(blob))),
        created_at: now(),
        created_by: Auth?.session?.()?.user_id,
        created_by_name: Auth?.session?.()?.full_name,
        is_scheduled: false
      };
      const list = loadAll(); list.push(rec);
      // cap at 50 newest
      if (list.length>50) list.sort((a,b)=>b.created_at.localeCompare(a.created_at)).length=50;
      saveAll(list);
      Audit?.log('backup.created',{ backup_id:rec.backup_id, type, label:rec.label });
      return rec;
    },

    preview(id){
      const rec = loadAll().find(b=>b.backup_id===id); if (!rec) return null;
      const data = JSON.parse(decodeURIComponent(escape(atob(rec.data_b64))));
      const counts = {}; Object.keys(data).forEach(t => counts[t] = Array.isArray(data[t])?data[t].length:1);
      return { rec, counts };
    },

    restore(id, mode){
      // mode: 'replace' | 'merge'
      const rec = loadAll().find(b=>b.backup_id===id); if (!rec) return false;
      // safety auto-snapshot before restore
      Backup.create({ label:`Auto pre-restore ${rec.label}`, type:'full' });
      const data = JSON.parse(decodeURIComponent(escape(atob(rec.data_b64))));
      const current = dbRoot();
      if (rec.type==='full' && mode==='replace'){
        localStorage.setItem('church_db_v1', JSON.stringify(data));
      } else if (rec.type==='tenant' && rec.church_id){
        // For tenant restores: remove tenant rows then add backup rows
        Object.keys(data).forEach(t => {
          if (!Array.isArray(data[t])) return;
          current[t] = (current[t]||[]).filter(r=>r.church_id!==rec.church_id);
          current[t] = current[t].concat(data[t]);
        });
        localStorage.setItem('church_db_v1', JSON.stringify(current));
      } else {
        // module restore: replace those tables
        Object.keys(data).forEach(t => { current[t] = data[t]; });
        localStorage.setItem('church_db_v1', JSON.stringify(current));
      }
      Audit?.log('backup.restored',{ backup_id:id, mode });
      return true;
    },

    remove(id){
      const list = loadAll().filter(b=>b.backup_id!==id);
      saveAll(list);
      Audit?.log('backup.deleted',{ backup_id:id });
    },

    download(id){
      const rec = loadAll().find(b=>b.backup_id===id); if (!rec) return;
      const data = JSON.parse(decodeURIComponent(escape(atob(rec.data_b64))));
      const blob = new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href=url; a.download=`${rec.label.replace(/\s+/g,'_')}.json`; a.click();
      URL.revokeObjectURL(url);
    },

    schedule(){ /* placeholder for cron-like in-browser, runs on page load */
      const lastKey = 'church_backups_last_auto';
      const last = +localStorage.getItem(lastKey)||0;
      if (Date.now()-last > 24*36e5){
        Backup.create({ label:'Auto daily snapshot', type:'full' });
        localStorage.setItem(lastKey, Date.now());
      }
    },
    moduleKeys(){ return Object.keys(MODULES); }
  };
  window.Backup = Backup;
})();


/* === family-engine.js === */
/* ============================================================
   FAMILY-ENGINE.js — Family-Centered Church Census Core
   Family is the primary entity. Members link via family_id.
   ============================================================ */
(function(){
  function genFamilyId(){
    const year = new Date().getFullYear();
    const list = DB._raw('families') || [];
    const cid  = (window.Auth && Auth.session()) ? Auth.session().church_id : null;
    const scope = list.filter(f => !cid || f.church_id === cid);
    let max = 0;
    scope.forEach(f => {
      const m = /FAM-\d{4}-(\d{4,})$/.exec(f.family_code || '');
      if (m) max = Math.max(max, parseInt(m[1],10));
    });
    return `FAM-${year}-${String(max+1).padStart(4,'0')}`;
  }

  function calcAge(birth){
    return window.Hierarchy ? Hierarchy.ageFromBirth(birth) : null;
  }

  /* Create family + automatically create member records for father/mother/children */
  function createFamily(data){
    const fam = {
      family_id: data.family_id,
      family_code: data.family_code || genFamilyId(),
      family_name: data.family_name || '',
      area: data.area || '',
      city: data.city || '',
      address: data.address || '',
      latitude: data.latitude || null,
      longitude: data.longitude || null,
      primary_phone: data.primary_phone || '',
      secondary_phone: data.secondary_phone || '',
      family_status: data.family_status || 'active',
      notes: data.notes || '',
      registration_date: data.registration_date || new Date().toISOString(),
      father_name: data.father_name || '',
      father_birth_date: data.father_birth_date || null,
      father_phone: data.father_phone || '',
      father_job: data.father_job || '',
      father_spiritual_status: data.father_spiritual_status || '',
      father_notes: data.father_notes || '',
      mother_name: data.mother_name || '',
      mother_birth_date: data.mother_birth_date || null,
      mother_phone: data.mother_phone || '',
      mother_job: data.mother_job || '',
      mother_spiritual_status: data.mother_spiritual_status || '',
      mother_notes: data.mother_notes || '',
      followup_notes: data.followup_notes || '',
      visitation_notes: data.visitation_notes || '',
      special_conditions: data.special_conditions || '',
      emergency_notes: data.emergency_notes || ''
    };
    const saved = DB.insert('families', fam);

    // Create father member
    if (saved.father_name){
      DB.insert('members', {
        full_name: saved.father_name,
        gender: 'male',
        birth_date: saved.father_birth_date,
        phone: saved.father_phone,
        job: saved.father_job,
        family_id: saved.family_id,
        family_role: 'father',
        member_status: 'active',
        age_stage: Hierarchy.stageFromBirth(saved.father_birth_date) || 'adult'
      });
    }
    if (saved.mother_name){
      DB.insert('members', {
        full_name: saved.mother_name,
        gender: 'female',
        birth_date: saved.mother_birth_date,
        phone: saved.mother_phone,
        job: saved.mother_job,
        family_id: saved.family_id,
        family_role: 'mother',
        member_status: 'active',
        age_stage: Hierarchy.stageFromBirth(saved.mother_birth_date) || 'adult'
      });
    }
    // Create children
    (data.children || []).forEach(c => {
      if (!c.full_name) return;
      const birth = c.birth_date || null;
      const stage = Hierarchy.stageFromBirth(birth);
      DB.insert('members', {
        full_name: c.full_name,
        gender: c.gender || 'male',
        birth_date: birth,
        notes: c.notes || '',
        family_id: saved.family_id,
        family_role: 'child',
        school: c.school_year || '',
        member_status: 'active',
        parent_phone: saved.father_phone || saved.mother_phone,
        age_stage: stage || null
      });
    });
    return saved;
  }

  function updateFamily(id, patch){
    return DB.update('families','family_id', id, patch);
  }

  function familyMembers(family_id){
    return DB.filter('members', m => m.family_id === family_id);
  }

  function familyFather(family_id){
    return DB.find('members', m => m.family_id===family_id && m.family_role==='father');
  }
  function familyMother(family_id){
    return DB.find('members', m => m.family_id===family_id && m.family_role==='mother');
  }
  function familyChildren(family_id){
    return DB.filter('members', m => m.family_id===family_id && m.family_role==='child');
  }

  function addChild(family_id, child){
    const fam = DB.byId('families','family_id', family_id);
    if (!fam) return null;
    const stage = Hierarchy.stageFromBirth(child.birth_date);
    return DB.insert('members', {
      full_name: child.full_name,
      gender: child.gender || 'male',
      birth_date: child.birth_date || null,
      school: child.school_year || '',
      notes: child.notes || '',
      family_id, family_role:'child',
      member_status:'active',
      parent_phone: fam.father_phone || fam.mother_phone,
      age_stage: stage || null
    });
  }

  /* ----- Family analytics ----- */
  function familyAttendanceRate(family_id, days){
    days = days || 60;
    const members = familyMembers(family_id);
    if (!members.length) return 0;
    const since = Date.now() - days*864e5;
    const sessions = DB.filter('attendance_sessions', s => new Date(s.starts_at).getTime() >= since).length;
    if (!sessions) return 0;
    const records = DB.filter('attendance_records', r =>
      members.some(m => m.member_id === r.member_id) &&
      new Date(r.check_in_at).getTime() >= since
    ).length;
    return Math.min(100, Math.round((records / (sessions * members.length)) * 100));
  }

  function familyLastAttendance(family_id){
    const members = familyMembers(family_id);
    const recs = DB.filter('attendance_records', r => members.some(m => m.member_id === r.member_id));
    if (!recs.length) return null;
    return recs.sort((a,b) => new Date(b.check_in_at) - new Date(a.check_in_at))[0].check_in_at;
  }

  function familiesNeedingVisit(){
    return DB.all('families').filter(f => {
      const last = familyLastAttendance(f.family_id);
      if (!last) return true;
      return (Date.now() - new Date(last).getTime()) > 30*864e5;
    });
  }

  window.Family = {
    genFamilyId, createFamily, updateFamily,
    familyMembers, familyFather, familyMother, familyChildren, addChild,
    familyAttendanceRate, familyLastAttendance, familiesNeedingVisit,
    calcAge
  };
})();


/* === stage-engine.js === */
/* ============================================================
   STAGE-ENGINE.js — Auto stage detection + supervisor approval queue
   ============================================================ */
(function(){
  /* Scan all members; if calculated stage differs from current age_stage,
     create a pending transition (unless one already pending for this member). */
  function scanTransitions(){
    const created = [];
    DB.all('members').forEach(m => {
      if (!m.birth_date) return;
      const auto = Hierarchy.stageFromBirth(m.birth_date);
      if (!auto || auto === m.age_stage) return;
      const existing = DB.find('pending_transitions',
        t => t.member_id===m.member_id && t.status==='pending');
      if (existing) return;
      const row = DB.insert('pending_transitions', {
        member_id: m.member_id,
        family_id: m.family_id || null,
        current_stage: m.age_stage || null,
        suggested_stage: auto,
        current_class_id: m.service_class_id || null,
        suggested_class_id: null,
        reason: 'انتقال عمري تلقائي بناءً على تاريخ الميلاد',
        age_years: Hierarchy.ageFromBirth(m.birth_date).years,
        status: 'pending'
      });
      created.push(row);
    });
    return created;
  }

  function approve(transition_id, opts){
    opts = opts || {};
    const t = DB.byId('pending_transitions','transition_id', transition_id);
    if (!t) return null;
    const patch = { age_stage: t.suggested_stage };
    if (opts.class_id) patch.service_class_id = opts.class_id;
    if (opts.servant_id) patch.assigned_servant_id = opts.servant_id;
    DB.update('members','member_id', t.member_id, patch);
    return DB.update('pending_transitions','transition_id', transition_id, {
      status:'approved',
      reviewed_at: new Date().toISOString(),
      reviewer_id: (Auth.session()||{}).user_id || null,
      approved_class_id: opts.class_id || null,
      approved_servant_id: opts.servant_id || null
    });
  }

  function reject(transition_id, reason){
    return DB.update('pending_transitions','transition_id', transition_id, {
      status:'rejected',
      reviewed_at: new Date().toISOString(),
      reviewer_id: (Auth.session()||{}).user_id || null,
      reject_reason: reason || ''
    });
  }

  function pendingCount(){
    return DB.count('pending_transitions', t => t.status==='pending');
  }

  window.StageEngine = { scanTransitions, approve, reject, pendingCount };

  // run on every page bootstrap
  window.addEventListener('DOMContentLoaded', () => {
    const s = window.Auth && Auth.session();
    if (!s || s.role==='super_admin') return;
    try{ scanTransitions(); }catch(_){}
  });
})();


/* === lifecycle-engine.js === */
/**
 * Lifecycle Engine — Behavior Wiring Phase
 *
 * Central brain that connects domain events across the system.
 * Pure JS, no UI changes. Other modules call Lifecycle.* after writes.
 */
(function(){
  'use strict';

  const HIGH_RISK_THRESHOLD = 50;

  function today(){ return new Date().toISOString().slice(0,10); }

  function safe(fn){ try { return fn(); } catch(e){ console.warn('[Lifecycle]', e); } }

  // Lightweight pub/sub so pages can refresh silently without UI changes
  const listeners = {};
  function on(evt, cb){ (listeners[evt] = listeners[evt] || []).push(cb); }
  function emit(evt, payload){
    (listeners[evt] || []).forEach(cb => { try { cb(payload); } catch(e){ console.warn(e); } });
    // also broadcast a DOM event so any page can listen
    try {
      window.dispatchEvent(new CustomEvent('lifecycle:'+evt, { detail: payload }));
    } catch(_){}
  }

  // Generic refresh trigger: if a page exposes a re-render hook, call it.
  function refreshPage(){
    safe(()=> window.FamilyProfile && FamilyProfile.render && FamilyProfile.render());
    safe(()=> window.Members && Members.render && Members.render());
    safe(()=> window.Followup && Followup.render && Followup.render());
    safe(()=> window.Attendance && Attendance.render && Attendance.render());
    safe(()=> window.Dashboard && Dashboard.render && Dashboard.render());
  }

  const Lifecycle = {

    onMemberCreated(member){
      if (!member) return;
      const id = member.member_id || member.id;
      if (!id) return;

      // Initialize spine fields if missing
      const patch = {};
      if (member.risk_score == null)    patch.risk_score = 0;
      if (!member.member_status)        patch.member_status = 'new';
      if (!member.created_at)           patch.created_at = new Date().toISOString();
      if (Object.keys(patch).length){
        safe(()=> DB.update('members', id, patch));
      }

      emit('member:created', { member_id: id, member });
      refreshPage();
    },

    onAttendanceRecorded(member_id){
      if (!member_id) return;

      // Recalculate risk based on the new attendance signal
      safe(()=> window.recalculateRisk && window.recalculateRisk(member_id));

      // Refresh member journey (if a journey/timeline module exists)
      safe(()=> window.MemberJourney && MemberJourney.refresh && MemberJourney.refresh(member_id));

      emit('attendance:recorded', { member_id });
      refreshPage();
    },

    onRiskChanged(member_id){
      if (!member_id) return;
      const member = safe(()=> DB.find('members', { member_id })) ||
                     safe(()=> DB.byId && DB.byId('members','member_id', member_id));
      if (!member) return;

      const score = Number(member.risk_score) || 0;

      if (score > HIGH_RISK_THRESHOLD){
        // Avoid duplicate auto follow-ups for the same member
        const existing = safe(()=> DB.find('followups', t =>
          t && t.member_id === member_id &&
          (t.status === 'pending' || t.status === 'open' || t.status === 'in_progress') &&
          typeof t.reason === 'string' &&
          (t.reason.indexOf('Auto generated from high risk') === 0 ||
           t.reason.indexOf('High risk') === 0)
        ));

        if (!existing){
          safe(()=> DB.insert('followups', {
            member_id,
            reason: 'Auto generated from high risk',
            status: 'pending',
            priority: 'high',
            auto_generated: true,
            date: today(),
            due_at: new Date(Date.now() + 48*3600*1000).toISOString()
          }));
        }
      }

      emit('risk:changed', { member_id, risk_score: score });
      refreshPage();
    },

    on, emit,
    HIGH_RISK_THRESHOLD
  };

  window.Lifecycle = Lifecycle;
})();


/* === insights-engine.js === */
/* ============================================================
   INSIGHTS-ENGINE.js — Church Intelligence Layer (v8)
   ------------------------------------------------------------
   Pure frontend analytical layer built on top of the existing
   data spine (families → members → services →
   attendance_sessions → attendance_records → followups → notes
   + events + servant_assignments).

   No DB structure changes. No new tables. No backend.
   All functions are READ-ONLY and side-effect free.

   Public API (window.Insights):
     Insights.serviceHealth(service_id?)     -> [{...}]  or {...}
     Insights.familyRisk(family_id?)         -> [{...}]  or {...}
     Insights.memberJourney(member_id?)      -> [{...}]  or {...}
     Insights.reEngagement(opts?)            -> [{...}]
     Insights.servantLoad(servant_id?)       -> [{...}]  or {...}
     Insights.eventImpact(event_id?)         -> [{...}]  or {...}
     Insights.dashboard()                    -> [{...}]   smart bullets
   ============================================================ */
(function(){
  if (typeof window === 'undefined') return;
  if (!window.DB) { console.warn('[Insights] DB not loaded yet'); }

  /* ---------------- utilities ---------------- */
  const DAY = 86400000;
  const now = () => Date.now();
  const T   = (d) => d ? new Date(d).getTime() : 0;
  const daysAgo = (n) => now() - n * DAY;
  const clamp = (v,a,b)=> Math.max(a, Math.min(b, v));
  const safeAll = (t) => { try { return DB.all(t) || []; } catch(_){ return []; } };
  const safeFilter = (t,q) => { try { return DB.filter(t,q) || []; } catch(_){ return []; } };
  const groupBy = (arr,key) => arr.reduce((m,x)=>{ const k=typeof key==='function'?key(x):x[key]; (m[k]=m[k]||[]).push(x); return m; },{});
  const pct = (n,d)=> d>0 ? Math.round((n/d)*100) : 0;
  const uniq = (a)=> Array.from(new Set(a));

  /* attendance helpers */
  function sessionsFor(service_id, sinceTs){
    return safeFilter('attendance_sessions', s =>
      (!service_id || s.service_id === service_id) &&
      (!sinceTs   || T(s.session_date || s.date || s.created_at) >= sinceTs)
    );
  }
  function recordsForSessions(sessionIds){
    if (!sessionIds.length) return [];
    const set = new Set(sessionIds);
    return safeAll('attendance_records').filter(r => set.has(r.session_id));
  }
  function recordsForMember(member_id, limit){
    const recs = safeFilter('attendance_records', r => r.member_id === member_id);
    // best-effort chronological order using session date
    const sessById = {};
    safeAll('attendance_sessions').forEach(s => sessById[s.session_id] = s);
    recs.sort((a,b)=> T((sessById[b.session_id]||{}).session_date || (sessById[b.session_id]||{}).date) -
                       T((sessById[a.session_id]||{}).session_date || (sessById[a.session_id]||{}).date));
    return limit ? recs.slice(0, limit) : recs;
  }
  function isPresent(rec){
    const s = (rec.status || rec.attendance_status || '').toLowerCase();
    return s === 'present' || s === 'attended' || s === 'p' || rec.attended === true;
  }

  /* ============================================================
     1) SERVICE HEALTH SCORE
     ============================================================ */
  function serviceHealth(service_id){
    const services = service_id
      ? safeFilter('services', s => s.service_id === service_id)
      : safeAll('services');
    const results = services.map(svc => {
      const sinceTs = daysAgo(60);
      const sess = sessionsFor(svc.service_id, sinceTs);
      const recs = recordsForSessions(sess.map(s=>s.session_id));
      const present = recs.filter(isPresent).length;
      const attRate = pct(present, recs.length);             // 0..100

      // member base for this service
      const members = safeFilter('members', m =>
        m.service_id === svc.service_id ||
        (Array.isArray(m.service_ids) && m.service_ids.includes(svc.service_id))
      );
      const memberIds = new Set(members.map(m=>m.member_id));

      // engagement: members who showed up at least once in window
      const activeIds = new Set(recs.filter(isPresent).map(r=>r.member_id));
      const engagedRate = pct(activeIds.size, memberIds.size || 1);

      // servants
      const servants = safeFilter('servant_assignments', a => a.service_id === svc.service_id);
      const seatsTarget = +svc.servant_seats || 0;
      const servantGap = Math.max(0, seatsTarget - servants.length);
      const servantCoverage = seatsTarget > 0
        ? clamp(pct(servants.length, seatsTarget), 0, 120)
        : (servants.length > 0 ? 100 : 0);

      // composite score (0..100)
      const score = clamp(Math.round(
        attRate * 0.45 + engagedRate * 0.35 + Math.min(servantCoverage,100) * 0.20
      ), 0, 100);

      const flags = [];
      if (attRate   < 50) flags.push({ key:'low_attendance', label:'حضور ضعيف' });
      if (engagedRate < 40) flags.push({ key:'low_engagement', label:'تفاعل منخفض' });
      if (servantGap > 0)   flags.push({ key:'servant_gap',   label:`نقص خدام (${servantGap})` });

      return {
        service_id: svc.service_id,
        service_name: svc.name || svc.service_name || svc.title || '—',
        attendance_rate: attRate,
        engagement_rate: engagedRate,
        servant_coverage: servantCoverage,
        servant_gap: servantGap,
        members_count: memberIds.size,
        sessions_count: sess.length,
        score,
        status: score >= 75 ? 'healthy' : score >= 50 ? 'watch' : 'at_risk',
        flags
      };
    });
    results.sort((a,b)=> a.score - b.score);
    return service_id ? (results[0] || null) : results;
  }

  /* ============================================================
     2) FAMILY RISK ANALYSIS
     ============================================================ */
  function familyRisk(family_id){
    const families = family_id
      ? safeFilter('families', f => f.family_id === family_id)
      : safeAll('families');
    const results = families.map(fam => {
      const members = safeFilter('members', m => m.family_id === fam.family_id);
      if (!members.length){
        return { family_id: fam.family_id, family_name: fam.family_name || fam.name || '—',
                 members_count: 0, avg_risk: 0, inactive_ratio: 0, risk_score: 50,
                 status:'watch', reasons:['لا يوجد أعضاء مسجلين'] };
      }
      const avgRisk = Math.round(
        members.reduce((s,m)=> s + (+m.risk_score||0), 0) / members.length
      );
      const inactive = members.filter(m =>
        m.member_status === 'at_risk' || m.member_status === 'inactive' || (+m.risk_score||0) >= 60
      ).length;
      const inactiveRatio = pct(inactive, members.length);

      // recent activity in last 45 days
      const sinceTs = daysAgo(45);
      const recentRecs = safeAll('attendance_records').filter(r =>
        members.some(m=>m.member_id===r.member_id)
      );
      const recentSess = safeAll('attendance_sessions').reduce((m,s)=>{ m[s.session_id]=s; return m; },{});
      const recent = recentRecs.filter(r => T((recentSess[r.session_id]||{}).session_date || (recentSess[r.session_id]||{}).date) >= sinceTs);
      const recentPresent = recent.filter(isPresent).length;
      const recentRate = pct(recentPresent, recent.length);

      const risk = clamp(Math.round(
        avgRisk * 0.45 + inactiveRatio * 0.35 + (100 - recentRate) * 0.20
      ), 0, 100);

      const reasons = [];
      if (avgRisk >= 50)       reasons.push('متوسط مخاطر مرتفع');
      if (inactiveRatio >= 50) reasons.push('أكثر من نصف الأسرة غير نشط');
      if (recentRate < 40 && recent.length > 0) reasons.push('انخفاض الحضور مؤخراً');
      if (recent.length === 0) reasons.push('بدون حضور مسجل آخر 45 يوم');

      return {
        family_id: fam.family_id,
        family_name: fam.family_name || fam.name || '—',
        members_count: members.length,
        avg_risk: avgRisk,
        inactive_ratio: inactiveRatio,
        recent_attendance_rate: recentRate,
        risk_score: risk,
        status: risk >= 60 ? 'at_risk' : risk >= 40 ? 'watch' : 'healthy',
        reasons
      };
    });
    results.sort((a,b)=> b.risk_score - a.risk_score);
    return family_id ? (results[0] || null) : results;
  }

  /* ============================================================
     3) MEMBER JOURNEY SCORE
     ============================================================ */
  function memberJourney(member_id){
    const members = member_id
      ? safeFilter('members', m => m.member_id === member_id)
      : safeAll('members');
    const results = members.map(m => {
      const recs = recordsForMember(m.member_id, 12);
      const present = recs.filter(isPresent).length;
      const attRate = pct(present, recs.length);              // attendance dimension

      // commitment: streak of present sessions in latest records
      let streak = 0;
      for (const r of recs){ if (isPresent(r)) streak++; else break; }
      const commitment = clamp(streak * 12 + (m.member_status==='active'?20:0), 0, 100);

      // engagement: events + followups completed
      const evParticipation = safeFilter('event_registrations',
        r => r.member_id === m.member_id && (r.status==='attended' || r.checked_in===true)).length;
      const followsDone = safeFilter('followup_tasks',
        t => t.member_id === m.member_id && t.status === 'done').length;
      const engagement = clamp(evParticipation * 12 + followsDone * 8, 0, 100);

      // continuity: how long since joined and recency
      const joined = T(m.joined_at || m.created_at);
      const tenureDays = joined ? Math.floor((now() - joined) / DAY) : 0;
      const lastRecTs = recs[0] ? T((safeAll('attendance_sessions').find(s=>s.session_id===recs[0].session_id)||{}).session_date) : 0;
      const daysSinceLast = lastRecTs ? Math.floor((now() - lastRecTs)/DAY) : 999;
      const continuity = clamp(
        100 - Math.min(daysSinceLast, 90)
            + Math.min(Math.floor(tenureDays/30) * 2, 20),
        0, 100
      );

      const score = clamp(Math.round(
        attRate * 0.40 + commitment * 0.20 + engagement * 0.20 + continuity * 0.20
      ), 0, 100);

      return {
        member_id: m.member_id,
        full_name: m.full_name || m.name || '—',
        family_id: m.family_id || null,
        attendance: attRate,
        commitment, engagement, continuity,
        score,
        tier: score >= 75 ? 'committed' : score >= 50 ? 'engaged' : score >= 25 ? 'drifting' : 'inactive'
      };
    });
    results.sort((a,b)=> b.score - a.score);
    return member_id ? (results[0] || null) : results;
  }

  /* ============================================================
     4) RE-ENGAGEMENT DETECTION
     ============================================================ */
  function reEngagement(opts){
    opts = opts || {};
    const recentDays = opts.recentDays || 30;
    const baselineDays = opts.baselineDays || 120;
    const minBaseline = opts.minBaseline || 3;

    const sessions = safeAll('attendance_sessions');
    const sessById = {};
    sessions.forEach(s => sessById[s.session_id] = s);

    const members = safeAll('members');
    const out = [];
    members.forEach(m => {
      const recs = safeFilter('attendance_records', r => r.member_id === m.member_id);
      if (!recs.length) return;
      const baselineCut = daysAgo(baselineDays);
      const recentCut   = daysAgo(recentDays);
      const baseline = recs.filter(r => {
        const t = T((sessById[r.session_id]||{}).session_date || (sessById[r.session_id]||{}).date);
        return t >= baselineCut && t < recentCut && isPresent(r);
      }).length;
      const recent = recs.filter(r => {
        const t = T((sessById[r.session_id]||{}).session_date || (sessById[r.session_id]||{}).date);
        return t >= recentCut && isPresent(r);
      }).length;
      if (baseline >= minBaseline){
        const drop = baseline === 0 ? 0 : Math.round((1 - (recent / (baseline*(recentDays/baselineDays)))) * 100);
        if (recent === 0 || drop >= 50){
          out.push({
            member_id: m.member_id,
            full_name: m.full_name || m.name || '—',
            family_id: m.family_id || null,
            baseline_attendance: baseline,
            recent_attendance: recent,
            drop_percent: clamp(drop, 0, 100),
            status: recent === 0 ? 'stopped' : 'declining'
          });
        }
      }
    });
    out.sort((a,b)=> b.drop_percent - a.drop_percent);
    return out;
  }

  /* ============================================================
     5) SERVANT LOAD ANALYSIS
     ============================================================ */
  function servantLoad(servant_id){
    const assigns = safeAll('servant_assignments');
    const users   = safeAll('users');
    const grouped = groupBy(assigns, a => a.servant_id || a.user_id);
    const ids = servant_id ? [servant_id] : Object.keys(grouped);
    // also include users with role=servant but no assignment
    if (!servant_id){
      users.filter(u => /servant/i.test(u.role||'')).forEach(u => {
        if (!grouped[u.user_id]) ids.push(u.user_id);
      });
    }
    const all = uniq(ids).map(id => {
      const list = grouped[id] || [];
      const services = uniq(list.map(a=>a.service_id)).filter(Boolean);
      const tasks = safeFilter('followup_tasks',
        t => t.assigned_to === id && (t.status === 'open' || t.status === 'in_progress'));
      const events = safeFilter('event_assignments',
        a => (a.user_id===id || a.servant_id===id));
      const user = users.find(u => u.user_id === id) || {};
      // load = weighted sum
      const load = list.length * 10 + tasks.length * 6 + events.length * 4 + services.length * 5;
      return {
        servant_id: id,
        full_name: user.full_name || user.name || '—',
        services_count: services.length,
        assignments_count: list.length,
        open_tasks: tasks.length,
        event_assignments: events.length,
        load_score: load,
        status: load >= 60 ? 'overloaded' : load >= 25 ? 'balanced' : (list.length===0 ? 'underused' : 'light')
      };
    });
    all.sort((a,b)=> b.load_score - a.load_score);
    return servant_id ? (all[0] || null) : all;
  }

  /* ============================================================
     6) EVENT IMPACT ANALYSIS
     ============================================================ */
  function eventImpact(event_id){
    const events = event_id
      ? safeFilter('events', e => e.event_id === event_id)
      : safeAll('events');
    const sessions = safeAll('attendance_sessions');
    const sessById = {};
    sessions.forEach(s => sessById[s.session_id] = s);

    const results = events.map(ev => {
      const startTs = T(ev.starts_at || ev.event_date || ev.date || ev.created_at);
      if (!startTs) return null;
      const beforeStart = startTs - 30*DAY;
      const afterEnd    = startTs + 30*DAY;

      const regs = safeFilter('event_registrations', r => r.event_id === ev.event_id);
      const attended = regs.filter(r => r.status==='attended' || r.checked_in===true).length;
      const attendedIds = regs.filter(r => r.status==='attended' || r.checked_in===true).map(r=>r.member_id);

      const records = safeAll('attendance_records');
      function rateBetween(memberIds, from, to){
        const set = new Set(memberIds);
        const r = records.filter(x => set.has(x.member_id) && (()=>{
          const t = T((sessById[x.session_id]||{}).session_date || (sessById[x.session_id]||{}).date);
          return t >= from && t < to;
        })());
        const p = r.filter(isPresent).length;
        return pct(p, r.length);
      }

      const beforeRate = rateBetween(attendedIds, beforeStart, startTs);
      const afterRate  = rateBetween(attendedIds, startTs,    afterEnd);
      const lift = afterRate - beforeRate;

      return {
        event_id: ev.event_id,
        event_name: ev.title || ev.name || '—',
        registrations: regs.length,
        attended,
        attendance_rate: pct(attended, regs.length),
        before_rate: beforeRate,
        after_rate: afterRate,
        engagement_lift: lift,
        verdict: lift >= 10 ? 'positive' : lift <= -10 ? 'negative' : 'neutral'
      };
    }).filter(Boolean);
    results.sort((a,b)=> b.engagement_lift - a.engagement_lift);
    return event_id ? (results[0] || null) : results;
  }

  /* ============================================================
     DASHBOARD SMART BULLETS
     Returns short human-readable insight cards for the dashboard.
     ============================================================ */
  function dashboard(){
    const out = [];
    try {
      const sh = serviceHealth();
      const worstSvc = sh.find(s => s.status === 'at_risk');
      if (worstSvc){
        out.push({
          type:'service', severity:'critical', icon:'fa-triangle-exclamation',
          title:`خدمة "${worstSvc.service_name}" في خطر`,
          body:`حضور ${worstSvc.attendance_rate}% • تفاعل ${worstSvc.engagement_rate}%${worstSvc.servant_gap?` • نقص ${worstSvc.servant_gap} خدام`:''}`,
          ref:{ service_id: worstSvc.service_id }
        });
      }

      const fr = familyRisk().filter(f => f.status === 'at_risk');
      if (fr.length){
        out.push({
          type:'family', severity:'warning', icon:'fa-house-circle-exclamation',
          title:`${fr.length} ${fr.length===1?'أسرة تحتاج':'أسر تحتاج'} افتقاد`,
          body: fr.slice(0,3).map(f=>f.family_name).join(' • '),
          ref:{ families: fr.slice(0,5).map(f=>f.family_id) }
        });
      }

      const re = reEngagement();
      if (re.length){
        out.push({
          type:'reengage', severity:'warning', icon:'fa-user-clock',
          title:`${re.length} ${re.length===1?'عضو بدأ يقل':'أعضاء بدأوا يقلوا'} في الحضور`,
          body: re.slice(0,3).map(r=>r.full_name).join(' • '),
          ref:{ members: re.slice(0,5).map(r=>r.member_id) }
        });
      }

      const overloaded = servantLoad().filter(s => s.status === 'overloaded');
      overloaded.slice(0,2).forEach(o=>{
        out.push({
          type:'servant', severity:'warning', icon:'fa-person-burst',
          title:`الخادم ${o.full_name} عليه ضغط عالي`,
          body:`${o.assignments_count} تكليفات • ${o.open_tasks} مهام مفتوحة • ${o.services_count} خدمات`,
          ref:{ servant_id: o.servant_id }
        });
      });

      const ei = eventImpact().filter(e => e.verdict === 'positive');
      if (ei.length){
        const top = ei[0];
        out.push({
          type:'event', severity:'info', icon:'fa-arrow-trend-up',
          title:`حدث "${top.event_name}" زاد التفاعل +${top.engagement_lift}%`,
          body:`حضور بعد الحدث ${top.after_rate}% مقابل ${top.before_rate}% قبله`,
          ref:{ event_id: top.event_id }
        });
      }
    } catch(err){
      console.warn('[Insights.dashboard] error', err);
    }
    return out;
  }

  window.Insights = {
    serviceHealth, familyRisk, memberJourney,
    reEngagement, servantLoad, eventImpact, dashboard
  };
})();


/* === hierarchy-resolver.js === */
/* ============================================================
   HIERARCHY-RESOLVER.js — Single source of truth for permissions
   inheritance across services → stages → grades → classes → groups.
   ============================================================ */
(function () {
  function tableAll(name) {
    if (window.DB && typeof DB.findAll === 'function') return DB.findAll(name) || [];
    if (window.DB && typeof DB._raw === 'function')    return DB._raw(name) || [];
    return [];
  }
  function tenant() {
    return (window.Auth && Auth.session()) ? Auth.session().church_id : null;
  }
  function ofTenant(rows) {
    const cid = tenant();
    if (!cid) return rows;
    return rows.filter(r => !r.church_id || r.church_id === cid);
  }

  function getUser(userId) {
    return ofTenant(tableAll('users')).find(u => u.user_id === userId) || null;
  }

  /** Classes visible to a user, honoring role + service_supervisors + servant_assignments. */
  function getScopedClassIds(userId) {
    const u = getUser(userId);
    if (!u) return [];
    if (['super_admin','church_admin'].includes(u.role)) {
      return ofTenant(tableAll('service_classes')).map(c => c.class_id);
    }
    const ids = new Set();

    // Servant: directly assigned classes
    ofTenant(tableAll('servant_assignments'))
      .filter(a => a.user_id === userId && a.active !== false)
      .forEach(a => a.class_id && ids.add(a.class_id));

    // Supervisor of service / stage: walk down
    const sups = ofTenant(tableAll('service_supervisors'))
      .filter(s => s.user_id === userId && s.active !== false);
    const classes = ofTenant(tableAll('service_classes'));
    const stages  = ofTenant(tableAll('service_stages'));
    sups.forEach(s => {
      if (s.stage_id) {
        classes.filter(c => c.stage_id === s.stage_id).forEach(c => ids.add(c.class_id));
      } else if (s.service_id) {
        const stageIds = stages.filter(st => st.service_id === s.service_id).map(st => st.stage_id);
        classes.filter(c => c.service_id === s.service_id || stageIds.includes(c.stage_id))
               .forEach(c => ids.add(c.class_id));
      }
    });

    return Array.from(ids);
  }

  function getScopedMemberIds(userId) {
    const classIds = new Set(getScopedClassIds(userId));
    if (classIds.size === 0) return [];
    return ofTenant(tableAll('members'))
      .filter(m => classIds.has(m.service_class_id) ||
                   classIds.has(m.class_id) ||
                   (m.assigned_servant_id === userId))
      .map(m => m.member_id);
  }

  /** Breadcrumb: [service, stage, grade, class, small_group]. Nulls skipped. */
  function getBreadcrumb(class_id) {
    if (!class_id) return [];
    const cls   = ofTenant(tableAll('service_classes')).find(c => c.class_id === class_id);
    if (!cls) return [];
    const stage = cls.stage_id   ? ofTenant(tableAll('service_stages')).find(s => s.stage_id === cls.stage_id) : null;
    const grade = cls.grade_id   ? ofTenant(tableAll('service_grades')).find(g => g.grade_id === cls.grade_id) : null;
    const svcId = cls.service_id || (stage && stage.service_id);
    const svc   = svcId ? ofTenant(tableAll('services')).find(x => x.service_id === svcId) : null;
    return [
      svc   && { level:'service', id:svc.service_id, name:svc.name },
      stage && { level:'stage',   id:stage.stage_id, name:stage.name },
      grade && { level:'grade',   id:grade.grade_id, name:grade.name },
      cls   && { level:'class',   id:cls.class_id,   name:cls.class_name || cls.name }
    ].filter(Boolean);
  }

  /** Validate parent/child consistency for a class — returns array of issues. */
  function validateClass(cls) {
    const issues = [];
    if (cls.stage_id) {
      const stage = ofTenant(tableAll('service_stages')).find(s => s.stage_id === cls.stage_id);
      if (!stage) issues.push('orphan_stage');
      else if (cls.service_id && stage.service_id && cls.service_id !== stage.service_id) {
        issues.push('service_mismatch_with_stage');
      }
    }
    if (cls.grade_id) {
      const grade = ofTenant(tableAll('service_grades')).find(g => g.grade_id === cls.grade_id);
      if (!grade) issues.push('orphan_grade');
      else if (cls.stage_id && grade.stage_id !== cls.stage_id) {
        issues.push('grade_stage_mismatch');
      }
    }
    return issues;
  }

  window.HierarchyResolver = {
    getScopedClassIds,
    getScopedMemberIds,
    getBreadcrumb,
    validateClass
  };
})();


/* === spiritual-engine.js === */
/* ============================================================
   SPIRITUAL-ENGINE.js — Phase 5: spiritual growth tracking
   ============================================================ */
(function () {
  function table(name){ return (window.DB && DB.findAll) ? (DB.findAll(name)||[]) : []; }
  function tenant(){ return (window.Auth && Auth.session()) ? Auth.session().church_id : null; }
  function now(){ return new Date().toISOString(); }
  function uid(p){ return p + '-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

  function recordSacrament({ member_id, kind, date, performed_by, location, notes }) {
    return DB.insert('sacraments', {
      sacrament_id: uid('sac'), church_id: tenant(),
      member_id, kind, date, performed_by, location, notes, created_at: now()
    });
  }
  function recordMilestone({ member_id, kind, date, notes }) {
    return DB.insert('spiritual_milestones', {
      milestone_id: uid('mil'), church_id: tenant(),
      member_id, kind, date: date || now(), notes, created_at: now()
    });
  }
  function startMentorship({ mentor_user_id, mentee_member_id, notes }) {
    return DB.insert('mentorships', {
      mentorship_id: uid('men'), church_id: tenant(),
      mentor_user_id, mentee_member_id, started_at: now(),
      status:'active', notes
    });
  }
  function setJourneyStage({ member_id, stage, notes }) {
    return DB.insert('discipleship_journeys', {
      journey_id: uid('jrn'), church_id: tenant(),
      member_id, stage, entered_at: now(), notes
    });
  }

  /* Member spiritual timeline = sacraments + milestones + spiritual attendances + mentorships */
  function timeline(member_id) {
    const SPIRITUAL_ACTIVITIES = new Set(['mass','bible_study','retreat','prayer_meeting','confession']);
    const events = [];
    table('sacraments').filter(s => s.member_id === member_id).forEach(s =>
      events.push({ at: s.date, type:'sacrament', label: s.kind, data: s })
    );
    table('spiritual_milestones').filter(m => m.member_id === member_id).forEach(m =>
      events.push({ at: m.date, type:'milestone', label: m.kind, data: m })
    );
    table('mentorships').filter(x => x.mentee_member_id === member_id).forEach(x =>
      events.push({ at: x.started_at, type:'mentorship', label: 'mentorship_start', data: x })
    );
    table('discipleship_journeys').filter(j => j.member_id === member_id).forEach(j =>
      events.push({ at: j.entered_at, type:'journey', label: j.stage, data: j })
    );
    const sessions = table('attendance_sessions');
    table('attendance_records')
      .filter(r => r.member_id === member_id && (r.status === 'present' || r.status === 'served' || r.status == null))
      .forEach(r => {
        const ses = sessions.find(s => s.session_id === r.session_id);
        if (ses && SPIRITUAL_ACTIVITIES.has(ses.activity_type)) {
          events.push({ at: r.check_in_at || ses.starts_at, type:'attendance',
                        label: ses.activity_type, data: { session: ses, record: r } });
        }
      });
    return events.filter(e => e.at).sort((a,b) => new Date(b.at) - new Date(a.at));
  }

  /* Detectors */
  function isDisconnected(member_id, days = 60) {
    const since = Date.now() - days*86400000;
    return !timeline(member_id).some(e => new Date(e.at).getTime() >= since);
  }
  function needsMentorship(member_id) {
    const journey = table('discipleship_journeys')
      .filter(j => j.member_id === member_id)
      .sort((a,b) => new Date(b.entered_at) - new Date(a.entered_at))[0];
    if (!journey || journey.stage !== 'new_believer') return false;
    const hasMentor = table('mentorships')
      .some(m => m.mentee_member_id === member_id && m.status === 'active');
    return !hasMentor;
  }
  function isPotentialServant(member_id) {
    const journey = table('discipleship_journeys')
      .filter(j => j.member_id === member_id)
      .sort((a,b) => new Date(b.entered_at) - new Date(a.entered_at))[0];
    if (!journey || !['growing','serving'].includes(journey.stage)) return false;
    if (window.AttendancePlus) {
      const s = AttendancePlus.engagementScore(member_id, 90);
      return s.score >= 75 && s.sample >= 6;
    }
    return false;
  }

  /* Aggregate spiritual report for a class / family / church */
  function summary(memberIds) {
    const out = { total: memberIds.length, disconnected: 0, needs_mentor: 0,
                  potential_servants: 0, by_stage: {} };
    memberIds.forEach(id => {
      if (isDisconnected(id)) out.disconnected++;
      if (needsMentorship(id)) out.needs_mentor++;
      if (isPotentialServant(id)) out.potential_servants++;
      const j = table('discipleship_journeys')
        .filter(x => x.member_id === id)
        .sort((a,b) => new Date(b.entered_at) - new Date(a.entered_at))[0];
      const stage = (j && j.stage) || 'unknown';
      out.by_stage[stage] = (out.by_stage[stage] || 0) + 1;
    });
    return out;
  }

  window.SpiritualEngine = {
    recordSacrament, recordMilestone, startMentorship, setJourneyStage,
    timeline, isDisconnected, needsMentorship, isPotentialServant, summary
  };
})();


/* === family-plus.js === */
/* ============================================================
   FAMILY-PLUS.js — Phase 1+2 enhancements (aggregations + detectors)
   Adds on top of family-engine.js without modifying it.
   ============================================================ */
(function () {
  function table(name){ return (window.DB && DB.findAll) ? (DB.findAll(name)||[]) : []; }
  function tenant(){ return (window.Auth && Auth.session()) ? Auth.session().church_id : null; }
  function now(){ return new Date().toISOString(); }
  function uid(p){ return p + '-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

  function membersOf(family_id) {
    return table('members').filter(m => m.family_id === family_id);
  }

  /* Add / change a relationship — supports multi-role (e.g. son AND guardian). */
  function setRelationship({ family_id, member_id, relationship_kind, is_primary }) {
    const existing = table('family_relationships')
      .find(r => r.family_id === family_id && r.member_id === member_id
                 && r.relationship_kind === relationship_kind);
    if (existing) {
      DB.update('family_relationships', existing.rel_id, { is_primary: !!is_primary });
      return existing;
    }
    return DB.insert('family_relationships', {
      rel_id: uid('rel'), church_id: tenant(),
      family_id, member_id, relationship_kind,
      is_primary: !!is_primary, created_at: now()
    });
  }

  function logVisitation({ family_id, performed_by, outcome, notes }) {
    return DB.insert('family_visitations', {
      visit_id: uid('vis'), church_id: tenant(),
      family_id, performed_by, performed_at: now(),
      outcome, notes, created_at: now()
    });
  }

  /* Family attendance window: % of (members × spiritual sessions) that resulted in present/late/online/served */
  function computeFamilyAttendance(family_id, days = 30) {
    const since = Date.now() - days*86400000;
    const memberIds = membersOf(family_id).map(m => m.member_id);
    if (memberIds.length === 0) return { rate:0, sample:0, attended:0 };
    const records = table('attendance_records').filter(r =>
      memberIds.includes(r.member_id) && r.check_in_at &&
      new Date(r.check_in_at).getTime() >= since
    );
    const good = records.filter(r => ['present','late','online','served'].includes(r.status) ||
                                     (r.status == null && r.check_in_at));
    return { rate: records.length ? Math.round(good.length / records.length * 100) : 0,
             sample: records.length, attended: good.length, members: memberIds.length };
  }

  /* Family risk score = avg of member risk scores, boosted by inactivity. */
  function computeFamilyRiskScore(family_id) {
    const memberIds = membersOf(family_id).map(m => m.member_id);
    if (memberIds.length === 0) return { score: 0, level: 'low', size: 0 };
    const scores = table('member_risk_scores').filter(s => memberIds.includes(s.member_id));
    const avg = scores.length ? scores.reduce((a,s) => a + (s.score||0), 0) / scores.length : 0;
    const attended = computeFamilyAttendance(family_id, 28);
    let boost = 0;
    if (attended.sample === 0) boost = 25;
    else if (attended.rate < 30) boost = 15;
    const total = Math.min(100, Math.round(avg + boost));
    const level = total >= 75 ? 'critical' : total >= 50 ? 'high' : total >= 25 ? 'medium' : 'low';
    return { score: total, level, size: memberIds.length, attendance: attended };
  }

  /* Detect "spiritually disconnected" families (auto-tag, non-destructive). */
  function detectDisconnected() {
    const out = [];
    table('families').forEach(f => {
      const att = computeFamilyAttendance(f.family_id, 28);
      const risky = computeFamilyRiskScore(f.family_id);
      const flag = att.sample === 0 || risky.level === 'critical';
      if (flag) {
        if (f.family_status !== 'spiritually_disconnected') {
          DB.update('families', f.family_id, { family_status: 'spiritually_disconnected' });
        }
        out.push({ family_id: f.family_id, family_name: f.family_name,
                   attendance: att, risk: risky });
      }
    });
    return out;
  }

  /* Dashboard widgets for families.html */
  function dashboard() {
    const all = table('families');
    return {
      total:     all.length,
      active:    all.filter(f => f.family_status === 'active').length,
      inactive:  all.filter(f => f.family_status === 'inactive').length,
      new:       all.filter(f => f.family_status === 'new').length,
      high_risk: all.filter(f => ['high_risk','spiritually_disconnected'].includes(f.family_status)).length,
      needs_visitation: all.filter(f => f.family_status === 'needs_visitation').length
    };
  }

  window.FamilyPlus = {
    setRelationship, logVisitation,
    computeFamilyAttendance, computeFamilyRiskScore,
    detectDisconnected, dashboard
  };
})();


/* === followup-plus.js === */
/* ============================================================
   FOLLOWUP-PLUS.js — Phase 6: intelligent follow-up journey
   ============================================================ */
(function () {
  function table(name){ return (window.DB && DB.findAll) ? (DB.findAll(name)||[]) : []; }
  function tenant(){ return (window.Auth && Auth.session()) ? Auth.session().church_id : null; }
  function now(){ return new Date().toISOString(); }
  function uid(p){ return p + '-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

  const JOURNEY_STEPS = [
    'new','welcome','initial_followup','service_integration',
    'small_group','spiritual_eval','regular','leadership'
  ];

  function advanceJourney(member_id, step, owner_user_id, notes) {
    if (!JOURNEY_STEPS.includes(step)) throw new Error('invalid step');
    // Close the currently-open step (if any)
    const open = table('member_journey_steps')
      .filter(s => s.member_id === member_id && !s.completed_at)
      .sort((a,b) => new Date(b.entered_at) - new Date(a.entered_at))[0];
    if (open) DB.update('member_journey_steps', open.step_id, { completed_at: now() });
    return DB.insert('member_journey_steps', {
      step_id: uid('jst'), church_id: tenant(),
      member_id, step, entered_at: now(), owner_user_id, notes
    });
  }

  function journeyOf(member_id) {
    return table('member_journey_steps')
      .filter(s => s.member_id === member_id)
      .sort((a,b) => new Date(a.entered_at) - new Date(b.entered_at));
  }

  function setOutcome(task_id, outcome) {
    const allowed = ['responded','no_response','needs_escalation','recovered',
                     're_engaged','transferred','inactive','emergency'];
    if (!allowed.includes(outcome)) throw new Error('invalid outcome');
    DB.update('followup_tasks', task_id, { outcome });
    if (['recovered','re_engaged','responded'].includes(outcome)) {
      DB.update('followup_tasks', task_id, { status: 'done' });
    } else if (outcome === 'needs_escalation' || outcome === 'emergency') {
      const task = (table('followup_tasks')||[]).find(t => t.task_id === task_id);
      if (task) DB.update('followup_tasks', task_id, {
        status: 'escalated', escalation_level: (task.escalation_level || 0) + 1
      });
    }
  }

  /* Recommend best servant to assign — based on user's scope, current load,
     and historical response rate. */
  function recommendServant(member_id) {
    const member = (table('members')||[]).find(m => m.member_id === member_id);
    if (!member) return null;
    const users = (table('users')||[]).filter(u => u.is_active !== false && u.role === 'servant');
    const tasks = table('followup_tasks');
    const logs  = table('followup_logs');

    const scored = users.map(u => {
      const scope = window.HierarchyResolver
        ? new Set(HierarchyResolver.getScopedMemberIds(u.user_id)) : null;
      const inScope = !scope || scope.has(member_id);
      if (!inScope) return null;

      const openLoad = tasks.filter(t => t.assigned_to === u.user_id &&
                                         ['open','in_progress'].includes(t.status)).length;
      const myLogs = logs.filter(l => l.performed_by === u.user_id);
      const responsive = myLogs.filter(l => l.action !== 'no_response').length;
      const rate = myLogs.length ? responsive / myLogs.length : 0.5;
      const score = (rate * 100) - (openLoad * 5);
      return { user_id: u.user_id, full_name: u.full_name, score, openLoad,
               response_rate: Math.round(rate*100) };
    }).filter(Boolean).sort((a,b) => b.score - a.score);

    return scored[0] || null;
  }

  /* Dashboard buckets */
  function dashboard() {
    const tasks = table('followup_tasks');
    return {
      urgent:     tasks.filter(t => t.priority === 'urgent' && t.status !== 'done').length,
      escalated:  tasks.filter(t => t.status === 'escalated').length,
      recovered:  tasks.filter(t => t.outcome === 'recovered').length,
      inactive:   tasks.filter(t => t.outcome === 'inactive').length,
      high_risk:  tasks.filter(t => ['high','urgent'].includes(t.priority) && t.status !== 'done').length,
      open_total: tasks.filter(t => ['open','in_progress'].includes(t.status)).length
    };
  }

  window.FollowupPlus = {
    JOURNEY_STEPS, advanceJourney, journeyOf,
    setOutcome, recommendServant, dashboard
  };
})();


/* === attendance-plus.js === */
/* ============================================================
   ATTENDANCE-PLUS.js — Phase 4 enhancements (additive)
   Adds explicit status, anti-fraud, expectation roster, offline queue.
   Existing attendance.js continues to work; this module wraps it.
   ============================================================ */
(function () {
  const ATT_STATUS = ['present','late','excused','online','served','visitor','partial','absent'];

  function table(name) { return (window.DB && DB.findAll) ? (DB.findAll(name)||[]) : []; }
  function tenant()    { return (window.Auth && Auth.session()) ? Auth.session().church_id : null; }
  function now()       { return new Date().toISOString(); }
  function uid(p)      { return p + '-' + Math.random().toString(36).slice(2,10) + Date.now().toString(36).slice(-4); }

  /* ---------- Expectations roster ---------- */
  function setExpectedRoster(session_id, memberIds) {
    const cid = tenant();
    const existing = table('attendance_session_expectations').filter(e => e.session_id === session_id);
    const have = new Set(existing.map(e => e.member_id));
    memberIds.forEach(mid => {
      if (have.has(mid)) return;
      DB.insert('attendance_session_expectations', {
        expect_id: uid('exp'), church_id: cid, session_id, member_id: mid, created_at: now()
      });
    });
  }

  /* ---------- Mark status (replaces / augments simple check-in) ---------- */
  function markStatus({ session_id, member_id, status, evidence }) {
    if (!ATT_STATUS.includes(status)) throw new Error('invalid status: ' + status);
    const cid = tenant();
    const existing = (table('attendance_records')||[])
      .find(r => r.session_id === session_id && r.member_id === member_id);
    const payload = Object.assign({
      church_id: cid, session_id, member_id,
      status,
      is_late: status === 'late',
      check_in_at: now(),
      check_in_method: (evidence && evidence.method) || 'manual',
      location_lat: evidence && evidence.lat || null,
      location_lng: evidence && evidence.lng || null,
      device_id:          evidence && evidence.device_id || null,
      device_fingerprint: evidence && evidence.device_fingerprint || null,
      ip_hash:            evidence && evidence.ip_hash || null,
      excuse_reason:      evidence && evidence.excuse_reason || null,
      partial_minutes:    evidence && evidence.partial_minutes || null
    });
    if (existing) {
      DB.update('attendance_records', existing.record_id, payload);
      return Object.assign({}, existing, payload);
    }
    payload.record_id = uid('rec');
    return DB.insert('attendance_records', payload);
  }

  /* ---------- Close session → materialize 'absent' rows from roster ---------- */
  function closeSession(session_id) {
    const cid = tenant();
    const roster = table('attendance_session_expectations').filter(e => e.session_id === session_id);
    const records = table('attendance_records').filter(r => r.session_id === session_id);
    const present = new Set(records.map(r => r.member_id));
    let created = 0;
    roster.forEach(e => {
      if (present.has(e.member_id)) return;
      DB.insert('attendance_records', {
        record_id: uid('rec'),
        church_id: cid,
        session_id, member_id: e.member_id,
        status: 'absent',
        check_in_method: 'manual',
        check_in_at: null,
        is_late: false
      });
      created++;
    });
    const ses = (table('attendance_sessions')||[]).find(s => s.session_id === session_id);
    if (ses) DB.update('attendance_sessions', session_id, { status: 'closed' });
    return { created_absent: created };
  }

  /* ---------- Anti-fraud check (returns {ok, reason?}) ---------- */
  function antiFraudCheck({ session_id, member_id, evidence }) {
    const ses = (table('attendance_sessions')||[]).find(s => s.session_id === session_id);
    if (!ses) return { ok:false, reason:'session_not_found' };

    // Time window
    const settings = (table('church_settings')||[])[0] || {};
    const windowMin = settings.attendance_window_min || 30;
    const start = ses.starts_at ? new Date(ses.starts_at).getTime() : null;
    const end   = ses.ends_at   ? new Date(ses.ends_at).getTime()   : null;
    const t = Date.now();
    if (start && t < start - windowMin*60000) return { ok:false, reason:'too_early' };
    if (end   && t > end   + windowMin*60000) return { ok:false, reason:'too_late' };

    // Geofence
    if (evidence && evidence.lat != null && settings.geofence_lat != null) {
      const km = haversine(evidence.lat, evidence.lng, settings.geofence_lat, settings.geofence_lng);
      const radius = (settings.geofence_radius_m || 500) / 1000;
      if (km > radius) return { ok:false, reason:'outside_geofence' };
    }

    // Device abuse: same fingerprint > 25 distinct members in same session
    if (evidence && evidence.device_fingerprint) {
      const sameDevice = table('attendance_records')
        .filter(r => r.session_id === session_id && r.device_fingerprint === evidence.device_fingerprint);
      const distinct = new Set(sameDevice.map(r => r.member_id));
      if (distinct.size > 25 && !distinct.has(member_id)) {
        return { ok:false, reason:'device_abuse' };
      }
    }
    return { ok:true };
  }

  function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371, toR = d => d * Math.PI/180;
    const dLat = toR(lat2-lat1), dLon = toR(lon2-lon1);
    const a = Math.sin(dLat/2)**2 + Math.cos(toR(lat1))*Math.cos(toR(lat2))*Math.sin(dLon/2)**2;
    return 2*R*Math.asin(Math.sqrt(a));
  }

  /* ---------- Offline queue ---------- */
  function enqueueOffline(payload) {
    const local_id = uid('off');
    DB.insert('attendance_offline_queue', {
      local_id, church_id: tenant(),
      session_id: payload.session_id,
      member_id:  payload.member_id,
      payload, queued_at: now(), synced_at: null, error: null
    });
    return local_id;
  }
  function flushOffline() {
    const q = table('attendance_offline_queue').filter(r => !r.synced_at);
    const out = { synced:0, failed:0 };
    q.forEach(item => {
      try {
        markStatus(item.payload);
        DB.update('attendance_offline_queue', item.local_id, { synced_at: now() });
        out.synced++;
      } catch (e) {
        DB.update('attendance_offline_queue', item.local_id, { error: String(e) });
        out.failed++;
      }
    });
    return out;
  }

  /* ---------- Engagement score (transparent rolling-window heuristic) ---------- */
  function engagementScore(member_id, days = 90) {
    const since = Date.now() - days*86400000;
    const records = table('attendance_records').filter(r => r.member_id === member_id);
    const recent = records.filter(r => r.check_in_at && new Date(r.check_in_at).getTime() >= since);
    if (recent.length === 0) return { score: 0, label: 'inactive', sample: 0 };
    const weights = { present:1.0, online:0.9, served:1.1, late:0.7, partial:0.6, excused:0.5, visitor:0.4, absent:0 };
    const total = recent.reduce((acc,r) => acc + (weights[r.status] != null ? weights[r.status] : (r.is_late ? 0.7 : 1.0)), 0);
    const score = Math.min(100, Math.round((total / recent.length) * 100));
    const label = score >= 80 ? 'high' : score >= 50 ? 'moderate' : score >= 20 ? 'low' : 'inactive';
    return { score, label, sample: recent.length };
  }

  /* ---------- 52-week heatmap data ---------- */
  function heatmap(member_id) {
    const cells = {};
    table('attendance_records')
      .filter(r => r.member_id === member_id && r.check_in_at)
      .forEach(r => {
        const d = new Date(r.check_in_at).toISOString().slice(0,10);
        cells[d] = (cells[d] || 0) + 1;
      });
    return cells; // { 'YYYY-MM-DD': count }
  }

  window.AttendancePlus = {
    STATUSES: ATT_STATUS,
    setExpectedRoster, markStatus, closeSession,
    antiFraudCheck, enqueueOffline, flushOffline,
    engagementScore, heatmap
  };
})();

