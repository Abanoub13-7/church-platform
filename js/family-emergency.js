/* family-emergency.js — Section 10: Emergency contacts + comms log */
(function(){
  if (!window.DB){ console.warn('[family-emergency] DB missing'); return; }
  const TC='family_emergency_contacts', TL='family_emergency_log';
  const Emergency = {
    addContact(c){
      const row=Object.assign({contact_id:DB.uuid(),created_at:new Date().toISOString(),priority:1,is_pickup_authorized:false},c);
      DB.insert(TC,row); return row;
    },
    removeContact(contact_id){ DB.remove(TC,{contact_id}); },
    contactsOf(family_id){
      return (DB.select(TC)||[]).filter(c=>c.family_id===family_id)
        .sort((a,b)=>(a.priority||9)-(b.priority||9));
    },
    log(rec){
      const row=Object.assign({
        log_id:DB.uuid(), occurred_at:new Date().toISOString(),
        severity:'info', channel:'call'
      }, rec);
      DB.insert(TL,row);
      if (row.severity==='urgent'||row.severity==='critical'){
        DB.update('families',{family_id:rec.family_id},{emergency_status:'active'});
      }
      return row;
    },
    logsOf(family_id){
      return (DB.select(TL)||[]).filter(l=>l.family_id===family_id)
        .sort((a,b)=>(b.occurred_at||'').localeCompare(a.occurred_at||''));
    },
    broadcast(family_id, subject, body, channel){
      // Pure JS broadcast — logs every contact; integrators wire real SMS/WhatsApp later
      const contacts=this.contactsOf(family_id);
      contacts.forEach(c=>{
        this.log({family_id, severity:'urgent', channel:channel||'sms',
          subject, body:`${body}\n→ ${c.name} (${c.phone||'-'})`});
      });
      return contacts.length;
    },
    clear(family_id){
      DB.update('families',{family_id},{emergency_status:'none'});
    }
  };
  window.Emergency = Emergency;
})();
