/* family-ai.js — Section 14: AI insights layer (heuristic, offline) */
(function(){
  if (!window.DB){ console.warn('[family-ai] DB missing'); return; }
  const T='family_ai_insights';

  function push(family_id, church_id, ins){
    DB.insert(T, Object.assign({
      insight_id:DB.uuid(), church_id, family_id,
      computed_at:new Date().toISOString(), confidence:65
    }, ins));
  }

  function compute(family_id){
    const fam=(DB.select('families')||[]).find(f=>f.family_id===family_id);
    if (!fam) return [];
    // Clear previous snapshot
    (DB.select(T)||[]).filter(i=>i.family_id===family_id).forEach(i=>DB.remove(T,{insight_id:i.insight_id}));
    const out=[];
    function add(o){ push(family_id, fam.church_id, o); out.push(o); }

    if (window.FamilyAttendance){
      const a=FamilyAttendance.summary(family_id);
      if (a.consecutive_absences>=3) add({category:'attendance',severity:'urgent',
        headline:`غياب متتالي ${a.consecutive_absences} مرات`,
        detail:'يُنصح بزيارة بيتيّة عاجلة وتفعيل خدمة رعوية مكثفة.', confidence:85});
      else if (a.engagement_trend==='declining') add({category:'attendance',severity:'warn',
        headline:'تراجع تدريجي في الحضور', detail:'تواصل ودي + دعوة للأنشطة القادمة.', confidence:70});
      else if (a.attendance_monthly_pct>=80) add({category:'attendance',severity:'info',
        headline:'عائلة منتظمة الحضور', detail:'مرشحة لخدمة قيادية أو رعاية أسرة أخرى.', confidence:75});
    }
    if (window.Spiritual){
      const s=Spiritual.summary(family_id);
      if (s.status==='disconnected') add({category:'spiritual',severity:'urgent',
        headline:'انقطاع روحي واضح', detail:'إسناد أب اعتراف وبرنامج عودة تدريجي.', confidence:80});
      else if (s.overdue>0) add({category:'spiritual',severity:'suggestion',
        headline:`${s.overdue} استحقاق روحي متأخر`, detail:'جدولة الأسرار/الدروس المتأخرة.', confidence:70});
    }
    if (window.Serving){
      const s=Serving.summary(family_id);
      if (s.status==='inactive') add({category:'serving',severity:'suggestion',
        headline:'لا توجد خدمة نشطة', detail:'اقترح خدمات تناسب أعمار ومواهب الأعضاء.', confidence:65});
      else if (s.active>=3) add({category:'serving',severity:'info',
        headline:`عائلة خادمة بقوة (${s.active} مهام)`,
        detail:'انتبه لخطر الإرهاق — راجع توزيع الأعباء.', confidence:60});
    }
    if (window.Financial){
      const f=Financial.summary(family_id);
      if (f.status==='dependent' || f.status==='assisted') add({category:'financial',severity:'warn',
        headline:'الأسرة في وضع يحتاج دعم', detail:'فعّل لجنة المحبة + متابعة شهرية سرية.', confidence:75});
      else if (f.status==='consistent') add({category:'financial',severity:'info',
        headline:'عطاء منتظم', detail:'يمكن دعوتهم لرعاية مالية لأسرة أخرى.', confidence:60});
    }
    if (window.Custody){
      const issues=Custody.issues(family_id);
      if (issues.length) add({category:'risk',severity:'urgent',
        headline:`مشاكل حضانة (${issues.length})`, detail:'مراجعة وثائق الحضانة المنتهية/غير المكتملة.', confidence:90});
    }
    if (window.Rel){
      const probs=Rel.detectIssues(family_id);
      if (probs.length) add({category:'relationships',severity:'warn',
        headline:`مشاكل بنية أسرية (${probs.length})`,
        detail:'أعضاء بدون أوصياء أو علاقات ناقصة — راجع شجرة العائلة.', confidence:80});
    }
    if (fam.risk_status==='critical') add({category:'risk',severity:'urgent',
      headline:'الأسرة في خطر حرج', detail:'فعّل بروتوكول الرعاية الطارئة الشامل.', confidence:95});

    if (out.length===0) add({category:'general',severity:'info',
      headline:'الوضع العام مستقر', detail:'لا توجد إشارات تستدعي تدخلاً الآن.', confidence:55});
    return out;
  }

  function listByFamily(family_id){
    return (DB.select(T)||[]).filter(i=>i.family_id===family_id)
      .sort((a,b)=>(b.computed_at||'').localeCompare(a.computed_at||''));
  }

  function computeAll(){ (DB.select('families')||[]).forEach(f=>compute(f.family_id)); }

  window.FamilyAI = { compute, computeAll, listByFamily };
})();
