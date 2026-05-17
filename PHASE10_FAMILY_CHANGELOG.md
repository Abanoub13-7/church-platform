# PHASE 10 — FAMILY-CENTERED CHURCH CENSUS & MINISTRY INTELLIGENCE

تحويل النظام من Member-Based إلى Family-Centered بدون كسر الـ Architecture الحالية.

## الإضافات

### 1) Family Entity
- جدول جديد `families` في `data/schema.js` يحتوي على:
  - معرف فريد ثابت `family_code` بصيغة `FAM-YYYY-NNNN`
  - بيانات الأسرة الكاملة (الاسم، العنوان، المنطقة، المدينة، الهاتف، الحالة، التواريخ).
  - بيانات الأب والأم (الاسم، الميلاد، الهاتف، المهنة، الحالة الروحية، الملاحظات).
  - ملاحظات المتابعة والافتقاد، الظروف الخاصة، الطوارئ.
  - حقول `latitude/longitude` جاهزة للخرائط الحرارية مستقبلًا.
- بيانات تجريبية في `data/mock-data.js`.

### 2) Member Linking
- إضافة `family_id` و `family_role` (`father|mother|child|other`) على schema الأعضاء.
- عند إنشاء أسرة جديدة يتم تلقائيًا إنشاء سجلات Member للأب والأم وكل الأبناء (عدد ديناميكي بدون `child1/child2`).
- ربط الأعضاء القدامى بأسر تجريبية.

### 3) Age Engine
- يعتمد على `Hierarchy.ageFromBirth` و `Hierarchy.formatAge` الموجودة (شهور للأصغر / سنوات للأكبر).
- مستخدم في الـ Family Profile وعرض كل فرد ديناميكيًا.

### 4) Stage Assignment Engine
- ملف جديد `js/stage-engine.js`:
  - يفحص كل الأعضاء عند تحميل الصفحة، ويقترح انتقال المرحلة (لا يطبقها تلقائيًا).
  - يستخدم `STAGE_RULES` الحالية (حضانة → KG → ابتدائي → إعدادي → ثانوي → جامعة → شباب → كبار → مسنين).

### 5) Supervisor Approval Layer
- جدول جديد `pending_transitions` في schema.
- صفحة جديدة `transitions.html` + `js/transitions.js`:
  - عرض كل الاقتراحات المعلقة (المخدوم، الأسرة، العمر، المرحلة الحالية، المقترحة، السبب).
  - يستطيع المشرف: Approve / Reject + اختيار الفصل والخادم عند الموافقة.
  - سجل آخر القرارات.
- مرتبط بصلاحيات `church_admin / service_admin / supervisor`.

### 6) Family Dashboard
- صفحة جديدة `families.html` + `js/families.js`:
  - قائمة الأسر، بحث، فلترة بالمنطقة والحالة.
  - KPI cards: إجمالي الأسر / الأفراد / تحتاج افتقاد / النشطة.
  - فورم إنشاء/تعديل أسرة مع إضافة أبناء ديناميكية.
- صفحة جديدة `family-profile.html` + `js/family-profile.js`:
  - عرض الأب، الأم، كل الأبناء.
  - لكل فرد: العمر، المرحلة، الفصل، الخادم، الحالة، آخر حضور.
  - معدل الحضور العام للأسرة، آخر حضور، ملاحظات الافتقاد، الظروف الخاصة، الطوارئ.

### 7) Navigation
- إضافة قسم "الأسر والخدمة" يحتوي على:
  - الأسر
  - اقتراحات النقل
  - هيكل الخدمة
  - المخدومين
  - المستخدمين

## التعديلات على الملفات

- `data/schema.js` — جدولين جديدين + `family_id/family_role` على members.
- `data/mock-data.js` — Seed لـ families + ربط أعضاء قدامى.
- `js/app.js` — تعديل القائمة الجانبية.
- جميع الـ `*.html` (30 صفحة) — تحميل `family-engine.js` و `stage-engine.js`.

## الملفات الجديدة

- `js/family-engine.js`
- `js/stage-engine.js`
- `js/families.js`
- `js/family-profile.js`
- `js/transitions.js`
- `families.html`
- `family-profile.html`
- `transitions.html`

## بدون كسر

- لم يتم تغيير اللغة أو الـ framework.
- لم يتم حذف أي ملف.
- جميع الـ engines الحالية (Workflow, AI, Notifications, Hierarchy, Permissions) تعمل كما هي.
- الـ `DB.js` كما هو — `church_id` scoping يعمل تلقائيًا مع الجداول الجديدة.
- الصلاحيات والـ Multi-Tenant Isolation محفوظة.
