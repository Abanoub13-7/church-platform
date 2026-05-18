/* ============================================================
   DB.js — LocalStorage Adapter with Multi-Tenant Isolation
   كل query تلقائياً مقيد بـ church_id الخاص بالـ session
   جاهز للاستبدال بـ REST API / Supabase / Postgres لاحقاً

   v6 refactor:
   - Unified data spine: families → members → services
       → attendance_sessions → attendance_records → followups → notes
   - Generic helpers: DB.insert(table,data) / DB.update(table,id,data)
     / DB.find(table,query) / DB.findAll(table)
   - Table aliasing so legacy calls keep working
       'followups'       <-> 'followup_tasks'
       'notes' (unified) absorbs legacy 'member_notes'
   - One-time migration runs after the cache is loaded.
   ============================================================ */
(function(){
  const STORAGE_KEY = 'church_db_v1';
  let cache = null;

  /* --------- table aliases ---------- */
  // Public/canonical name on the left, physical storage name on the right.
  const TABLE_ALIAS = {
    followups: 'followup_tasks'
  };
  function resolveTable(name){ return TABLE_ALIAS[name] || name; }

  /* --------- primary-key resolver ---------- */
  function pkOf(table){
    const t = resolveTable(table);
    const schema = window.SCHEMA && window.SCHEMA[t];
    if (schema && schema.fields){
      const pk = Object.keys(schema.fields).find(f => schema.fields[f].pk);
      if (pk) return pk;
    }
    // Convention fallback: "<singular>_id"
    return t.replace(/s$/,'') + '_id';
  }

  function load(){
    if (cache) return cache;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw){ cache = JSON.parse(raw); }
    else {
      cache = JSON.parse(JSON.stringify(window.MOCK_DATA || {}));
    }
    ensureCoreCollections();
    runMigrations();
    save();
    return cache;
  }
  function save(){ localStorage.setItem(STORAGE_KEY, JSON.stringify(cache)); }
  function uuid(prefix='id'){ return prefix+'-'+Math.random().toString(36).slice(2,10)+Date.now().toString(36).slice(-4); }

  function ensureCoreCollections(){
    const REQUIRED = [
      'families','members','services',
      'attendance_sessions','attendance_records',
      'followup_tasks','followup_logs',
      'notes'
    ];
    REQUIRED.forEach(t => { if (!Array.isArray(cache[t])) cache[t] = []; });
  }

  /**
   * One-time, idempotent migrations.
   * Guarded by cache.__migrations so they never re-run for the same browser.
   */
  function runMigrations(){
    cache.__migrations = cache.__migrations || {};
    // v6_notes_unify: pull legacy member_notes into the unified `notes` table.
    if (!cache.__migrations.v6_notes_unify){
      const legacy = Array.isArray(cache.member_notes) ? cache.member_notes : [];
      legacy.forEach(n => {
        cache.notes.push({
          note_id: n.note_id || uuid('note'),
          entity_type: 'member',
          entity_id: n.member_id,
          text: n.text || n.body || '',
          date: n.created_at || new Date().toISOString(),
          author_id: n.author_id || null,
          church_id: n.church_id || null
        });
      });
      cache.__migrations.v6_notes_unify = true;
    }
  }

  function getChurchId(){
    const s = window.Auth && Auth.session();
    return s ? s.church_id : null;
  }
  function isSuperAdmin(){
    const s = window.Auth && Auth.session();
    return s && s.role === 'super_admin';
  }

  function scoped(table, rows){
    if (isSuperAdmin()){
      const FORBIDDEN_FOR_SUPER = [
        'members','attendance_records','attendance_sessions','followup_tasks',
        'followup_logs','member_notes','member_risk_scores','financial_transactions',
        'notes','followups','families'
      ];
      if (FORBIDDEN_FOR_SUPER.includes(table)) return [];
      return rows;
    }
    const cid = getChurchId();
    if (!cid) return rows; // pre-login (seed phase) — allow
    return rows.filter(r => r.church_id === cid || r.church_id === null || r.church_id === undefined);
  }

  function matchesQuery(row, query){
    if (typeof query === 'function') return query(row);
    if (!query || typeof query !== 'object') return true;
    return Object.keys(query).every(k => row[k] === query[k]);
  }

  const DB = {
    /* raw access (no scoping) */
    _raw(table){ return load()[resolveTable(table)] || []; },

    /* ----- READ ----- */
    all(table){
      load();
      const t = resolveTable(table);
      return scoped(t, cache[t] || []);
    },
    findAll(table){ return DB.all(table); },

    /**
     * DB.find(table, query)
     *   query: function(row)=>bool   OR   plain object {field:value,...}
     * Returns first match, scoped by tenant.
     */
    find(table, query){
      return DB.all(table).find(r => matchesQuery(r, query));
    },

    /**
     * DB.filter(table, query) — same semantics, all matches.
     */
    filter(table, query){
      return DB.all(table).filter(r => matchesQuery(r, query));
    },

    byId(table, idField, id){
      // Two signatures: byId(table, id) using PK from schema,
      // or legacy byId(table, idField, id).
      if (id === undefined){
        const realId = idField;
        const pk = pkOf(table);
        return DB.find(table, r => r[pk] === realId);
      }
      return DB.find(table, r => r[idField] === id);
    },

    /* ----- WRITE ----- */
    insert(table, row){
      load();
      const t = resolveTable(table);
      const pk = pkOf(table);
      row = { ...row };
      if (!row[pk]) row[pk] = uuid(t.slice(0,3));
      if (!row.created_at) row.created_at = new Date().toISOString();
      if (!row.church_id && !isSuperAdmin()){
        const cid = getChurchId();
        if (cid) row.church_id = cid;
      }
      cache[t] = cache[t] || [];
      cache[t].push(row);
      save();
      DB._emit('insert', t, row);
      return row;
    },

    /**
     * DB.update has TWO supported signatures:
     *   1) DB.update(table, id, patch)                 (NEW – generic)
     *   2) DB.update(table, idField, id, patch)        (LEGACY – explicit PK)
     */
    update(table, a, b, c){
      load();
      const t = resolveTable(table);
      let idField, id, patch;
      if (c === undefined){
        idField = pkOf(table); id = a; patch = b || {};
      } else {
        idField = a; id = b; patch = c || {};
      }
      const list = cache[t] || [];
      // Support object-as-id form: DB.update(table, {field:value,...}, patch)
      let idx;
      if (id !== null && typeof id === 'object'){
        const query = id;
        idx = list.findIndex(r => Object.keys(query).every(k => r[k] === query[k]));
      } else {
        idx = list.findIndex(r => r[idField] === id);
      }
      if (idx < 0) return null;
      if (!isSuperAdmin() && list[idx].church_id && list[idx].church_id !== getChurchId()) return null;
      list[idx] = { ...list[idx], ...patch, updated_at: new Date().toISOString() };
      save();
      DB._emit('update', t, list[idx]);
      return list[idx];
    },

    /**
     * DB.remove(table, id)  OR  DB.remove(table, idField, id)
     */
    remove(table, a, b){
      load();
      const t = resolveTable(table);
      let idField, id;
      if (b === undefined){ idField = pkOf(table); id = a; }
      else                { idField = a; id = b; }
      const list = cache[t] || [];
      const before = list.length;
      cache[t] = list.filter(r => {
        if (r[idField] !== id) return true;
        if (!isSuperAdmin() && r.church_id && r.church_id !== getChurchId()) return true;
        return false;
      });
      save();
      const removed = before !== cache[t].length;
      if (removed) DB._emit('remove', t, { [idField]: id });
      return removed;
    },

    count(table, predicate){
      const rows = DB.all(table);
      return predicate ? rows.filter(predicate).length : rows.length;
    },

    reset(){ localStorage.removeItem(STORAGE_KEY); cache = null; load(); },

    /* simple pub/sub */
    _subs:[],
    on(fn){ DB._subs.push(fn); },
    _emit(op, table, row){ DB._subs.forEach(fn => { try{ fn(op,table,row); }catch(_){} }); }
  };

  // Backwards-compat / convenience aliases used by feature modules
  DB.select = DB.all;
  DB.uuid   = uuid;

  window.DB = DB;

  /* ============================================================
     Notes — unified entity-agnostic notes API
     entity_type: 'family' | 'member' | 'followup' | 'service' | ...
     Persists to the `notes` table via DB.insert/find.
     ============================================================ */
  const Notes = {
    add(entity_type, entity_id, text, extra){
      if (!entity_type || !entity_id || !text) return null;
      return DB.insert('notes', {
        entity_type, entity_id,
        text: String(text),
        date: new Date().toISOString(),
        author_id: (window.Auth && Auth.session()?.user_id) || null,
        ...(extra||{})
      });
    },
    list(entity_type, entity_id){
      return DB.filter('notes', { entity_type, entity_id })
               .sort((a,b)=> new Date(b.date) - new Date(a.date));
    },
    forFamily(family_id){ return Notes.list('family', family_id); },
    forMember(member_id){ return Notes.list('member', member_id); },
    forFollowup(task_id){ return Notes.list('followup', task_id); }
  };
  window.Notes = Notes;
})();
