/* ============================================================
   HIERARCHY.js — Church → Services → Stages → Groups → Classes → Members
   Provides:
   - Age calculation (months/years) from birth_date
   - Auto stage detection from age
   - Scoped queries by role/service/stage/class/ownership
   - Birthday helpers (upcoming + today)
   - Servant assignment helpers
   ============================================================ */
(function(){

  /* ---------- Age & stage rules ---------- */
  const STAGE_RULES = [
    { stage:'nursery',     label:'حضانة',      min:0,  max:3  },
    { stage:'kg',          label:'KG',         min:4,  max:5  },
    { stage:'primary',     label:'ابتدائي',    min:6,  max:11 },
    { stage:'preparatory', label:'إعدادي',     min:12, max:14 },
    { stage:'secondary',   label:'ثانوي',      min:15, max:17 },
    { stage:'university',  label:'جامعة',      min:18, max:23 },
    { stage:'youth',       label:'شباب',       min:24, max:39 },
    { stage:'adult',       label:'كبار',       min:40, max:59 },
    { stage:'senior',      label:'مسنين',      min:60, max:200 }
  ];

  function ageFromBirth(birth){
    if (!birth) return null;
    const b = new Date(birth);
    if (isNaN(b)) return null;
    const now = new Date();
    let years  = now.getFullYear() - b.getFullYear();
    let months = now.getMonth()    - b.getMonth();
    let days   = now.getDate()     - b.getDate();
    if (days < 0) months--;
    if (months < 0){ years--; months += 12; }
    const totalMonths = years*12 + months;
    return { years, months, totalMonths, isInfant: years < 2 };
  }

  function formatAge(birth){
    const a = ageFromBirth(birth);
    if (!a) return '—';
    if (a.years < 2) return `${a.totalMonths} شهر`;
    return `${a.years} سنة`;
  }

  function stageFromBirth(birth){
    const a = ageFromBirth(birth);
    if (!a) return null;
    const rule = STAGE_RULES.find(r => a.years >= r.min && a.years <= r.max);
    return rule ? rule.stage : null;
  }

  function stageLabel(stage){
    return (STAGE_RULES.find(r => r.stage===stage)||{}).label || stage || '—';
  }

  function syncMemberStage(member){
    if (!member) return member;
    if (member.birth_date){
      const auto = stageFromBirth(member.birth_date);
      if (auto && !member._stage_locked) member.age_stage = auto;
    }
    return member;
  }

  /* ---------- Scoping by role ---------- */
  /* Resolve which members/classes the current user can see. */
  function getScope(session){
    session = session || (window.Auth && Auth.session());
    if (!session) return { all:false, members:[], classes:[] };

    // Admin-tier sees everything in tenant
    const ADMIN_ROLES = ['church_admin','service_admin'];
    if (ADMIN_ROLES.includes(session.role)){
      return {
        all: true,
        services: DB.all('services').map(s=>s.service_id),
        stages:   DB.all('service_stages').map(s=>s.stage_id),
        classes:  DB.all('service_classes').map(c=>c.class_id)
      };
    }

    // Service Supervisor — scoped to his service (all stages/classes under it)
    if (session.role === 'service_supervisor' || session.role === 'supervisor'){
      const sups = DB.filter('service_supervisors', s => s.user_id===session.user_id && s.active!==false);
      const serviceIds = [...new Set(sups.map(s=>s.service_id).filter(Boolean))];
      const stages  = DB.filter('service_stages', s => serviceIds.includes(s.service_id)).map(s=>s.stage_id);
      const classes = DB.filter('service_classes', c => serviceIds.includes(c.service_id) || stages.includes(c.stage_id)).map(c=>c.class_id);
      return { all:false, services:serviceIds, stages, classes };
    }

    // Servant — scoped to his classes via servant_assignments
    if (session.role === 'servant' || session.role === 'servant_leader'){
      const asn = DB.filter('servant_assignments', a => a.user_id===session.user_id && a.active!==false);
      const classes = [...new Set(asn.map(a=>a.class_id).filter(Boolean))];
      const cls = DB.filter('service_classes', c => classes.includes(c.class_id));
      const stages   = [...new Set(cls.map(c=>c.stage_id).filter(Boolean))];
      const services = [...new Set(cls.map(c=>c.service_id).filter(Boolean))];
      return { all:false, services, stages, classes };
    }

    // Finance & viewer — see no member scope
    return { all:false, services:[], stages:[], classes:[] };
  }

  function scopedMembers(session){
    const sc = getScope(session);
    const all = DB.all('members');
    if (sc.all) return all;
    return all.filter(m => sc.classes.includes(m.service_class_id));
  }

  function scopedClasses(session){
    const sc = getScope(session);
    const all = DB.all('service_classes');
    if (sc.all) return all;
    return all.filter(c => sc.classes.includes(c.class_id));
  }

  function scopedServants(session){
    const sc = getScope(session);
    if (sc.all) return DB.filter('users', u => ['servant','servant_leader'].includes(u.role));
    const asn = DB.filter('servant_assignments', a => sc.classes.includes(a.class_id) && a.active!==false);
    const ids = [...new Set(asn.map(a=>a.user_id))];
    return DB.filter('users', u => ids.includes(u.user_id));
  }

  /* ---------- Birthday helpers ---------- */
  function birthdaysUpcoming(days){
    days = days || 30;
    const today = new Date(); today.setHours(0,0,0,0);
    const end = new Date(today.getTime() + days*864e5);
    return DB.all('members').filter(m => m.birth_date).map(m => {
      const b = new Date(m.birth_date);
      const nb = new Date(today.getFullYear(), b.getMonth(), b.getDate());
      if (nb < today) nb.setFullYear(today.getFullYear()+1);
      return { member:m, next:nb, daysAway: Math.round((nb-today)/864e5) };
    }).filter(x => x.next <= end).sort((a,b)=>a.next-b.next);
  }

  function birthdaysToday(){
    const t = new Date();
    return DB.all('members').filter(m => {
      if (!m.birth_date) return false;
      const b = new Date(m.birth_date);
      return b.getMonth()===t.getMonth() && b.getDate()===t.getDate();
    });
  }

  /* ---------- Family helpers ---------- */
  function familyOf(member){
    if (!member) return [];
    // siblings = same family_id OR same father_phone+mother_phone fingerprint
    const key = member.family_id || (member.father_phone || member.mother_phone || '');
    if (!key) return [];
    return DB.filter('members', m => {
      if (m.member_id === member.member_id) return false;
      if (member.family_id) return m.family_id === member.family_id;
      return (m.father_phone && m.father_phone === member.father_phone) ||
             (m.mother_phone && m.mother_phone === member.mother_phone);
    });
  }

  /* ---------- Public API ---------- */
  window.Hierarchy = {
    STAGE_RULES, ageFromBirth, formatAge, stageFromBirth, stageLabel,
    syncMemberStage, getScope, scopedMembers, scopedClasses, scopedServants,
    birthdaysUpcoming, birthdaysToday, familyOf
  };
})();
