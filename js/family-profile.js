/* ============================================================
   FAMILY PROFILE — Enterprise Family Intelligence Dashboard
   Tabs: Overview | Members | Relationship Map | Attendance
         | Risk | Spiritual/Service/Financial | Follow-up | Timeline
   Preserves prior FamilyProfilePage.edit / addChild APIs.
   ============================================================ */
(function(){
  if (!App.init('families')) return;
  const params = new URLSearchParams(location.search);
  const fid = params.get('family_id');
  const family = DB.byId('families','family_id', fid);

  if (!family){
    App.render('<div class="empty"><i class="fa-solid fa-triangle-exclamation"></i> الأسرة غير موجودة <a href="families.html" class="btn btn-primary">عودة</a></div>');
    return;
  }

  // ensure scores are fresh whenever the profile opens
  try { window.FamilyAttendance && FamilyAttendance.recompute(fid); } catch(_){}
  try { window.FamilyRisk       && FamilyRisk.recompute(fid); } catch(_){}

  let activeTab = 'overview';
  const TABS = [
    { id:'overview',   label:'نظرة عامة',     icon:'fa-gauge-high' },
    { id:'members',    label:'الأفراد',        icon:'fa-user-group' },
    { id:'map',        label:'خريطة الأسرة',  icon:'fa-diagram-project' },
    { id:'attendance', label:'الحضور',         icon:'fa-calendar-check' },
    { id:'risk',       label:'المخاطر',        icon:'fa-triangle-exclamation' },
    { id:'status',     label:'الحالة الروحية والخدمية', icon:'fa-cross' },
    { id:'spiritual',  label:'الحياة الروحية', icon:'fa-book-bible' },
    { id:'serving',    label:'الخدمة',          icon:'fa-hands-praying' },
    { id:'financial',  label:'العطاء',          icon:'fa-hand-holding-dollar' },
    { id:'custody',    label:'الحضانة القانونية', icon:'fa-gavel' },
    { id:'emergency',  label:'الطوارئ',         icon:'fa-bell' },
    { id:'ai',         label:'رؤى ذكية',         icon:'fa-brain' },
    { id:'followup',   label:'الافتقاد',       icon:'fa-clipboard-list' },
    { id:'timeline',   label:'السجل التاريخي', icon:'fa-clock-rotate-left' }
  ];

  /* ===================== shared helpers ===================== */
  function badge(level){ return ({critical:'red',high:'orange',medium:'yellow',low:'green'})[level]||'gray'; }
  function statusBadgeClass(s){
    if (s==='active') return 'green';
    if (s==='archived'||s==='suspended') return 'gray';
    if (s==='moved') return 'blue';
    if (s==='under_followup') return 'yellow';
    if (s==='high_risk'||s==='inactive') return 'red';
    return 'gray';
  }
  function memberRow(m){
    const guardians = window.Rel ? Rel.guardiansOf(m.member_id) : [];
    const lastAtt = DB.filter('attendance_records', r => r.member_id===m.member_id)
                      .sort((a,b)=>new Date(b.check_in_at)-new Date(a.check_in_at))[0];
    return `<tr>
      <td><b>${m.full_name}</b></td>
      <td>${m.family_role||'—'}</td>
      <td>${m.gender==='female'?'أنثى':'ذكر'}</td>
      <td>${m.birth_date ? UI.fmt.date(m.birth_date) : '—'}</td>
      <td>${guardians.map(g=>{
            const gm = DB.byId('members','member_id', g.member_id);
            return gm ? `<span class="badge badge-blue" title="${g.kind}">${gm.full_name}</span>` : '';
          }).join(' ') || '—'}</td>
      <td>${lastAtt ? UI.fmt.relative(lastAtt.check_in_at) : '—'}</td>
      <td><span class="badge badge-${m.member_status==='active'?'green':'gray'}">${m.member_status||'—'}</span></td>
    </tr>`;
  }

  /* ===================== tab renderers ===================== */
  function tabOverview(){
    const members = Family.familyMembers(fid);
    const children = Family.familyChildren(fid);
    const rate = Family.familyAttendanceRate(fid);
    const lastVisit = Family.familyLastAttendance(fid);
    const sc = DB.find('family_scores', { family_id:fid }) || {};
    const issues = window.Rel ? Rel.detectIssues(fid) : [];

    return `
      <div class="grid grid-4 mb-2">
        <div class="kpi-card"><div class="kpi-label">الأفراد</div><div class="kpi-value">${members.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">الأبناء</div><div class="kpi-value">${children.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">حضور (60 يومًا)</div><div class="kpi-value">${rate}%</div></div>
        <div class="kpi-card"><div class="kpi-label">آخر حضور</div><div class="kpi-value" style="font-size:1rem">${lastVisit?UI.fmt.relative(lastVisit):'—'}</div></div>
      </div>
      <div class="grid grid-3 mb-2">
        <div class="kpi-card"><div class="kpi-label">حالة الأسرة</div><div class="kpi-value" style="font-size:1rem"><span class="badge badge-${statusBadgeClass(family.family_status)}">${family.family_status||'—'}</span></div></div>
        <div class="kpi-card"><div class="kpi-label">النوع</div><div class="kpi-value" style="font-size:1rem">${family.family_type||'nuclear'}</div></div>
        <div class="kpi-card"><div class="kpi-label">مستوى المخاطر</div><div class="kpi-value" style="font-size:1rem"><span class="badge badge-${badge(sc.risk_level||family.risk_status||'low')}">${sc.risk_level||family.risk_status||'low'}</span> (${sc.risk_total||0}/100)</div></div>
      </div>
      ${issues.length ? `
        <div class="card mb-2" style="border-inline-start:4px solid #f59e0b">
          <div class="card-title"><i class="fa-solid fa-circle-exclamation"></i> تنبيهات على بنية الأسرة (${issues.length})</div>
          <ul style="margin:.5rem 0 0 1rem">
            ${issues.map(i=>`<li><span class="badge badge-${badge(i.level)}">${i.level}</span> ${i.message}</li>`).join('')}
          </ul>
        </div>` : ''}
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-location-dot"></i> الموقع وبيانات الاتصال</div>
        <div class="grid grid-3" style="margin-top:.5rem">
          <div><b>المنطقة:</b> ${family.area||'—'}</div>
          <div><b>المدينة:</b> ${family.city||'—'}</div>
          <div><b>العنوان:</b> ${family.address||'—'}</div>
          <div dir="ltr"><b>هاتف:</b> ${family.primary_phone||'—'}</div>
          <div dir="ltr"><b>بديل:</b> ${family.secondary_phone||'—'}</div>
          <div><b>تسجيل:</b> ${family.registration_date?UI.fmt.date(family.registration_date):'—'}</div>
        </div>
      </div>`;
  }

  function tabMembers(){
    const members = Family.familyMembers(fid);
    return `
      <div class="card mb-2">
        <div class="flex-between">
          <div class="card-title"><i class="fa-solid fa-user-group"></i> أفراد الأسرة (${members.length})</div>
          <button class="btn btn-primary btn-sm" onclick="FamilyProfilePage.addChild()"><i class="fa-solid fa-plus"></i> إضافة فرد</button>
        </div>
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>الاسم</th><th>الدور</th><th>النوع</th><th>الميلاد</th>
            <th>الأولياء</th><th>آخر حضور</th><th>الحالة</th>
          </tr></thead>
          <tbody>${members.length ? members.map(memberRow).join('') :
            '<tr><td colspan="7"><div class="empty">لا يوجد أفراد</div></td></tr>'}</tbody>
        </table></div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-user-shield"></i> الأولياء المعتمدون</div>
        <div class="grid grid-2" style="margin-top:.5rem">
          ${['primary_guardian_id','secondary_guardian_id'].map(k => {
            const m = family[k] ? DB.byId('members','member_id',family[k]) : null;
            const label = k==='primary_guardian_id' ? 'الوليّ الرئيسي' : 'الوليّ الثانوي';
            return `<div><b>${label}:</b> ${m?m.full_name:'<span class="text-muted">— غير محدد —</span>'}</div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function tabMap(){
    if (!window.Rel) return '<div class="empty">محرك العلاقات غير محمّل</div>';
    const g = Rel.graph(fid);
    if (!g) return '<div class="empty">لا توجد بيانات</div>';
    if (!g.nodes.length) return '<div class="empty">لا يوجد أفراد في هذه الأسرة</div>';

    // Layout: guardians row on top, children row on bottom, relatives below.
    const W = 720, RH = 110, NODE_W = 130, NODE_H = 56;
    function row(nodes, y){
      const spacing = nodes.length ? (W - nodes.length*NODE_W) / (nodes.length+1) : 0;
      return nodes.map((n,i)=>({ ...n, x: spacing + i*(NODE_W+spacing), y }));
    }
    const guardians = row(g.guardians, 20);
    const children  = row(g.children,  20 + RH);
    const others    = row(g.nodes.filter(n => n.role_class!=='guardian' && n.role_class!=='child'), 20 + 2*RH);
    const all = [...guardians, ...children, ...others];
    const pos = new Map(all.map(n => [n.member_id, n]));

    const edges = g.edges.map(e => {
      const a = pos.get(e.from), b = pos.get(e.to);
      if (!a||!b) return '';
      const stroke = e.kind==='foster' ? '#a855f7' : e.kind==='custody' ? '#f59e0b'
                   : e.kind==='guardian' ? '#3b82f6' : e.kind==='step' ? '#10b981' : '#64748b';
      const dash = (e.kind==='custody'||e.kind==='foster') ? '6,4' : '0';
      return `<line x1="${a.x+NODE_W/2}" y1="${a.y+NODE_H}" x2="${b.x+NODE_W/2}" y2="${b.y}"
                stroke="${stroke}" stroke-width="2" stroke-dasharray="${dash}"/>`;
    }).join('');

    function nodeSvg(n){
      const fill = n.role_class==='guardian' ? '#dbeafe'
                 : n.role_class==='child'   ? '#dcfce7'
                 : '#f1f5f9';
      const stroke = n.is_primary ? '#1d4ed8' : '#94a3b8';
      const badges = [];
      if (n.is_primary)   badges.push('<tspan fill="#1d4ed8"> ★</tspan>');
      if (n.is_emergency) badges.push('<tspan fill="#dc2626"> ⛑</tspan>');
      if (n.is_pickup)    badges.push('<tspan fill="#059669"> ✓</tspan>');
      const kinds = n.kinds.slice(0,2).join(', ') || '—';
      return `<g transform="translate(${n.x},${n.y})">
        <rect width="${NODE_W}" height="${NODE_H}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="${n.is_primary?2:1}"/>
        <text x="${NODE_W/2}" y="22" text-anchor="middle" font-weight="700" font-size="13">${n.name}${badges.join('')}</text>
        <text x="${NODE_W/2}" y="40" text-anchor="middle" font-size="11" fill="#475569">${kinds}</text>
      </g>`;
    }

    const totalH = 20 + (others.length?3:2)*RH + NODE_H + 20;

    return `
      <div class="card mb-2">
        <div class="card-title"><i class="fa-solid fa-diagram-project"></i> خريطة العلاقات</div>
        <div style="overflow:auto">
          <svg viewBox="0 0 ${W} ${totalH}" style="width:100%;min-width:600px;height:${totalH}px;background:#fafafa;border-radius:8px">
            ${edges}${all.map(nodeSvg).join('')}
          </svg>
        </div>
        <div style="font-size:.8rem;color:#64748b;margin-top:.5rem">
          أزرق = وليّ • أخضر = ابن/ابنة • رمادي = أقارب • متقطع = حضانة / تبنّي
          • ★ وليّ رئيسي • ⛑ طوارئ • ✓ صلاحية استلام
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-table-list"></i> العلاقات المسجلة</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>العضو</th><th>الصلة</th><th>الحضانة</th><th>السلطة</th><th>طوارئ</th><th>استلام</th></tr></thead>
          <tbody>${Rel.list(fid).length ? Rel.list(fid).map(r=>{
            const m = DB.byId('members','member_id', r.member_id);
            return `<tr>
              <td>${m?m.full_name:'—'}</td>
              <td>${r.relationship_kind}</td>
              <td>${r.custody_type||'—'}</td>
              <td>${r.authority_level||'—'}</td>
              <td>${r.is_emergency_contact?'✓':'—'}</td>
              <td>${r.is_pickup_authorized?'✓':'—'}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="6"><div class="empty">لم تُسجَّل علاقات صريحة (يتم الاستدلال من family_role)</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  function tabAttendance(){
    if (!window.FamilyAttendance) return '<div class="empty">محرك الحضور غير محمّل</div>';
    const m = FamilyAttendance.metrics(fid);
    const trendColor = m.engagement_trend==='rising' ? 'green'
                     : m.engagement_trend==='declining' ? 'red'
                     : m.engagement_trend==='stable' ? 'blue' : 'gray';
    return `
      <div class="grid grid-4 mb-2">
        <div class="kpi-card"><div class="kpi-label">حضور أسبوعي</div><div class="kpi-value">${m.weekly_pct}%</div></div>
        <div class="kpi-card"><div class="kpi-label">حضور شهري</div><div class="kpi-value">${m.monthly_pct}%</div></div>
        <div class="kpi-card"><div class="kpi-label">الانتظام (8 أسابيع)</div><div class="kpi-value">${m.consistency_score}%</div></div>
        <div class="kpi-card"><div class="kpi-label">غياب متتالٍ</div><div class="kpi-value">${m.consecutive_absences} أسابيع</div></div>
      </div>
      <div class="grid grid-3 mb-2">
        <div class="kpi-card"><div class="kpi-label">مشاركة الأولياء</div><div class="kpi-value">${m.parent_participation}%</div></div>
        <div class="kpi-card"><div class="kpi-label">مشاركة الأبناء</div><div class="kpi-value">${m.child_participation}%</div></div>
        <div class="kpi-card"><div class="kpi-label">الاتجاه</div><div class="kpi-value" style="font-size:1rem"><span class="badge badge-${trendColor}">${m.engagement_trend}</span></div></div>
      </div>
      ${(m.flags.full_family_absence||m.flags.declining||m.flags.inactive_guardians_active_children) ? `
        <div class="card mb-2" style="border-inline-start:4px solid #ef4444">
          <div class="card-title"><i class="fa-solid fa-bell"></i> تنبيهات الحضور</div>
          <ul style="margin:.5rem 0 0 1rem">
            ${m.flags.full_family_absence ? '<li>غياب كامل للأسرة هذا الشهر</li>':''}
            ${m.flags.declining ? '<li>انخفاض حاد في الحضور خلال الأسابيع الأخيرة</li>':''}
            ${m.flags.inactive_guardians_active_children ? '<li>الأولياء غير حاضرين بينما الأبناء يحضرون</li>':''}
          </ul>
        </div>`:''}
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-fire-flame-curved"></i> خريطة حرارية (آخر 12 أسبوع)</div>
        ${FamilyAttendance.heatmapHtml(fid, 12)}
      </div>`;
  }

  function tabRisk(){
    if (!window.FamilyRisk) return '<div class="empty">محرك المخاطر غير محمّل</div>';
    const r = FamilyRisk.recompute(fid);
    if (!r) return '<div class="empty">لا توجد بيانات</div>';
    const bar = (label, score, max) => {
      const pct = Math.round((score/max)*100);
      return `<div style="margin-bottom:.5rem">
        <div style="display:flex;justify-content:space-between;font-size:.85rem">
          <b>${label}</b><span>${score}/${max}</span></div>
        <div style="background:#e5e7eb;border-radius:6px;height:10px;overflow:hidden">
          <div style="background:${pct>70?'#dc2626':pct>40?'#f59e0b':'#3b82f6'};height:100%;width:${pct}%"></div>
        </div>
      </div>`;
    };
    return `
      <div class="grid grid-3 mb-2">
        <div class="kpi-card"><div class="kpi-label">المخاطر الإجمالية</div>
          <div class="kpi-value"><span class="badge badge-${badge(r.level)}">${r.level}</span> ${r.total}/100</div></div>
        <div class="kpi-card"><div class="kpi-label">درجة الاستقرار</div><div class="kpi-value">${r.stability_score}/100</div></div>
        <div class="kpi-card"><div class="kpi-label">آخر حساب</div><div class="kpi-value" style="font-size:1rem">${UI.fmt.relative(new Date().toISOString())}</div></div>
      </div>
      <div class="card mb-2">
        <div class="card-title"><i class="fa-solid fa-chart-column"></i> تفاصيل المخاطر</div>
        <div style="margin-top:.75rem">
          ${bar('مخاطر الحضور',   r.sub.att.score, 60)}
          ${bar('مخاطر المتابعة', r.sub.fu.score,  25)}
          ${bar('مخاطر الخدمة',   r.sub.sv.score,  15)}
          ${bar('مخاطر مالية',    r.sub.fn.score,  15)}
          ${bar('مخاطر الاستقرار',r.sub.st.score,  35)}
        </div>
      </div>
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-list"></i> أسباب المخاطر</div>
        ${r.reasons.length ? `<ul style="margin:.5rem 0 0 1rem">${r.reasons.map(x=>`<li>${x}</li>`).join('')}</ul>`
          : '<div class="empty">لا توجد عوامل خطر مرصودة</div>'}
      </div>`;
  }

  function tabStatus(){
    const sc = DB.find('family_scores', { family_id:fid }) || {};
    const lines = [
      ['الحالة الروحية', family.spiritual_status||'unknown'],
      ['الحالة الخدمية', family.service_status||'unknown'],
      ['الحالة المالية', family.financial_status||'unknown'],
      ['حالة الطوارئ',  family.emergency_status||'none']
    ];
    return `
      <div class="card mb-2">
        <div class="card-title"><i class="fa-solid fa-cross"></i> الحالة العامة</div>
        <div class="grid grid-2" style="margin-top:.5rem">
          ${lines.map(([k,v])=>`<div><b>${k}:</b> <span class="badge badge-gray">${v}</span></div>`).join('')}
        </div>
        <p class="text-muted mt-2" style="font-size:.85rem">
          محرّكات تفصيل الحالة الروحية / الخدمية / المالية ستُفعَّل كاملةً في الدفعات اللاحقة.
        </p>
      </div>
      <div class="grid grid-2">
        <div class="card"><b>ملاحظات المتابعة:</b><p>${family.followup_notes||'—'}</p></div>
        <div class="card"><b>ملاحظات الافتقاد:</b><p>${family.visitation_notes||'—'}</p></div>
        <div class="card"><b>ظروف خاصة:</b><p>${family.special_conditions||'—'}</p></div>
        <div class="card"><b>طوارئ:</b><p>${family.emergency_notes||'—'}</p></div>
      </div>`;
  }

  function tabFollowup(){
    const members = Family.familyMembers(fid);
    const tasks = DB.filter('followups', t => members.some(m => m.member_id===t.member_id))
                    .sort((a,b)=> new Date(b.created_at) - new Date(a.created_at));
    return `
      <div class="card">
        <div class="card-title"><i class="fa-solid fa-clipboard-list"></i> مهام الافتقاد (${tasks.length})</div>
        <div class="table-wrap"><table class="table">
          <thead><tr><th>المخدوم</th><th>السبب</th><th>الأولوية</th><th>الحالة</th><th>تاريخ</th></tr></thead>
          <tbody>${tasks.length ? tasks.map(t => {
            const m = DB.byId('members','member_id', t.member_id);
            return `<tr>
              <td>${m?m.full_name:'—'}</td>
              <td>${t.reason||'—'}</td>
              <td><span class="badge badge-${t.priority==='urgent'?'red':t.priority==='high'?'orange':'gray'}">${t.priority}</span></td>
              <td><span class="badge badge-${t.status==='done'?'green':t.status==='escalated'?'red':'blue'}">${t.status}</span></td>
              <td>${UI.fmt.relative(t.created_at)}</td>
            </tr>`;
          }).join('') : '<tr><td colspan="5"><div class="empty">لا توجد مهام</div></td></tr>'}</tbody>
        </table></div>
      </div>`;
  }

  function tabTimeline(){
    // Merge legacy movement log + enterprise Timeline engine events
    const movement = (window.Family && Family.movementLog ? Family.movementLog(fid) : [])
      .map(e => ({
        occurred_at: e.occurred_at, title: e.kind, domain:'movement',
        icon: ({transfer:'right-left',address_change:'location-dot',split:'code-branch',
                merge:'code-merge',guardian_change:'user-shield',custody_change:'scale-balanced',
                status_change:'flag',member_added:'user-plus',member_removed:'user-minus'}[e.kind])||'circle-dot',
        detail: (e.from_value||e.to_value) ? `${e.from_value||'—'} → ${e.to_value||'—'}` : (e.notes||'')
      }));
    const tlEvents = (window.Timeline && Timeline.forFamily) ? Timeline.forFamily(fid) : [];
    const all = movement.concat(tlEvents)
      .sort((a,b)=> new Date(b.occurred_at)-new Date(a.occurred_at));
    const body = (window.Timeline && Timeline.renderHTML)
      ? Timeline.renderHTML(all)
      : (all.length ? all.map(e=>`<div style="padding:.5rem;border-bottom:1px solid #eee"><b>${e.title}</b> <span style="color:#94a3b8;font-size:.8rem;float:inline-end">${UI.fmt.relative(e.occurred_at)}</span><div style="color:#64748b;font-size:.85rem">${e.detail||''}</div></div>`).join('') : '<div class="empty">لا توجد أحداث مسجلة</div>');
    return `<div class="card">
      <div class="card-title"><i class="fa-solid fa-clock-rotate-left"></i> السجل التاريخي للأسرة <span style="color:#94a3b8;font-weight:400;font-size:.85rem">(${all.length} حدث)</span></div>
      ${body}
    </div>`;
  }

  function tabBody(){
    switch(activeTab){
      case 'members':    return tabMembers();
      case 'map':        return tabMap();
      case 'attendance': return tabAttendance();
      case 'risk':       return tabRisk();
      case 'status':     return tabStatus();
      case 'spiritual':  return tabSpiritual();
      case 'serving':    return tabServing();
      case 'financial':  return tabFinancial();
      case 'custody':    return tabCustody();
      case 'emergency':  return tabEmergency();
      case 'ai':         return tabAI();
      case 'followup':   return tabFollowup();
      case 'timeline':   return tabTimeline();
      default:           return tabOverview();
    }
  }

  /* ===== Phase 2 tab renderers ===== */
  function rowsTable(headers, rows, empty){
    if (!rows.length) return `<div class="empty">${empty||'لا توجد بيانات'}</div>`;
    return `<div class="table-wrap"><table class="table">
      <thead><tr>${headers.map(h=>`<th>${h}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${c==null?'—':c}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function tabSpiritual(){
    if (!window.Spiritual) return '<div class="empty">وحدة الحياة الروحية غير محملة</div>';
    const s = Spiritual.summary(fid);
    const rows = Spiritual.listByFamily(fid).map(r=>[r.kind, r.status, r.occurred_at, r.next_due_at, r.notes]);
    return `<div class="card">
      <div class="card-title"><i class="fa-solid fa-book-bible"></i> ملخص الحياة الروحية</div>
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">الحالة</div><div class="kpi-value">${s.status}</div></div>
        <div class="kpi-card"><div class="kpi-label">السجلات</div><div class="kpi-value">${s.total}</div></div>
        <div class="kpi-card"><div class="kpi-label">منجزة</div><div class="kpi-value">${s.completed}</div></div>
        <div class="kpi-card"><div class="kpi-label">متأخرة</div><div class="kpi-value">${s.overdue}</div></div>
        <div class="kpi-card"><div class="kpi-label">درجة النمو</div><div class="kpi-value">${s.score}/100</div></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="FamilyProfilePage.addSpiritual()"><i class="fa-solid fa-plus"></i> سجل روحي</button>
      <div class="mt-2">${rowsTable(['النوع','الحالة','تاريخ','الموعد القادم','ملاحظات'], rows, 'لا توجد سجلات روحية')}</div>
    </div>`;
  }

  function tabServing(){
    if (!window.Serving) return '<div class="empty">وحدة الخدمة غير محملة</div>';
    const s = Serving.summary(fid);
    const rows = Serving.listByFamily(fid).map(r=>[r.member_id, r.ministry, r.role, r.status, r.hours_per_month]);
    return `<div class="card">
      <div class="card-title"><i class="fa-solid fa-hands-praying"></i> الخدمة الكنسية</div>
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">الحالة</div><div class="kpi-value">${s.status}</div></div>
        <div class="kpi-card"><div class="kpi-label">مهام نشطة</div><div class="kpi-value">${s.active}</div></div>
        <div class="kpi-card"><div class="kpi-label">عدد الخدمات</div><div class="kpi-value">${s.ministries.length}</div></div>
        <div class="kpi-card"><div class="kpi-label">ساعات/شهر</div><div class="kpi-value">${s.totalHours}</div></div>
      </div>
      <button class="btn btn-primary btn-sm" onclick="FamilyProfilePage.addServing()"><i class="fa-solid fa-plus"></i> تسجيل خدمة</button>
      <div class="mt-2">${rowsTable(['العضو','الخدمة','الدور','الحالة','ساعات/شهر'], rows, 'لا توجد خدمات مسجلة')}</div>
    </div>`;
  }

  function tabFinancial(){
    if (!window.Financial) return '<div class="empty">الوحدة المالية غير محملة</div>';
    const s = Financial.summary(fid);
    const max = Math.max(1, ...s.values);
    const bars = s.months.map((m,i)=>{
      const h = Math.round((s.values[i]/max)*60);
      return `<div style="display:inline-block;width:32px;text-align:center;margin:0 2px">
        <div style="height:60px;display:flex;align-items:flex-end;justify-content:center">
          <div style="width:18px;height:${h}px;background:#c79a3a;border-radius:3px 3px 0 0"></div>
        </div>
        <div style="font-size:.7em;color:#666">${m.slice(5)}</div>
      </div>`;
    }).join('');
    const rows = Financial.listByFamily(fid).slice(0,20).map(r=>[r.occurred_at, r.kind, r.amount+' '+r.currency, r.method, r.notes]);
    return `<div class="card">
      <div class="card-title"><i class="fa-solid fa-hand-holding-dollar"></i> العطاء والمساعدات</div>
      <div class="kpi-row">
        <div class="kpi-card"><div class="kpi-label">الحالة</div><div class="kpi-value">${s.status}</div></div>
        <div class="kpi-card"><div class="kpi-label">إجمالي العطاء (6 شهور)</div><div class="kpi-value">${s.totalIn}</div></div>
        <div class="kpi-card"><div class="kpi-label">مساعدات صادرة</div><div class="kpi-value">${s.assistance}</div></div>
        <div class="kpi-card"><div class="kpi-label">انتظام</div><div class="kpi-value">${s.consistencyPct}%</div></div>
      </div>
      <div class="mt-2" style="text-align:center">${bars}</div>
      <button class="btn btn-primary btn-sm mt-2" onclick="FamilyProfilePage.addFinancial()"><i class="fa-solid fa-plus"></i> تسجيل عطاء</button>
      <div class="mt-2">${rowsTable(['تاريخ','نوع','مبلغ','وسيلة','ملاحظات'], rows, 'لا توجد سجلات مالية')}</div>
    </div>`;
  }

  function tabCustody(){
    if (!window.Custody) return '<div class="empty">وحدة الحضانة غير محملة</div>';
    const rows = Custody.listByFamily(fid).map(r=>[r.child_id, r.guardian_id, r.custody_type, r.authority_level, r.status, r.valid_until]);
    const issues = Custody.issues(fid);
    return `<div class="card">
      <div class="card-title"><i class="fa-solid fa-gavel"></i> الحضانة القانونية</div>
      ${issues.length?`<div class="alert alert-warn">${issues.length} مشكلة حضانة تحتاج مراجعة</div>`:''}
      <button class="btn btn-primary btn-sm" onclick="FamilyProfilePage.addCustody()"><i class="fa-solid fa-plus"></i> سجل حضانة</button>
      <div class="mt-2">${rowsTable(['الطفل','الوصي','نوع الحضانة','السلطة','الحالة','ساري حتى'], rows, 'لا توجد وثائق حضانة')}</div>
    </div>`;
  }

  function tabEmergency(){
    if (!window.Emergency) return '<div class="empty">وحدة الطوارئ غير محملة</div>';
    const contacts = Emergency.contactsOf(fid).map(c=>[c.priority, c.name, c.phone, c.relation, c.is_pickup_authorized?'نعم':'لا']);
    const logs = Emergency.logsOf(fid).slice(0,20).map(l=>[(l.occurred_at||'').slice(0,16), l.severity, l.channel, l.subject, l.body]);
    return `<div class="card">
      <div class="card-title"><i class="fa-solid fa-bell"></i> جهات الطوارئ</div>
      <button class="btn btn-primary btn-sm" onclick="FamilyProfilePage.addEmergencyContact()"><i class="fa-solid fa-plus"></i> إضافة جهة</button>
      <button class="btn btn-warn btn-sm" onclick="FamilyProfilePage.broadcastEmergency()"><i class="fa-solid fa-broadcast-tower"></i> بث طارئ</button>
      <div class="mt-2">${rowsTable(['أولوية','الاسم','هاتف','صلة','استلام أطفال'], contacts, 'لا توجد جهات طوارئ')}</div>
      <div class="card-title mt-2"><i class="fa-solid fa-clock"></i> سجل التواصل الطارئ</div>
      ${rowsTable(['وقت','خطورة','قناة','موضوع','تفاصيل'], logs, 'لا يوجد سجل تواصل')}
    </div>`;
  }

  function tabAI(){
    if (!window.FamilyAI) return '<div class="empty">طبقة الرؤى الذكية غير محملة</div>';
    let list = FamilyAI.listByFamily(fid);
    if (!list.length){ FamilyAI.compute(fid); list = FamilyAI.listByFamily(fid); }
    const sevColor = {urgent:'#c0392b', warn:'#e67e22', suggestion:'#2980b9', info:'#27ae60'};
    return `<div class="card">
      <div class="card-title"><i class="fa-solid fa-brain"></i> رؤى ذكية للأسرة</div>
      <button class="btn btn-ghost btn-sm" onclick="FamilyAI.compute('${fid}'); FamilyProfilePage.setTab('ai')"><i class="fa-solid fa-rotate"></i> إعادة الحساب</button>
      <div class="mt-2">
        ${list.map(i=>`
          <div style="border-right:4px solid ${sevColor[i.severity]||'#777'};padding:10px 14px;margin:8px 0;background:#fafafa;border-radius:6px">
            <div style="font-weight:bold">${i.headline} <span style="float:left;font-size:.75em;color:#888">ثقة ${i.confidence}%</span></div>
            <div style="font-size:.9em;color:#444">${i.detail||''}</div>
            <div style="font-size:.7em;color:#999">${i.category} • ${i.severity}</div>
          </div>`).join('')}
      </div>
    </div>`;
  }

  function render(){
    const tabs = TABS.map(t => `
      <button class="btn ${activeTab===t.id?'btn-primary':'btn-ghost'} btn-sm"
              onclick="FamilyProfilePage.setTab('${t.id}')">
        <i class="fa-solid ${t.icon}"></i> ${t.label}
      </button>`).join(' ');

    App.render(`
      <div class="page-header">
        <div>
          <a href="families.html" class="btn btn-ghost btn-sm"><i class="fa-solid fa-arrow-right"></i> العودة</a>
          <h1 class="page-title">${family.family_name} <code style="margin-inline-start:.5rem;font-size:.7em">${family.family_code}</code></h1>
          <p class="page-subtitle">${family.area||'—'} ${family.city?'• '+family.city:''} • ${family.address||''}</p>
        </div>
        <div class="flex gap-sm">
          <button class="btn btn-accent" onclick="FamilyProfilePage.edit()"><i class="fa-solid fa-pen"></i> تعديل</button>
        </div>
      </div>

      <div class="card mb-2" style="display:flex;flex-wrap:wrap;gap:.5rem">${tabs}</div>

      <div id="family-tab-body">${tabBody()}</div>
    `);
  }

  window.FamilyProfilePage = {
    setTab(id){ activeTab = id; render(); },
    edit(){ location.href = 'families.html?edit='+fid; },
    addChild(){
      const name = prompt('اسم الابن/الابنة:');
      if (!name) return;
      const gender = confirm('ذكر؟ (إلغاء = أنثى)') ? 'male':'female';
      const birth = prompt('تاريخ الميلاد (YYYY-MM-DD):') || null;
      Family.addChild(fid, { full_name:name, gender, birth_date:birth });
      try { Family.logMovement && Family.logMovement(fid, 'member_added', null, name); } catch(_){}
      UI.toast('تمت إضافة الفرد','success');
      try { FamilyAttendance.recompute(fid); FamilyRisk.recompute(fid); } catch(_){}
      render();
    },
    addSpiritual(){
      if (!window.Spiritual) return;
      const kind = prompt('نوع السجل (baptism/communion/confession/prayer_life/bible_class/...):','prayer_life');
      if (!kind) return;
      const occurred_at = prompt('تاريخ (YYYY-MM-DD):', new Date().toISOString().slice(0,10));
      const notes = prompt('ملاحظات:','')||null;
      Spiritual.add({church_id:family.church_id, family_id:fid, kind, occurred_at, notes, status:'completed', score:5});
      UI.toast('تم تسجيل النشاط الروحي','success'); render();
    },
    addServing(){
      if (!window.Serving) return;
      const member_id = prompt('معرّف العضو:'); if (!member_id) return;
      const ministry = prompt('الخدمة:'); if (!ministry) return;
      const role = prompt('الدور:','')||null;
      const hrs = parseInt(prompt('ساعات/شهر:','4'))||0;
      Serving.assign({church_id:family.church_id, family_id:fid, member_id, ministry, role, hours_per_month:hrs, started_at:new Date().toISOString().slice(0,10)});
      UI.toast('تم تسجيل الخدمة','success'); render();
    },
    addFinancial(){
      if (!window.Financial) return;
      const kind = prompt('النوع (tithe/donation/pledge/assistance_in/assistance_out):','tithe'); if (!kind) return;
      const amount = parseFloat(prompt('المبلغ:','0'))||0;
      const occurred_at = prompt('التاريخ (YYYY-MM-DD):', new Date().toISOString().slice(0,10));
      const method = prompt('وسيلة (cash/bank/online/in_kind):','cash');
      Financial.record({church_id:family.church_id, family_id:fid, kind, amount, occurred_at, method});
      UI.toast('تم تسجيل العطاء','success'); render();
    },
    addCustody(){
      if (!window.Custody) return;
      const child_id = prompt('معرّف الطفل:'); if (!child_id) return;
      const guardian_id = prompt('معرّف الوصي (اختياري):','')||null;
      const custody_type = prompt('نوع الحضانة (full/shared/temporary/emergency/foster/court_ordered):','full');
      const authority_level = prompt('السلطة (none/limited/full/legal):','full');
      const valid_until = prompt('ساري حتى (YYYY-MM-DD):','')||null;
      const doc_ref = prompt('مرجع الوثيقة:','')||null;
      Custody.add({church_id:family.church_id, family_id:fid, child_id, guardian_id, custody_type, authority_level, valid_until, doc_ref});
      UI.toast('تم تسجيل الحضانة','success'); render();
    },
    addEmergencyContact(){
      if (!window.Emergency) return;
      const name = prompt('اسم جهة الطوارئ:'); if (!name) return;
      const phone = prompt('هاتف:','')||null;
      const relation = prompt('صلة:','')||null;
      const priority = parseInt(prompt('أولوية (1-9):','1'))||1;
      const is_pickup_authorized = confirm('مصرح باستلام الأطفال؟');
      Emergency.addContact({church_id:family.church_id, family_id:fid, name, phone, relation, priority, is_pickup_authorized});
      UI.toast('تمت إضافة جهة الطوارئ','success'); render();
    },
    broadcastEmergency(){
      if (!window.Emergency) return;
      const subject = prompt('موضوع البث الطارئ:'); if (!subject) return;
      const body = prompt('نص الرسالة:','')||'';
      const channel = prompt('قناة (sms/whatsapp/call):','sms');
      const n = Emergency.broadcast(fid, subject, body, channel);
      UI.toast(`تم تسجيل البث لـ ${n} جهة`,'success'); render();
    },
    clearEmergency(){ if (window.Emergency) { Emergency.clear(fid); UI.toast('تم إنهاء الحالة الطارئة','success'); render(); } }
  };
  render();
})();
