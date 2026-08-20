const API_BASE_URL = 'https://real-time-school-minotring-system.onrender.com';
const token = localStorage.getItem('token');
let currentUser = null;
let tenants = [];
let users = [];
let currentLang = localStorage.getItem('language') || 'ar';

const I18N = {
  ar: {"overview":"لوحة التحكم","tenants":"المؤسسات","users":"المستخدمون","activity":"النشاطات","health":"حالة النظام","logout":"تسجيل الخروج","overview_title":"نظرة عامة","overview_desc":"مراقبة شاملة لجميع المؤسسات والمستخدمين.","refresh":"تحديث","user_distribution":"توزيع المستخدمين","student_status":"حالة الطلاب","tenants_title":"المؤسسات","tenants_desc":"إنشاء وإدارة المؤسسات المستقلة.","new_tenant":"مؤسسة جديدة","tenant":"المؤسسة","key":"المفتاح","students":"الطلاب","status":"الحالة","action":"إجراء","users_title":"المستخدمون","users_desc":"إدارة الحسابات داخل جميع المؤسسات.","new_user":"مستخدم جديد","all_roles":"كل الأدوار","admin":"مدير","teacher":"موظف","parent":"ولي أمر","all_tenants":"كل المؤسسات","user":"المستخدم","role":"الدور","phone":"الهاتف","created_at":"تاريخ الإنشاء","activity_title":"النشاطات","activity_desc":"آخر الأحداث المسجلة في النظام.","health_title":"حالة النظام","health_desc":"مراقبة API وقاعدة البيانات والبيئة.","check_now":"فحص الآن","active_alerts":"تنبيهات نشطة","admin_plural":"مدراء","teacher_plural":"موظفون","parent_plural":"أولياء أمور","registration_code":"رمز التسجيل","generate_code":"إنشاء رمز","rotate_code":"تجديد الرمز","deactivate_code":"تعطيل الرمز","activate_code":"تفعيل الرمز","copy_code":"نسخ الرمز","code_warning":"احتفظ بهذا الرمز. لن يظهر النص الكامل مرة أخرى بعد إغلاق النافذة.","code_created":"تم إنشاء رمز التسجيل","no_code":"لا يوجد رمز تسجيل","code_active":"نشط","code_inactive":"معطل","max_uses":"عدد الاستخدامات (0 = غير محدود)","expires_at":"تاريخ الانتهاء (اختياري)","code_last4":"آخر 4 أحرف","code_uses":"الاستخدامات","cancel":"إلغاء","create":"إنشاء","save":"حفظ","edit_tenant":"تعديل المؤسسة","add_tenant":"إضافة مؤسسة","add_user":"إنشاء مستخدم","name":"الاسم","email":"البريد","password":"كلمة المرور","key_label":"المفتاح التقني","new_role":"الدور الجديد: admin / teacher / parent","no_tenants":"لا توجد مؤسسات.","no_users":"لا توجد حسابات.","no_activity":"لا توجد نشاطات حديثة.","active":"نشطة","disabled":"معطلة","inside":"داخل المؤسسة","outside":"خارج المؤسسة","pending_leaves":"طلبات أعذار معلقة","api_unavailable":"تعذر الوصول إلى الخادم.","system_ok":"يعمل بشكل طبيعي","create_tenant_success":"تم إنشاء المؤسسة","create_user_success":"تم إنشاء المستخدم","saved_success":"تم الحفظ","role_updated":"تم تحديث الدور","tenant_status_updated":"تم تحديث حالة المؤسسة","confirm_disable_tenant":"تعطيل المؤسسة؟","confirm_enable_tenant":"تفعيل المؤسسة؟","confirm_deactivate_code":"تعطيل الرمز؟","confirm_activate_code":"تفعيل الرمز؟","required_fields":"يرجى ملء جميع الحقول واختيار المؤسسة","service":"الخدمة الرئيسية","database":"قاعدة البيانات","environment":"البيئة","nodejs":"Node.js","working":"يعمل بشكل طبيعي","unavailable":"غير متاح","uptime":"مدة التشغيل: {minutes} دقيقة","add_tenant_title":"إضافة مؤسسة","tenant_name":"اسم المؤسسة","example_school":"مثال: مدرسة الأمل","technical_key":"المفتاح التقني","example_key":"al-amal","edit_tenant_title":"تعديل المؤسسة","new_user_title":"إنشاء مستخدم","user_role_prompt":"الدور الجديد: admin / teacher / parent","confirm_disable":"تعطيل المؤسسة؟","confirm_enable":"تفعيل المؤسسة؟","active_status":"نشطة","disabled_status":"معطلة","ok":"موافق"},
  fr: {"overview":"Tableau de bord","tenants":"Établissements","users":"Utilisateurs","activity":"Activité","health":"État du système","logout":"Déconnexion","overview_title":"Vue d’ensemble","overview_desc":"Surveillance globale de tous les établissements et utilisateurs.","refresh":"Actualiser","user_distribution":"Répartition des utilisateurs","student_status":"État des élèves","tenants_title":"Établissements","tenants_desc":"Créer et gérer les établissements indépendants.","new_tenant":"Nouvel établissement","tenant":"Établissement","key":"Clé","students":"Élèves","status":"Statut","action":"Action","users_title":"Utilisateurs","users_desc":"Gérer les comptes de tous les établissements.","new_user":"Nouvel utilisateur","all_roles":"Tous les rôles","admin":"Administrateur","teacher":"Employé","parent":"Parent","all_tenants":"Tous les établissements","user":"Utilisateur","role":"Rôle","phone":"Téléphone","created_at":"Date de création","activity_title":"Activité","activity_desc":"Derniers événements enregistrés dans le système.","health_title":"État du système","health_desc":"Surveillance de l’API, de la base de données et de l’environnement.","check_now":"Vérifier maintenant","active_alerts":"Alertes actives","admin_plural":"Administrateurs","teacher_plural":"Employés","parent_plural":"Parents","registration_code":"Code d’inscription","generate_code":"Générer le code","rotate_code":"Renouveler le code","deactivate_code":"Désactiver le code","activate_code":"Activer le code","copy_code":"Copier le code","code_warning":"Conservez ce code. Le code complet ne sera plus affiché après fermeture.","code_created":"Code d’inscription créé","no_code":"Aucun code d’inscription","code_active":"Actif","code_inactive":"Désactivé","max_uses":"Nombre d’utilisations (0 = illimité)","expires_at":"Date d’expiration (optionnel)","code_last4":"4 derniers caractères","code_uses":"Utilisations","cancel":"Annuler","create":"Créer","save":"Enregistrer","edit_tenant":"Modifier l’établissement","add_tenant":"Ajouter un établissement","add_user":"Créer un utilisateur","name":"Nom","email":"E-mail","password":"Mot de passe","key_label":"Clé technique","new_role":"Nouveau rôle : admin / teacher / parent","no_tenants":"Aucun établissement.","no_users":"Aucun compte.","no_activity":"Aucune activité récente.","active":"Actives","disabled":"Désactivé","inside":"À l’intérieur de l’établissement","outside":"À l’extérieur de l’établissement","pending_leaves":"Demandes d’absence en attente","api_unavailable":"Impossible d’accéder au serveur.","system_ok":"Fonctionne normalement","create_tenant_success":"Établissement créé","create_user_success":"Utilisateur créé","saved_success":"Enregistré","role_updated":"Rôle mis à jour","tenant_status_updated":"Statut de l’établissement mis à jour","confirm_disable_tenant":"Désactiver l’établissement ?","confirm_enable_tenant":"Activer l’établissement ?","confirm_deactivate_code":"Désactiver le code ?","confirm_activate_code":"Activer le code ?","required_fields":"Veuillez remplir tous les champs et choisir un établissement","service":"Service principal","database":"Base de données","environment":"Environnement","nodejs":"Node.js","working":"Fonctionnement normal","unavailable":"Indisponible","uptime":"Durée : {minutes} min","add_tenant_title":"Ajouter un établissement","tenant_name":"Nom de l’établissement","example_school":"Ex. : École Al Amal","technical_key":"Clé technique","example_key":"al-amal","edit_tenant_title":"Modifier l’établissement","new_user_title":"Créer un utilisateur","user_role_prompt":"Nouveau rôle : admin / teacher / parent","confirm_disable":"Désactiver l’établissement ?","confirm_enable":"Activer l’établissement ?","active_status":"Actif","disabled_status":"Désactivé","ok":"OK"},
  en: {"overview":"Dashboard","tenants":"Institutions","users":"Users","activity":"Activity","health":"System Health","logout":"Logout","overview_title":"Overview","overview_desc":"Global monitoring of all institutions and users.","refresh":"Refresh","user_distribution":"User distribution","student_status":"Student status","tenants_title":"Institutions","tenants_desc":"Create and manage independent institutions.","new_tenant":"New institution","tenant":"Institution","key":"Key","students":"Students","status":"Status","action":"Action","users_title":"Users","users_desc":"Manage accounts across all institutions.","new_user":"New user","all_roles":"All roles","admin":"Admin","teacher":"Staff","parent":"Parent","all_tenants":"All institutions","user":"User","role":"Role","phone":"Phone","created_at":"Created","activity_title":"Activity","activity_desc":"Latest events recorded in the system.","health_title":"System health","health_desc":"Monitor API, database and environment.","check_now":"Check now","active_alerts":"Active alerts","admin_plural":"Admins","teacher_plural":"Staff","parent_plural":"Parents","registration_code":"Registration Code","generate_code":"Generate code","rotate_code":"Rotate code","deactivate_code":"Deactivate code","activate_code":"Activate code","copy_code":"Copy code","code_warning":"Keep this code safe. The full code will not be shown again after closing this window.","code_created":"Registration code created","no_code":"No registration code","code_active":"Active","code_inactive":"Disabled","max_uses":"Maximum uses (0 = unlimited)","expires_at":"Expiration date (optional)","code_last4":"Last 4 characters","code_uses":"Uses","cancel":"Cancel","create":"Create","save":"Save","edit_tenant":"Edit institution","add_tenant":"Add institution","add_user":"Create user","name":"Name","email":"Email","password":"Password","key_label":"Technical key","new_role":"New role: admin / teacher / parent","no_tenants":"No institutions.","no_users":"No accounts.","no_activity":"No recent activity.","active":"Active","disabled":"Disabled","inside":"Inside institution","outside":"Outside institution","pending_leaves":"Pending leave requests","api_unavailable":"Unable to reach the server.","system_ok":"Operating normally","create_tenant_success":"Institution created","create_user_success":"User created","saved_success":"Saved","role_updated":"Role updated","tenant_status_updated":"Institution status updated","confirm_disable_tenant":"Disable institution?","confirm_enable_tenant":"Enable institution?","confirm_deactivate_code":"Deactivate code?","confirm_activate_code":"Activate code?","required_fields":"Please fill all fields and select an institution","service":"Main service","database":"Database","environment":"Environment","nodejs":"Node.js","working":"Operating normally","unavailable":"Unavailable","uptime":"Uptime: {minutes} min","add_tenant_title":"Add institution","tenant_name":"Institution name","example_school":"e.g. Al Amal School","technical_key":"Technical key","example_key":"al-amal","edit_tenant_title":"Edit institution","new_user_title":"Create user","user_role_prompt":"New role: admin / teacher / parent","confirm_disable":"Disable institution?","confirm_enable":"Enable institution?","active_status":"Active","disabled_status":"Disabled","ok":"OK"}
};


I18N.ar.unauthorized='غير مصرح لك'; I18N.fr.unauthorized='Non autorisé'; I18N.en.unauthorized='Unauthorized';
I18N.ar.request_failed='فشل الطلب'; I18N.fr.request_failed='Échec de la requête'; I18N.en.request_failed='Request failed';

function t(k){ return I18N[currentLang]?.[k] || I18N.ar[k] || k; }
function escapeHtml(v){ return String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function api(path, options={}) {
  return fetch(API_BASE_URL + path, {
    ...options,
    headers: { 'Content-Type':'application/json', ...(options.headers||{}), Authorization:`Bearer ${token}` }
  }).then(async r => {
    const data = await r.json().catch(()=>({}));
    if (r.status === 401 || r.status === 403) {
      if (r.status === 401) logout();
      throw new Error(data.message || 'غير مصرح لك');
    }
    if (!r.ok) throw new Error(data.message || 'فشل الطلب');
    return data;
  });
}
function toast(msg){const e=document.getElementById('toast');e.textContent=msg;e.classList.add('show');setTimeout(()=>e.classList.remove('show'),2800);}
function showError(err){const e=document.getElementById('errorBox');e.textContent=err.message||String(err);e.hidden=false;setTimeout(()=>e.hidden=true,5000);}
function date(v){
  if(!v) return '—';
  const locale = currentLang==='ar'?'ar-DZ':currentLang==='fr'?'fr-FR':'en-US';
  return new Intl.DateTimeFormat(locale,{
    timeZone:'Africa/Algiers',
    dateStyle:'medium',
    timeStyle:'short'
  }).format(new Date(v));
}
function roleLabel(r){return {admin:t('admin'),teacher:t('teacher'),parent:t('parent'),super_admin:'Super Admin'}[r]||r;}
function initials(name){return String(name||'SA').split(/\s+/).slice(0,2).map(x=>x[0]||'').join('').toUpperCase();}

async function boot(){
  if(!token){ location.href='../index.html'; return; }
  try{
    const me=await api('/api/auth/me');
    currentUser=me.user;
    if(currentUser.role!=='super_admin'){ location.href='../index.html'; return; }
    document.getElementById('userName').textContent=currentUser.name||'Super Admin';
    document.getElementById('userEmail').textContent=currentUser.email||'';
    document.getElementById('userAvatar').textContent=initials(currentUser.name);
    bind();
    applyLang();
    await Promise.all([loadOverview(),loadTenants(),loadUsers(),loadActivity(),loadHealth()]);
    showSection('overview');
  }catch(e){showError(e);}
}

function bind(){
  document.querySelectorAll('.nav-item').forEach(b=>b.addEventListener('click',()=>showSection(b.dataset.section)));
  document.querySelectorAll('[data-lang]').forEach(b=>b.addEventListener('click',()=>{
    const nextLang=b.dataset.lang;
    if(nextLang===currentLang) return;
    currentLang=nextLang;
    localStorage.setItem('language',currentLang);
    window.location.reload();
  }));
  document.getElementById('mobileMenu').onclick=()=>document.querySelector('.sidebar').classList.toggle('open');
  document.getElementById('logoutBtn').onclick=logout;
  document.getElementById('refreshOverview').onclick=loadOverview;
  document.getElementById('refreshUsers').onclick=loadUsers;
  document.getElementById('refreshActivity').onclick=loadActivity;
  document.getElementById('refreshHealth').onclick=loadHealth;
  document.getElementById('addTenantBtn').onclick=tenantModal;
  document.getElementById('addUserBtn').onclick=userModal;
  document.getElementById('userRoleFilter').onchange=loadUsers;
  document.getElementById('userTenantFilter').onchange=loadUsers;
  document.getElementById('closeModal').onclick=closeModal;
  document.getElementById('modal').addEventListener('click',e=>{if(e.target.id==='modal')closeModal();});
}
function applyLang(){
  const isArabic = currentLang === 'ar';
  document.documentElement.lang = currentLang;
  document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
  document.body.dir = isArabic ? 'rtl' : 'ltr';
  document.body.classList.toggle('rtl', isArabic);
  document.body.classList.toggle('ltr', !isArabic);
  document.querySelectorAll('[data-i18n]').forEach(e=>{
    const value=t(e.dataset.i18n);
    if (e.tagName==='INPUT' || e.tagName==='TEXTAREA') e.placeholder=value;
    else e.textContent=value;
  });
  document.querySelectorAll('[data-lang]').forEach(e=>e.classList.toggle('active',e.dataset.lang===currentLang));
  const active=document.querySelector('.nav-item.active'); if(active) document.getElementById('pageTitle').textContent=t(active.dataset.section);
}
function showSection(name){
  document.querySelectorAll('.section').forEach(s=>s.classList.remove('active'));
  document.getElementById('section-'+name).classList.add('active');
  document.querySelectorAll('.nav-item').forEach(b=>b.classList.toggle('active',b.dataset.section===name));
  document.getElementById('pageTitle').textContent=t(name);
  document.querySelector('.sidebar').classList.remove('open');
}
async function loadOverview(){
  try{
    const d=await api('/api/super-admin/overview');
    const c=d.counts||{};
    const cards=[
      ['fa-school',t('tenants'),c.tenants],['fa-users',t('users'),c.users],['fa-user-graduate',t('students'),c.students],['fa-bell',t('active_alerts'),c.alerts]
    ];
    document.getElementById('overviewCards').innerHTML=cards.map(x=>`<div class="stat-card"><div class="stat-top"><span class="stat-label">${x[1]}</span><span class="stat-icon"><i class="fas ${x[0]}"></i></span></div><div class="stat-value">${x[2]??0}</div></div>`).join('');
    const roles=d.usersByRole||{}, total=Math.max(roles.parents+roles.admins+roles.teachers,1);
    document.getElementById('roleStats').innerHTML=[[t('admin_plural'),roles.admins],[t('teacher_plural'),roles.teachers],[t('parent_plural'),roles.parents]].map(x=>`<div class="bar-row"><div class="bar-label"><span>${x[0]}</span><strong>${x[1]||0}</strong></div><div class="bar"><span style="width:${Math.min(100,((x[1]||0)/total)*100)}%"></span></div></div>`).join('');
    const p=d.studentsByPresence||{}, pt=Math.max((p.inside||0)+(p.outside||0),1);
    document.getElementById('presenceStats').innerHTML=`<div class="presence-row"><span>🏫 ${escapeHtml(t('inside'))}</span><strong>${p.inside||0} (${Math.round((p.inside||0)/pt*100)}%)</strong></div><div class="presence-row"><span>🚪 ${escapeHtml(t('outside'))}</span><strong>${p.outside||0} (${Math.round((p.outside||0)/pt*100)}%)</strong></div><div class="presence-row"><span>📩 ${escapeHtml(t('pending_leaves'))}</span><strong>${c.pendingLeaveRequests||0}</strong></div>`;
    document.getElementById('lastSync').innerHTML='<i class="fas fa-circle"></i> '+date(d.generatedAt);
  }catch(e){showError(e);}
}
async function loadTenants(){
  try{
    tenants=await api('/api/super-admin/tenants');
    document.getElementById('tenantsTable').innerHTML=tenants.length?tenants.map(tn=>`<tr><td><div class="person"><span class="mini-avatar"><i class="fas fa-school"></i></span><div><strong>${escapeHtml(tn.name)}</strong><small>${escapeHtml(tn.key)}</small></div></div></td><td><code>${escapeHtml(tn.key)}</code></td><td>${tn.stats.users}</td><td>${tn.stats.students}</td><td><span class="badge ${tn.isActive?'green':'red'}">${tn.isActive?t('active_status'):t('disabled_status')}</span></td><td><div class="table-actions"><button class="small-btn" title="${t('registration_code')}" onclick="registrationCodeModal('${tn.id}')"><i class="fas fa-key"></i></button><button class="small-btn" onclick="editTenant('${tn.id}')"><i class="fas fa-pen"></i></button><button class="small-btn" onclick="toggleTenant('${tn.id}',${tn.isActive})"><i class="fas fa-power-off"></i></button></div></td></tr>`).join(''):`<tr><td colspan="6">${t('no_tenants')}</td></tr>`;
    const opts='<option value="">'+t('all_tenants')+'</option>'+tenants.map(tn=>`<option value="${tn.id}">${escapeHtml(tn.name)}</option>`).join('');
    document.getElementById('userTenantFilter').innerHTML=opts;
  }catch(e){showError(e);}
}
async function loadUsers(){
  try{
    const role=document.getElementById('userRoleFilter').value;
    const tenant=document.getElementById('userTenantFilter').value;
    let q=new URLSearchParams(); if(role)q.set('role',role);if(tenant)q.set('tenantId',tenant);
    users=await api('/api/super-admin/users?'+q.toString());
    document.getElementById('usersTable').innerHTML=users.length?users.map(u=>`<tr><td><div class="person"><span class="mini-avatar">${escapeHtml(initials(u.name))}</span><div><strong>${escapeHtml(u.name)}</strong><small>${escapeHtml(u.email)}</small></div></div></td><td><span class="badge ${u.role==='admin'?'blue':u.role==='teacher'?'gray':'green'}">${roleLabel(u.role)}</span></td><td>${escapeHtml(u.tenant?.name||'—')}</td><td>${escapeHtml(u.phone||'—')}</td><td>${date(u.createdAt)}</td><td><button class="small-btn" onclick="changeRole('${u.id}','${u.role}')"><i class="fas fa-user-shield"></i></button></td></tr>`).join(''):`<tr><td colspan="6">${t('no_users')}</td></tr>`;
  }catch(e){showError(e);}
}
async function loadActivity(){
  try{
    const list=await api('/api/super-admin/activity?limit=50');
    document.getElementById('activityList').innerHTML=list.length?list.map(a=>`<div class="activity"><span class="activity-icon"><i class="fas ${a.type==='alert'?'fa-brain':a.type==='leave'?'fa-file-circle-check':'fa-bell'}"></i></span><div><strong>${escapeHtml(a.title)}</strong><div>${escapeHtml(a.message)}</div><small>${escapeHtml(a.actor||'system')} • ${date(a.createdAt)}</small></div></div>`).join(''):`<div class="panel" style="padding:20px">${t('no_activity')}</div>`;
  }catch(e){showError(e);}
}
async function loadHealth(){
  try{
    const h=await fetch(API_BASE_URL+'/health').then(r=>r.json());
    document.getElementById('healthGrid').innerHTML=[
      [t('service'),h.status==='ok',t('service')],
      [t('database'),h.database==='connected',t('database')],
      [t('environment'),true,(h.uptime?t('uptime').replace('{minutes}',Math.round(h.uptime/60)):'')],
      [t('nodejs'),true,navigator.userAgent]
    ].map(x=>`<div class="health-card"><div class="health-status"><span class="dot ${x[1]?'':'bad'}"></span>${x[0]}</div><p>${x[1]?t('working'):t('unavailable')}<br>${escapeHtml(x[2])}</p></div>`).join('');
  }catch(e){
    document.getElementById('healthGrid').innerHTML=`<div class="health-card"><div class="health-status"><span class="dot bad"></span>API</div><p>${t('api_unavailable')}</p></div>`;
  }
}
function tenantModal(){
  openModal(t('add_tenant_title'),`<div class="form-grid"><div class="full"><label>${t('tenant_name')}</label><input id="mName" required placeholder="${t('example_school')}"></div><div class="full"><label>${t('technical_key')}</label><input id="mKey" required pattern="[a-z0-9][a-z0-9_\-]{2,63}" placeholder="${t('example_key')}"></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">${t('cancel')}</button><button type="button" class="primary" id="modalSave">إنشاء</button></div></div>`);
  document.getElementById('modalSave').onclick=async()=>{try{const r=await api('/api/super-admin/tenants',{method:'POST',body:JSON.stringify({name:document.getElementById('mName').value,key:document.getElementById('mKey').value})});toast(t('create_tenant_success'));closeModal();await Promise.all([loadTenants(),loadOverview()]);}catch(e){showError(e);}};
}
function editTenant(id){
  const tn=tenants.find(x=>x.id===id);if(!tn)return;
  openModal(t('edit_tenant_title'),`<div class="form-grid"><div class="full"><label>${t('tenant_name')}</label><input id="mName" value="${escapeHtml(tn.name)}"></div><div class="full"><label>${t('key')}</label><input value="${escapeHtml(tn.key)}" disabled></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">${t('cancel')}</button><button class="primary" id="modalSave">حفظ</button></div></div>`);
  document.getElementById('modalSave').onclick=async()=>{try{await api('/api/super-admin/tenants/'+id,{method:'PUT',body:JSON.stringify({name:document.getElementById('mName').value})});toast(t('saved_success'));closeModal();loadTenants();}catch(e){showError(e);}};
}
async function registrationCodeModal(id){
  const tn=tenants.find(x=>x.id===id);
  if(!tn)return;
  try{
    const meta=await api('/api/super-admin/tenants/'+id+'/registration-code');
    const status=meta.exists?(meta.isActive?`<span class="badge green">${t('code_active')}</span>`:`<span class="badge red">${t('code_inactive')}</span>`):`<span class="badge gray">${t('no_code')}</span>`;
    openModal(`${t('registration_code')} • ${escapeHtml(tn.name)}`,`
      <div class="form-grid">
        <div class="full">
          <div class="panel" style="padding:16px">
            <div style="display:flex;justify-content:space-between;gap:12px;align-items:center;flex-wrap:wrap">
              <strong>${t('registration_code')}</strong>${status}
            </div>
            <div style="margin-top:10px;display:grid;gap:6px">
              <div>${t('code_last4')}: <code>${escapeHtml(meta.last4||'—')}</code></div>
              <div>${t('code_uses')}: ${meta.uses||0}${meta.maxUses>0?` / ${meta.maxUses}`:' / ∞'}</div>
              <div>${meta.expiresAt?date(meta.expiresAt):'—'}</div>
            </div>
          </div>
        </div>
        <div class="full">
          <label>${t('max_uses')}</label>
          <input id="mMaxUses" type="number" min="0" max="100000" value="${meta.maxUses||0}">
        </div>
        <div class="full">
          <label>${t('expires_at')}</label>
          <input id="mExpiresAt" type="datetime-local">
        </div>
        <div class="form-actions">
          ${meta.exists?`<button type="button" class="secondary" id="toggleCodeBtn">${meta.isActive?t('deactivate_code'):t('activate_code')}</button>`:''}
          <button type="button" class="secondary" onclick="closeModal()">${t('cancel')}</button>
          <button type="button" class="primary" id="generateCodeBtn">${meta.exists?t('rotate_code'):t('generate_code')}</button>
        </div>
      </div>`);
    document.getElementById('generateCodeBtn').onclick=async()=>{
      try{
        const maxUses=Number(document.getElementById('mMaxUses').value||0);
        const expiresRaw=document.getElementById('mExpiresAt').value;
        const expiresAt=expiresRaw?new Date(expiresRaw).toISOString():null;
        const r=await api('/api/super-admin/tenants/'+id+'/registration-code',{method:'POST',body:JSON.stringify({maxUses,expiresAt})});
        openModal(`${t('registration_code')} • ${escapeHtml(tn.name)}`,`
          <div class="form-grid">
            <div class="full">
              <div style="padding:18px;border-radius:14px;background:#f3f7fb;border:1px dashed #b7c7d9">
                <small>${t('registration_code')}</small>
                <div id="generatedCode" style="font-size:22px;font-weight:800;letter-spacing:2px;word-break:break-all;margin-top:8px">${escapeHtml(r.code)}</div>
              </div>
            </div>
            <div class="full"><p style="margin:0">${escapeHtml(t('code_warning'))}</p></div>
            <div class="form-actions">
              <button type="button" class="secondary" id="copyCodeBtn"><i class="fas fa-copy"></i> ${t('copy_code')}</button>
              <button type="button" class="primary" onclick="closeModal()">${t('ok')}</button>
            </div>
          </div>`);
        document.getElementById('copyCodeBtn').onclick=async()=>{
          try{await navigator.clipboard.writeText(r.code);toast(t('copy_code'));}catch{toast(r.code);}
        };
        await loadTenants();
      }catch(e){showError(e);}
    };
    const toggleBtn=document.getElementById('toggleCodeBtn');
    if(toggleBtn) toggleBtn.onclick=async()=>{
      try{
        await api('/api/super-admin/tenants/'+id+'/registration-code',{method:'PUT',body:JSON.stringify({isActive:!meta.isActive})});
        toast(t(meta.isActive?'deactivate_code':'activate_code'));
        closeModal();
        registrationCodeModal(id);
      }catch(e){showError(e);}
    };
  }catch(e){showError(e);}
}

async function toggleTenant(id,current){
  if(!confirm(current?t('confirm_disable'):t('confirm_enable')))return;
  try{await api('/api/super-admin/tenants/'+id,{method:'PUT',body:JSON.stringify({isActive:!current})});toast(t('tenant_status_updated'));await Promise.all([loadTenants(),loadOverview()]);}catch(e){showError(e);}
}
function userModal(){
  const opts=tenants.map(tn=>`<option value="${tn.id}">${escapeHtml(tn.name)}</option>`).join('');
  openModal(t('new_user_title'),`<div class="form-grid"><div><label>${t('name')}</label><input id="mName" required></div><div><label>${t('phone')}</label><input id="mPhone" required></div><div><label>${t('email')}</label><input id="mEmail" type="email" required></div><div><label>${t('password')}</label><input id="mPassword" type="password" minlength="6" required></div><div><label>${t('role')}</label><select id="mRole"><option value="admin">${t('admin')}</option><option value="teacher">${t('teacher')}</option><option value="parent">${t('parent')}</option></select></div><div><label>${t('tenant')}</label><select id="mTenant" required>${opts}</select></div><div class="form-actions"><button type="button" class="secondary" onclick="closeModal()">${t('cancel')}</button><button class="primary" id="modalSave">إنشاء</button></div></div>`);
  const saveBtn=document.getElementById('modalSave');
  saveBtn.onclick=async()=>{
    const payload={name:document.getElementById('mName').value.trim(),email:document.getElementById('mEmail').value.trim(),password:document.getElementById('mPassword').value,phone:document.getElementById('mPhone').value.trim(),role:document.getElementById('mRole').value,tenantId:document.getElementById('mTenant').value};
    if(!payload.name||!payload.email||!payload.password||!payload.phone||!payload.tenantId){showError(new Error(t('required_fields')));return;}
    saveBtn.disabled=true;
    try{
      await api('/api/super-admin/users',{method:'POST',body:JSON.stringify(payload)});
      toast(t('create_user_success'));
      closeModal();
      await Promise.all([loadUsers(),loadOverview()]);
    }catch(e){showError(e);saveBtn.disabled=false;}
  };
}
async function changeRole(id,current){
  const role=prompt(t('user_role_prompt'),current);
  if(!role||!['admin','teacher','parent'].includes(role))return;
  try{await api('/api/super-admin/users/'+id+'/role',{method:'PUT',body:JSON.stringify({role})});toast(t('role_updated'));loadUsers();}catch(e){showError(e);}
}
function openModal(title,html){document.getElementById('modalTitle').textContent=title;document.getElementById('modalForm').innerHTML=html;document.getElementById('modal').hidden=false;}
function closeModal(){document.getElementById('modal').hidden=true;}
function logout(){localStorage.removeItem('token');localStorage.removeItem('user');location.href='../index.html';}

window.editTenant=editTenant;window.toggleTenant=toggleTenant;window.changeRole=changeRole;window.registrationCodeModal=registrationCodeModal;window.closeModal=closeModal;
boot();
