/**
 * GEF - Gestor de Ferragem
 * embaixadores.js - Programa de Embaixadores & Links de Indicação Reais
 */

import {
  dbGetAmbassadors,
  dbSaveAmbassador,
  dbToggleAmbassadorStatus,
  dbGetAmbassadorReferrals,
  dbGetAmbassadorCommissions
} from './database.js';
import { formatCurrency, formatPhone, formatDateTime, buildWhatsAppLink } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';

let ambassadorsList = [];

export async function init() {
  setupEvents();
  setupModals();
  await loadAmbassadors();
}

function setupEvents() {
  document.getElementById('btn-refresh-ambassadors')?.addEventListener('click', loadAmbassadors);
  document.getElementById('btn-new-ambassador')?.addEventListener('click', () => {
    document.getElementById('modal-ambassador').style.display = 'flex';
  });
}

function setupModals() {
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-ambassador').style.display = 'none';
      document.getElementById('modal-amb-history').style.display = 'none';
    });
  });

  document.getElementById('form-new-ambassador')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('amb-name').value.trim(),
      profession: document.getElementById('amb-profession').value.trim(),
      phone: document.getElementById('amb-phone').value.trim(),
      email: document.getElementById('amb-email').value.trim(),
      referral_code: document.getElementById('amb-code').value.trim().toUpperCase(),
      commission_rate: document.getElementById('amb-rate').value,
      pix_key: document.getElementById('amb-pix').value.trim()
    };

    try {
      await dbSaveAmbassador(payload);
      showToast('Embaixador registrado com sucesso!', 'success');
      document.getElementById('modal-ambassador').style.display = 'none';
      document.getElementById('form-new-ambassador').reset();
      await loadAmbassadors();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadAmbassadors() {
  const container = document.getElementById('embaixadores-table-container');
  if (!container) return;
  showLoading(container, 'Consultando embaixadores no Supabase...');

  try {
    ambassadorsList = await dbGetAmbassadors();

    // Atualiza KPIs
    const activeCount = ambassadorsList.filter(a => a.status === 'ativo').length;
    let totalEarned = 0;
    ambassadorsList.forEach(a => {
      totalEarned += Number(a.total_earned || 0);
    });

    const kpiCount = document.getElementById('kpi-ambassadors-count');
    const kpiEarned = document.getElementById('kpi-commissions-total');
    if (kpiCount) kpiCount.textContent = activeCount;
    if (kpiEarned) kpiEarned.textContent = formatCurrency(totalEarned);

    if (!ambassadorsList || ambassadorsList.length === 0) {
      container.innerHTML = renderEmptyState({
        title: 'Nenhum embaixador cadastrado',
        message: 'Cadastre divulgadores e parceiros comerciais para gerar links únicos de indicação.'
      });
      return;
    }

    const baseUrl = window.location.origin + window.location.pathname;

    const columns = [
      {
        label: 'Embaixador / Parceiro',
        key: 'name',
        render: (a) => `
          <div>
            <strong>${a.name}</strong><br />
            <small style="color: var(--text-muted);">${a.profession || 'Divulgador'}</small>
          </div>
        `
      },
      {
        label: 'Contato & Pix',
        key: 'phone',
        render: (a) => `
          <div>
            <span>${formatPhone(a.phone)}</span><br />
            <small style="color: var(--text-muted);">${a.pix_key ? 'Pix: ' + a.pix_key : 'Sem Pix'}</small>
          </div>
        `
      },
      {
        label: 'Link de Indicação',
        key: 'referral_code',
        render: (a) => {
          const code = a.referral_code || 'PROMO';
          const refLink = `${baseUrl}#login?ref=${code}`;
          return `
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <code style="font-weight: 700; color: var(--primary);">${code}</code>
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-outline btn-xs btn-copy-link" data-link="${refLink}">
                  Copiar Link
                </button>
                <a href="${buildWhatsAppLink(a.phone, `Olá ${a.name}! Seu link exclusivo de indicação do GEF Ferragens é: ${refLink}`)}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-xs">
                  WhatsApp
                </a>
              </div>
            </div>
          `;
        }
      },
      {
        label: '% Comissão',
        key: 'commission_rate',
        numeric: true,
        render: (a) => `${a.commission_rate}%`
      },
      {
        label: 'Comissão Acumulada',
        key: 'total_earned',
        numeric: true,
        render: (a) => `<strong>${formatCurrency(a.total_earned || 0)}</strong>`
      },
      {
        label: 'Status',
        key: 'status',
        render: (a) => {
          const isActive = a.status === 'ativo';
          return `<span class="badge ${isActive ? 'badge-success' : 'badge-danger'}">${(a.status || 'ativo').toUpperCase()}</span>`;
        }
      },
      {
        label: 'Ações',
        key: 'actions',
        render: (a) => `
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-outline btn-xs btn-view-history" data-id="${a.id}" data-name="${a.name}">
              Extrato
            </button>
            <button class="btn ${a.status === 'ativo' ? 'btn-danger' : 'btn-success'} btn-xs btn-toggle-status" data-id="${a.id}" data-status="${a.status}">
              ${a.status === 'ativo' ? 'Bloquear' : 'Ativar'}
            </button>
          </div>
        `
      }
    ];

    container.innerHTML = renderTable({ columns, rows: ambassadorsList });

    // Eventos
    container.querySelectorAll('.btn-copy-link').forEach(btn => {
      btn.addEventListener('click', () => {
        navigator.clipboard.writeText(btn.dataset.link);
        showToast('Link de indicação copiado!', 'success');
      });
    });

    container.querySelectorAll('.btn-toggle-status').forEach(btn => {
      btn.addEventListener('click', async () => {
        try {
          await dbToggleAmbassadorStatus(btn.dataset.id, btn.dataset.status);
          showToast('Status do embaixador alterado.', 'info');
          await loadAmbassadors();
        } catch (err) {
          showToast(err.message, 'error');
        }
      });
    });

    container.querySelectorAll('.btn-view-history').forEach(btn => {
      btn.addEventListener('click', () => {
        openAmbassadorHistory(btn.dataset.id, btn.dataset.name);
      });
    });

  } catch (err) {
    console.error('Erro em embaixadores:', err);
    container.innerHTML = `<div style="padding: 16px; color: var(--danger);">${err.message}</div>`;
  }
}

async function openAmbassadorHistory(ambassadorId, ambassadorName) {
  const modal = document.getElementById('modal-amb-history');
  const title = document.getElementById('amb-history-title');
  const content = document.getElementById('amb-history-content');
  if (!modal || !content) return;

  title.textContent = `Extrato: ${ambassadorName}`;
  showLoading(content, 'Consultando histórico de indicações e comissões...');
  modal.style.display = 'flex';

  try {
    const [referrals, commissions] = await Promise.all([
      dbGetAmbassadorReferrals(ambassadorId),
      dbGetAmbassadorCommissions(ambassadorId)
    ]);

    let html = `
      <div style="margin-bottom: 20px;">
        <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 10px; color: var(--text-primary);">
          Empresas Contratantes Indicadas (${referrals.length})
        </h4>
    `;

    if (referrals.length === 0) {
      html += `<p style="color: var(--text-muted); font-size: 0.875rem;">Nenhuma empresa cadastrada com este link ainda.</p>`;
    } else {
      html += `
        <table class="table" style="width: 100%; font-size: 0.8125rem;">
          <thead>
            <tr>
              <th>Empresa</th>
              <th>Data do Vínculo</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${referrals.map(r => `
              <tr>
                <td><strong>${r.tenant?.name || 'Tenant'}</strong></td>
                <td>${formatDateTime(r.created_at)}</td>
                <td><span class="badge badge-success">${(r.status || 'ativo').toUpperCase()}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    html += `
      </div>
      <div>
        <h4 style="font-size: 1rem; font-weight: 700; margin-bottom: 10px; color: var(--text-primary);">
          Comissões Geradas por Mensalidades (${commissions.length})
        </h4>
    `;

    if (commissions.length === 0) {
      html += `<p style="color: var(--text-muted); font-size: 0.875rem;">Nenhum repasse de mensalidade registrado ainda.</p>`;
    } else {
      html += `
        <table class="table" style="width: 100%; font-size: 0.8125rem;">
          <thead>
            <tr>
              <th>Data</th>
              <th>Empresa</th>
              <th>Base</th>
              <th>Comissão</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${commissions.map(c => `
              <tr>
                <td>${formatDateTime(c.created_at)}</td>
                <td>${c.tenant?.name || '-'}</td>
                <td>${formatCurrency(c.base_amount)}</td>
                <td><strong>${formatCurrency(c.commission_amount)}</strong></td>
                <td><span class="badge ${c.status === 'pago' ? 'badge-success' : 'badge-warning'}">${(c.status || 'pendente').toUpperCase()}</span></td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      `;
    }

    html += `</div>`;
    content.innerHTML = html;

  } catch (err) {
    content.innerHTML = `<div style="color: var(--danger); padding: 12px;">${err.message}</div>`;
  }
}
