/* family-movement-ui.js — Section 11: Movement audit UI helpers */
(function(){
  if (!window.DB){ console.warn('[family-movement-ui] DB missing'); return; }
  const KIND_LABEL_AR = {
    transfer:'نقل بين كنائس', address_change:'تغيير عنوان',
    split:'انفصال', merge:'دمج', guardian_change:'تغيير وصي',
    custody_change:'تغيير حضانة', service_change:'تغيير خدمة',
    attendance_pattern_change:'تغير نمط الحضور', status_change:'تغيير حالة',
    member_added:'إضافة فرد', member_removed:'إزالة فرد'
  };
  const MovementUI = {
    timeline(family_id){
      return (DB.select('family_movement_log')||[])
        .filter(m=>m.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    label(kind){ return KIND_LABEL_AR[kind]||kind; },
    renderHTML(family_id){
      const rows=this.timeline(family_id);
      if (!rows.length) return '<div class="muted">لا يوجد سجل حركات.</div>';
      return `<ul class="movement-timeline" style="list-style:none;padding:0">
        ${rows.map(r=>`
          <li style="border-right:3px solid #c79a3a;padding:8px 12px;margin:6px 0;background:#fff8e7;border-radius:6px">
            <div style="font-weight:bold">${MovementUI.label(r.kind)}</div>
            <div style="font-size:.85em;color:#666">
              ${r.from_value?('من: '+r.from_value+' '):''}${r.to_value?('إلى: '+r.to_value):''}
            </div>
            ${r.notes?`<div style="font-size:.85em">${r.notes}</div>`:''}
            <div style="font-size:.75em;color:#999">${(r.occurred_at||'').replace('T',' ').slice(0,16)}</div>
          </li>`).join('')}
      </ul>`;
    }
  };
  window.MovementUI = MovementUI;
})();
