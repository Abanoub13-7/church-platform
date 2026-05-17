# Phase 9 — Operational Enterprise Platform

تحويل المنصة من Dashboard / CRUD إلى **Enterprise Operational Church Management Platform**
مع الحفاظ الكامل على الـ Architecture الأصلية (HTML / CSS / Vanilla JS — بدون أي Framework جديد).

## 1) Service Workspaces — `js/service-workspace.js`
كل خدمة (حضانة، ابتدائي، إعدادي، ثانوي، جامعة، شباب) أصبحت **Operational Workspace مستقل**:
- **Service Overview**: المشرف، المكان، المبنى، الدور، الأيام، المواعيد، الفصول، الخدام، المخدومين، الطاقة.
- **Classes & Groups**: الفصول، الخدام المسؤولين، عدد المخدومين، نسبة الحضور، حالة الفصل.
- **Servants**: تقييم كل خادم، نسبة النشاط، الافتقادات، المخدومين، الالتزام، آخر نشاط.
- **Members**: الحضور، الحالات، أعياد ميلاد، آخر حضور، مستوى النشاط.
- **Follow-up & Visitation**: المنقطعين، الحالات الحرجة، المعرضين للانقطاع، سجل الافتقاد.
- **Service Analytics**: نسبة الحضور، الغياب، أداء الخدام، أكثر/أقل الفصول نشاطاً، الافتقاد، الحالات الحرجة.
- **Service Health Score** (Healthy / Warning / Critical) بحساب موزون لـ:
  attendance consistency × servant activity × follow-up completion × member engagement × absence rate.

## 2) Hierarchy
Church → Services → Stages → Groups → Classes → Members — مدعومة في `js/hierarchy.js` ومستخدمة في الـ Workspace + Scoping.

## 3) Operational Supervisor Dashboard — `js/supervisor-page.js`
- بطاقات لكل خدمة مع Health Score ولون حالة.
- تنبيهات AI سياقية في نطاق المشرف فقط.
- تقييم الخدام، نقل/تعيين بين الفصول، فصول ضعيفة/نشطة.
- المشرف لا يرى أي بيانات مالية أو خدمات أخرى أو إعدادات نظام.

## 4) Scoped Permissions — `js/scoped-permissions.js`
طبقة `ScopedPerm` تعتمد على role × service × stage × class × ownership:
- `canViewService / canViewClass / canViewMember`
- `filterServices / filterClasses / filterMembers`
- `canSeeFinance / canSeeMembers / canApproveFinance`
- `guardPage(allowedRoles)`
- Servant → فصله فقط • Supervisor → خدمته فقط • Finance → مالية فقط • Admin → كل شيء.

## 5) Financial Isolation Layer — `js/finance-isolation.js`
- بيانات مالية معزولة بالكامل: ممنوع ظهورها لأي خادم/مشرف/مستخدم عادي.
- workflow: **Request → Financial Review → Admin Approval / Reject → Final Confirmation**.
- API: `createRequest / review / finalApprove / finalReject / listRequests`.
- `guardFinancePage()` يحمي صفحات المالية ويعرض شاشة العزل لغير المخوّلين.

## 6) Context-Aware AI — `js/ai-scope.js`
`AIScope.insightsForCurrentUser()` يولّد تنبيهات في **نطاق المستخدم فقط**:
- الخادم: مخدوميه، المعرضين للغياب، المحتاجين افتقاد، حالات فصله الحرجة.
- المشرف: تحليلات خدمته، الفصول الضعيفة، الخدام غير النشطين.
- لا يتسرب أي شيء خارج النطاق. الفينانس مستثنى من تحليلات المخدومين كليًا.

## 7) Member Management
- حساب العمر تلقائيًا من تاريخ الميلاد (`Hierarchy.ageFromBirth`).
- اكتشاف المرحلة العمرية تلقائيًا (`Hierarchy.stageFromBirth`).
- تذكير أعياد الميلاد (`Hierarchy.birthdaysToday / birthdaysUpcoming`).
- الأطفال: optional member phone، required guardian phone.

## 8) Physical Service Structure
يتم استخدام: location / building / floor / schedule_days / schedule_times / capacity من جدول `services` وعرضها داخل الـ Workspace Overview.

## 9) UI
الواجهات الحالية أصبحت Operational Workspace Interfaces بدلاً من مجرد CRUD Pages، عن طريق Workspace dispatcher داخل `services-page.js` + dashboard المشرف الجديد.

## 10) Backward Compatibility
لم يتم حذف أي ملف. كل التعديلات additive:
- ملفات جديدة: `service-workspace.js`, `scoped-permissions.js`, `finance-isolation.js`, `ai-scope.js`.
- HTML pages تم حقن السكربتات الجديدة فيها فقط.
- `services-page.js` يفتح Workspace بشكل افتراضي مع زر للرجوع للهيكل التقليدي.
- `supervisor-page.js` يضيف Health Score Cards + AI Insights.
- `finance.js` تمت حمايته بـ `FinanceIsolation.guardFinancePage()`.
