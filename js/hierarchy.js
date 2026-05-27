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

/* ============================================================
   HIERARCHY TREE ENGINE — Phase 1 (additive)
   Church → Sector → Service → Class → Group → Members
   Stable parent/child relations, recursive rendering, search,
   breadcrumbs, DnD reorder, role-aware visibility, mobile-aware.
   ============================================================ */
(function(){
  if (!window.Hierarchy) return; // safety
  const H = window.Hierarchy;
  const LEVELS = ['church','sector','service','class','group','member'];
  const LEVEL_LABEL = { church:'كنيسة', sector:'قطاع', service:'خدمة', class:'فصل', group:'مجموعة', member:'مخدوم' };
  const LEVEL_ICON  = { church:'fa-church', sector:'fa-diagram-project', service:'fa-sitemap', class:'fa-chalkboard-user', group:'fa-people-group', member:'fa-user' };

  function db(t){ try { return DB.all(t)||[]; } catch(_){ return []; } }
  function uniq(arr){ return [...new Set(arr.filter(Boolean))]; }

  // Build a tree from existing tables. We DO NOT migrate data —
  // we derive a unified node shape on read so existing pages keep working.
  function getTree(opts){
    opts = opts || {};
    const include = opts.include || ['church','sector','service','class','group','member'];
    const session = (window.Auth && Auth.session()) || null;
    const scope = session ? H.getScope(session) : { all:true };

    function node(type, id, name, parentId, extra){
      return Object.assign({
        id, type, name,
        parent_id: parentId || null,
        hierarchy_level: LEVELS.indexOf(type),
        church_id: extra && extra.church_id || (session && session.church_id) || null,
        tenant_id: extra && extra.tenant_id || (session && session.tenant_id) || null,
        status: (extra && extra.status) || 'active',
        visibility: (extra && extra.visibility) || 'visible',
        order_index: (extra && extra.order_index) || 0,
        created_at: extra && extra.created_at,
        updated_at: extra && extra.updated_at,
        children: []
      }, extra||{});
    }

    const churches = db('churches');
    const root = churches[0]
      ? node('church', churches[0].church_id, churches[0].church_name || churches[0].name || 'الكنيسة', null, churches[0])
      : node('church', 'root', (session && session.church_name) || 'الكنيسة', null, {});

    const sectors  = db('sectors');
    const services = db('services');
    const stages   = db('service_stages');
    const classes  = db('service_classes');
    const groups   = db('groups').length ? db('groups') : db('small_groups');
    const members  = db('members');

    function passesScope(level, id){
      if (!session || scope.all) return true;
      if (level === 'service') return (scope.services||[]).includes(id);
      if (level === 'class')   return (scope.classes||[]).includes(id);
      return true;
    }

    // Sectors
    if (include.includes('sector')) sectors.forEach(s => {
      root.children.push(node('sector', s.sector_id, s.name || s.sector_name, root.id, s));
    });

    // Services (attach to sector if matched, else root)
    if (include.includes('service')) services.forEach(s => {
      if (!passesScope('service', s.service_id)) return;
      const parent = s.sector_id && root.children.find(c => c.id === s.sector_id) || root;
      parent.children.push(node('service', s.service_id, s.name || s.service_name, parent.id, s));
    });

    function findNode(n, pred){
      if (pred(n)) return n;
      for (const c of n.children || []){ const r = findNode(c, pred); if (r) return r; }
      return null;
    }

    // Classes (stages may exist between service & class — flatten classes to service for cleaner UI)
    if (include.includes('class')) classes.forEach(c => {
      if (!passesScope('class', c.class_id)) return;
      const svcNode = findNode(root, n => n.type==='service' && n.id===c.service_id);
      const host = svcNode || root;
      host.children.push(node('class', c.class_id, c.name || c.class_name, host.id, c));
    });

    // Groups
    if (include.includes('group')) groups.forEach(g => {
      const host = findNode(root, n => n.type==='class' && n.id === (g.class_id || g.service_class_id)) || root;
      host.children.push(node('group', g.group_id || g.id, g.name || g.group_name || 'مجموعة', host.id, g));
    });

    // Members (leaves)
    if (include.includes('member')){
      const memberList = (session && !scope.all) ? H.scopedMembers(session) : members;
      memberList.forEach(m => {
        const host = findNode(root, n => n.type==='class' && n.id===m.service_class_id) || root;
        host.children.push(node('member', m.member_id,
          m.full_name || m.name || ((m.first_name||'')+' '+(m.last_name||'')).trim() || 'بدون اسم',
          host.id, Object.assign({ status: m.status || 'active', _record: m })));
      });
    }

    // Sort by order_index, then name
    (function sort(n){
      n.children.sort((a,b) => (a.order_index||0)-(b.order_index||0) || String(a.name).localeCompare(String(b.name),'ar'));
      n.children.forEach(sort);
    })(root);

    // Counts
    (function count(n){
      n.children.forEach(count);
      n.member_count = n.type==='member' ? 1 : n.children.reduce((s,c)=>s+(c.member_count||0),0);
    })(root);

    return root;
  }

  function flatten(node, out){
    out = out || [];
    out.push(node);
    (node.children||[]).forEach(c => flatten(c, out));
    return out;
  }
  function findById(root, id){ return flatten(root).find(n => n.id === id) || null; }
  function breadcrumb(root, id){
    const path = [];
    (function walk(n, trail){
      const next = trail.concat([n]);
      if (n.id === id){ path.push(...next); return true; }
      for (const c of n.children||[]) if (walk(c, next)) return true;
      return false;
    })(root, []);
    return path;
  }
  function search(root, q){
    if (!q) return flatten(root);
    const needle = String(q).toLowerCase();
    return flatten(root).filter(n => String(n.name).toLowerCase().includes(needle));
  }

  // Validate the tree: no loops, no level reversal, no orphans.
  function validateTree(root){
    const errors = [], seen = new Set();
    (function walk(n, depth){
      if (seen.has(n.id)) { errors.push({ id:n.id, msg:'loop or duplicate id' }); return; }
      seen.add(n.id);
      (n.children||[]).forEach(c => {
        if (c.parent_id !== n.id) errors.push({ id:c.id, msg:'parent mismatch' });
        if (c.hierarchy_level <= n.hierarchy_level) errors.push({ id:c.id, msg:'level reversal' });
        walk(c, depth+1);
      });
    })(root, 0);
    return { ok: errors.length===0, errors };
  }

  /* ---------- UI RENDERER (vanilla, no deps) ---------- */
  function escape(s){ return String(s==null?'':s).replace(/[&<>"']/g, ch => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[ch])); }

  function nodeRow(n, depth, opts){
    const collapsible = (n.children && n.children.length>0);
    const meta = n.type==='member'
      ? `<span class="tree-meta">${escape(n.status||'')}</span>`
      : `<span class="tree-meta">${n.member_count||0} مخدوم</span>`;
    const drag = opts.dnd ? `draggable="true" data-drag-id="${escape(n.id)}"` : '';
    return `
      <div class="tree-node tree-${n.type}" data-id="${escape(n.id)}" data-level="${n.hierarchy_level}" ${drag}>
        <div class="tree-row" style="padding-inline-start:${depth*1.1}rem" tabindex="0">
          <button class="tree-twisty" aria-label="توسيع" ${collapsible?'':'style="visibility:hidden"'}>
            <i class="fa-solid fa-chevron-left"></i>
          </button>
          <i class="fa-solid ${LEVEL_ICON[n.type]||'fa-circle'} tree-icon"></i>
          <span class="tree-name">${escape(n.name)}</span>
          ${meta}
        </div>
        ${collapsible ? `<div class="tree-children" hidden>${(n.children||[]).map(c => nodeRow(c, depth+1, opts)).join('')}</div>` : ''}
      </div>`;
  }

  function render(container, opts){
    opts = opts || {};
    const root = opts.root || getTree(opts.tree || {});
    const html = `
      <div class="tree-toolbar">
        <div class="tree-search">
          <i class="fa-solid fa-magnifying-glass"></i>
          <input type="search" placeholder="ابحث في الهيكل..." />
        </div>
        <div class="tree-actions">
          <button class="btn btn-sm" data-tree-expand><i class="fa-solid fa-down-left-and-up-right-to-center"></i> توسيع الكل</button>
          <button class="btn btn-sm" data-tree-collapse><i class="fa-solid fa-up-right-and-down-left-from-center"></i> طي الكل</button>
        </div>
      </div>
      <div class="tree-breadcrumb" data-tree-bc></div>
      <div class="tree-body">${nodeRow(root, 0, opts)}</div>`;
    container.innerHTML = html;

    const body = container.querySelector('.tree-body');
    // Twisty toggle
    body.addEventListener('click', e => {
      const t = e.target.closest('.tree-twisty');
      if (!t) return;
      const node = t.closest('.tree-node');
      const kids = node.querySelector(':scope > .tree-children');
      if (!kids) return;
      const open = !kids.hasAttribute('hidden');
      if (open){ kids.setAttribute('hidden',''); t.querySelector('i').className='fa-solid fa-chevron-left'; }
      else     { kids.removeAttribute('hidden'); t.querySelector('i').className='fa-solid fa-chevron-down'; }
    });
    // Row click → breadcrumb + onSelect
    body.addEventListener('click', e => {
      const row = e.target.closest('.tree-row');
      if (!row || e.target.closest('.tree-twisty')) return;
      const id = row.parentElement.dataset.id;
      body.querySelectorAll('.tree-row.is-active').forEach(r => r.classList.remove('is-active'));
      row.classList.add('is-active');
      const trail = breadcrumb(root, id);
      const bc = container.querySelector('[data-tree-bc]');
      bc.innerHTML = trail.map(n => `<span><i class="fa-solid ${LEVEL_ICON[n.type]||'fa-circle'}"></i> ${escape(n.name)}</span>`).join('<i class="fa-solid fa-angle-left sep"></i>');
      if (opts.onSelect) opts.onSelect(findById(root, id));
    });
    // Expand / collapse all
    container.querySelector('[data-tree-expand]').onclick = ()=> body.querySelectorAll('.tree-children').forEach(c=>{ c.removeAttribute('hidden'); });
    container.querySelector('[data-tree-collapse]').onclick = ()=> body.querySelectorAll('.tree-children').forEach(c=>{ c.setAttribute('hidden',''); });
    // Search filter
    const search = container.querySelector('.tree-search input');
    search.addEventListener('input', () => {
      const q = search.value.trim().toLowerCase();
      body.querySelectorAll('.tree-node').forEach(node => {
        const name = (node.querySelector('.tree-name')?.textContent||'').toLowerCase();
        const match = !q || name.includes(q);
        node.style.display = match ? '' : 'none';
        if (match && q){ // open ancestors
          let p = node.parentElement;
          while (p && p.classList && p.classList.contains('tree-children')){ p.removeAttribute('hidden'); p = p.parentElement?.parentElement; }
        }
      });
    });
    // Drag and drop (basic reorder within same parent type)
    if (opts.dnd){
      let dragId = null;
      body.addEventListener('dragstart', e => {
        const n = e.target.closest('[data-drag-id]'); if (!n) return;
        dragId = n.dataset.dragId; n.classList.add('is-dragging');
      });
      body.addEventListener('dragend', e => {
        body.querySelectorAll('.is-dragging').forEach(n => n.classList.remove('is-dragging'));
      });
      body.addEventListener('dragover', e => { e.preventDefault(); });
      body.addEventListener('drop', e => {
        e.preventDefault();
        const target = e.target.closest('[data-drag-id]');
        if (!target || !dragId || target.dataset.dragId === dragId) return;
        if (opts.onReorder) opts.onReorder(dragId, target.dataset.dragId);
      });
    }
    return root;
  }

  // Extend the public API (non-breaking — keeps existing keys)
  Object.assign(H, {
    LEVELS, LEVEL_LABEL, LEVEL_ICON,
    getTree, flatten, findById, breadcrumb, search, validateTree, render
  });
})();
