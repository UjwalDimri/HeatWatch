'use strict';

(function admin() {
  const errEl = document.getElementById('admin-error');
  const $ = (id) => document.getElementById(id);

  function fail(msg) { errEl.textContent = msg; errEl.hidden = false; }

  async function getJson(url) {
    const res = await fetch(url);
    const body = await res.json();
    if (!res.ok) throw new Error(body.error || `Request to ${url} failed.`);
    return body;
  }

  async function loadStats() {
    const s = await getJson('/api/admin/statistics');
    $('a-users').textContent = s.totalUsers;
    $('a-active').textContent = s.activeUsers;
    $('a-preds').textContent = s.totalPredictions;
    $('a-alerts').textContent = s.totalAlerts;
    $('a-uprofiles').textContent = s.profiles.user;
    $('a-sprofiles').textContent = s.profiles.synthetic;

    const tbody = document.querySelector('#data-status-table tbody');
    tbody.innerHTML = '';
    Object.entries(s.dataFiles).forEach(([name, info]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${name}.csv</td><td>${info.present ? 'yes' : 'no'}</td>
        <td>${info.present ? (info.bytes / 1024).toFixed(1) + ' KB' : '—'}</td>
        <td>${info.present ? new Date(info.modified).toLocaleString() : '—'}</td>`;
      tbody.appendChild(tr);
    });

    const m = s.model;
    $('m-status').textContent = m.runtime.modelAvailable
      ? 'trained model loaded'
      : 'no trained model — transparent rule engine in use';
    $('m-type').textContent = m.metadata ? m.metadata.modelType : 'rule engine (calculations/htsi.js)';
    $('m-version').textContent = m.metadata ? 'v' + m.metadata.modelVersion : '—';
    $('m-date').textContent = m.metadata ? new Date(m.metadata.trainingDate).toLocaleString() : '—';
    $('m-labels').textContent = m.metadata ? m.metadata.labelSource + ' (prototype, not medically validated)' : '—';
    $('m-metrics').textContent = m.metrics
      ? `MAE ${m.metrics.test.mae} · RMSE ${m.metrics.test.rmse} · R² ${m.metrics.test.r2} · risk-level accuracy ${m.metrics.riskLevelClassification.accuracy}`
      : '—';
  }

  async function loadApiStatus() {
    const s = await getJson('/api/admin/api-status');
    const tbody = document.querySelector('#api-status-table tbody');
    tbody.innerHTML = '';
    const rows = [['Open-Meteo', s.openMeteo], ['NASA POWER', s.nasaPower], ['IMD', s.imd], ['Nominatim', s.nominatim]];
    rows.forEach(([name, st]) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${name}</td>
        <td><span class="status-chip" data-state="${st.state}">${st.state}</span></td>
        <td>${st.checkedAt ? new Date(st.checkedAt).toLocaleTimeString() : '—'}</td>
        <td>${st.detail || ''}</td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadUsers() {
    const { users } = await getJson('/api/admin/users');
    const tbody = document.querySelector('#users-table tbody');
    tbody.innerHTML = '';
    users.forEach((u) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${u.name}</td><td>${u.email}</td><td>${u.role}</td>
        <td>${new Date(u.createdAt).toLocaleDateString()}</td>
        <td>${u.lastLogin ? new Date(u.lastLogin).toLocaleString() : 'never'}</td>`;
      tbody.appendChild(tr);
    });
  }

  async function loadLogs() {
    const { logs } = await getJson('/api/admin/logs');
    const tbody = document.querySelector('#logs-table tbody');
    tbody.innerHTML = '';
    logs.forEach((l) => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${new Date(l.timestamp).toLocaleString()}</td>
        <td class="lvl-${l.level}">${l.level}</td><td>${l.category}</td><td>${l.message}</td>`;
      tbody.appendChild(tr);
    });
  }

  Promise.allSettled([loadStats(), loadApiStatus(), loadUsers(), loadLogs()]).then((results) => {
    const firstErr = results.find((r) => r.status === 'rejected');
    if (firstErr) fail(firstErr.reason.message);
  });
})();
