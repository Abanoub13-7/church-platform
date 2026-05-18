/* family-financial.js — Section 8: Financial engine (read/aggregate) */
(function(){
  if (!window.DB){ console.warn('[family-financial] DB missing'); return; }
  const T='family_financial_records';
  const Financial = {
    record(rec){
      const row = Object.assign({
        record_id:DB.uuid(), created_at:new Date().toISOString(),
        amount:0, currency:'EGP', method:'cash',
        occurred_at:new Date().toISOString().slice(0,10)
      }, rec);
      DB.insert(T,row); this._touch(rec.family_id); return row;
    },
    listByFamily(family_id){
      return (DB.select(T)||[]).filter(r=>r.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    summary(family_id){
      const rows=this.listByFamily(family_id);
      const now=new Date();
      const cutoff=new Date(now.getFullYear(),now.getMonth()-5,1).toISOString().slice(0,10);
      const recent=rows.filter(r=>r.occurred_at>=cutoff);
      const monthly={};
      recent.forEach(r=>{
        const k=(r.occurred_at||'').slice(0,7);
        const sign = (r.kind==='assistance_out')?-1:1;
        monthly[k]=(monthly[k]||0)+sign*(+r.amount||0);
      });
      const months=Object.keys(monthly).sort();
      const values=months.map(m=>monthly[m]);
      const totalIn=recent.filter(r=>r.kind!=='assistance_out').reduce((s,r)=>s+(+r.amount||0),0);
      const assistance=recent.filter(r=>r.kind==='assistance_out').reduce((s,r)=>s+(+r.amount||0),0);
      // consistency: % months with any contribution out of last 6
      const last6=[];
      for (let i=5;i>=0;i--){ const d=new Date(now.getFullYear(),now.getMonth()-i,1);
        last6.push(d.toISOString().slice(0,7)); }
      const active=last6.filter(m=>(monthly[m]||0)>0).length;
      const consistencyPct=Math.round(active/6*100);
      let status='unknown';
      if (recent.length===0) status='unknown';
      else if (assistance>totalIn) status='assisted';
      else if (consistencyPct>=80) status='consistent';
      else if (consistencyPct>=40) status='irregular';
      else status='dependent';
      return { totalIn, assistance, months:last6, values:last6.map(m=>monthly[m]||0), consistencyPct, status };
    },
    _touch(family_id){
      const s=this.summary(family_id);
      DB.update('families',{family_id},{financial_status:s.status});
    }
  };
  window.Financial = Financial;
})();
