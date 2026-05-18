/* ============================================================
   APP.js — Bootstrap, UI helpers, Theme, Layout
   ============================================================ */
(function(){
  // Theme
  const Theme = {
    get(){ return localStorage.getItem('theme') || 'light'; },
    set(t){ document.documentElement.dataset.theme = t; localStorage.setItem('theme',t); },
    toggle(){ Theme.set(Theme.get()==='dark' ? 'light' : 'dark'); }
  };
  Theme.set(Theme.get());

  // UI helpers
  const UI = {
    toast(msg, type='info'){
      let c = document.querySelector('.toast-container');
      if (!c){ c=document.createElement('div'); c.className='toast-container'; document.body.appendChild(c); }
      const t = document.createElement('div'); t.className='toast '+type;
      t.innerHTML = `<div>${msg}</div>`;
      c.appendChild(t);
      setTimeout(()=>{ t.style.opacity='0'; setTimeout(()=>t.remove(),300); }, 3000);
    },
    modal(content){
      let b = document.querySelector('.modal-backdrop');
      if (!b){ b=document.createElement('div'); b.className='modal-backdrop'; document.body.appendChild(b); }
      b.innerHTML = `<div class="modal">${content}</div>`;
      b.classList.add('open');
      b.onclick = e => { if (e.target===b) UI.closeModal(); };
      return b;
    },
    closeModal(){ document.querySelector('.modal-backdrop')?.classList.remove('open'); },
    confirm(msg){ return window.confirm(msg); },
    fmt: {
      date(iso){ if (!iso) return '—'; const d=new Date(iso); return d.toLocaleDateString('ar-EG',{year:'numeric',month:'short',day:'numeric'}); },
      dateTime(iso){ if (!iso) return '—'; return new Date(iso).toLocaleString('ar-EG'); },
      relative(iso){
        if (!iso) return '—';
        const diff = Date.now() - new Date(iso).getTime();
        const d = Math.floor(diff/864e5);
        if (d<1) return 'اليوم';
        if (d===1) return 'أمس';
        if (d<7) return `منذ ${d} أيام`;
        if (d<30) return `منذ ${Math.floor(d/7)} أسابيع`;
        if (d<365) return `منذ ${Math.floor(d/30)} شهر`;
        return `منذ ${Math.floor(d/365)} سنة`;
      },
      money(n){ return new Intl.NumberFormat('ar-EG').format(n||0) + ' ج.م'; }
    }
  };
  window.UI = UI;
  window.Theme = Theme;

  /* === LAYOUT (sidebar + topbar) === */
  function renderLayout(activePage){
    const session = Auth.session();
    if (!session) return;
    const isSuper = session.role === 'super_admin';

    const NAV = isSuper ? [
      { section:'المنصة' },
      { id:'super-admin',      label:'لوحة المنصة',       icon:'fa-globe',         href:'super-admin.html' },
      { id:'tenants',          label:'المستأجرون',         icon:'fa-church',        href:'tenants.html' },
      { id:'platform-health',  label:'صحة المنصة',         icon:'fa-heart-pulse',   href:'platform-health.html' },
      { section:'الفوترة' },
      { id:'subscriptions',    label:'الاشتراكات والخطط',  icon:'fa-credit-card',   href:'subscriptions.html' },
      { id:'billing',          label:'الفواتير والمدفوعات', icon:'fa-file-invoice-dollar', href:'billing.html' },
      { section:'الذكاء والتحليل' },
      { id:'usage-analytics',  label:'تحليلات الاستخدام',  icon:'fa-chart-mixed',   href:'usage-analytics.html' },
      { id:'ai-ops',           label:'رؤى AI التشغيلية',   icon:'fa-brain',         href:'ai-ops.html' },
      { section:'العمليات' },
      { id:'white-label',      label:'العلامة التجارية',   icon:'fa-palette',       href:'white-label.html' },
      { id:'support',          label:'مركز الدعم',         icon:'fa-headset',       href:'support.html' },
      { id:'knowledge-base',   label:'قاعدة المعرفة',      icon:'fa-book',          href:'knowledge-base.html' },
      { id:'backups',          label:'النسخ الاحتياطية',   icon:'fa-database',      href:'backups.html' }
    ] : [
      { section:'الرئيسية' },
      { id:'dashboard', label:'لوحة التحكم', icon:'fa-gauge-high', href:'dashboard.html' },
      { id:'supervisor', label:'لوحة مشرف الخدمة', icon:'fa-user-tie', href:'supervisor.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor'] },
      { section:'الأسر والخدمة' },
      { id:'families',   label:'الأسر',         icon:'fa-people-roof',   href:'families.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor','servant_leader','servant','viewer'] },
      { id:'transitions',label:'اقتراحات النقل', icon:'fa-arrow-right-arrow-left', href:'transitions.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor'] },
      { id:'services',   label:'هيكل الخدمة',  icon:'fa-sitemap',       href:'services.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor','servant_leader','servant'] },
      { id:'members',    label:'المخدومين',    icon:'fa-users',         href:'members.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor','servant_leader','servant','viewer'] },
      { id:'users',      label:'المستخدمين',  icon:'fa-user-shield',   href:'users.html', roles:['church_admin','service_admin'] },
      { id:'attendance', label:'الحضور',       icon:'fa-clipboard-check', href:'attendance.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor','servant_leader','servant'] },
      { id:'events',     label:'الفعاليات',   icon:'fa-calendar-days', href:'events.html' },
      { id:'followup',   label:'الافتقاد',    icon:'fa-hand-holding-heart', href:'followup.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor','servant_leader','servant'] },
      { section:'الذكاء والأتمتة' },
      { id:'ai-insights',label:'تحليلات AI',  icon:'fa-brain',         href:'ai-insights.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor','servant_leader','servant'] },
      { id:'analytics',  label:'التحليلات التشغيلية', icon:'fa-chart-mixed', href:'analytics.html',
        roles:['church_admin','service_admin','service_supervisor','supervisor'] },
      { id:'workflows',  label:'Workflows',    icon:'fa-diagram-project', href:'workflows.html',
        roles:['church_admin','service_admin'] },
      { id:'workflow-builder', label:'Workflow Builder', icon:'fa-shapes', href:'workflow-builder.html',
        roles:['church_admin','service_admin'] },
      { id:'notifications', label:'الإشعارات', icon:'fa-bell',         href:'notifications.html' },
      { section:'الماليات (الحسابات فقط)' },
      { id:'finance',    label:'الماليات',    icon:'fa-coins',         href:'finance.html', roles:['church_admin','finance','financial_manager'] },
      { id:'finance-reports', label:'التقارير المالية', icon:'fa-chart-line', href:'finance-reports.html', roles:['church_admin','finance','financial_manager'] },
      { id:'my-billing', label:'اشتراكي وفواتيري', icon:'fa-credit-card', href:'my-billing.html', roles:['church_admin','financial_manager'] },
      { section:'النظام' },
      { id:'white-label',label:'العلامة التجارية', icon:'fa-palette',   href:'white-label.html', roles:['church_admin'] },
      { id:'support',    label:'مركز الدعم',  icon:'fa-headset',       href:'support.html' },
      { id:'knowledge-base', label:'قاعدة المعرفة', icon:'fa-book',    href:'knowledge-base.html' },
      { id:'security',   label:'الأمان',      icon:'fa-shield-halved', href:'security.html', roles:['church_admin'] },
      { id:'settings',   label:'الإعدادات',   icon:'fa-cog',           href:'settings.html', roles:['church_admin'] }
    ];

    const navHtml = NAV.map(item => {
      if (item.section) return `<div class="nav-title">${item.section}</div>`;
      if (item.roles && !item.roles.includes(session.role)) return '';
      const active = item.id === activePage ? 'active' : '';
      return `<a class="nav-link ${active}" href="${item.href}"><i class="fa-solid ${item.icon}"></i> <span>${item.label}</span></a>`;
    }).join('');

    const unread = DB.count('notifications', n => n.user_id===session.user_id && !n.is_read);

    document.body.insertAdjacentHTML('afterbegin', `
      <div class="app">
        <aside class="sidebar" id="sidebar">
          <div class="sidebar-brand">
            <div class="logo">⛪</div>
            <div>
              <div class="title">${session.church_name}</div>
              <div class="sub">${session.church_code || 'Church Platform'}</div>
            </div>
          </div>
          <nav>${navHtml}</nav>
          <div style="margin-top:auto;padding-top:1rem">
            <a class="nav-link" href="#" onclick="Auth.logout();return false"><i class="fa-solid fa-right-from-bracket"></i> <span>تسجيل الخروج</span></a>
          </div>
        </aside>
        <div class="sidebar-overlay" onclick="document.getElementById('sidebar').classList.remove('open');this.classList.remove('show')"></div>
        <div class="main">
          <header class="topbar">
            <button class="menu-toggle" onclick="document.getElementById('sidebar').classList.add('open');document.querySelector('.sidebar-overlay').classList.add('show')">
              <i class="fa-solid fa-bars"></i>
            </button>
            <div class="topbar-search">
              <input placeholder="بحث سريع..." />
              <i class="fa-solid fa-magnifying-glass"></i>
            </div>
            <div class="topbar-actions">
              <button class="icon-btn" onclick="Theme.toggle();location.reload()" title="تبديل الثيم"><i class="fa-solid fa-moon"></i></button>
              <a href="notifications.html" class="icon-btn" title="الإشعارات">
                <i class="fa-solid fa-bell"></i>
                ${unread>0?'<span class="dot"></span>':''}
              </a>
              <div class="user-chip">
                <div class="avatar">${session.full_name.charAt(0)}</div>
                <div>
                  <div class="name">${session.full_name}</div>
                  <div class="role">${roleLabel(session.role)}</div>
                </div>
              </div>
            </div>
          </header>
          <main class="content" id="page-content"></main>
        </div>
      </div>
    `);
  }
  function roleLabel(r){
    return ({
      super_admin:'مدير المنصة', church_admin:'مدير الكنيسة',
      financial_manager:'مدير مالي', servant_leader:'قائد خدمة',
      servant:'خادم', viewer:'عرض فقط', member:'عضو',
      // legacy
      service_supervisor:'مشرف خدمة', service_admin:'أمين الخدمة', supervisor:'مشرف', finance:'محاسب'
    })[r] || r;
  }


  /* === PAGE BOOTSTRAP (v18 — stable + idempotent) === */
  window.App = {
    init(pageId, requiredRoles){
      try{
        const declared = document.body && document.body.dataset && document.body.dataset.page;
        if (declared && pageId && declared !== pageId) return false;
        if (window.__APP_PAGE__ && window.__APP_PAGE__ !== pageId) return false;
        if (!window.Auth || !Auth.require(requiredRoles)) return false;
        window.__APP_PAGE__ = pageId;
        if (!document.querySelector('.app')) renderLayout(pageId);
        setTimeout(() => { try{ window.Permissions && Permissions.applyDomGuards(); }catch(_){} }, 0);
        return true;
      }catch(err){ try{ console.warn('[App.init]', pageId, err); }catch(_){} return false; }
    },
    content(){ return document.getElementById('page-content'); },
    render(html){
      const c = App.content(); if (!c) return;
      c.innerHTML = html;
      try{ window.Permissions && Permissions.applyDomGuards(c); }catch(_){}
    }
  };

  /* === Unified namespace (non-breaking aggregator) === */
  window.ChurchApp = window.ChurchApp || {};
  Object.assign(window.ChurchApp, {
    core: { get Auth(){return window.Auth;}, get Security(){return window.Security;}, get DB(){return window.DB;}, get Bus(){return window.Bus;}, get Events(){return window.Events;} },
    services:     window.ChurchApp.services     || {},
    engines:      window.ChurchApp.engines      || {},
    repositories: window.ChurchApp.repositories || {},
    domains:      window.ChurchApp.domains      || {}
  });

  // Run workflow engine + AI on app start (every page load) — fully fail-safe
  window.addEventListener('DOMContentLoaded', () => {
    try{
      const s = window.Auth && Auth.session(); if (!s) return;
      try{ window.Billing && Billing.runLifecycle && Billing.runLifecycle(); }catch(_){}
      try{ window.Backup  && Backup.schedule    && Backup.schedule(); }catch(_){}
      try{ window.WhiteLabel && WhiteLabel.applyForCurrent && WhiteLabel.applyForCurrent(); }catch(_){}
      if (s.role !== 'super_admin'){
        try{ window.WorkflowEngine && WorkflowEngine.runAll && WorkflowEngine.runAll(); }catch(_){}
        try{ window.AIEngine && AIEngine.recomputeAll && AIEngine.recomputeAll(); }catch(_){}
      }
    }catch(_){}
  });
})();
