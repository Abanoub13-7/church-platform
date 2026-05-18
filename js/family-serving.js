/* family-serving.js — Section 7: Serving / ministry engine */
(function(){
  if (!window.DB){ console.warn('[family-serving] DB missing'); return; }
  const T='family_serving_assignments';
  const Serving = {
    assign(rec){
      const row = Object.assign({
        assignment_id: DB.uuid(), created_at:new Date().toISOString(),
        status:'active', hours_per_month:0
      }, rec);
      DB.insert(T,row); this._touch(rec.family_id); return row;
    },
    end(assignment_id, ended_at){
      DB.update(T,{assignment_id},{status:'ended', ended_at: ended_at||new Date().toISOString().slice(0,10)});
    },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id);
    },
    summary(family_id){
      const rows=this.listByFamily(family_id);
      const active=rows.filter(r=>r.status==='active');
      const ministries=[...new Set(active.map(r=>r.ministry))];
      const totalHours=active.reduce((s,r)=>s+(+r.hours_per_month||0),0);
      let status='unknown';
      if (rows.length===0) status='unknown';
      else if (active.length===0) status='inactive';
      else if (active.length>=2 || totalHours>=8) status='serving';
      else status='partial';
      return { total:rows.length, active:active.length, ministries, totalHours, status };
    },
    _touch(family_id){
      const s=this.summary(family_id);
      DB.update('families',{family_id},{service_status:s.status});
    }
  };
  window.Serving = Serving;
})();
