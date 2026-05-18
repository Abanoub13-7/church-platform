/* family-custody.js — Section 9: Legal custody records */
(function(){
  if (!window.DB){ console.warn('[family-custody] DB missing'); return; }
  const T='family_custody_legal';
  const Custody = {
    add(rec){
      const row=Object.assign({
        custody_id:DB.uuid(), created_at:new Date().toISOString(),
        status:'active', custody_type:'none', authority_level:'none'
      }, rec);
      DB.insert(T,row);
      DB.insert('family_movement_log',{
        movement_id:DB.uuid(), church_id:rec.church_id, family_id:rec.family_id,
        kind:'custody_change', from_value:null, to_value:row.custody_type,
        related_id:row.child_id, notes:row.notes||null,
        occurred_at:new Date().toISOString(), created_at:new Date().toISOString()
      });
      return row;
    },
    update(custody_id, patch){ DB.update(T,{custody_id},patch); },
    revoke(custody_id){ DB.update(T,{custody_id},{status:'revoked'}); },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id);
    },
    activeFor(child_id){
      const today=new Date().toISOString().slice(0,10);
      return (DB.select(T)||[]).filter(r=>
        r.child_id===child_id && r.status==='active' &&
        (!r.valid_until || r.valid_until>=today));
    },
    expiringSoon(family_id, days){
      const d=days||30;
      const limit=new Date(Date.now()+d*864e5).toISOString().slice(0,10);
      const today=new Date().toISOString().slice(0,10);
      return this.listByFamily(family_id).filter(r=>
        r.status==='active' && r.valid_until && r.valid_until>=today && r.valid_until<=limit);
    },
    issues(family_id){
      const out=[];
      this.listByFamily(family_id).forEach(r=>{
        const today=new Date().toISOString().slice(0,10);
        if (r.status==='active' && r.valid_until && r.valid_until<today){
          out.push({custody_id:r.custody_id, type:'expired', child_id:r.child_id});
        }
        if (r.custody_type==='temporary' && !r.valid_until){
          out.push({custody_id:r.custody_id, type:'temporary_no_end', child_id:r.child_id});
        }
      });
      return out;
    }
  };
  window.Custody = Custody;
})();
