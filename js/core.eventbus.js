/* ============================================================
   core.eventbus.js — Enterprise Event Bus + Event Catalog
   v17 — Service Layer / Event Bus refactor
   ------------------------------------------------------------
   Lightweight pub/sub bus used as the operational backbone.
   - window.Events  : canonical event-name catalog (constants)
   - window.Bus     : EventBus instance (on/once/off/emit/emitAsync)
   - Bridges DB.on(insert/update/remove) -> domain events.
   No external deps. Loads after db.js, before services.bundle.js.
   ============================================================ */
(function(){
  if (window.Bus) return;

  /* ---------- Event catalog ---------- */
  const Events = Object.freeze({
    // Family domain
    FAMILY_CREATED:        'family.created',
    FAMILY_UPDATED:        'family.updated',
    FAMILY_DELETED:        'family.deleted',
    FAMILY_SPLIT:          'family.split',
    FAMILY_MERGED:         'family.merged',
    FAMILY_TRANSFERRED:    'family.transferred',
    GUARDIAN_CHANGED:      'family.guardian.changed',
    FAMILY_RISK_CHANGED:   'family.risk.changed',

    // Attendance domain
    ATTENDANCE_MARKED:         'attendance.marked',
    MEMBER_ABSENT:             'attendance.member.absent',
    FAMILY_INACTIVE:           'attendance.family.inactive',
    ATTENDANCE_RISK_DETECTED:  'attendance.risk.detected',

    // Workflow domain
    TASK_CREATED:       'workflow.task.created',
    TASK_ASSIGNED:      'workflow.task.assigned',
    TASK_ESCALATED:     'workflow.task.escalated',
    TASK_CLOSED:        'workflow.task.closed',
    FOLLOWUP_REQUIRED:  'workflow.followup.required',
    FOLLOWUP_OVERDUE:   'workflow.followup.overdue',

    // AI / Intelligence domain
    AI_RISK_DETECTED:           'ai.risk.detected',
    AI_RECOMMENDATION_CREATED:  'ai.recommendation.created',
    AI_PATTERN_DETECTED:        'ai.pattern.detected',

    // Notification domain
    NOTIFICATION_SENT:   'notification.sent',
    NOTIFICATION_FAILED: 'notification.failed'
  });

  /* ---------- EventBus core ---------- */
  function EventBus(){
    this._subs = Object.create(null);
    this._id = 0;
  }
  EventBus.prototype.on = function(event, handler){
    if (!event || typeof handler !== 'function') return function(){};
    const list = this._subs[event] || (this._subs[event] = []);
    const id = ++this._id;
    list.push({ id, handler });
    return () => this.off(event, handler);
  };
  EventBus.prototype.once = function(event, handler){
    const off = this.on(event, function(payload){
      try { handler(payload); } finally { off(); }
    });
    return off;
  };
  EventBus.prototype.off = function(event, handler){
    const list = this._subs[event]; if (!list) return;
    this._subs[event] = list.filter(s => s.handler !== handler);
  };
  EventBus.prototype.emit = function(event, payload){
    const list = this._subs[event]; if (!list || !list.length) return;
    // Snapshot to allow handlers to unsubscribe during dispatch.
    list.slice().forEach(s => {
      try { s.handler(payload, event); }
      catch(err){ try { console.warn('[Bus]', event, err); } catch(_){} }
    });
  };
  EventBus.prototype.emitAsync = function(event, payload){
    return new Promise(resolve => {
      setTimeout(() => { this.emit(event, payload); resolve(); }, 0);
    });
  };
  EventBus.prototype.listenerCount = function(event){
    return (this._subs[event] || []).length;
  };

  const Bus = new EventBus();

  /* ---------- DB bridge: data writes -> domain events ---------- */
  if (window.DB && typeof DB.on === 'function'){
    DB.on(function(op, table, row){
      try {
        if (table === 'families'){
          if (op === 'insert') Bus.emit(Events.FAMILY_CREATED, { family: row });
          else if (op === 'update') Bus.emit(Events.FAMILY_UPDATED, { family: row });
          else if (op === 'remove') Bus.emit(Events.FAMILY_DELETED, { family: row });
        } else if (table === 'attendance_records' && op === 'insert'){
          Bus.emit(Events.ATTENDANCE_MARKED, { record: row });
        } else if ((table === 'followup_tasks' || table === 'followups')){
          if (op === 'insert') Bus.emit(Events.TASK_CREATED, { task: row });
          else if (op === 'update') {
            if (row && (row.status === 'closed' || row.status === 'done'))
              Bus.emit(Events.TASK_CLOSED, { task: row });
          }
        } else if (table === 'family_movement_log' && op === 'insert'){
          const t = (row && row.action) || '';
          if (t === 'split')      Bus.emit(Events.FAMILY_SPLIT,       { log: row });
          else if (t === 'merge') Bus.emit(Events.FAMILY_MERGED,      { log: row });
          else if (t === 'transfer') Bus.emit(Events.FAMILY_TRANSFERRED, { log: row });
          else if (t === 'guardian_change') Bus.emit(Events.GUARDIAN_CHANGED, { log: row });
        } else if (table === 'notifications' && op === 'insert'){
          Bus.emit(Events.NOTIFICATION_SENT, { notification: row });
        } else if (table === 'family_ai_insights' && op === 'insert'){
          Bus.emit(Events.AI_PATTERN_DETECTED, { insight: row });
        }
      } catch(_){}
    });
  }

  window.Events = Events;
  window.Bus = Bus;
})();
