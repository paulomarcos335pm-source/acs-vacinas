
    // State
    let allData = [];
    let currentPage = 'dashboard';
    const defaultConfig = {
      app_title: 'ACS Vacinas & Busca Ativa',
      ubs_name: 'UBS Central',
      primary_color: '#047857',
      surface_color: '#ffffff',
      text_color: '#1f2937',
      action_color: '#059669',
      secondary_action_color: '#6b7280'
    };

    const LOCAL_DB_NAME = 'acs-vacinas-busca-ativa-local';
    const LOCAL_DB_VERSION = 1;
    let localDb = null;
    let localDataHandler = null;
    const photoUrlCache = new Map();

    window.lucide = window.lucide || { createIcons() {} };

    function createElementSdkFallback() {
      return {
        init(options) {
          if (options && typeof options.onConfigChange === 'function') {
            options.onConfigChange(defaultConfig);
          }
        },
        setConfig() {}
      };
    }

    function openLocalDb() {
      if (localDb) return Promise.resolve(localDb);
      return new Promise((resolve, reject) => {
        if (!('indexedDB' in window)) {
          reject(new Error('IndexedDB não está disponível neste navegador.'));
          return;
        }
        const request = indexedDB.open(LOCAL_DB_NAME, LOCAL_DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains('records')) {
            const store = db.createObjectStore('records', { keyPath: '__backendId' });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('patient_id', 'patient_id', { unique: false });
            store.createIndex('created_at', 'created_at', { unique: false });
          }
        };
        request.onsuccess = () => {
          localDb = request.result;
          resolve(localDb);
        };
        request.onerror = () => reject(request.error);
      });
    }

    async function getAllLocalRecords() {
      const db = await openLocalDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readonly');
        const request = tx.objectStore('records').getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => reject(request.error);
      });
    }

    async function putLocalRecord(record) {
      const db = await openLocalDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').put(record);
        tx.oncomplete = () => resolve(record);
        tx.onerror = () => reject(tx.error);
      });
    }

    async function deleteLocalRecord(id) {
      const db = await openLocalDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction('records', 'readwrite');
        tx.objectStore('records').delete(id);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    }

    function makeLocalId() {
      if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
      return 'local-' + Date.now() + '-' + Math.random().toString(16).slice(2);
    }

    async function refreshLocalData() {
      allData = await getAllLocalRecords();
      if (localDataHandler && typeof localDataHandler.onDataChanged === 'function') {
        localDataHandler.onDataChanged(allData);
      }
      updateLocalStatus();
    }

    function updateLocalStatus() {
      const status = document.getElementById('sync-status');
      if (!status) return;
      const photos = allData.filter(item => item.photo_blob).length;
      status.innerHTML = `<i data-lucide="database" class="w-3 h-3"></i> Local • ${allData.length} reg. • ${photos} foto(s)`;
      lucide.createIcons();
    }

    function createLocalDataSdk() {
      return {
        init(handler) {
          localDataHandler = handler;
          refreshLocalData().catch((error) => {
            console.error(error);
            const status = document.getElementById('sync-status');
            if (status) status.textContent = 'Banco local indisponível';
          });
        },
        async create(data) {
          try {
            const record = { ...data, __backendId: data.__backendId || makeLocalId(), created_at: data.created_at || new Date().toISOString(), updated_at: new Date().toISOString() };
            await putLocalRecord(record);
            await refreshLocalData();
            return { isOk: true, value: record };
          } catch (error) {
            console.error(error);
            return { isOk: false, error };
          }
        },
        async update(data) {
          try {
            const record = { ...data, __backendId: data.__backendId || makeLocalId(), updated_at: new Date().toISOString() };
            await putLocalRecord(record);
            await refreshLocalData();
            return { isOk: true, value: record };
          } catch (error) {
            console.error(error);
            return { isOk: false, error };
          }
        },
        async delete(record) {
          try {
            await deleteLocalRecord(record.__backendId);
            await refreshLocalData();
            return { isOk: true };
          } catch (error) {
            console.error(error);
            return { isOk: false, error };
          }
        }
      };
    }

    function blobToDataUrl(blob) {
      return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }

    async function exportLocalBackup() {
      try {
        const records = await Promise.all(allData.map(async (item) => {
          const copy = { ...item };
          if (copy.photo_blob) {
            copy.photo_data_url = await blobToDataUrl(copy.photo_blob);
            delete copy.photo_blob;
          }
          return copy;
        }));
        const payload = {
          app: 'ACS Vacinas & Busca Ativa',
          exported_at: new Date().toISOString(),
          records
        };
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `backup-acs-${new Date().toISOString().slice(0, 10)}.json`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
        showToast('Backup local gerado!');
      } catch (error) {
        console.error(error);
        showToast('Erro ao gerar backup', 'error');
      }
    }

    window.elementSdk = window.elementSdk || createElementSdkFallback();
    window.dataSdk = createLocalDataSdk();

    // Element SDK
    window.elementSdk.init({
      defaultConfig,
      onConfigChange: async (config) => {
        document.getElementById('sidebar-title').textContent = (config.app_title || defaultConfig.app_title).split('&')[0].trim();
        document.getElementById('sidebar-ubs').textContent = config.ubs_name || defaultConfig.ubs_name;
      },
      mapToCapabilities: (config) => ({
        recolorables: [
          { get: () => config.primary_color || defaultConfig.primary_color, set: (v) => { config.primary_color = v; window.elementSdk.setConfig({ primary_color: v }); } },
          { get: () => config.surface_color || defaultConfig.surface_color, set: (v) => { config.surface_color = v; window.elementSdk.setConfig({ surface_color: v }); } },
          { get: () => config.text_color || defaultConfig.text_color, set: (v) => { config.text_color = v; window.elementSdk.setConfig({ text_color: v }); } },
          { get: () => config.action_color || defaultConfig.action_color, set: (v) => { config.action_color = v; window.elementSdk.setConfig({ action_color: v }); } },
          { get: () => config.secondary_action_color || defaultConfig.secondary_action_color, set: (v) => { config.secondary_action_color = v; window.elementSdk.setConfig({ secondary_action_color: v }); } }
        ],
        borderables: [],
        fontEditable: { get: () => config.font_family || 'Plus Jakarta Sans', set: (v) => { config.font_family = v; window.elementSdk.setConfig({ font_family: v }); } },
        fontSizeable: undefined
      }),
      mapToEditPanelValues: (config) => new Map([
        ['app_title', config.app_title || defaultConfig.app_title],
        ['ubs_name', config.ubs_name || defaultConfig.ubs_name]
      ])
    });

    // Data SDK
    const dataHandler = {
      onDataChanged(data) {
        allData = data;
        renderCurrentPage();
      }
    };
    window.dataSdk.init(dataHandler);

    // Helpers
    function getPatients() { return allData.filter(d => d.type === 'patient'); }
    function getVaccines() { return allData.filter(d => d.type === 'vaccine' && d.active !== false); }
    function getApplications() { return allData.filter(d => d.type === 'application'); }
    function getConsultations() { return allData.filter(d => d.type === 'consultation'); }
    function getVisits() { return allData.filter(d => d.type === 'visit'); }
    function getPrenatalRecords() { return allData.filter(d => d.type === 'prenatal'); }

    function calcAge(birthDate) {
      if (!birthDate) return '';
      const birth = new Date(birthDate);
      const now = new Date();
      const years = now.getFullYear() - birth.getFullYear();
      const months = now.getMonth() - birth.getMonth();
      if (years < 2) {
        const totalMonths = years * 12 + months;
        return totalMonths + (totalMonths === 1 ? ' mês' : ' meses');
      }
      return years + ' anos';
    }

    function calcGestWeeks(dum) {
      if (!dum) return '';
      const d = new Date(dum);
      const now = new Date();
      const days = Math.floor((now - d) / 86400000);
      return Math.floor(days / 7) + ' semanas';
    }

    function isOverdue(app) {
      if (app.status === 'applied') return false;
      if (!app.next_dose_date) return false;
      const nextDate = new Date(app.next_dose_date);
      const today = new Date();
      // Comparar apenas as datas (sem horas)
      nextDate.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      return today >= nextDate; // Incluir hoje como atrasado
    }

    function showToast(msg, type = 'success') {
      const container = document.getElementById('toast-container');
      const div = document.createElement('div');
      const colors = { success: 'bg-emerald-600', error: 'bg-red-600', warning: 'bg-amber-600' };
      div.className = `toast ${colors[type]} text-white px-4 py-3 rounded-lg shadow-lg text-sm flex items-center gap-2`;
      div.innerHTML = `<i data-lucide="${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'alert-triangle'}" class="w-4 h-4"></i>${msg}`;
      container.appendChild(div);
      lucide.createIcons();
      setTimeout(() => div.remove(), 3000);
    }

    function showModal(title, content) {
      const modal = document.getElementById('modal-container');
      modal.className = 'fixed inset-0 z-50 flex items-center justify-center modal-overlay';
      modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 max-h-[85%] overflow-y-auto fade-in">
          <div class="flex items-center justify-between p-4 border-b">
            <h3 class="font-bold text-gray-800">${title}</h3>
            <button onclick="closeModal()" class="p-1 hover:bg-gray-100 rounded-lg"><i data-lucide="x" class="w-5 h-5"></i></button>
          </div>
          <div class="p-4">${content}</div>
        </div>`;
      lucide.createIcons();
    }

    function closeModal() {
      document.getElementById('modal-container').className = 'hidden fixed inset-0 z-50';
    }

    // Navigation
    function navigate(page) {
      currentPage = page;
      document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
      const navEl = document.querySelector(`[data-nav="${page}"]`);
      if (navEl) navEl.classList.add('active');
      const titles = { dashboard: 'Dashboard', patients: 'Pacientes', 'apply-vaccine': 'Aplicar Vacina', visits: 'Visitas', vaccines: 'Cadastrar Vacina', alerts: 'Alertas', reports: 'Relatórios' };
      document.getElementById('page-title').textContent = titles[page] || '';
      renderCurrentPage();
    }

    function renderCurrentPage() {
      const container = document.getElementById('page-content');
      container.className = 'p-6 fade-in';
      const renderers = { 
        dashboard: renderDashboard, 
        patients: renderPatients, 
        'apply-vaccine': renderApplyVaccine, 
        visits: renderVisits,
        vaccines: renderVaccines, 
        alerts: renderAlerts, 
        reports: renderReports 
      };
      (renderers[currentPage] || renderDashboard)(container);
      lucide.createIcons();
    }

    function toggleSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.toggle('-translate-x-full');
      overlay.classList.toggle('hidden');
    }

    function closeSidebar() {
      const sidebar = document.getElementById('sidebar');
      const overlay = document.getElementById('sidebar-overlay');
      sidebar.classList.add('-translate-x-full');
      overlay.classList.add('hidden');
    }

    // DASHBOARD
    function renderDashboard(el) {
      const patients = getPatients();
      const apps = getApplications();
      const overdueApps = apps.filter(isOverdue);
      const consultations = getConsultations();
      const babies = patients.filter(p => {
        if (p.category !== 'Criança') return false;
        const birth = new Date(p.birth_date);
        const ageMs = Date.now() - birth.getTime();
        return ageMs < 365.25 * 24 * 60 * 60 * 1000;
      });
      const overdueCount = overdueApps.length;
      const coverage = apps.length > 0 ? Math.round((apps.filter(a => a.status === 'applied').length / apps.length) * 100) : 0;
      const highRiskPatients = patients.filter(p => p.risk_level === 3).length;
      const mediumRiskPatients = patients.filter(p => p.risk_level === 2).length;
      const hasOverdue = overdueCount > 0;

      el.innerHTML = `
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <div class="stat-card bg-white p-4 rounded-xl shadow-sm border-red-500 card-hover" style="border-left: 4px solid; ${hasOverdue ? 'animation: pulse-alert 2s infinite;' : ''}">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide">Vacinas Atrasadas</p>
                <p class="text-2xl font-bold text-red-600 mt-1">${overdueCount}</p>
              </div>
              <div class="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center"><i data-lucide="alert-triangle" class="w-5 h-5 text-red-500"></i></div>
            </div>
          </div>
          <div class="stat-card bg-white p-4 rounded-xl shadow-sm border-emerald-500 card-hover" style="border-left: 4px solid;">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide">Cobertura Vacinal</p>
                <p class="text-2xl font-bold text-emerald-600 mt-1">${coverage}%</p>
              </div>
              <div class="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center"><i data-lucide="shield-check" class="w-5 h-5 text-emerald-500"></i></div>
            </div>
          </div>
          <div class="stat-card bg-white p-4 rounded-xl shadow-sm border-blue-500 card-hover" style="border-left: 4px solid;">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide">Pacientes</p>
                <p class="text-2xl font-bold text-blue-600 mt-1">${patients.length}</p>
              </div>
              <div class="w-10 h-10 bg-blue-50 rounded-lg flex items-center justify-center"><i data-lucide="users" class="w-5 h-5 text-blue-500"></i></div>
            </div>
          </div>
          <div class="stat-card bg-white p-4 rounded-xl shadow-sm border-amber-500 card-hover" style="border-left: 4px solid;">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide">Crianças < 1 ano</p>
                <p class="text-2xl font-bold text-amber-600 mt-1">${babies.length}</p>
              </div>
              <div class="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center"><i data-lucide="baby" class="w-5 h-5 text-amber-500"></i></div>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="stat-card bg-white p-4 rounded-xl shadow-sm border-red-500 card-hover" style="border-left: 4px solid;">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide">Risco Alto</p>
                <p class="text-2xl font-bold text-red-600 mt-1">${highRiskPatients}</p>
              </div>
              <div class="w-10 h-10 bg-red-50 rounded-lg flex items-center justify-center">🔴</div>
            </div>
          </div>
          <div class="stat-card bg-white p-4 rounded-xl shadow-sm border-amber-500 card-hover" style="border-left: 4px solid;">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide">Risco Médio</p>
                <p class="text-2xl font-bold text-amber-600 mt-1">${mediumRiskPatients}</p>
              </div>
              <div class="w-10 h-10 bg-amber-50 rounded-lg flex items-center justify-center">🟡</div>
            </div>
          </div>
          <div class="stat-card bg-white p-4 rounded-xl shadow-sm border-emerald-500 card-hover" style="border-left: 4px solid;">
            <div class="flex items-center justify-between">
              <div>
                <p class="text-xs text-gray-500 uppercase tracking-wide">Risco Baixo</p>
                <p class="text-2xl font-bold text-emerald-600 mt-1">${patients.length - highRiskPatients - mediumRiskPatients}</p>
              </div>
              <div class="w-10 h-10 bg-emerald-50 rounded-lg flex items-center justify-center">🟢</div>
            </div>
          </div>
        </div>

        ${overdueApps.length > 0 ? `
        <div class="bg-white rounded-xl shadow-sm p-4 mb-6 border-2 border-red-200">
          <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="alert-circle" class="w-4 h-4 text-red-500"></i>Vacinas Atrasadas</h3>
          <div class="space-y-2">
            ${overdueApps.slice(0, 5).map(a => {
              const patient = patients.find(p => p.sus_card === a.patient_id) || {};
              const daysOverdue = Math.floor((new Date() - new Date(a.next_dose_date)) / 86400000);
              return `<div class="flex items-center justify-between p-3 bg-red-50 rounded-lg border border-red-200">
                <div>
                  <p class="font-medium text-sm text-gray-800">${patient.name || 'Paciente'}</p>
                  <p class="text-xs text-gray-500">${a.vaccine_name} - ${a.dose || ''} | ${daysOverdue} dias atrasada</p>
                </div>
                <div class="flex gap-2">
                  <button onclick="showSendMessageForm('${patient.phone || ''}', '${patient.name || ''}', '${a.vaccine_name}')" class="px-2 py-1 bg-blue-500 hover:bg-blue-600 text-white text-xs rounded transition flex items-center gap-1">
                    <i data-lucide="message-circle" class="w-3 h-3"></i> Msg
                  </button>
                  <span class="badge badge-red">Atrasada</span>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>` : ''}

        <div class="bg-white rounded-xl shadow-sm p-4">
          <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="activity" class="w-4 h-4 text-emerald-500"></i>Últimas Aplicações</h3>
          ${apps.filter(a => a.status === 'applied').length === 0 ? '<p class="text-gray-400 text-sm">Nenhuma aplicação registrada</p>' : `
          <div class="space-y-2">
            ${apps.filter(a => a.status === 'applied').slice(-5).reverse().map(a => {
              const patient = patients.find(p => p.sus_card === a.patient_id) || {};
              return `<div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <p class="font-medium text-sm">${patient.name || 'Paciente'}</p>
                  <p class="text-xs text-gray-500">${a.vaccine_name} - ${a.application_date || ''}</p>
                </div>
                <span class="badge badge-green">Aplicada</span>
              </div>`;
            }).join('')}
          </div>`}
        </div>`;
    }

    // PATIENTS
    function renderPatients(el) {
      const patients = getPatients();
      el.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">${patients.length} paciente(s) cadastrado(s)</p>
          <button onclick="showPatientForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
            <i data-lucide="plus" class="w-4 h-4"></i>Novo Paciente
          </button>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          ${patients.length === 0 ? '<p class="p-6 text-gray-400 text-sm text-center">Nenhum paciente cadastrado. Clique em "Novo Paciente" para começar.</p>' : `
          <div class="divide-y">
            ${patients.map(p => {
              const riskColor = p.risk_level === 1 ? 'emerald' : p.risk_level === 2 ? 'amber' : 'red';
              const riskIcon = p.risk_level === 1 ? '🟢' : p.risk_level === 2 ? '🟡' : '🔴';
              return `
              <div class="p-4 flex items-center justify-between hover:bg-gray-50 transition cursor-pointer" onclick="showPatientProfile('${p.sus_card}')">
                <div class="flex items-center gap-3">
                  <div class="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-sm">${(p.name || '?')[0]}</div>
                  <div>
                    <p class="font-medium text-sm text-gray-800">${p.name}</p>
                    <p class="text-xs text-gray-500">${p.category} • ${calcAge(p.birth_date)} • Microárea ${p.microarea || '-'}</p>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <span class="badge ${riskColor === 'emerald' ? 'badge-green' : riskColor === 'amber' ? 'badge-yellow' : 'badge-red'}">${riskIcon} Risco</span>
                  <button onclick="event.stopPropagation(); deletePatient('${p.__backendId}')" class="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                </div>
              </div>`;
            }).join('')}
          </div>`}
        </div>`;
      lucide.createIcons();
    }

    function showPatientForm(existing) {
      const p = existing || {};
      const isEditing = p.__backendId ? true : false;
      showModal(isEditing ? 'Editar Paciente' : 'Novo Paciente', `
        <form onsubmit="savePatient(event, '${p.__backendId || ''}')" class="space-y-3 max-h-[70vh] overflow-y-auto">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
            <p class="text-xs text-blue-700"><strong>Dica:</strong> ${isEditing ? 'Você pode alterar qualquer informação do paciente clicando nos campos abaixo.' : 'Preencha todos os campos marcados com * para cadastrar o paciente.'}</p>
          </div>
          
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Nome completo *</label><input name="name" value="${p.name || ''}" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Nome do responsável/mãe</label><input name="responsible" value="${p.responsible || ''}" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          
          <div class="border-t pt-3">
            <h4 class="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="card" class="w-3 h-3"></i>Identificação</h4>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Cartão SUS *</label><input name="sus_card" value="${p.sus_card || ''}" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Data de Nascimento *</label><input type="date" name="birth_date" value="${p.birth_date || ''}" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
            </div>
          </div>

          <div class="border-t pt-3">
            <h4 class="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="users" class="w-3 h-3"></i>Classificação</h4>
            <div class="grid grid-cols-2 gap-3">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Categoria *</label>
                <select name="category" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" onchange="document.getElementById('dum-field').style.display = this.value === 'Gestante' ? 'block' : 'none'">
                  <option value="">Selecione</option>
                  <option ${p.category === 'Criança' ? 'selected' : ''}>Criança</option>
                  <option ${p.category === 'Adolescente' ? 'selected' : ''}>Adolescente</option>
                  <option ${p.category === 'Gestante' ? 'selected' : ''}>Gestante</option>
                  <option ${p.category === 'Adulto' ? 'selected' : ''}>Adulto</option>
                </select>
              </div>
              <div id="dum-field" style="display:${p.category === 'Gestante' ? 'block' : 'none'}"><label class="block text-xs font-medium text-gray-600 mb-1">DUM</label><input type="date" name="dum" value="${p.dum || ''}" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
            </div>
          </div>

          <div class="border-t pt-3">
            <h4 class="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="alert-circle" class="w-3 h-3"></i>Nível de Risco *</h4>
            <div class="space-y-2">
              <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-emerald-50 transition" style="border-color: #10b981;">
                <input type="radio" name="risk_level" value="1" ${p.risk_level === 1 || !p.risk_level ? 'checked' : ''} class="w-4 h-4 accent-emerald-600">
                <div>
                  <p class="text-sm font-medium text-emerald-700">🟢 Risco Baixo</p>
                  <p class="text-xs text-emerald-600">Paciente em bom estado de saúde</p>
                </div>
              </label>
              <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-amber-50 transition" style="border-color: #f59e0b;">
                <input type="radio" name="risk_level" value="2" ${p.risk_level === 2 ? 'checked' : ''} class="w-4 h-4 accent-amber-600">
                <div>
                  <p class="text-sm font-medium text-amber-700">🟡 Risco Médio</p>
                  <p class="text-xs text-amber-600">Requer acompanhamento frequente</p>
                </div>
              </label>
              <label class="flex items-center gap-3 p-3 border rounded-lg cursor-pointer hover:bg-red-50 transition" style="border-color: #ef4444;">
                <input type="radio" name="risk_level" value="3" ${p.risk_level === 3 ? 'checked' : ''} class="w-4 h-4 accent-red-600">
                <div>
                  <p class="text-sm font-medium text-red-700">🔴 Risco Alto</p>
                  <p class="text-xs text-red-600">Requer intervenção imediata</p>
                </div>
              </label>
            </div>
          </div>

          <div class="border-t pt-3">
            <h4 class="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="phone" class="w-3 h-3"></i>Contato</h4>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Telefone</label><input name="phone" value="${p.phone || ''}" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="(11) 99999-9999"></div>
          </div>

          <div class="border-t pt-3">
            <h4 class="text-xs font-bold text-gray-700 mb-2 flex items-center gap-2"><i data-lucide="map-pin" class="w-3 h-3"></i>Localização</h4>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Endereço</label><input name="address" value="${p.address || ''}" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Rua, número, bairro"></div>
            <div class="grid grid-cols-2 gap-3 mt-2">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Microárea</label><input name="microarea" value="${p.microarea || ''}" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Ex: 01"></div>
            </div>
          </div>

          <div class="flex gap-2 border-t pt-3">
            <button type="submit" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2">
              <i data-lucide="check" class="w-4 h-4"></i>
              ${isEditing ? 'Atualizar Paciente' : 'Salvar Paciente'}
            </button>
            <button type="button" onclick="closeModal()" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm transition">Cancelar</button>
          </div>
        </form>`);
      lucide.createIcons();
    }

    async function savePatient(e, backendId) {
      e.preventDefault();
      const form = e.target;
      const data = {
        type: 'patient',
        name: form.name.value,
        responsible: form.responsible.value,
        sus_card: form.sus_card.value,
        birth_date: form.birth_date.value,
        category: form.category.value,
        phone: form.phone.value,
        address: form.address.value,
        microarea: form.microarea.value,
        dum: form.dum ? form.dum.value : '',
        risk_level: parseInt(form.risk_level.value) || 1,
        created_at: new Date().toISOString()
      };
      let result;
      if (backendId) {
        const existing = allData.find(d => d.__backendId === backendId);
        result = await window.dataSdk.update({ ...existing, ...data });
      } else {
        if (allData.length >= 999) { showToast('Limite de registros atingido (999)', 'error'); return; }
        result = await window.dataSdk.create(data);
      }
      if (result.isOk) { showToast('Paciente salvo!'); closeModal(); }
      else showToast('Erro ao salvar', 'error');
    }

    async function deletePatient(backendId) {
      const record = allData.find(d => d.__backendId === backendId);
      if (!record) return;
      // Inline confirmation
      showModal('Confirmar Exclusão', `
        <p class="text-sm text-gray-600 mb-4">Deseja excluir o paciente <strong>${record.name}</strong>?</p>
        <div class="flex gap-2">
          <button onclick="confirmDelete('${backendId}')" class="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg text-sm font-medium">Excluir</button>
          <button onclick="closeModal()" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2 rounded-lg text-sm font-medium">Cancelar</button>
        </div>`);
    }

    async function confirmDelete(backendId) {
      const record = allData.find(d => d.__backendId === backendId);
      const result = await window.dataSdk.delete(record);
      if (result.isOk) { showToast('Excluído!'); closeModal(); }
      else showToast('Erro ao excluir', 'error');
    }

    function showPatientProfile(susCard) {
      const p = getPatients().find(pt => pt.sus_card === susCard);
      if (!p) return;
      const apps = getApplications().filter(a => a.patient_id === susCard);
      const riskColor = p.risk_level === 1 ? 'bg-emerald-100 text-emerald-700' : p.risk_level === 2 ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700';
      const riskLabel = p.risk_level === 1 ? 'Baixo' : p.risk_level === 2 ? 'Médio' : 'Alto';
      showModal('Perfil do Paciente', `
        <div class="space-y-4">
          <div class="flex items-center justify-between gap-3">
            <div class="flex items-center gap-3">
              <div class="w-14 h-14 bg-emerald-100 rounded-full flex items-center justify-center text-emerald-700 font-bold text-xl">${p.name[0]}</div>
              <div>
                <p class="font-bold text-gray-800">${p.name}</p>
                <p class="text-sm text-gray-500">${p.category} • ${calcAge(p.birth_date)}${p.category === 'Gestante' && p.dum ? ' • ' + calcGestWeeks(p.dum) + ' gest.' : ''}</p>
              </div>
            </div>
            <button onclick="openEditPatient('${p.__backendId}'); closeModal();" class="p-2 hover:bg-emerald-100 rounded-lg text-emerald-600">
              <i data-lucide="edit-2" class="w-4 h-4"></i>
            </button>
          </div>
          <div class="p-3 ${riskColor} rounded-lg">
            <p class="text-xs font-bold">Nível de Risco: <span>${riskLabel}</span></p>
          </div>
          <div class="grid grid-cols-2 gap-3 text-sm">
            <div><span class="text-gray-500">SUS:</span> <span class="font-medium">${p.sus_card}</span></div>
            <div><span class="text-gray-500">Telefone:</span> <span class="font-medium">${p.phone || '-'}</span></div>
            <div class="col-span-2"><span class="text-gray-500">Endereço:</span> <span class="font-medium">${p.address || '-'}</span></div>
            <div><span class="text-gray-500">Microárea:</span> <span class="font-medium">${p.microarea || '-'}</span></div>
            ${p.responsible ? `<div class="col-span-2"><span class="text-gray-500">Responsável:</span> <span class="font-medium">${p.responsible}</span></div>` : ''}
          </div>
          <div>
            <h4 class="font-bold text-sm text-gray-700 mb-2">Histórico Vacinal</h4>
            ${apps.length === 0 ? '<p class="text-xs text-gray-400">Nenhum registro</p>' : `
            <div class="space-y-1">
              ${apps.map(a => `<div class="flex justify-between items-center p-2 bg-gray-50 rounded text-xs">
                <span>${a.vaccine_name} (${a.dose || ''})</span>
                <span class="badge ${a.status === 'applied' ? 'badge-green' : isOverdue(a) ? 'badge-red' : 'badge-yellow'}">${a.status === 'applied' ? 'Aplicada' : isOverdue(a) ? 'Atrasada' : 'Agendada'}</span>
              </div>`).join('')}
            </div>`}
          </div>
        </div>`);
      lucide.createIcons();
    }

    function openEditPatient(backendId) {
      const existing = allData.find(d => d.__backendId === backendId);
      if (!existing) return;
      showPatientForm(existing);
    }

    // APPLY VACCINE
    function renderApplyVaccine(el) {
      const patients = getPatients();
      const vaccines = getVaccines();
      el.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm p-5">
          <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="syringe" class="w-5 h-5 text-emerald-600"></i>Registrar Aplicação de Vacina</h3>
          <form onsubmit="saveApplication(event)" class="space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Paciente *</label>
                <select name="patient_id" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="">Selecione o paciente</option>
                  ${patients.map(p => `<option value="${p.sus_card}">${p.name} (${p.sus_card})</option>`).join('')}
                </select>
              </div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Vacina *</label>
                <select name="vaccine_name" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option value="">Selecione a vacina</option>
                  ${vaccines.map(v => `<option value="${v.vaccine_name}">${v.vaccine_name} (${v.dose || ''})</option>`).join('')}
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Data da Aplicação *</label><input type="date" name="application_date" value="${new Date().toISOString().split('T')[0]}" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Dose *</label>
                <select name="dose" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                  <option>1ª Dose</option><option>2ª Dose</option><option>3ª Dose</option><option>Reforço</option><option>Dose Única</option>
                </select>
              </div>
              <div><label class="block text-xs font-medium text-gray-600 mb-1">Próxima Dose</label><input type="date" name="next_dose_date" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
              <select name="status" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option value="applied">Aplicada</option><option value="scheduled">Agendada</option>
              </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Observações</label><textarea name="observations" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></textarea></div>
            <button type="submit" class="bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-lg font-medium text-sm transition flex items-center gap-2"><i data-lucide="check" class="w-4 h-4"></i>Registrar Aplicação</button>
          </form>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5 mt-6">
          <h3 class="font-bold text-gray-800 mb-3">Aplicações Registradas</h3>
          ${getApplications().length === 0 ? '<p class="text-sm text-gray-400">Nenhuma aplicação registrada</p>' : `
          <div class="space-y-2">
            ${getApplications().slice(-10).reverse().map(a => {
              const patient = patients.find(p => p.sus_card === a.patient_id);
              const overdue = isOverdue(a);
              return `<div class="flex items-center justify-between p-3 rounded-lg ${overdue ? 'bg-red-50' : 'bg-gray-50'} group hover:bg-blue-50 transition">
                <div class="flex-1">
                  <p class="font-medium text-sm">${patient ? patient.name : a.patient_id}</p>
                  <p class="text-xs text-gray-500">${a.vaccine_name} • ${a.dose} • Aplicada: ${a.application_date || '-'}</p>
                  ${a.next_dose_date ? `<p class="text-xs text-amber-600 font-medium">Próxima dose: ${a.next_dose_date}</p>` : ''}
                </div>
                <div class="flex items-center gap-2">
                  ${a.status === 'scheduled' || a.status === 'applied' ? `
                    <select onchange="updateApplicationStatus(event, '${a.__backendId}')" class="text-xs py-1 px-2 rounded border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                      <option value="scheduled" ${a.status === 'scheduled' ? 'selected' : ''}>Agendada</option>
                      <option value="applied" ${a.status === 'applied' ? 'selected' : ''}>Aplicada</option>
                    </select>
                  ` : `
                    <span class="badge ${a.status === 'applied' ? 'badge-green' : overdue ? 'badge-red' : 'badge-yellow'}">${a.status === 'applied' ? 'Aplicada' : overdue ? 'Atrasada' : 'Agendada'}</span>
                  `}
                </div>
              </div>`;
            }).join('')}
          </div>`}
        </div>`;
      lucide.createIcons();
    }

    async function saveApplication(e) {
      e.preventDefault();
      if (allData.length >= 999) { showToast('Limite de registros atingido', 'error'); return; }
      const form = e.target;
      const data = {
        type: 'application',
        patient_id: form.patient_id.value,
        vaccine_name: form.vaccine_name.value,
        application_date: form.application_date.value,
        dose: form.dose.value,
        next_dose_date: form.next_dose_date.value,
        status: form.status.value,
        observations: form.observations.value,
        created_at: new Date().toISOString()
      };
      const result = await window.dataSdk.create(data);
      if (result.isOk) { 
        showToast('Vacina registrada!'); 
        form.reset(); 
        form.application_date.value = new Date().toISOString().split('T')[0];
        
        // Oferece enviar mensagem ao paciente
        const patientId = form.patient_id.value;
        const patient = getPatients().find(p => p.sus_card === patientId);
        if (patient && patient.phone) {
          setTimeout(() => {
            showSendMessageForm(patient.phone, patient.name, form.vaccine_name.value);
          }, 500);
        }
      }
      else showToast('Erro ao registrar', 'error');
    }

    async function updateApplicationStatus(e, backendId) {
      const newStatus = e.target.value;
      const record = allData.find(d => d.__backendId === backendId);
      if (!record) return;
      const updated = { ...record, status: newStatus };
      const result = await window.dataSdk.update(updated);
      if (result.isOk) { showToast('Status atualizado!'); }
      else showToast('Erro ao atualizar', 'error');
    }

    // CONSULTATIONS
    function renderConsultations(el) {
      const patients = getPatients();
      const consultations = getConsultations();
      el.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">${consultations.length} consulta(s) registrada(s)</p>
          <button onclick="showConsultationForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
            <i data-lucide="plus" class="w-4 h-4"></i>Nova Consulta
          </button>
        </div>
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          ${consultations.length === 0 ? '<p class="p-6 text-gray-400 text-sm text-center">Nenhuma consulta registrada.</p>' : `
          <div class="divide-y">
            ${consultations.map(c => {
              const patient = patients.find(p => p.sus_card === c.patient_id);
              const isOverdueConsult = (c.status === 'scheduled' || c.status === 'confirmed') && new Date(c.application_date) < new Date();
              return `<div class="p-4 flex items-center justify-between hover:bg-gray-50 transition group">
                <div class="flex-1">
                  <p class="font-medium text-sm text-gray-800">${patient ? patient.name : 'Paciente'}</p>
                  <p class="text-xs text-gray-500">${c.consultation_type || 'Consulta'} • ${c.application_date || ''} • ${c.professional || 'Profissional não informado'}</p>
                </div>
                <div class="flex items-center gap-2">
                  <select onchange="updateConsultationStatus(event, '${c.__backendId}')" class="text-xs py-1 px-2 rounded border border-gray-300 focus:ring-2 focus:ring-emerald-500 focus:outline-none bg-white">
                    <option value="scheduled" ${c.status === 'scheduled' ? 'selected' : ''}>Agendada</option>
                    <option value="confirmed" ${c.status === 'confirmed' ? 'selected' : ''}>Confirmada</option>
                    <option value="realized" ${c.status === 'realized' ? 'selected' : ''}>Realizada</option>
                    <option value="rescheduled" ${c.status === 'rescheduled' ? 'selected' : ''}>Reagendada</option>
                  </select>
                </div>
              </div>`;
            }).join('')}
          </div>`}
        </div>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
          <div class="bg-white p-4 rounded-xl shadow-sm text-center">
            <p class="text-2xl font-bold text-emerald-600">${consultations.filter(c => c.status === 'realized').length}</p>
            <p class="text-xs text-gray-500 mt-1">Realizadas</p>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm text-center">
            <p class="text-2xl font-bold text-blue-600">${consultations.filter(c => c.status === 'confirmed').length}</p>
            <p class="text-xs text-gray-500 mt-1">Confirmadas</p>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm text-center">
            <p class="text-2xl font-bold text-purple-600">${consultations.filter(c => c.status === 'scheduled').length}</p>
            <p class="text-xs text-gray-500 mt-1">Agendadas</p>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm text-center">
            <p class="text-2xl font-bold text-red-600">${consultations.filter(c => (c.status === 'scheduled' || c.status === 'confirmed') && new Date(c.application_date) < new Date()).length}</p>
            <p class="text-xs text-gray-500 mt-1">Atrasadas</p>
          </div>
        </div>`;
      lucide.createIcons();
    }

    function showConsultationForm() {
      const patients = getPatients();
      showModal('Registrar Consulta', `
        <form onsubmit="saveConsultation(event)" class="space-y-3">
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Paciente *</label>
            <select name="patient_id" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="">Selecione o paciente</option>
              ${patients.map(p => `<option value="${p.sus_card}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipo de Consulta *</label>
              <select name="consultation_type" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
                <option>Puericultura</option>
                <option>Pré-natal</option>
                <option>Rotina</option>
                <option>Urgência</option>
              </select>
            </div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Data *</label><input type="date" name="application_date" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Profissional</label><input name="professional" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select name="status" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="scheduled">Agendada</option>
              <option value="confirmed">Confirmada</option>
              <option value="realized">Realizada</option>
              <option value="rescheduled">Reagendada</option>
            </select>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Observações</label><textarea name="observations" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></textarea></div>
          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium text-sm transition">Registrar Consulta</button>
        </form>`);
      lucide.createIcons();
    }

    async function saveConsultation(e) {
      e.preventDefault();
      if (allData.length >= 999) { showToast('Limite de registros atingido', 'error'); return; }
      const form = e.target;
      const result = await window.dataSdk.create({
        type: 'consultation',
        patient_id: form.patient_id.value,
        consultation_type: form.consultation_type.value,
        application_date: form.application_date.value,
        professional: form.professional.value,
        status: form.status.value,
        observations: form.observations.value,
        created_at: new Date().toISOString()
      });
      if (result.isOk) { showToast('Consulta registrada!'); closeModal(); }
      else showToast('Erro ao registrar', 'error');
    }

    async function updateConsultationStatus(e, backendId) {
      const newStatus = e.target.value;
      const record = allData.find(d => d.__backendId === backendId);
      if (!record) return;
      const updated = { ...record, status: newStatus };
      const result = await window.dataSdk.update(updated);
      if (result.isOk) { showToast('Status atualizado!'); }
      else showToast('Erro ao atualizar', 'error');
    }

    // PRENATAL
    function renderPrenatal(el) {
      const patients = getPatients();
      const gestantes = patients.filter(p => p.category === 'Gestante');
      const prenatal = getPrenatalRecords();
      el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div class="bg-white p-4 rounded-xl shadow-sm text-center">
            <p class="text-2xl font-bold text-emerald-600">${gestantes.length}</p>
            <p class="text-xs text-gray-500 mt-1">Gestantes Cadastradas</p>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm text-center">
            <p class="text-2xl font-bold text-blue-600">${prenatal.length}</p>
            <p class="text-xs text-gray-500 mt-1">Registros de Pré-natal</p>
          </div>
          <div class="bg-white p-4 rounded-xl shadow-sm text-center">
            <p class="text-2xl font-bold text-amber-600">${gestantes.filter(g => {
              const gestWeeks = Math.floor((new Date() - new Date(g.dum)) / 604800000);
              return gestWeeks >= 28;
            }).length}</p>
            <p class="text-xs text-gray-500 mt-1">No 3º Trimestre</p>
          </div>
        </div>
        <div class="bg-white rounded-xl shadow-sm p-5 mb-6">
          <h3 class="font-bold text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="users" class="w-4 h-4 text-emerald-600"></i>Gestantes Cadastradas</h3>
          ${gestantes.length === 0 ? '<p class="text-sm text-gray-400">Nenhuma gestante cadastrada</p>' : `
          <div class="space-y-2">
            ${gestantes.map(g => {
              const weeks = Math.floor((new Date() - new Date(g.dum)) / 604800000);
              const trimester = weeks < 13 ? '1º' : weeks < 28 ? '2º' : '3º';
              return `<div class="p-3 bg-gray-50 rounded-lg flex items-center justify-between">
                <div>
                  <p class="font-medium text-sm">${g.name}</p>
                  <p class="text-xs text-gray-500">${weeks} semanas • ${trimester} trimestre</p>
                </div>
                <button onclick="showPrenatalForm('${g.sus_card}')" class="px-3 py-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 text-xs font-medium rounded transition">
                  <i data-lucide="plus" class="w-3 h-3 inline"></i> Registrar
                </button>
              </div>`;
            }).join('')}
          </div>`}
        </div>
        <div class="bg-white rounded-xl shadow-sm p-5">
          <h3 class="font-bold text-gray-800 mb-3">Registros de Pré-natal</h3>
          ${prenatal.length === 0 ? '<p class="text-sm text-gray-400">Nenhum registro</p>' : `
          <div class="space-y-2">
            ${prenatal.slice(-10).reverse().map(p => {
              const patient = patients.find(pt => pt.sus_card === p.patient_id);
              return `<div class="p-3 bg-gray-50 rounded-lg">
                <div class="flex items-center justify-between">
                  <div>
                    <p class="font-medium text-sm">${patient ? patient.name : 'Gestante'}</p>
                    <p class="text-xs text-gray-500">${p.consultation_type || ''} • ${p.application_date || ''}</p>
                  </div>
                  <span class="badge badge-green">${p.status || 'Registrado'}</span>
                </div>
                ${p.observations ? `<p class="text-xs text-gray-600 mt-1">${p.observations}</p>` : ''}
              </div>`;
            }).join('')}
          </div>`}
        </div>`;
      lucide.createIcons();
    }

    function showPrenatalForm(patientId) {
      showModal('Registrar Pré-natal', `
        <form onsubmit="savePrenatal(event, '${patientId}')" class="space-y-3">
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipo de Consulta *</label>
            <select name="consultation_type" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option>Consulta Pré-natal</option>
              <option>Ultrassom</option>
              <option>Exame Laboratorial</option>
              <option>Vacinação</option>
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Data *</label><input type="date" name="application_date" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Profissional</label><input name="professional" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Observações/Resultado</label><textarea name="observations" rows="3" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></textarea></div>
          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium text-sm transition">Salvar Registro</button>
        </form>`);
      lucide.createIcons();
    }

    async function savePrenatal(e, patientId) {
      e.preventDefault();
      if (allData.length >= 999) { showToast('Limite de registros atingido', 'error'); return; }
      const form = e.target;
      const result = await window.dataSdk.create({
        type: 'prenatal',
        patient_id: patientId,
        consultation_type: form.consultation_type.value,
        application_date: form.application_date.value,
        professional: form.professional.value,
        observations: form.observations.value,
        status: 'Registrado',
        created_at: new Date().toISOString()
      });
      if (result.isOk) { showToast('Pré-natal registrado!'); closeModal(); }
      else showToast('Erro ao registrar', 'error');
    }

    // VISITS
    function renderVisits(el) {
      const patients = getPatients();
      const visits = getVisits();
      const todayVisits = visits.filter(v => v.visit_date === new Date().toISOString().split('T')[0]);
      el.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">${visits.length} visita(s) registrada(s) • ${todayVisits.length} hoje</p>
          <button onclick="showVisitForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
            <i data-lucide="plus" class="w-4 h-4"></i>Nova Visita
          </button>
        </div>
        ${todayVisits.length > 0 ? `
        <div class="bg-emerald-50 border border-emerald-200 rounded-xl p-4 mb-4">
          <h3 class="font-bold text-emerald-900 mb-2 text-sm">Visitas de Hoje</h3>
          <div class="space-y-1">
            ${todayVisits.map(v => {
              const patient = patients.find(p => p.sus_card === v.patient_id);
              return `<div class="text-sm text-emerald-800">✓ ${patient ? patient.name : v.patient_name} - ${v.visit_type || 'Visita'}</div>`;
            }).join('')}
          </div>
        </div>` : ''}
        <div class="bg-white rounded-xl shadow-sm overflow-hidden">
          ${visits.length === 0 ? '<p class="p-6 text-gray-400 text-sm text-center">Nenhuma visita registrada.</p>' : `
          <div class="divide-y">
            ${visits.slice(-10).reverse().map(v => {
              const patient = patients.find(p => p.sus_card === v.patient_id);
              const photoUrl = getPhotoUrl(v);
              return `<div class="p-4 flex items-center justify-between gap-3 hover:bg-gray-50 transition">
                ${photoUrl ? `
                  <button onclick="showVisitPhoto('${v.__backendId}')" class="shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500" aria-label="Abrir foto da visita">
                    <img src="${photoUrl}" alt="Foto da visita" class="visit-photo-thumb">
                  </button>
                ` : `
                  <div class="shrink-0 w-16 h-16 bg-emerald-50 rounded-xl border border-emerald-100 flex items-center justify-center">
                    <i data-lucide="home" class="w-6 h-6 text-emerald-600"></i>
                  </div>
                `}
                <div class="flex-1 min-w-0">
                  <p class="font-medium text-sm text-gray-800">${patient ? patient.name : v.patient_name}</p>
                  <p class="text-xs text-gray-500">${v.visit_type || 'Visita'} • ${v.visit_date} ${v.visit_time ? '• ' + v.visit_time : ''}</p>
                  ${v.photo_name ? `<p class="text-xs text-emerald-600 font-medium mt-1">Foto salva no aparelho</p>` : ''}
                </div>
                <span class="badge ${v.status === 'realized' ? 'badge-green' : v.status === 'scheduled' ? 'badge-blue' : 'badge-yellow'}">${v.status === 'realized' ? 'Realizada' : v.status === 'scheduled' ? 'Agendada' : 'Reagendada'}</span>
              </div>`;
            }).join('')}
          </div>`}
        </div>`;
      lucide.createIcons();
    }

    function showVisitForm() {
      const patients = getPatients();
      showModal('Registrar Visita Domiciliar', `
        <form onsubmit="saveVisit(event)" class="space-y-3">
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Paciente *</label>
            <select name="patient_id" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="">Selecione o paciente</option>
              ${patients.map(p => `<option value="${p.sus_card}">${p.name}</option>`).join('')}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Data *</label><input type="date" name="visit_date" value="${new Date().toISOString().split('T')[0]}" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Horário</label><input type="time" name="visit_time" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Tipo de Visita *</label>
            <select name="visit_type" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option>Orientação</option>
              <option>Busca Ativa</option>
              <option>Acompanhamento</option>
              <option>Coleta de Exame</option>
              <option>Vacinação</option>
            </select>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Status</label>
            <select name="status" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="realized">Realizada</option>
              <option value="scheduled">Agendada</option>
              <option value="rescheduled">Reagendada</option>
            </select>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Observações</label><textarea name="observations" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></textarea></div>
          <div class="border rounded-lg p-3 bg-gray-50">
            <label class="block text-xs font-medium text-gray-600 mb-2">Foto da visita</label>
            <input id="photo-input" name="photo" type="file" accept="image/*" capture="environment" onchange="previewPhoto(event)" class="camera-input w-full text-xs text-gray-600">
            <div id="photo-preview" class="hidden mt-3">
              <img id="preview-img" alt="Prévia da foto" class="w-full max-h-56 object-cover rounded-lg border">
              <button type="button" onclick="clearPhoto()" class="mt-2 text-xs text-red-600 hover:text-red-700 font-medium">Remover foto</button>
            </div>
          </div>
          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium text-sm transition">Registrar Visita</button>
        </form>`);
      lucide.createIcons();
    }

    function getPhotoUrl(record) {
      if (!record || !record.photo_blob) return '';
      if (!photoUrlCache.has(record.__backendId)) {
        photoUrlCache.set(record.__backendId, URL.createObjectURL(record.photo_blob));
      }
      return photoUrlCache.get(record.__backendId);
    }

    async function preparePhotoBlob(file) {
      if (!file || !file.type || !file.type.startsWith('image/')) return null;
      if (!window.createImageBitmap) return file;
      const bitmap = await createImageBitmap(file).catch(() => null);
      if (!bitmap) return file;

      const maxSize = 1400;
      const scale = Math.min(1, maxSize / Math.max(bitmap.width, bitmap.height));
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(bitmap, 0, 0, width, height);

      return new Promise((resolve) => {
        canvas.toBlob((blob) => resolve(blob || file), 'image/jpeg', 0.78);
      });
    }

    function showVisitPhoto(backendId) {
      const visit = allData.find(d => d.__backendId === backendId);
      const url = getPhotoUrl(visit);
      if (!url) {
        showToast('Foto não encontrada no banco local', 'warning');
        return;
      }
      const patient = getPatients().find(p => p.sus_card === visit.patient_id);
      showModal('Foto da Visita', `
        <div class="space-y-3">
          <img src="${url}" alt="Foto da visita" class="w-full rounded-lg border object-contain max-h-[65vh] bg-gray-100">
          <div>
            <p class="font-medium text-sm text-gray-800">${patient ? patient.name : 'Paciente'}</p>
            <p class="text-xs text-gray-500">${visit.visit_type || 'Visita'} • ${visit.visit_date || ''} ${visit.visit_time || ''}</p>
          </div>
        </div>`);
      lucide.createIcons();
    }

    function previewPhoto(e) {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(event) {
          const preview = document.getElementById('photo-preview');
          const img = document.getElementById('preview-img');
          img.src = event.target.result;
          preview.classList.remove('hidden');
          document.getElementById('photo-input').dataset.photoData = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    }

    function clearPhoto() {
      document.getElementById('photo-input').value = '';
      document.getElementById('photo-input').dataset.photoData = '';
      document.getElementById('photo-preview').classList.add('hidden');
    }

    async function saveVisit(e) {
      e.preventDefault();
      if (allData.length >= 999) { showToast('Limite de registros atingido', 'error'); return; }
      const form = e.target;
      const photoInput = form.querySelector('#photo-input');
      const photoFile = photoInput && photoInput.files && photoInput.files[0] ? photoInput.files[0] : null;
      const photoBlob = await preparePhotoBlob(photoFile);
      const visitRecord = {
        type: 'visit',
        patient_id: form.patient_id.value,
        visit_date: form.visit_date.value,
        visit_time: form.visit_time.value,
        visit_type: form.visit_type.value,
        status: form.status.value,
        observations: form.observations.value,
        created_at: new Date().toISOString()
      };
      if (photoBlob) {
        visitRecord.photo_blob = photoBlob;
        visitRecord.photo_name = photoFile.name || `visita-${Date.now()}.jpg`;
        visitRecord.photo_type = photoBlob.type || photoFile.type || 'image/jpeg';
        visitRecord.photo_size = photoBlob.size || photoFile.size || 0;
      }
      const result = await window.dataSdk.create(visitRecord);
      if (result.isOk) { showToast('Visita registrada!'); closeModal(); }
      else showToast('Erro ao registrar', 'error');
    }
    function renderVaccines(el) {
      const vaccines = getVaccines();
      el.innerHTML = `
        <div class="flex items-center justify-between mb-4">
          <p class="text-sm text-gray-500">${vaccines.length} vacina(s) cadastrada(s)</p>
          <button onclick="showVaccineForm()" class="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition">
            <i data-lucide="plus" class="w-4 h-4"></i>Nova Vacina
          </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          ${vaccines.length === 0 ? '<p class="text-gray-400 text-sm col-span-full text-center py-8">Nenhuma vacina cadastrada. Clique em "Nova Vacina" para começar.</p>' :
          vaccines.map(v => `
            <div class="bg-white rounded-xl shadow-sm p-4 card-hover border-l-4 border-emerald-500">
              <div class="flex items-start justify-between">
                <div>
                  <h4 class="font-bold text-sm text-gray-800">${v.vaccine_name}</h4>
                  <p class="text-xs text-gray-500 mt-1">${v.dose || ''} • ${v.age_range || ''}</p>
                  ${v.description ? `<p class="text-xs text-gray-400 mt-2">${v.description}</p>` : ''}
                </div>
                <button onclick="deleteVaccineRecord('${v.__backendId}')" class="p-1 hover:bg-red-50 rounded text-red-400"><i data-lucide="trash-2" class="w-3.5 h-3.5"></i></button>
              </div>
              <div class="flex gap-2 mt-3">
                ${v.interval_days ? `<span class="text-[10px] bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Intervalo: ${v.interval_days}d</span>` : ''}
                ${v.delay_days ? `<span class="text-[10px] bg-amber-50 text-amber-600 px-2 py-0.5 rounded-full">Atraso: ${v.delay_days}d</span>` : ''}
              </div>
            </div>`).join('')}
        </div>`;
      lucide.createIcons();
    }

    function showVaccineForm() {
      showModal('Cadastrar Vacina', `
        <form onsubmit="saveVaccine(event)" class="space-y-3">
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Nome da Vacina *</label><input name="vaccine_name" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Dose</label><input name="dose" placeholder="Ex: 1ª Dose" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Faixa Etária</label><input name="age_range" placeholder="Ex: 2 meses" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          </div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Intervalo entre doses (dias)</label><input type="number" name="interval_days" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
            <div><label class="block text-xs font-medium text-gray-600 mb-1">Dias para atraso</label><input type="number" name="delay_days" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></div>
          </div>
          <div><label class="block text-xs font-medium text-gray-600 mb-1">Descrição</label><textarea name="description" rows="2" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none"></textarea></div>
          <button type="submit" class="w-full bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium text-sm transition">Salvar Vacina</button>
        </form>`);
      lucide.createIcons();
    }

    async function saveVaccine(e) {
      e.preventDefault();
      if (allData.length >= 999) { showToast('Limite de registros atingido', 'error'); return; }
      const form = e.target;
      const result = await window.dataSdk.create({
        type: 'vaccine',
        vaccine_name: form.vaccine_name.value,
        dose: form.dose.value,
        age_range: form.age_range.value,
        interval_days: parseInt(form.interval_days.value) || 0,
        delay_days: parseInt(form.delay_days.value) || 0,
        description: form.description.value,
        active: true,
        created_at: new Date().toISOString()
      });
      if (result.isOk) { showToast('Vacina cadastrada!'); closeModal(); }
      else showToast('Erro ao cadastrar', 'error');
    }

    async function deleteVaccineRecord(id) {
      const record = allData.find(d => d.__backendId === id);
      if (record) {
        const result = await window.dataSdk.delete(record);
        if (result.isOk) showToast('Vacina excluída');
      }
    }

    // ROUTE
    function renderRoute(el) {
      const apps = getApplications().filter(isOverdue);
      const patients = getPatients();
      // Group by address/street
      const grouped = {};
      apps.forEach(a => {
        const patient = patients.find(p => p.sus_card === a.patient_id);
        if (!patient) return;
        const street = patient.address || 'Sem endereço';
        if (!grouped[street]) grouped[street] = [];
        grouped[street].push({ ...a, patientName: patient.name });
      });

      el.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm p-5">
          <h3 class="font-bold text-gray-800 mb-1 flex items-center gap-2"><i data-lucide="route" class="w-5 h-5 text-emerald-600"></i>Roteiro Inteligente</h3>
          <p class="text-xs text-gray-500 mb-4">Visitas agrupadas por endereço para otimizar deslocamento</p>
          ${Object.keys(grouped).length === 0 ? '<p class="text-sm text-gray-400 text-center py-8">Nenhuma visita pendente! 🎉</p>' : `
          <div class="space-y-4">
            ${Object.entries(grouped).map(([street, items]) => `
              <div class="border rounded-lg p-3">
                <div class="flex items-center gap-2 mb-2">
                  <i data-lucide="map-pin" class="w-4 h-4 text-emerald-600"></i>
                  <span class="font-medium text-sm text-gray-700">${street}</span>
                  <span class="badge badge-red">${items.length}</span>
                </div>
                <div class="space-y-1 pl-6">
                  ${items.map(i => `<div class="text-xs text-gray-600 flex items-center gap-2">
                    <span class="w-1.5 h-1.5 bg-red-400 rounded-full"></span>
                    <span class="font-medium">${i.patientName}</span> → ${i.vaccine_name}
                  </div>`).join('')}
                </div>
              </div>`).join('')}
          </div>`}
        </div>`;
      lucide.createIcons();
    }

    // ALERTS
    function renderAlerts(el) {
      const patients = getPatients();
      const apps = getApplications();
      const alerts = [];

      // Overdue vaccines
      apps.filter(isOverdue).forEach(a => {
        const p = patients.find(pt => pt.sus_card === a.patient_id);
        alerts.push({ icon: 'alert-triangle', color: 'red', msg: `${p ? p.name : 'Paciente'}: ${a.vaccine_name} atrasada`, type: 'Vacina' });
      });

      // Overdue consultations
      getConsultations().filter(c => c.status === 'scheduled' && new Date(c.application_date) < new Date()).forEach(c => {
        const p = patients.find(pt => pt.sus_card === c.patient_id);
        alerts.push({ icon: 'calendar', color: 'red', msg: `${p ? p.name : 'Paciente'}: consulta atrasada`, type: 'Consulta' });
      });

      // Upcoming (next 7 days)
      apps.filter(a => a.status !== 'applied' && a.next_dose_date).forEach(a => {
        const diff = (new Date(a.next_dose_date) - new Date()) / 86400000;
        if (diff >= 0 && diff <= 7) {
          const p = patients.find(pt => pt.sus_card === a.patient_id);
          alerts.push({ icon: 'clock', color: 'amber', msg: `${p ? p.name : 'Paciente'}: ${a.vaccine_name} vence em ${Math.ceil(diff)} dia(s)`, type: 'Próxima' });
        }
      });

      // Gestantes without recent activity
      patients.filter(p => p.category === 'Gestante').forEach(p => {
        const patientApps = apps.filter(a => a.patient_id === p.sus_card);
        const patientConsults = getConsultations().filter(c => c.patient_id === p.sus_card);
        if (patientConsults.length === 0 && patientApps.length === 0) {
          alerts.push({ icon: 'heart', color: 'red', msg: `${p.name}: gestante sem registro de acompanhamento`, type: 'Gestante' });
        }
      });

      el.innerHTML = `
        <div class="bg-white rounded-xl shadow-sm p-5">
          <h3 class="font-bold text-gray-800 mb-4 flex items-center gap-2"><i data-lucide="bell" class="w-5 h-5 text-amber-500"></i>Alertas Automáticos</h3>
          ${alerts.length === 0 ? '<p class="text-sm text-gray-400 text-center py-8">Nenhum alerta no momento! ✅</p>' : `
          <div class="space-y-2">
            ${alerts.map(a => {
              const bgColors = { red: 'bg-red-50', amber: 'bg-amber-50' };
              const borderColors = { red: 'border-red-100', amber: 'border-amber-100' };
              const textColors = { red: 'text-red-500', amber: 'text-amber-500' };
              const badgeColors = { red: 'bg-red-100 text-red-600', amber: 'bg-amber-100 text-amber-600' };
              return `
              <div class="flex items-center gap-3 p-3 ${bgColors[a.color]} rounded-lg border ${borderColors[a.color]}">
                <i data-lucide="${a.icon}" class="w-4 h-4 ${textColors[a.color]} shrink-0"></i>
                <div class="flex-1">
                  <p class="text-sm text-gray-700">${a.msg}</p>
                </div>
                <span class="text-[10px] font-medium ${badgeColors[a.color]} px-2 py-0.5 rounded-full">${a.type}</span>
              </div>`;
            }).join('')}
          </div>`}
        </div>`;
      lucide.createIcons();
    }

    // REPORTS
    function renderReports(el) {

    // MESSAGE SERVICE
    function showSendMessageForm(phone, patientName, vaccineName) {
      if (!phone) {
        showToast('Paciente não possui telefone cadastrado', 'warning');
        return;
      }
      
      showModal('Enviar Notificação', `
        <form onsubmit="sendMessage(event, '${phone.replace(/'/g, "\\'")}', '${patientName.replace(/'/g, "\\'")}', '${vaccineName.replace(/'/g, "\\'")}')" class="space-y-4">
          <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-3">
            <p class="text-xs text-blue-700"><strong>ℹ️ Informação:</strong> As mensagens serão enviadas via WhatsApp Web. Certifique-se de que o WhatsApp está instalado no seu dispositivo.</p>
          </div>
          
          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Destinatário</label>
            <input type="text" value="${patientName} (${phone})" disabled class="w-full border rounded-lg px-3 py-2 text-sm bg-gray-100">
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-1">Serviço de Envio</label>
            <select name="service" required class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none">
              <option value="">Selecione o serviço</option>
              <option value="whatsapp">WhatsApp Web</option>
              <option value="telegram">Telegram</option>
              <option value="sms">SMS (Simulado)</option>
            </select>
          </div>

          <div>
            <label class="block text-xs font-medium text-gray-600 mb-2">Mensagem</label>
            <div class="space-y-2 mb-2">
              <button type="button" onclick="setMessageTemplate('lembrete')" class="text-xs text-blue-600 hover:text-blue-700 underline block">📌 Template: Lembrete</button>
              <button type="button" onclick="setMessageTemplate('confirmacao')" class="text-xs text-blue-600 hover:text-blue-700 underline block">✓ Template: Confirmação</button>
              <button type="button" onclick="setMessageTemplate('urgente')" class="text-xs text-blue-600 hover:text-blue-700 underline block">⚠️ Template: Urgente</button>
            </div>
            <textarea name="message" required rows="4" class="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:outline-none" placeholder="Digite sua mensagem...">Olá ${patientName}, você tem uma vacina agendada: ${vaccineName}. Compareça à UBS Central para aplicação.</textarea>
          </div>

          <div class="flex gap-2">
            <button type="submit" class="flex-1 bg-emerald-600 hover:bg-emerald-700 text-white py-2.5 rounded-lg font-medium text-sm transition flex items-center justify-center gap-2">
              <i data-lucide="send" class="w-4 h-4"></i> Enviar
            </button>
            <button type="button" onclick="closeModal()" class="flex-1 bg-gray-200 hover:bg-gray-300 text-gray-700 py-2.5 rounded-lg font-medium text-sm transition">Cancelar</button>
          </div>
        </form>`);
      lucide.createIcons();
    }

    function setMessageTemplate(type) {
      const textarea = document.querySelector('textarea[name="message"]');
      const templates = {
        lembrete: 'Olá! Você tem uma vacina agendada. Compareça à UBS Central para aplicação.',
        confirmacao: 'Obrigado por confirmar sua presença! Veja você em breve para sua vacinação.',
        urgente: '⚠️ URGENTE: Sua vacinação está atrasada! Compareça à unidade de saúde o mais breve possível.'
      };
      if (textarea) textarea.value = templates[type] || '';
    }

    async function sendMessage(e, phone, patientName, vaccineName) {
      e.preventDefault();
      const form = e.target;
      const service = form.service.value;
      const message = form.message.value;

      if (!service || !message) {
        showToast('Preencha todos os campos', 'error');
        return;
      }

      // Simulate sending
      if (service === 'whatsapp') {
        const encodedMsg = encodeURIComponent(message);
        const cleanPhone = phone.replace(/\D/g, '');
        const whatsappUrl = `https://wa.me/55${cleanPhone}?text=${encodedMsg}`;
        window.open(whatsappUrl, '_blank');
        showToast('Abrindo WhatsApp Web... Complete o envio no seu dispositivo.');
      } else if (service === 'telegram') {
        showToast('⚠️ Integração Telegram: Configure um bot do Telegram para automatizar.', 'warning');
      } else if (service === 'sms') {
        showToast('📱 SMS: Integre com Twilio ou outro serviço SMS para envio automático.', 'warning');
      }

      closeModal();
      showToast(`Notificação enviada para ${patientName}!`);
    }
      const patients = getPatients();
      const apps = getApplications();
      const consultations = getConsultations();
      const visits = getVisits();
      const overdueCount = apps.filter(isOverdue).length;
      const appliedCount = apps.filter(a => a.status === 'applied').length;
      const gestantes = patients.filter(p => p.category === 'Gestante').length;
      const criancas = patients.filter(p => p.category === 'Criança').length;
      const realizadConsults = consultations.filter(c => c.status === 'realized').length;
      const realizadVisits = visits.filter(v => v.status === 'realized').length;

      el.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div class="bg-white rounded-xl shadow-sm p-5">
            <h4 class="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="users" class="w-4 h-4"></i>Pacientes</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm"><span class="text-gray-500">Total</span><span class="font-bold">${patients.length}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Crianças</span><span class="font-bold">${criancas}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Gestantes</span><span class="font-bold">${gestantes}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Adolescentes</span><span class="font-bold">${patients.filter(p => p.category === 'Adolescente').length}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Adultos</span><span class="font-bold">${patients.filter(p => p.category === 'Adulto').length}</span></div>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-5">
            <h4 class="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="syringe" class="w-4 h-4"></i>Vacinação</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm"><span class="text-gray-500">Aplicadas</span><span class="font-bold text-emerald-600">${appliedCount}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Agendadas</span><span class="font-bold text-blue-600">${apps.filter(a => a.status === 'scheduled').length}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Atrasadas</span><span class="font-bold text-red-600">${overdueCount}</span></div>
              <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div class="bg-emerald-500 h-2 rounded-full" style="width: ${apps.length > 0 ? Math.round((appliedCount / apps.length) * 100) : 0}%"></div>
              </div>
              <p class="text-xs text-gray-500 mt-1">Cobertura: ${apps.length > 0 ? Math.round((appliedCount / apps.length) * 100) : 0}%</p>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-5">
            <h4 class="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="activity" class="w-4 h-4"></i>Acompanhamento</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm"><span class="text-gray-500">Consultas</span><span class="font-bold">${consultations.length}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Realizadas</span><span class="font-bold text-emerald-600">${realizadConsults}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Atrasadas</span><span class="font-bold text-red-600">${consultations.filter(c => c.status === 'scheduled' && new Date(c.application_date) < new Date()).length}</span></div>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-5">
            <h4 class="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="home" class="w-4 h-4"></i>Visitas</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm"><span class="text-gray-500">Total</span><span class="font-bold">${visits.length}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Realizadas</span><span class="font-bold text-emerald-600">${realizadVisits}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Agendadas</span><span class="font-bold text-blue-600">${visits.filter(v => v.status === 'scheduled').length}</span></div>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-5">
            <h4 class="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="heart-handshake" class="w-4 h-4"></i>Pré-natal</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm"><span class="text-gray-500">Gestantes</span><span class="font-bold">${gestantes}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Registros</span><span class="font-bold">${getPrenatalRecords().length}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Média/Gestante</span><span class="font-bold">${gestantes > 0 ? (getPrenatalRecords().length / gestantes).toFixed(1) : 0}</span></div>
            </div>
          </div>

          <div class="bg-white rounded-xl shadow-sm p-5">
            <h4 class="font-bold text-sm text-gray-800 mb-3 flex items-center gap-2"><i data-lucide="bar-chart-2" class="w-4 h-4"></i>Resumo</h4>
            <div class="space-y-2">
              <div class="flex justify-between text-sm"><span class="text-gray-500">Total Registros</span><span class="font-bold">${allData.length}</span></div>
              <div class="flex justify-between text-sm"><span class="text-gray-500">Limite</span><span class="font-bold text-amber-600">999</span></div>
              <div class="w-full bg-gray-200 rounded-full h-2 mt-2">
                <div class="bg-amber-500 h-2 rounded-full" style="width: ${(allData.length / 999) * 100}%"></div>
              </div>
            </div>
          </div>
        </div>

        <div class="bg-white rounded-xl shadow-sm p-5">
          <h3 class="font-bold text-gray-800 mb-4">Distribuição por Categoria</h3>
          <div class="grid grid-cols-2 md:grid-cols-4 gap-3">
            ${['Criança', 'Adolescente', 'Gestante', 'Adulto'].map(cat => {
              const count = patients.filter(p => p.category === cat).length;
              const colors = { Criança: { bg: 'bg-blue-50', text: 'text-blue-600', badge: 'badge-blue' }, Adolescente: { bg: 'bg-purple-50', text: 'text-purple-600', badge: 'badge-blue' }, Gestante: { bg: 'bg-pink-50', text: 'text-pink-600', badge: 'badge-blue' }, Adulto: { bg: 'bg-gray-100', text: 'text-gray-600', badge: 'badge-blue' } };
              const c = colors[cat];
              return `<div class="text-center p-3 ${c.bg} rounded-lg">
                <p class="text-2xl font-bold ${c.text}">${count}</p>
                <p class="text-xs text-gray-500">${cat}</p>
              </div>`;
            }).join('')}
          </div>
        </div>`;
      lucide.createIcons();
    }

    // Global search
    document.getElementById('global-search').addEventListener('input', function(e) {
      const query = e.target.value.toLowerCase();
      if (query.length >= 2) {
        const found = getPatients().filter(p => p.name.toLowerCase().includes(query) || (p.sus_card && p.sus_card.includes(query)));
        if (found.length === 1) showPatientProfile(found[0].sus_card);
      }
    });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch(console.warn);
      });
    }

    // Initial render
    renderCurrentPage();
    lucide.createIcons();
  
