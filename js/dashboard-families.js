/* ============================================================
   dashboard-families.js — "Families at Risk" widget
   Auto-mounts on dashboard.html after page render.
   ============================================================ */
(function(){
  if (!window.DB || !window.FamilyRisk) return;
  if (!/dashboard\.html/.test(location.pathname) && location.pathname !== '/' && !location.pathname.endsWith('/'))
    if (!document.querySelector('script[src*="dashboard.js"]')) return;

  function widgetHtml(){
    try { FamilyRisk.recomputeAll(); } catch(_){}
    const top = FamilyRisk.topAt(8, 'medium');
    const badge = lvl => ({critical:'red',high:'orange',medium:'yellow',low:'green'})[lvl]||'gray';
    const rowsHtml = top.length ? top.map(x => {
      const sc = DB.find('family_scores', { family_id:x.fam.family_id }) || {};
      return `<tr>
        <td><a href="family-profile.html?family_id=${x.fam.family_id}"><b>${x.fam.family_name||x.fam.family_code||'—'}</b></a></td>
        <td><span class="badge badge-${badge(x.level)}">${x.level}</span></td>
        <td>${x.score}</td>
        <td>${sc.attendance_monthly_pct||0}%</td>
        <td>${sc.consecutive_absences||0}</td>
        <td>${sc.engagement_trend||'—'}</td>
      </tr>`;
    }).join('') : '<tr><td colspan="6"><div class="empty">لا توجد أسر بحاجة متابعة 🎉</div></td></tr>';

    return `
      <div class="card mb-2" id="family-risk-widget" style="border-inline-start:4px solid #ef4444">
        <div class="card-title"><i class="fa-solid fa-people-roof"></i> أسر بحاجة متابعة عاجلة</div>
        <div class="table-wrap"><table class="table">
          <thead><tr>
            <th>الأسرة</th><th>المستوى</th><th>النقاط</th>
            <th>حضور شهري</th><th>غياب متتالٍ</th><th>الاتجاه</th>
          </tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table></div>
        <div style="text-align:end;margin-top:.5rem">
          <a class="btn btn-ghost btn-sm" href="families.html"><i class="fa-solid fa-arrow-left"></i> كل الأسر</a>
        </div>
      </div>`;
  }

  function mount(){
    const host = document.getElementById('page-content');
    if (!host || document.getElementById('family-risk-widget')) return;
    // Append at the end of the dashboard content
    host.insertAdjacentHTML('beforeend', widgetHtml());
  }

  // Wait for dashboard to render
  window.addEventListener('DOMContentLoaded', () => {
    setTimeout(mount, 50);
    setTimeout(mount, 250); // safety re-try if dashboard renders late
  });
})();
