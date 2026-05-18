/* ============================================================
   attendance-enterprise.js — v20
   Enterprise Church Attendance Ecosystem
   ------------------------------------------------------------
   Engines :
     - Liturgy     : fixed weekly (Friday/Sunday) + dynamic
     - Meeting     : youth/servants/men/women/... + recurrence
     - SundaySchool: auto-Friday by stage (Nursery..Secondary)
     - EventAttendance : helpers over events module
     - Visitor     : separate visitors registry + attendance
     - QRSession   : rotating-token QR attendance sessions
     - AttendanceCalendar    : monthly multi-domain calendar
     - AttendanceIntelligence: operational insight engine
     - SpiritualMarks: communion / confession per record
   UI (page="attendance") :
     Calendar | Sessions | Liturgies | Meetings | Sunday School
     Visitors | QR | Intelligence
   ------------------------------------------------------------
   Loads after pages.bundle.js. Idempotent, fail-safe.
   Reuses existing window.Attendance, window.DB, window.Bus.
   ============================================================ */
(function(){
  if (!window.DB) { console.warn('[attendance-enterprise] DB missing'); return; }
  if (window.AttendanceEnterprise) return; // idempotent

  /* ===================== Event catalog patch ===================== */
  if (window.Events){
    const extra = {
      LITURGY_CREATED:      'liturgy.created',
      LITURGY_COMPLETED:    'liturgy.completed',
      MEETING_CREATED:      'meeting.created',
      MEETING_COMPLETED:    'meeting.completed',
      EVENT_CHECKIN:        'event.checkin',
      VISITOR_REGISTERED:   'visitor.registered',
      VISITOR_CHECKIN:      'visitor.checkin',
      COMMUNION_RECORDED:   'attendance.communion.recorded',
      CONFESSION_RECORDED:  'attendance.confession.recorded',
      QR_SESSION_STARTED:   'attendance.qr.started',
      QR_SESSION_EXPIRED:   'attendance.qr.expired'
    };
    Object.keys(extra).forEach(k => {
      try { window.Events[k] = extra[k]; } catch(_){ /* frozen — ok */ }
    });
    // Mirror onto Bus for direct emit by string too
  }
  const emit = (name, payload) => { try { window.Bus && window.Bus.emit(name, payload); } catch(_){} };

  /* ===================== helpers ===================== */
  const todayISO  = () => new Date().toISOString();
  const dateOnly  = d => (d ? new Date(d).toISOString().slice(0,10) : null);
  const startOfMonth = d => { const x=new Date(d); x.setDate(1); x.setHours(0,0,0,0); return x; };
  const endOfMonth   = d => { const x=new Date(d); x.setMonth(x.getMonth()+1,0); x.setHours(23,59,59,999); return x; };
  const fmtTime = iso => { try { return new Date(iso).toLocaleString('ar-EG',{hour:'2-digit',minute:'2-digit'}); } catch(_){ return iso; } };

  function safeInsert(table, row){
    try { return DB.insert(table, row); } catch(e){ console.warn('[att-ent]',table,e); return null; }
  }

  /* ===================== LITURGY ===================== */
  const Liturgy = {
    TYPES: {
      friday:   { label:'قداس الجمعة',  color:'#7c3aed', recurrence:'weekly_friday' },
      sunday:   { label:'قداس الأحد',   color:'#7c3aed', recurrence:'weekly_sunday' },
      feast:    { label:'قداس عيد',     color:'#dc2626', recurrence:'none' },
      holiday:  { label:'قداس عطلة',    color:'#ea580c', recurrence:'none' },
      fasting:  { label:'قداس صوم',     color:'#0891b2', recurrence:'none' },
      memorial: { label:'قداس تذكاري',  color:'#475569', recurrence:'none' },
      special:  { label:'قداس خاص',     color:'#0d9488', recurrence:'none' },
      custom:   { label:'مخصص',         color:'#6366f1', recurrence:'none' }
    },

    list(){ return DB.all('liturgies').sort((a,b)=> new Date(b.starts_at)-new Date(a.starts_at)); },

    create(data){
      const t = Liturgy.TYPES[data.liturgy_type] || Liturgy.TYPES.custom;
      const sess = window.Attendance && Attendance.createSession({
        activity_type: 'mass',
        title: data.title || t.label,
        starts_at: data.starts_at,
        ends_at: data.ends_at || null
      });
      const row = safeInsert('liturgies', {
        title:        data.title || t.label,
        liturgy_type: data.liturgy_type || 'custom',
        recurrence:   data.recurrence || t.recurrence || 'none',
        starts_at:    data.starts_at || todayISO(),
        ends_at:      data.ends_at || null,
        session_id:   sess ? sess.session_id : null,
        created_by:   (window.Auth && Auth.session()?.user_id) || null,
        notes:        data.notes || null
      });
      emit('liturgy.created', row);
      return row;
    },

    /** Materialise upcoming weekly Friday + Sunday liturgies (idempotent for the next N weeks) */
    seedRecurring(weeks=4){
      const out=[];
      const today = new Date(); today.setHours(9,0,0,0);
      for (let w=0; w<weeks; w++){
        for (const day of [5,0]){ // 5=Fri, 0=Sun
          const d = new Date(today);
          const diff = (day - d.getDay() + 7) % 7;
          d.setDate(d.getDate() + diff + w*7);
          const iso = d.toISOString();
          const ttype = day===5 ? 'friday' : 'sunday';
          const exists = DB.filter('liturgies', r => r.liturgy_type===ttype && r.starts_at.slice(0,10)===iso.slice(0,10)).length;
          if (!exists) out.push(Liturgy.create({ liturgy_type:ttype, starts_at:iso, title:Liturgy.TYPES[ttype].label }));
        }
      }
      return out;
    },

    complete(liturgy_id){
      const row = DB.byId('liturgies', liturgy_id);
      if (!row) return null;
      if (row.session_id && window.Attendance) Attendance.closeSession(row.session_id);
      emit('liturgy.completed', row);
      return row;
    }
  };

  /* ===================== MEETING ===================== */
  const Meeting = {
    TYPES: {
      youth:               { label:'اجتماع شباب',           color:'#2563eb' },
      university_graduates:{ label:'اجتماع جامعة وخريجين',  color:'#1d4ed8' },
      servants:            { label:'اجتماع خدام',           color:'#9333ea' },
      men:                 { label:'اجتماع رجال',           color:'#0f766e' },
      women:               { label:'اجتماع سيدات',          color:'#db2777' },
      secondary:           { label:'اجتماع ثانوي',          color:'#0ea5e9' },
      preparatory:         { label:'اجتماع إعدادي',         color:'#38bdf8' },
      kids:                { label:'اجتماع أطفال',          color:'#22c55e' },
      custom:              { label:'اجتماع مخصص',           color:'#64748b' }
    },

    list(){ return DB.all('meetings').sort((a,b)=> new Date(b.starts_at)-new Date(a.starts_at)); },

    create(data){
      const t = Meeting.TYPES[data.meeting_type] || Meeting.TYPES.custom;
      const sess = window.Attendance && Attendance.createSession({
        activity_type: 'meeting',
        title: data.title || t.label,
        starts_at: data.starts_at
      });
      const row = safeInsert('meetings', {
        title:        data.title || t.label,
        meeting_type: data.meeting_type || 'custom',
        recurrence:   data.recurrence || 'weekly',
        weekday:      data.weekday ?? null,
        starts_at:    data.starts_at || todayISO(),
        ends_at:      data.ends_at || null,
        session_id:   sess ? sess.session_id : null,
        service_stage:data.service_stage || null,
        leaders:      data.leaders || null,
        created_by:   (window.Auth && Auth.session()?.user_id) || null
      });
      emit('meeting.created', row);
      return row;
    },

    complete(meeting_id){
      const row = DB.byId('meetings', meeting_id);
      if (!row) return null;
      if (row.session_id && window.Attendance) Attendance.closeSession(row.session_id);
      emit('meeting.completed', row);
      return row;
    }
  };

  /* ===================== SUNDAY SCHOOL (Friday, Nursery → Secondary) ===================== */
  const SundaySchool = {
    STAGES: {
      nursery:     { label:'حضانة',  color:'#fde68a' },
      primary:     { label:'ابتدائي', color:'#bef264' },
      preparatory: { label:'إعدادي', color:'#86efac' },
      secondary:   { label:'ثانوي',  color:'#4ade80' }
    },

    list(){ return DB.all('sunday_school_sessions').sort((a,b)=> (b.occurs_on||'').localeCompare(a.occurs_on||'')); },

    /** Returns this/next Friday ISO date (yyyy-mm-dd). */
    nextFriday(from=new Date()){
      const d = new Date(from);
      const diff = (5 - d.getDay() + 7) % 7;
      d.setDate(d.getDate() + diff);
      return d.toISOString().slice(0,10);
    },

    /** Create (or fetch) a Sunday School session for a stage on a given date. */
    open(stage, date){
      date = date || SundaySchool.nextFriday();
      const existing = DB.find('sunday_school_sessions', r => r.stage===stage && r.occurs_on===date);
      if (existing) return existing;
      const sess = window.Attendance && Attendance.createSession({
        activity_type:'sunday_school',
        title:`مدارس أحد — ${SundaySchool.STAGES[stage]?.label || stage} (${date})`,
        starts_at: date+'T10:00:00'
      });
      return safeInsert('sunday_school_sessions', {
        stage, occurs_on:date,
        session_id: sess ? sess.session_id : null
      });
    }
  };

  /* ===================== EVENT ATTENDANCE (over existing events) ===================== */
  const EventAttendance = {
    listEvents(){ return (DB.all('events')||[]); },

    /** Create or get the attendance session attached to an event. */
    openSession(event_id){
      const ev = DB.byId('events', event_id);
      if (!ev) return null;
      let sess = DB.find('attendance_sessions', s => s.event_id===event_id && s.status==='open');
      if (sess) return sess;
      sess = window.Attendance && Attendance.createSession({
        activity_type: 'conference',
        title: ev.title || ev.name || 'حدث',
        starts_at: ev.starts_at || todayISO(),
        event_id
      });
      return sess;
    },

    checkin(event_id, member_id){
      const sess = EventAttendance.openSession(event_id);
      if (!sess) return { ok:false, error:'لا توجد جلسة' };
      const r = Attendance.checkIn(sess.session_id, member_id, 'event');
      if (r.ok) emit('event.checkin', { event_id, member_id, record_id: r.record?.record_id });
      return r;
    }
  };

  /* ===================== VISITORS ===================== */
  const Visitor = {
    list(){ return DB.all('visitors').sort((a,b)=> (b.last_visit_at||'').localeCompare(a.last_visit_at||'')); },

    register(data){
      const row = safeInsert('visitors', {
        full_name:   data.full_name || 'زائر',
        phone:       data.phone || null,
        invited_by:  data.invited_by || null,
        home_church: data.home_church || null,
        visit_count: 0,
        first_visit_at: null,
        last_visit_at:  null,
        notes:       data.notes || null
      });
      emit('visitor.registered', row);
      return row;
    },

    checkin(visitor_id, session_id){
      const v = DB.byId('visitors', visitor_id);
      const s = DB.byId('attendance_sessions','session_id', session_id);
      if (!v || !s) return { ok:false, error:'بيانات غير صحيحة' };
      const rec = safeInsert('visitor_attendance', {
        visitor_id, session_id, attended_at: todayISO()
      });
      const now = todayISO();
      DB.update('visitors', visitor_id, {
        visit_count: (v.visit_count||0)+1,
        first_visit_at: v.first_visit_at || now,
        last_visit_at: now
      });
      emit('visitor.checkin', { visitor_id, session_id, record:rec });
      return { ok:true, record:rec };
    },

    history(visitor_id){
      return DB.filter('visitor_attendance', { visitor_id })
               .sort((a,b)=> new Date(b.attended_at)-new Date(a.attended_at));
    }
  };

  /* ===================== QR SESSION (rotating token) ===================== */
  const QRSession = {
    _timers: Object.create(null),

    /** Start a QR session bound to an attendance session. Rotates token every N seconds. */
    start(session_id, opts){
      opts = opts || {};
      const rotate = Math.max(10, +opts.rotates_every_sec || 30);
      const ttlMin = Math.max(1, +opts.duration_min || 60);
      const row = safeInsert('qr_attendance_sessions', {
        session_id,
        token: QRSession._mint(),
        rotates_every_sec: rotate,
        expires_at: new Date(Date.now()+ttlMin*60000).toISOString(),
        status:'active',
        created_by: (window.Auth && Auth.session()?.user_id) || null
      });
      if (!row) return null;
      emit('attendance.qr.started', row);
      QRSession._timers[row.qr_id] = setInterval(()=>{
        const cur = DB.byId('qr_attendance_sessions', row.qr_id);
        if (!cur || cur.status!=='active' || new Date(cur.expires_at) <= new Date()){
          QRSession.expire(row.qr_id); return;
        }
        DB.update('qr_attendance_sessions', row.qr_id, { token: QRSession._mint() });
      }, rotate*1000);
      return row;
    },

    _mint(){
      return (Math.random().toString(36).slice(2,8) + Date.now().toString(36).slice(-4)).toUpperCase();
    },

    /** Validate token + member, then check in with optional communion/confession marks. */
    scan(token, member_id, marks){
      const qr = DB.find('qr_attendance_sessions', q => q.token===token && q.status==='active');
      if (!qr) return { ok:false, error:'رمز غير صالح أو منتهي' };
      if (new Date(qr.expires_at) <= new Date()){ QRSession.expire(qr.qr_id); return { ok:false, error:'انتهت صلاحية الجلسة' }; }
      const r = window.Attendance && Attendance.checkIn(qr.session_id, member_id, 'qr');
      if (r && r.ok && marks){
        SpiritualMarks.mark(r.record.record_id, member_id, marks);
      }
      return r || { ok:false, error:'فشل التسجيل' };
    },

    expire(qr_id){
      DB.update('qr_attendance_sessions', qr_id, { status:'expired' });
      clearInterval(QRSession._timers[qr_id]); delete QRSession._timers[qr_id];
      emit('attendance.qr.expired', { qr_id });
    }
  };

  /* ===================== SPIRITUAL MARKS (communion / confession) ===================== */
  const SpiritualMarks = {
    mark(record_id, member_id, marks){
      const row = safeInsert('attendance_spiritual_marks', {
        record_id, member_id,
        communion: !!marks.communion,
        confession:!!marks.confession
      });
      if (marks.communion)  emit('attendance.communion.recorded',  { record_id, member_id });
      if (marks.confession) emit('attendance.confession.recorded', { record_id, member_id });
      return row;
    },
    forRecord(record_id){ return DB.find('attendance_spiritual_marks', { record_id }); },
    statsForMember(member_id, days=90){
      const cutoff = Date.now() - days*864e5;
      const marks = DB.filter('attendance_spiritual_marks', m => m.member_id===member_id);
      return {
        communion:  marks.filter(m => m.communion  && new Date(m.created_at).getTime()>=cutoff).length,
        confession: marks.filter(m => m.confession && new Date(m.created_at).getTime()>=cutoff).length
      };
    }
  };

  /* ===================== CALENDAR ===================== */
  const AttendanceCalendar = {
    /** Build monthly grid (array of {date, items[]}) for the given month. */
    month(year, month /* 0..11 */){
      const ref = new Date(year, month, 1);
      const start = startOfMonth(ref), end = endOfMonth(ref);
      const inRange = (iso) => { const t=new Date(iso).getTime(); return t>=start.getTime() && t<=end.getTime(); };

      const lit  = DB.all('liturgies').filter(r => inRange(r.starts_at));
      const meet = DB.all('meetings').filter(r => inRange(r.starts_at));
      const ss   = DB.all('sunday_school_sessions').filter(r => r.occurs_on>=dateOnly(start) && r.occurs_on<=dateOnly(end));
      const evs  = (DB.all('events')||[]).filter(r => r.starts_at && inRange(r.starts_at));

      // Build map by yyyy-mm-dd
      const map = {};
      const push = (date, item)=>{ (map[date] = map[date] || []).push(item); };

      lit.forEach(r => push(dateOnly(r.starts_at), {
        kind:'liturgy', id:r.liturgy_id, title:r.title, color: (Liturgy.TYPES[r.liturgy_type]||{}).color || '#7c3aed', time:fmtTime(r.starts_at)
      }));
      meet.forEach(r => push(dateOnly(r.starts_at), {
        kind:'meeting', id:r.meeting_id, title:r.title, color:(Meeting.TYPES[r.meeting_type]||{}).color || '#2563eb', time:fmtTime(r.starts_at)
      }));
      ss.forEach(r => push(r.occurs_on, {
        kind:'sunday_school', id:r.ss_id, title:'مدارس أحد — '+(SundaySchool.STAGES[r.stage]?.label||r.stage), color:'#16a34a', time:''
      }));
      evs.forEach(r => push(dateOnly(r.starts_at), {
        kind:'event', id:r.event_id||r.id, title:r.title||r.name||'حدث', color:'#f59e0b', time:fmtTime(r.starts_at)
      }));

      // Pad calendar grid
      const firstDow = new Date(year, month, 1).getDay();
      const lastDay  = new Date(year, month+1, 0).getDate();
      const cells = [];
      for (let i=0; i<firstDow; i++) cells.push(null);
      for (let d=1; d<=lastDay; d++){
        const iso = new Date(year, month, d).toISOString().slice(0,10);
        cells.push({ date:iso, day:d, items: map[iso] || [] });
      }
      return cells;
    }
  };

  /* ===================== INTELLIGENCE ===================== */
  const AttendanceIntelligence = {
    /** Recompute insights for all families. Stores into attendance_intelligence. */
    recompute(){
      // Clear stale insights from the last 24h to avoid duplicates
      const cutoff = Date.now() - 24*3600*1000;
      DB.all('attendance_intelligence')
        .filter(i => new Date(i.created_at).getTime() < cutoff)
        .forEach(i => DB.remove('attendance_intelligence', i.insight_id));

      const insights = [];
      const families = DB.all('families');
      families.forEach(f => {
        const members = DB.filter('members', { family_id: f.family_id });
        if (!members.length) return;
        // Family attendance rate (60 days)
        const rates = members.map(m => (window.Attendance ? Attendance.memberStats(m.member_id, 60).rate : 0));
        const avg = rates.length ? Math.round(rates.reduce((a,b)=>a+b,0)/rates.length) : 0;
        if (avg < 25){
          insights.push({ category:'family_decline', severity:'urgent', family_id:f.family_id,
            headline:`أسرة ${f.family_name||''} في تراجع حضوري حاد (${avg}%)`,
            detail:'متوسط الحضور خلال 60 يومًا منخفض جداً — يستحسن الافتقاد العاجل.',
            confidence:85 });
        } else if (avg < 50){
          insights.push({ category:'family_decline', severity:'warn', family_id:f.family_id,
            headline:`تراجع متوسط الحضور لأسرة ${f.family_name||''} (${avg}%)`,
            detail:'حضور متذبذب — يُنصح بمتابعة دورية.', confidence:70 });
        }
        // Inactive guardian with active children
        const guardians = members.filter(m => /father|mother|guardian/i.test(m.family_role||''));
        const children  = members.filter(m => /son|daughter|child/i.test(m.family_role||''));
        const gActive = guardians.some(g => window.Attendance && Attendance.memberStats(g.member_id,60).rate>=50);
        const cActive = children.some(c => window.Attendance && Attendance.memberStats(c.member_id,60).rate>=50);
        if (children.length && guardians.length && !gActive && cActive){
          insights.push({ category:'risky_family', severity:'warn', family_id:f.family_id,
            headline:`الأبناء يحضرون والأولياء غائبون — ${f.family_name||''}`,
            detail:'يُنصح بالتواصل المباشر مع الوالدين.', confidence:75 });
        }
      });

      // Inactive servants (members with active serving but no attendance > 45 days)
      if (window.Serving){
        const cutoffDays = 45;
        const recents = DB.all('attendance_records');
        const byMember = recents.reduce((a,r)=>{ const t=new Date(r.check_in_at).getTime();
          if (!a[r.member_id] || a[r.member_id]<t) a[r.member_id]=t; return a; },{});
        const assigns = (DB.all('family_serving_assignments')||[]).filter(a=>a.status==='active');
        assigns.forEach(a => {
          const last = byMember[a.member_id] || 0;
          if (Date.now()-last > cutoffDays*864e5){
            const m = DB.byId('members','member_id', a.member_id);
            insights.push({ category:'servant_inactive', severity:'warn', member_id:a.member_id, family_id:a.family_id,
              headline:`خادم غير نشط: ${m?m.full_name:'—'} (${a.ministry||'—'})`,
              detail:`لم يُسجّل حضور منذ أكثر من ${cutoffDays} يومًا.`, confidence:80 });
          }
        });
      }

      const stamped = insights.map(i => safeInsert('attendance_intelligence', { ...i, detected_at: todayISO() })).filter(Boolean);
      try { window.Bus && window.Bus.emit('attendance.risk.detected', { count: stamped.length }); } catch(_){}
      return stamped;
    },

    list(limit=50){
      return DB.all('attendance_intelligence')
        .sort((a,b)=> new Date(b.created_at)-new Date(a.created_at))
        .slice(0, limit);
    }
  };

  /* ===================== EXPORTS ===================== */
  window.Liturgy = Liturgy;
  window.Meeting = Meeting;
  window.SundaySchool = SundaySchool;
  window.EventAttendance = EventAttendance;
  window.Visitor = Visitor;
  window.QRSession = QRSession;
  window.SpiritualMarks = SpiritualMarks;
  window.AttendanceCalendar = AttendanceCalendar;
  window.AttendanceIntelligence = AttendanceIntelligence;
  window.AttendanceEnterprise = {
    Liturgy, Meeting, SundaySchool, EventAttendance, Visitor,
    QRSession, SpiritualMarks, AttendanceCalendar, AttendanceIntelligence
  };

  /* ===================== PATCH Attendance.checkIn to emit Bus events ===================== */
  if (window.Attendance && !Attendance.__busPatched){
    const _orig = Attendance.checkIn.bind(Attendance);
    Attendance.checkIn = function(sessionId, memberId, method, checkedBy){
      const r = _orig(sessionId, memberId, method, checkedBy);
      try {
        if (r && r.ok) emit('attendance.marked', { session_id:sessionId, member_id:memberId, record:r.record, method });
      } catch(_){}
      return r;
    };
    Attendance.__busPatched = true;
  }

  /* ============================================================
     UI — only active when on attendance.html
     Wraps the existing AttPage with a tabbed enterprise view.
     ============================================================ */
  if (document.body && document.body.dataset.page !== 'attendance') return;
  if (!window.App || !window.UI) return;

  // Seed recurring liturgies once (idempotent)
  try { Liturgy.seedRecurring(4); } catch(_){}

  let activeTab = 'calendar';
  let calRef = new Date();

  const TABS = [
    { id:'calendar',     label:'التقويم',         icon:'fa-calendar' },
    { id:'sessions',     label:'الجلسات',         icon:'fa-list-check' },
    { id:'liturgies',    label:'القداسات',        icon:'fa-church' },
    { id:'meetings',     label:'الاجتماعات',      icon:'fa-people-group' },
    { id:'sundayschool', label:'مدارس الأحد',     icon:'fa-book-open' },
    { id:'visitors',     label:'الزوار',          icon:'fa-user-plus' },
    { id:'qr',           label:'حضور QR',         icon:'fa-qrcode' },
    { id:'intel',        label:'تحليلات ذكية',     icon:'fa-brain' }
  ];

  function header(){
    return `
      <div class="page-header">
        <div>
          <h1 class="page-title">منظومة الحضور الكنسية</h1>
          <p class="page-subtitle">قداسات • اجتماعات • مدارس أحد • مؤتمرات • زوار • QR • تحليلات</p>
        </div>
      </div>
      <div class="card mb-2" style="display:flex;flex-wrap:wrap;gap:.5rem">
        ${TABS.map(t => `<button class="btn ${activeTab===t.id?'btn-primary':'btn-ghost'} btn-sm"
          onclick="AttEntUI.tab('${t.id}')"><i class="fa-solid ${t.icon}"></i> ${t.label}</button>`).join('')}
      </div>
      <div id="att-ent-body"></div>
    `;
  }

  /* ---------- Calendar tab ---------- */
  function renderCalendar(){
    const y = calRef.getFullYear(), m = calRef.getMonth();
    const cells = AttendanceCalendar.month(y, m);
    const monthName = calRef.toLocaleDateString('ar-EG',{month:'long', year:'numeric'});
    const days = ['أحد','اثنين','ثلاثاء','أربعاء','خميس','جمعة','سبت'];
    return `
      <div class="card">
        <div class="flex-between mb-2">
          <div>
            <button class="btn btn-ghost btn-sm" onclick="AttEntUI.shiftMonth(-1)"><i class="fa-solid fa-chevron-right"></i></button>
            <b style="margin:0 .5rem">${monthName}</b>
            <button class="btn btn-ghost btn-sm" onclick="AttEntUI.shiftMonth(1)"><i class="fa-solid fa-chevron-left"></i></button>
            <button class="btn btn-ghost btn-sm" onclick="AttEntUI.today()">اليوم</button>
          </div>
          <div style="font-size:.85rem;color:#64748b">
            <span style="display:inline-block;width:10px;height:10px;background:#7c3aed;border-radius:2px"></span> قداس
            <span style="display:inline-block;width:10px;height:10px;background:#2563eb;border-radius:2px;margin-inline-start:.5rem"></span> اجتماع
            <span style="display:inline-block;width:10px;height:10px;background:#16a34a;border-radius:2px;margin-inline-start:.5rem"></span> مدارس أحد
            <span style="display:inline-block;width:10px;height:10px;background:#f59e0b;border-radius:2px;margin-inline-start:.5rem"></span> حدث
          </div>
        </div>
        <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">
          ${days.map(d=>`<div style="text-align:center;font-weight:600;padding:.25rem;background:#f1f5f9;border-radius:4px">${d}</div>`).join('')}
          ${cells.map(c => {
            if (!c) return `<div></div>`;
            const items = c.items.slice(0,3).map(i => `
              <div title="${i.title}" style="font-size:.7rem;color:#fff;background:${i.color};border-radius:3px;padding:1px 4px;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer"
                   onclick="AttEntUI.openItem('${i.kind}','${i.id}')">${i.title}</div>`).join('');
            const more = c.items.length>3 ? `<div style="font-size:.65rem;color:#64748b">+${c.items.length-3}</div>` : '';
            return `<div style="border:1px solid #e5e7eb;border-radius:6px;min-height:90px;padding:.25rem">
              <div style="font-size:.75rem;color:#64748b">${c.day}</div>${items}${more}
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  /* ---------- Sessions tab ---------- */
  function renderSessions(){
    const sessions = DB.all('attendance_sessions').sort((a,b)=> new Date(b.starts_at)-new Date(a.starts_at)).slice(0,50);
    return `
      <div class="card">
        <div class="flex-between mb-2">
          <div class="card-title"><i class="fa-solid fa-list-check"></i> جلسات الحضور (آخر 50)</div>
          <button class="btn btn-accent btn-sm" onclick="AttPage.newSession()"><i class="fa-solid fa-plus"></i> جلسة جديدة</button>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>النشاط</th><th>العنوان</th><th>الوقت</th><th>الحضور</th><th>الحالة</th><th></th></tr></thead>
          <tbody>${sessions.length ? sessions.map(s=>{
            const stats = Attendance.sessionStats(s.session_id);
            const t = (Attendance.ACTIVITY_TYPES||{})[s.activity_type] || {label:s.activity_type, icon:'fa-circle'};
            return `<tr>
              <td><i class="fa-solid ${t.icon}"></i> ${t.label}</td>
              <td><b>${s.title}</b></td>
              <td>${UI.fmt.dateTime(s.starts_at)}</td>
              <td>${stats.total} <small class="text-muted">(${stats.late} متأخر)</small></td>
              <td><span class="badge badge-${s.status==='open'?'green':'gray'}">${s.status==='open'?'مفتوحة':'مغلقة'}</span></td>
              <td>
                ${s.status==='open' ? `<button class="btn btn-accent btn-sm" onclick="AttPage.openCheckin('${s.session_id}')"><i class="fa-solid fa-check"></i></button>`:''}
                <button class="btn btn-ghost btn-sm" onclick="AttPage.viewSession('${s.session_id}')"><i class="fa-solid fa-eye"></i></button>
              </td></tr>`;
          }).join('') : '<tr><td colspan="6"><div class="empty">لا توجد جلسات</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  /* ---------- Liturgies tab ---------- */
  function renderLiturgies(){
    const rows = Liturgy.list().slice(0,40);
    return `
      <div class="card">
        <div class="flex-between mb-2">
          <div class="card-title"><i class="fa-solid fa-church"></i> القداسات</div>
          <div>
            <button class="btn btn-ghost btn-sm" onclick="AttEntUI.seedLiturgies()"><i class="fa-solid fa-rotate"></i> توليد أسابيع متكررة</button>
            <button class="btn btn-accent btn-sm" onclick="AttEntUI.newLiturgy()"><i class="fa-solid fa-plus"></i> قداس جديد</button>
          </div>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>النوع</th><th>العنوان</th><th>التاريخ</th><th>التكرار</th><th></th></tr></thead>
          <tbody>${rows.length ? rows.map(r => {
            const t = Liturgy.TYPES[r.liturgy_type]||Liturgy.TYPES.custom;
            return `<tr>
              <td><span class="badge" style="background:${t.color};color:#fff">${t.label}</span></td>
              <td>${r.title}</td>
              <td>${UI.fmt.dateTime(r.starts_at)}</td>
              <td>${r.recurrence}</td>
              <td>
                ${r.session_id ? `<button class="btn btn-accent btn-sm" onclick="AttPage.openCheckin('${r.session_id}')"><i class="fa-solid fa-check"></i> تسجيل</button>`:''}
                <button class="btn btn-ghost btn-sm" onclick="AttEntUI.openQR('${r.session_id}')"><i class="fa-solid fa-qrcode"></i></button>
              </td></tr>`;
          }).join('') : '<tr><td colspan="5"><div class="empty">لا توجد قداسات</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  /* ---------- Meetings tab ---------- */
  function renderMeetings(){
    const rows = Meeting.list().slice(0,40);
    return `
      <div class="card">
        <div class="flex-between mb-2">
          <div class="card-title"><i class="fa-solid fa-people-group"></i> الاجتماعات</div>
          <button class="btn btn-accent btn-sm" onclick="AttEntUI.newMeeting()"><i class="fa-solid fa-plus"></i> اجتماع جديد</button>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>النوع</th><th>العنوان</th><th>التاريخ</th><th>التكرار</th><th></th></tr></thead>
          <tbody>${rows.length ? rows.map(r => {
            const t = Meeting.TYPES[r.meeting_type]||Meeting.TYPES.custom;
            return `<tr>
              <td><span class="badge" style="background:${t.color};color:#fff">${t.label}</span></td>
              <td>${r.title}</td>
              <td>${UI.fmt.dateTime(r.starts_at)}</td>
              <td>${r.recurrence}</td>
              <td>${r.session_id ? `<button class="btn btn-accent btn-sm" onclick="AttPage.openCheckin('${r.session_id}')"><i class="fa-solid fa-check"></i></button>`:''}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="5"><div class="empty">لا توجد اجتماعات</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  /* ---------- Sunday School tab ---------- */
  function renderSundaySchool(){
    const next = SundaySchool.nextFriday();
    const rows = SundaySchool.list().slice(0,30);
    return `
      <div class="card">
        <div class="flex-between mb-2">
          <div class="card-title"><i class="fa-solid fa-book-open"></i> مدارس الأحد — الجمعة القادمة: ${next}</div>
        </div>
        <div class="grid grid-4 mb-2">
          ${Object.entries(SundaySchool.STAGES).map(([k,v]) => `
            <div class="kpi-card" style="background:${v.color}22">
              <div class="kpi-label">${v.label}</div>
              <button class="btn btn-accent btn-sm" onclick="AttEntUI.openSS('${k}','${next}')">فتح جلسة</button>
            </div>`).join('')}
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>المرحلة</th><th>التاريخ</th><th></th></tr></thead>
          <tbody>${rows.length ? rows.map(r=>`<tr>
            <td>${SundaySchool.STAGES[r.stage]?.label||r.stage}</td>
            <td>${r.occurs_on}</td>
            <td>${r.session_id?`<button class="btn btn-accent btn-sm" onclick="AttPage.openCheckin('${r.session_id}')"><i class="fa-solid fa-check"></i></button>`:''}</td>
          </tr>`).join('') : '<tr><td colspan="3"><div class="empty">لا توجد جلسات</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  /* ---------- Visitors tab ---------- */
  function renderVisitors(){
    const rows = Visitor.list().slice(0,50);
    return `
      <div class="card">
        <div class="flex-between mb-2">
          <div class="card-title"><i class="fa-solid fa-user-plus"></i> الزوار</div>
          <button class="btn btn-accent btn-sm" onclick="AttEntUI.newVisitor()"><i class="fa-solid fa-plus"></i> تسجيل زائر</button>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الاسم</th><th>هاتف</th><th>كنيسة الأصل</th><th>زيارات</th><th>آخر زيارة</th></tr></thead>
          <tbody>${rows.length ? rows.map(v=>`<tr style="background:#fef3c7">
            <td><i class="fa-solid fa-user-plus" style="color:#d97706"></i> <b>${v.full_name}</b></td>
            <td>${v.phone||'—'}</td>
            <td>${v.home_church||'—'}</td>
            <td>${v.visit_count||0}</td>
            <td>${v.last_visit_at?UI.fmt.relative(v.last_visit_at):'—'}</td>
          </tr>`).join('') : '<tr><td colspan="5"><div class="empty">لا يوجد زوار</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  /* ---------- QR tab ---------- */
  function renderQR(){
    const active = DB.filter('qr_attendance_sessions', q => q.status==='active');
    const openSessions = DB.filter('attendance_sessions', s => s.status==='open');
    return `
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-qrcode"></i> جلسات QR النشطة</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>الجلسة</th><th>الرمز الحالي</th><th>التحديث</th><th>تنتهي</th><th></th></tr></thead>
          <tbody>${active.length ? active.map(q => {
            const s = DB.byId('attendance_sessions','session_id',q.session_id);
            return `<tr>
              <td>${s?s.title:'—'}</td>
              <td><code style="font-size:1.1rem">${q.token}</code></td>
              <td>كل ${q.rotates_every_sec} ث</td>
              <td>${fmtTime(q.expires_at)}</td>
              <td><button class="btn btn-ghost btn-sm" onclick="AttEntUI.expireQR('${q.qr_id}')"><i class="fa-solid fa-xmark"></i> إنهاء</button></td>
            </tr>`;
          }).join('') : '<tr><td colspan="5"><div class="empty">لا توجد جلسات QR نشطة</div></td></tr>'}</tbody>
        </table></div>
        <div class="mt-2">
          <label class="form-label">بدء جلسة QR لجلسة حضور مفتوحة</label>
          <select id="qr-pick-session" class="form-select" style="max-width:400px">
            ${openSessions.map(s=>`<option value="${s.session_id}">${s.title}</option>`).join('')}
          </select>
          <button class="btn btn-accent btn-sm" onclick="AttEntUI.startQR()"><i class="fa-solid fa-play"></i> بدء</button>
        </div>
      </div>`;
  }

  /* ---------- Intelligence tab ---------- */
  function renderIntel(){
    if (!DB.all('attendance_intelligence').length){
      try { AttendanceIntelligence.recompute(); } catch(_){}
    }
    const list = AttendanceIntelligence.list();
    const sevColor = { urgent:'#dc2626', warn:'#ea580c', suggestion:'#0ea5e9', info:'#16a34a' };
    return `
      <div class="card">
        <div class="flex-between mb-2">
          <div class="card-title"><i class="fa-solid fa-brain"></i> تحليلات الحضور الذكية (${list.length})</div>
          <button class="btn btn-ghost btn-sm" onclick="AttEntUI.recomputeIntel()"><i class="fa-solid fa-rotate"></i> إعادة الحساب</button>
        </div>
        ${list.length ? list.map(i => `
          <div style="border-inline-start:4px solid ${sevColor[i.severity]||'#777'};padding:10px 14px;margin:8px 0;background:#fafafa;border-radius:6px">
            <div style="font-weight:bold">${i.headline} <span style="float:left;font-size:.75em;color:#888">ثقة ${i.confidence}%</span></div>
            <div style="font-size:.9em;color:#444">${i.detail||''}</div>
            <div style="font-size:.7em;color:#999">${i.category} • ${i.severity}</div>
          </div>`).join('') : '<div class="empty">لا توجد تحليلات بعد</div>'}
      </div>`;
  }

  /* ---------- body switcher ---------- */
  function body(){
    switch(activeTab){
      case 'sessions':     return renderSessions();
      case 'liturgies':    return renderLiturgies();
      case 'meetings':     return renderMeetings();
      case 'sundayschool': return renderSundaySchool();
      case 'visitors':     return renderVisitors();
      case 'qr':           return renderQR();
      case 'intel':        return renderIntel();
      default:             return renderCalendar();
    }
  }

  function render(){
    try {
      App.render(header());
      const el = document.getElementById('att-ent-body');
      if (el) el.innerHTML = body();
    } catch(e){ console.error('[att-ent UI]', e); }
  }

  window.AttEntUI = {
    tab(id){ activeTab=id; render(); },
    shiftMonth(d){ calRef.setMonth(calRef.getMonth()+d); render(); },
    today(){ calRef = new Date(); render(); },

    seedLiturgies(){
      const out = Liturgy.seedRecurring(4);
      UI.toast(`تم توليد ${out.length} قداس متكرر`,'success');
      render();
    },
    newLiturgy(){
      const types = Object.entries(Liturgy.TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
      UI.modal(`
        <div class="modal-header"><h3>قداس جديد</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="lit-form">
          <div class="form-group"><label class="form-label">النوع</label><select class="form-select" name="liturgy_type">${types}</select></div>
          <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" name="title" placeholder="مثلاً: قداس عيد الميلاد"></div>
          <div class="form-group"><label class="form-label">التاريخ والوقت</label><input class="form-control" type="datetime-local" name="starts_at" value="${new Date().toISOString().slice(0,16)}"></div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="AttEntUI.saveLiturgy()">إنشاء</button>
        </div>`);
    },
    saveLiturgy(){
      const fd = new FormData(document.getElementById('lit-form'));
      const d = Object.fromEntries(fd.entries());
      d.starts_at = new Date(d.starts_at).toISOString();
      Liturgy.create(d);
      UI.closeModal(); UI.toast('تم إنشاء القداس','success'); render();
    },

    newMeeting(){
      const types = Object.entries(Meeting.TYPES).map(([k,v])=>`<option value="${k}">${v.label}</option>`).join('');
      UI.modal(`
        <div class="modal-header"><h3>اجتماع جديد</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="meet-form">
          <div class="form-group"><label class="form-label">النوع</label><select class="form-select" name="meeting_type">${types}</select></div>
          <div class="form-group"><label class="form-label">العنوان</label><input class="form-control" name="title"></div>
          <div class="form-group"><label class="form-label">التاريخ والوقت</label><input class="form-control" type="datetime-local" name="starts_at" value="${new Date().toISOString().slice(0,16)}"></div>
          <div class="form-group"><label class="form-label">التكرار</label>
            <select class="form-select" name="recurrence">
              <option value="none">بدون</option><option value="weekly" selected>أسبوعي</option>
              <option value="biweekly">كل أسبوعين</option><option value="monthly">شهري</option>
            </select>
          </div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="AttEntUI.saveMeeting()">إنشاء</button>
        </div>`);
    },
    saveMeeting(){
      const fd = new FormData(document.getElementById('meet-form'));
      const d = Object.fromEntries(fd.entries());
      d.starts_at = new Date(d.starts_at).toISOString();
      Meeting.create(d);
      UI.closeModal(); UI.toast('تم إنشاء الاجتماع','success'); render();
    },

    openSS(stage, date){
      const r = SundaySchool.open(stage, date);
      UI.toast('جلسة مدارس الأحد جاهزة','success');
      if (r && r.session_id) window.AttPage && AttPage.openCheckin(r.session_id);
      render();
    },

    newVisitor(){
      UI.modal(`
        <div class="modal-header"><h3>تسجيل زائر</h3><button class="icon-btn" onclick="UI.closeModal()"><i class="fa-solid fa-xmark"></i></button></div>
        <div class="modal-body"><form id="vis-form">
          <div class="form-group"><label class="form-label">الاسم الكامل</label><input class="form-control" name="full_name" required></div>
          <div class="form-group"><label class="form-label">هاتف</label><input class="form-control" name="phone"></div>
          <div class="form-group"><label class="form-label">كنيسة الأصل</label><input class="form-control" name="home_church"></div>
          <div class="form-group"><label class="form-label">ملاحظات</label><textarea class="form-control" name="notes"></textarea></div>
        </form></div>
        <div class="modal-footer">
          <button class="btn btn-ghost" onclick="UI.closeModal()">إلغاء</button>
          <button class="btn btn-accent" onclick="AttEntUI.saveVisitor()">حفظ</button>
        </div>`);
    },
    saveVisitor(){
      const fd = new FormData(document.getElementById('vis-form'));
      const d = Object.fromEntries(fd.entries());
      if (!d.full_name) return UI.toast('الاسم مطلوب','error');
      Visitor.register(d);
      UI.closeModal(); UI.toast('تم تسجيل الزائر','success'); render();
    },

    openQR(session_id){
      if (!session_id) return UI.toast('لا توجد جلسة مرتبطة','error');
      const q = QRSession.start(session_id, { rotates_every_sec:30, duration_min:90 });
      if (!q) return UI.toast('تعذر بدء QR','error');
      UI.toast('بدأت جلسة QR','success'); activeTab='qr'; render();
    },
    startQR(){
      const sel = document.getElementById('qr-pick-session');
      if (!sel || !sel.value) return UI.toast('اختر جلسة','error');
      const q = QRSession.start(sel.value, { rotates_every_sec:30, duration_min:90 });
      if (!q) return UI.toast('تعذر بدء QR','error');
      UI.toast('بدأت جلسة QR','success'); render();
    },
    expireQR(qr_id){ QRSession.expire(qr_id); render(); },

    recomputeIntel(){
      const list = AttendanceIntelligence.recompute();
      UI.toast(`تم توليد ${list.length} رؤية`,'success'); render();
    },

    openItem(kind, id){
      if (kind==='liturgy'){
        const r = DB.byId('liturgies', id);
        if (r && r.session_id) AttPage.openCheckin(r.session_id);
      } else if (kind==='meeting'){
        const r = DB.byId('meetings', id);
        if (r && r.session_id) AttPage.openCheckin(r.session_id);
      } else if (kind==='sunday_school'){
        const r = DB.byId('sunday_school_sessions', id);
        if (r && r.session_id) AttPage.openCheckin(r.session_id);
      } else if (kind==='event'){
        const sess = EventAttendance.openSession(id);
        if (sess) AttPage.openCheckin(sess.session_id);
      }
    }
  };

  // Take over the page (the original AttPage IIFE has already rendered).
  try { render(); } catch(e){ console.error('[att-ent boot]', e); }

  // Auto-refresh intelligence + calendar when attendance changes
  if (window.Bus){
    window.Bus.on('attendance.marked', () => {
      if (activeTab==='intel' || activeTab==='calendar') render();
    });
  }
})();
