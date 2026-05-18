/* family-workflows.js — Section 13: Automated workflow triggers */
(function(){
  if (!window.DB){ console.warn('[family-workflows] DB missing'); return; }
  const T='family_workflow_triggers';

  function fire(family_id, rule, action, payload){
    const fam=(DB.select('families')||[]).find(f=>f.family_id===family_id);
    if (!fam) return;
    DB.insert(T,{trigger_id:DB.uuid(), church_id:fam.church_id, family_id,
      rule, action, fired_at:new Date().toISOString(), payload:payload||null});
    if (action==='create_followup' && window.DB.select('followup_tasks')!==undefined){
      DB.insert('followup_tasks',{
        task_id:DB.uuid(), church_id:fam.church_id, family_id,
        title:payload?.title || rule, priority:payload?.priority || 'medium',
        status:'open', created_at:new Date().toISOString()
      });
    }
    if (action==='notify' && window.DB.select('notifications')!==undefined){
      DB.insert('notifications',{
        notification_id:DB.uuid(), church_id:fam.church_id, family_id,
        type:payload?.type||'family_workflow', title:payload?.title||rule,
        body:payload?.body||'', severity:payload?.severity||'info',
        created_at:new Date().toISOString()
      });
    }
  }

  const Rules = [
    { id:'financial_drop',
      check(fid){ if (!window.Financial) return null;
        const s=Financial.summary(fid);
        if (s.status==='irregular' || s.status==='dependent')
          return {title:'انخفاض ملحوظ في العطاء — متابعة برعاية', priority:'medium', severity:'warn'};
        return null;
      }, action:'create_followup' },
    { id:'service_inactive',
      check(fid){ if (!window.Serving) return null;
        const s=Serving.summary(fid);
        if (s.status==='inactive')
          return {title:'الأسرة غير منخرطة في الخدمة — اقتراح خدمة مناسبة', priority:'low', severity:'info'};
        return null;
      }, action:'create_followup' },
    { id:'spiritual_decline',
      check(fid){ if (!window.Spiritual) return null;
        const s=Spiritual.summary(fid);
        if (s.status==='declining' || s.status==='disconnected')
          return {title:'تراجع روحي — تواصل من أب الاعتراف', priority:'high', severity:'warn'};
        return null;
      }, action:'create_followup' },
    { id:'custody_expiring',
      check(fid){ if (!window.Custody) return null;
        const e=Custody.expiringSoon(fid,30);
        if (e.length) return {title:`وثيقة حضانة على وشك الانتهاء (${e.length})`, severity:'warn', priority:'high'};
        return null;
      }, action:'notify' },
    { id:'emergency_active',
      check(fid){ const f=(DB.select('families')||[]).find(x=>x.family_id===fid);
        if (f && f.emergency_status==='active')
          return {title:'حالة طارئة نشطة', severity:'urgent'};
        return null;
      }, action:'notify' }
  ];

  function runAll(family_id){
    Rules.forEach(r=>{ try{
      const p=r.check(family_id); if (p) fire(family_id, r.id, r.action, p);
    }catch(e){ console.warn('[workflows]',r.id,e); } });
  }

  function runAllFamilies(){
    (DB.select('families')||[]).forEach(f=>runAll(f.family_id));
  }

  // Hook on inserts to relevant tables
  if (DB.on){
    ['family_financial_records','family_serving_assignments','family_spiritual_records',
     'family_custody_legal','family_emergency_log']
      .forEach(t=>DB.on('insert',t,row=>{ if (row && row.family_id) runAll(row.family_id); }));
  }

  window.FamilyWorkflows = { fire, runAll, runAllFamilies, Rules };
})();
