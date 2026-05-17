/* ============================================================
   FINANCE-ISOLATION.js — Financial Isolation Layer
   ------------------------------------------------------------
   Strict isolation: only finance roles may read finance data.
   All finance writes route through an Approval Workflow:
     Request → Financial Review → Approval/Reject → Admin Escalation → Final Confirmation
   ============================================================ */
(function(){
  const FI = {};
  const STORE = 'finance_requests';

  function sess(){ return window.Auth && Auth.session(); }
  function role(){ return (sess()||{}).role; }
  function isFinance(){ return ['financial_manager','finance'].includes(role()); }
  function isAdmin(){   return ['church_admin','super_admin'].includes(role()); }
  function canRead(){   return isFinance() || isAdmin(); }
  function canApprove(){ return isAdmin(); }   // segregation of duties

  function ensureStore(){
    if (!window.DB) return;
    if (!DB._raw(STORE)) {
      try {
        const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
        all[STORE] = all[STORE] || [];
        localStorage.setItem('church_db_v1', JSON.stringify(all));
      } catch(_){}
    }
  }
  ensureStore();

  /* ---------- Public API ---------- */
  FI.canViewFinance = canRead;
  FI.canApprove     = canApprove;

  FI.guardFinancePage = function(){
    if (!canRead()){
      document.body.innerHTML = `<div style="padding:3rem;text-align:center;font-family:Cairo,sans-serif">
        <i class="fa-solid fa-shield-halved" style="font-size:3rem;color:#dc2626"></i>
        <h2>طبقة العزل المالي</h2>
        <p>البيانات المالية معزولة. صلاحيتك لا تسمح بالوصول.</p>
        <a href="dashboard.html" class="btn">الرجوع</a>
      </div>`;
      return false;
    }
    return true;
  };

  FI.createRequest = function(payload){
    if (!sess()) throw new Error('no session');
    const req = {
      request_id: 'req_' + Math.random().toString(36).slice(2,10),
      church_id: sess().church_id,
      type: payload.type,                    // payment | donation | expense | invoice | refund
      amount: Number(payload.amount||0),
      currency: payload.currency || 'EGP',
      description: payload.description || '',
      requested_by: sess().user_id,
      requested_by_name: sess().full_name,
      status: 'pending_review',
      review_notes: '',
      approval_chain: [],
      created_at: new Date().toISOString()
    };
    saveReq(req);
    audit('finance.request.created', req);
    return req;
  };

  FI.review = function(reqId, action, notes){
    if (!isFinance() && !isAdmin()) throw new Error('not allowed');
    const req = getReq(reqId);
    if (!req) throw new Error('not found');
    if (req.status !== 'pending_review') throw new Error('wrong state');
    req.approval_chain.push({
      step:'review', actor:sess().user_id, action, notes:notes||'', at:new Date().toISOString()
    });
    if (action === 'approve_to_admin') req.status = 'pending_admin_approval';
    else if (action === 'reject')      req.status = 'rejected';
    else                                req.status = 'pending_review';
    saveReq(req);
    audit('finance.request.reviewed', req);
    return req;
  };

  FI.finalApprove = function(reqId, notes){
    if (!canApprove()) throw new Error('only admin can finalize');
    const req = getReq(reqId);
    if (!req) throw new Error('not found');
    if (req.status !== 'pending_admin_approval') throw new Error('not at admin stage');
    req.approval_chain.push({
      step:'final_approval', actor:sess().user_id, action:'approved', notes:notes||'',
      at:new Date().toISOString()
    });
    req.status = 'approved';
    req.approved_at = new Date().toISOString();
    saveReq(req);
    audit('finance.request.approved', req);
    return req;
  };

  FI.finalReject = function(reqId, notes){
    if (!canApprove()) throw new Error('only admin');
    const req = getReq(reqId);
    if (!req) throw new Error('not found');
    req.approval_chain.push({
      step:'final_rejection', actor:sess().user_id, action:'rejected', notes:notes||'',
      at:new Date().toISOString()
    });
    req.status = 'rejected';
    saveReq(req);
    audit('finance.request.rejected', req);
    return req;
  };

  FI.listRequests = function(filter){
    if (!canRead()) return [];
    const all = readAll();
    const ch = (sess()||{}).church_id;
    return all.filter(r => r.church_id===ch && (!filter || !filter.status || r.status===filter.status));
  };

  /* ---------- internal storage ---------- */
  function readAll(){
    try { const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}'); return all[STORE]||[]; }
    catch(_) { return []; }
  }
  function writeAll(list){
    try {
      const all = JSON.parse(localStorage.getItem('church_db_v1')||'{}');
      all[STORE] = list;
      localStorage.setItem('church_db_v1', JSON.stringify(all));
    } catch(_){}
  }
  function getReq(id){ return readAll().find(r => r.request_id===id); }
  function saveReq(req){
    const list = readAll();
    const i = list.findIndex(r => r.request_id===req.request_id);
    if (i>=0) list[i] = req; else list.push(req);
    writeAll(list);
  }
  function audit(ev, data){
    try { window.Audit && Audit.log(ev, { request_id:data.request_id, status:data.status }); } catch(_){}
  }

  window.FinanceIsolation = FI;
})();
