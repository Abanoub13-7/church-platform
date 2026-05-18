/* family-spiritual.js — Section 6: Spiritual life engine */
(function(){
  if (!window.DB){ console.warn('[family-spiritual] DB missing'); return; }
  const T='family_spiritual_records';
  const Spiritual = {
    add(rec){
      const row = Object.assign({
        record_id: DB.uuid(), created_at: new Date().toISOString(),
        status:'completed', score:0
      }, rec);
      DB.insert(T, row); this._touch(rec.family_id); return row;
    },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    summary(family_id){
      const rows=this.listByFamily(family_id);
      const completed=rows.filter(r=>r.status==='completed').length;
      const overdue=rows.filter(r=>r.status==='overdue' || (r.next_due_at && r.next_due_at < new Date().toISOString().slice(0,10) && r.status!=='completed')).length;
      const score = Math.max(0, Math.min(100, 50 + completed*5 - overdue*10));
      let status='unknown';
      if (rows.length===0) status='unknown';
      else if (score>=75) status='growing';
      else if (score>=55) status='stable';
      else if (score>=35) status='declining';
      else status='disconnected';
      return { total:rows.length, completed, overdue, score, status };
    },
    _touch(family_id){
      const s=this.summary(family_id);
      DB.update('families',{family_id},{spiritual_status:s.status, last_activity_at:new Date().toISOString()});
    }
  };
  window.Spiritual = Spiritual;
})();
