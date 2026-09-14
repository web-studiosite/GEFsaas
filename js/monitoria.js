/**
 * GEF - Gestor de Ferragem
 * monitoria.js - Controlador do Nível Superior da Plataforma (Monitor)
 */

import {
  dbGetTenants,
  dbSaveTenant,
  dbBlockTenant,
  dbUnblockTenant,
  dbGetSubscriptions,
  dbRecordSubscriptionPayment,
  dbGetAmbassadorCommissions,
  dbPayAmbassadorCommission,
  dbGetMonitoringEvents
} from './database.js';
import { formatCurrency, formatDateTime } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';

let tenantsList = [];
let subscriptionsList = [];
let commissionsList = [];

export async function init() {
  setupTabs();
  setupModals();
  setupEvents();
  await loadAllMonitorData();
}

function setupTabs() {
  const tabs = document.querySelectorAll('.monitor-tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => {
        t.classList.remove('active');
        t.style.borderBottom = 'none';
        t.style.color = 'var(--text-secondary)';
      });
      tab.classList.add('active');
      tab.style.borderBottom = '3px solid var(--primary)';
      tab.style.color = 'var(--primary)';

      const tabId = tab.dataset.tab;
      document.querySelectorAll('.monitor-tab-pane').forEach(pane => {
        pane.style.display = 'none';
      });
      const targetPane = document.getElementById(`tab-content-${tabId}`);
      if (targetPane) targetPane.style.display = 'block';
    });
  });
}

function setupEvents() {
  document.getElementById('btn-refresh-monitor')?.addEventListener('click', loadAllMonitorData);
  document.getElementById('btn-new-tenant')?.addEventListener('click', () => openTenantModal());
}

function setupModals() {
  document.querySelectorAll('.btn-close-modal').forEach(btn => {
    btn.addEventListener('click', () => {
      document.getElementById('modal-tenant').style.display = 'none';
      document.getElementById('modal-block-tenant').style.display = 'none';
      document.getElementById('modal-sub-payment').style.display = 'none';
    });
  });

  // Salvar Novo Tenant
  document.getElementById('form-new-tenant')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      name: document.getElementById('tenant-name').value.trim(),
      document: document.getElementById('tenant-document').value.trim(),
      plan: document.getElementById('tenant-plan').value,
      monthly_fee: document.getElementById('tenant-fee').value,
      email: document.getElementById('tenant-email').value.trim(),
      phone: document.getElementById('tenant-phone').value.trim(),
      status: 'ativo'
    };

    try {
      await dbSaveTenant(payload);
      showToast('Novo tenant cadastrado com sucesso!', 'success');
      document.getElementById('modal-tenant').style.display = 'none';
      document.getElementById('form-new-tenant').reset();
      await loadTenants();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Salvar Bloqueio
  document.getElementById('form-block-tenant')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tenantId = document.getElementById('block-tenant-id').value;
    const reasonSelect = document.getElementById('block-reason-select').value;
    const reasonCustom = document.getElementById('block-reason-custom').value.trim();
    const reason = reasonCustom || reasonSelect;
    const blockedFrom = document.getElementById('block-from').value;
    const blockedUntil = document.getElementById('block-until').value || null;

    try {
      await dbBlockTenant(tenantId, blockedFrom, blockedUntil, reason);
      showToast('Tenant bloqueado com sucesso.', 'warning');
      document.getElementById('modal-block-tenant').style.display = 'none';
      await loadTenants();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });

  // Salvar Pagamento de Mensalidade
  document.getElementById('form-sub-payment')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const tenantId = document.getElementById('sub-pay-tenant-id').value;
    const amount = document.getElementById('sub-pay-amount').value;
    const method = document.getElementById('sub-pay-method').value;
    const ref = document.getElementById('sub-pay-ref').value.trim();

    try {
      await dbRecordSubscriptionPayment(tenantId, amount, method, ref);
      showToast('Mensalidade confirmada e comissões atualizadas!', 'success');
      document.getElementById('modal-sub-payment').style.display = 'none';
      await loadAllMonitorData();
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function loadAllMonitorData() {
  await Promise.all([
    loadTenants(),
    loadSubscriptions(),
    loadCommissions(),
    loadEvents()
  ]);
}

// 1. CARREGA TENANTS
async function loadTenants() {
  const container = document.getElementById('tenants-table-container');
  if (!container) return;
  showLoading(container, 'Consultando tenants no Supabase...');

  try {
    tenantsList = await dbGetTenants();
    const badge = document.getElementById('tenants-count-badge');
    if (badge) badge.textContent = `${tenantsList.length} empresas`;

    if (!tenantsList || tenantsList.length === 0) {
      container.innerHTML = renderEmptyState({
        title: 'Nenhum tenant cadastrado',
        message: 'Clique no botão acima para cadastrar a primeira empresa contratante.'
      });
      return;
    }

    const columns = [
      {
        label: 'Empresa / Ferragem',
        key: 'name',
        render: (t) => `
          <div>
            <strong>${t.name}</strong><br />
            <small style="color: var(--text-muted);">Doc: ${t.document || '-'}</small>
          </div>
        `
      },
      { label: 'Plano', key: 'plan', render: (t) => `<span class="badge badge-info">${t.plan || 'PRO'}</span>` },
      { label: 'Mensalidade', key: 'monthly_fee', numeric: true, render: (t) => formatCurrency(t.monthly_fee) },
      {
        label: 'Status de Acesso',
        key: 'status',
        render: (t) => {
          const s = (t.status || 'ativo').toLowerCase();
          const colorMap = {
            ativo: 'badge-success',
            pendente: 'badge-warning',
            vencido: 'badge-danger',
            bloqueado: 'badge-danger',
            suspenso: 'badge-warning'
          };
          const badgeClass = colorMap[s] || 'badge-secondary';
          let info = `<span class="badge ${badgeClass}">${s.toUpperCase()}</span>`;
          if (t.block_reason) {
            info += `<br><small style="color:var(--danger);">${t.block_reason}</small>`;
          }
          return info;
        }
      },
      {
        label: 'Filiais',
        key: 'stores',
        render: (t) => `${t.stores?.length || 1} loja(s)`
      },
      {
        label: 'Ações de Controle',
        key: 'actions',
        render: (t) => {
          const isBlocked = t.status === 'bloqueado';
          return `
            <div style="display: flex; gap: 6px;">
              <button class="btn btn-outline btn-xs btn-pay-sub" data-id="${t.id}" data-name="${t.name}" data-fee="${t.monthly_fee}">
                Quitar Mês
              </button>
              ${isBlocked ? `
                <button class="btn btn-success btn-xs btn-unblock-tenant" data-id="${t.id}">
                  Liberar
                </button>
              ` : `
                <button class="btn btn-danger btn-xs btn-open-block" data-id="${t.id}" data-name="${t.name}">
                  Bloquear
                </button>
              `}
            </div>
          `;
        }
      }
    ];

    container.innerHTML = renderTable({ columns, rows: tenantsList });

    // Eventos nas linhas da tabela
    container.querySelectorAll('.btn-open-block').forEach(btn => {
      btn.addEventListener('click', () => {
        openBlockModal(btn.dataset.id, btn.dataset.name);
      });
    });

    container.querySelectorAll('.btn-unblock-tenant').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Deseja realmente liberar o acesso desta empresa?')) {
          try {
            await dbUnblockTenant(btn.dataset.id);
            showToast('Tenant liberado!', 'success');
            await loadTenants();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });

    container.querySelectorAll('.btn-pay-sub').forEach(btn => {
      btn.addEventListener('click', () => {
        openSubPaymentModal(btn.dataset.id, btn.dataset.name, btn.dataset.fee);
      });
    });

  } catch (err) {
    console.error('Erro ao listar tenants:', err);
    container.innerHTML = `<div style="padding: 16px; color: var(--danger);">${err.message}</div>`;
  }
}

// 2. CARREGA MENSALIDADES
async function loadSubscriptions() {
  const container = document.getElementById('subscriptions-table-container');
  if (!container) return;

  try {
    subscriptionsList = await dbGetSubscriptions();
    if (!subscriptionsList || subscriptionsList.length === 0) {
      container.innerHTML = renderEmptyState({
        title: 'Nenhuma assinatura ativa',
        message: 'As assinaturas vinculadas aos tenants contratantes serão listadas aqui.'
      });
      return;
    }

    const columns = [
      { label: 'Tenant / Ferragem', key: 'tenant', render: (s) => `<strong>${s.tenant?.name || '-'}</strong>` },
      { label: 'Plano', key: 'plan', render: (s) => s.plan || 'PRO' },
      { label: 'Valor Mensal', key: 'amount', numeric: true, render: (s) => formatCurrency(s.amount) },
      { label: 'Próximo Vencimento', key: 'next_due_date', render: (s) => s.next_due_date || '-' },
      {
        label: 'Estado da Assinatura',
        key: 'status',
        render: (s) => {
          const st = (s.status || 'ativo').toUpperCase();
          const colorClass = st === 'ATIVO' ? 'badge-success' : 'badge-danger';
          return `<span class="badge ${colorClass}">${st}</span>`;
        }
      },
      {
        label: 'Ação',
        key: 'actions',
        render: (s) => `
          <button class="btn btn-outline btn-xs btn-pay-sub" data-id="${s.tenant_id}" data-name="${s.tenant?.name}" data-fee="${s.amount}">
            Confirmar Recebimento
          </button>
        `
      }
    ];

    container.innerHTML = renderTable({ columns, rows: subscriptionsList });

    container.querySelectorAll('.btn-pay-sub').forEach(btn => {
      btn.addEventListener('click', () => {
        openSubPaymentModal(btn.dataset.id, btn.dataset.name, btn.dataset.fee);
      });
    });

  } catch (err) {
    console.error('Erro em mensalidades:', err);
    container.innerHTML = `<div style="padding: 16px; color: var(--danger);">${err.message}</div>`;
  }
}

// 3. CARREGA COMISSÕES DE EMBAIXADORES
async function loadCommissions() {
  const container = document.getElementById('commissions-table-container');
  if (!container) return;

  try {
    commissionsList = await dbGetAmbassadorCommissions();
    if (!commissionsList || commissionsList.length === 0) {
      container.innerHTML = renderEmptyState({
        title: 'Nenhuma comissão registrada',
        message: 'Quando um tenant indicado efetuar o pagamento da mensalidade, a comissão calculada aparecerá aqui.'
      });
      return;
    }

    const columns = [
      { label: 'Embaixador', key: 'ambassador', render: (c) => `<strong>${c.ambassador?.name || '-'}</strong>` },
      { label: 'Tenant Indicado', key: 'tenant', render: (c) => c.tenant?.name || '-' },
      { label: 'Base de Cálculo', key: 'base_amount', numeric: true, render: (c) => formatCurrency(c.base_amount) },
      { label: '% Taxa', key: 'commission_rate', numeric: true, render: (c) => `${c.commission_rate}%` },
      { label: 'Comissão Gerada', key: 'commission_amount', numeric: true, render: (c) => `<strong>${formatCurrency(c.commission_amount)}</strong>` },
      {
        label: 'Status',
        key: 'status',
        render: (c) => {
          const isPaid = c.status === 'pago';
          return `<span class="badge ${isPaid ? 'badge-success' : 'badge-warning'}">${isPaid ? 'PAGO' : 'PENDENTE'}</span>`;
        }
      },
      {
        label: 'Quitação Pix',
        key: 'actions',
        render: (c) => {
          if (c.status === 'pago') return '<small style="color:var(--text-muted);">Quitado</small>';
          return `
            <button class="btn btn-success btn-xs btn-pay-comm" data-id="${c.id}">
              Quitar Pix
            </button>
          `;
        }
      }
    ];

    container.innerHTML = renderTable({ columns, rows: commissionsList });

    container.querySelectorAll('.btn-pay-comm').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (confirm('Confirmar quitação desta comissão via Pix?')) {
          try {
            await dbPayAmbassadorCommission(btn.dataset.id);
            showToast('Comissão quitada!', 'success');
            await loadCommissions();
          } catch (err) {
            showToast(err.message, 'error');
          }
        }
      });
    });

  } catch (err) {
    console.error('Erro ao buscar comissões:', err);
    container.innerHTML = `<div style="padding: 16px; color: var(--danger);">${err.message}</div>`;
  }
}

// 4. CARREGA FEED DE EVENTOS EM TEMPO REAL
async function loadEvents() {
  const container = document.getElementById('monitoria-feed-container');
  if (!container) return;

  try {
    const events = await dbGetMonitoringEvents(50);
    if (!events || events.length === 0) {
      container.innerHTML = renderEmptyState({
        title: 'Nenhum evento registrado',
        message: 'Ações operacionais da plataforma aparecerão aqui.'
      });
      return;
    }

    container.innerHTML = events.map(ev => {
      const color = ev.severity === 'error' ? 'var(--danger)' : ev.severity === 'warning' ? 'var(--warning)' : 'var(--primary)';
      return `
        <div style="display: flex; gap: 12px; padding: 10px 0; border-bottom: 1px solid var(--border-subtle); align-items: flex-start;">
          <div style="width: 10px; height: 10px; border-radius: 50%; background: ${color}; margin-top: 6px; flex-shrink: 0;"></div>
          <div style="flex: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
              <strong>${ev.description}</strong>
              <span style="font-size: 0.75rem; color: var(--text-muted);">${formatDateTime(ev.created_at)}</span>
            </div>
            <div style="font-size: 0.75rem; color: var(--text-secondary); display: flex; gap: 8px;">
              <span>Módulo: <strong>${ev.module.toUpperCase()}</strong></span>
              <span>Tipo: <code>${ev.event_type}</code></span>
              ${ev.user?.full_name ? `<span>Operador: ${ev.user.full_name}</span>` : ''}
            </div>
          </div>
        </div>
      `;
    }).join('');

  } catch (err) {
    console.error('Erro em feed de eventos:', err);
    container.innerHTML = `<div style="padding: 16px; color: var(--danger);">${err.message}</div>`;
  }
}

function openTenantModal() {
  document.getElementById('modal-tenant').style.display = 'flex';
}

function openBlockModal(tenantId, tenantName) {
  document.getElementById('block-tenant-id').value = tenantId;
  document.getElementById('block-tenant-info').textContent = `Empresa: ${tenantName}`;
  const nowStr = new Date().toISOString().slice(0, 16);
  document.getElementById('block-from').value = nowStr;
  document.getElementById('modal-block-tenant').style.display = 'flex';
}

function openSubPaymentModal(tenantId, tenantName, fee) {
  document.getElementById('sub-pay-tenant-id').value = tenantId;
  document.getElementById('sub-pay-tenant-label').textContent = `Empresa: ${tenantName}`;
  document.getElementById('sub-pay-amount').value = fee || '149.90';
  document.getElementById('modal-sub-payment').style.display = 'flex';
}
