/**
 * GEF - Gestor de Ferragem
 * caixa.js - Abertura, Sangria, Suprimento e Fechamento de Caixa
 */

import { dbGetActiveCashSession, dbOpenCashSession, dbCloseCashSession, dbCreateCashMovement, dbGetSessionMovements } from './database.js';
import { setState } from './state.js';
import { formatCurrency, formatDateTime } from './utils.js';
import { renderTable } from './table.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import { showLoading } from './loading.js';

let activeSession = null;
let sessionMovements = [];

export async function init() {
  await loadCashSession();
}

async function loadCashSession() {
  const banner = document.getElementById('caixa-status-banner');
  showLoading(banner, 'Verificando status do caixa...');

  try {
    activeSession = await dbGetActiveCashSession();
    setState('activeCashSession', activeSession);

    if (activeSession) {
      await loadSessionMovements(activeSession.id);
      renderOpenSession();
    } else {
      renderClosedSession();
    }
  } catch (err) {
    console.error('Erro ao verificar caixa:', err);
    if (banner) {
      banner.innerHTML = `<div style="color:var(--danger);">Falha: ${err.message}</div>`;
    }
  }
}

async function loadSessionMovements(sessionId) {
  try {
    sessionMovements = await dbGetSessionMovements(sessionId);
  } catch (e) {
    sessionMovements = [];
  }
}

function renderClosedSession() {
  const banner = document.getElementById('caixa-status-banner');
  const actionsEl = document.getElementById('caixa-header-actions');
  const metricsGrid = document.getElementById('caixa-metrics-grid');
  const movementsCard = document.getElementById('caixa-movements-card');

  if (metricsGrid) metricsGrid.style.display = 'none';
  if (movementsCard) movementsCard.style.display = 'none';

  if (actionsEl) {
    actionsEl.innerHTML = `
      <button id="btn-open-session" class="btn btn-primary btn-lg">
        🔓 Abrir Turno de Caixa
      </button>
    `;
    document.getElementById('btn-open-session')?.addEventListener('click', openSessionModal);
  }

  if (banner) {
    banner.style.borderLeftColor = 'var(--text-muted)';
    banner.innerHTML = `
      <div style="text-align: center; padding: 20px;">
        <div style="font-size: 2.5rem; margin-bottom: 12px;">🔒</div>
        <h3 style="font-size: 1.25rem; font-weight: 800; margin-bottom: 6px;">O Caixa da Ferragem Está Fechado</h3>
        <p style="color: var(--text-secondary); max-width: 480px; margin: 0 auto 20px auto;">
          Para registrar vendas balcão, troco e recebimentos de fiado, inicie um novo turno informando o fundo de reserva inicial.
        </p>
        <button id="btn-open-session-hero" class="btn btn-primary">
          Abrir Caixa Agora
        </button>
      </div>
    `;
    document.getElementById('btn-open-session-hero')?.addEventListener('click', openSessionModal);
  }
}

function renderOpenSession() {
  const banner = document.getElementById('caixa-status-banner');
  const actionsEl = document.getElementById('caixa-header-actions');
  const metricsGrid = document.getElementById('caixa-metrics-grid');
  const movementsCard = document.getElementById('caixa-movements-card');

  if (metricsGrid) metricsGrid.style.display = 'grid';
  if (movementsCard) movementsCard.style.display = 'block';

  // Totalizadores
  let cashIn = 0;
  let digitalIn = 0;
  let sangrias = 0;

  sessionMovements.forEach(m => {
    const val = Number(m.amount) || 0;
    if (m.type === 'venda' || m.type === 'recebimento_fiado' || m.type === 'suprimento') {
      if (m.payment_method === 'dinheiro') {
        cashIn += val;
      } else {
        digitalIn += val;
      }
    } else if (m.type === 'sangria') {
      sangrias += val;
    }
  });

  const opening = Number(activeSession.opening_balance) || 0;
  const currentInDrawer = opening + cashIn - sangrias;

  // Atualiza KPIs
  const elOpening = document.getElementById('cx-kpi-opening');
  if (elOpening) elOpening.textContent = formatCurrency(opening);

  const elCashIn = document.getElementById('cx-kpi-cash-in');
  if (elCashIn) elCashIn.textContent = formatCurrency(cashIn);

  const elDigitalIn = document.getElementById('cx-kpi-digital-in');
  if (elDigitalIn) elDigitalIn.textContent = formatCurrency(digitalIn);

  const elSangrias = document.getElementById('cx-kpi-sangrias');
  if (elSangrias) elSangrias.textContent = formatCurrency(sangrias);

  if (banner) {
    banner.style.borderLeftColor = 'var(--success)';
    banner.innerHTML = `
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 16px;">
        <div>
          <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
            <span class="status-dot" style="background: var(--success); width: 10px; height: 10px; border-radius: 50%;"></span>
            <span style="font-weight: 800; color: var(--success); text-transform: uppercase; font-size: 0.8125rem;">Turno em Operação</span>
          </div>
          <h3 style="font-size: 1.375rem; font-weight: 800;">Caixa Aberto por: ${activeSession.user?.full_name || 'Operador'}</h3>
          <p style="font-size: 0.8125rem; color: var(--text-muted); margin-top: 2px;">
            Iniciado em: ${formatDateTime(activeSession.opened_at)}
          </p>
        </div>
        <div style="text-align: right; background: var(--bg-surface-subtle); padding: 12px 20px; border-radius: var(--radius-md);">
          <div style="font-size: 0.75rem; color: var(--text-muted); text-transform: uppercase;">Saldo em Espécie na Gaveta</div>
          <div style="font-size: 1.75rem; font-weight: 900; color: var(--primary);">${formatCurrency(currentInDrawer)}</div>
        </div>
      </div>
    `;
  }

  if (actionsEl) {
    actionsEl.innerHTML = `
      <button id="btn-caixa-sangria" class="btn btn-outline" style="color: var(--danger);">
        💸 Sangria (Retirada)
      </button>
      <button id="btn-caixa-suprimento" class="btn btn-outline">
        💵 Suprimento (Troco)
      </button>
      <button id="btn-caixa-fechar" class="btn btn-primary">
        🔒 Fechar Caixa do Turno
      </button>
    `;

    document.getElementById('btn-caixa-sangria')?.addEventListener('click', () => openMovementModal('sangria'));
    document.getElementById('btn-caixa-suprimento')?.addEventListener('click', () => openMovementModal('suprimento'));
    document.getElementById('btn-caixa-fechar')?.addEventListener('click', () => openCloseSessionModal(currentInDrawer));
  }

  renderMovementsTable();
}

function renderMovementsTable() {
  const container = document.getElementById('caixa-movements-table');
  if (!container) return;

  if (sessionMovements.length === 0) {
    container.innerHTML = '<div style="padding: 24px; text-align: center; color: var(--text-muted);">Nenhuma movimentação avulsa registrada neste turno.</div>';
    return;
  }

  const columns = [
    { label: 'Horário', key: 'created_at', render: (r) => formatDateTime(r.created_at) },
    { label: 'Tipo', key: 'type', render: (r) => `<span class="badge badge-neutral">${r.type.toUpperCase()}</span>` },
    { label: 'Descrição / Motivo', key: 'description' },
    { label: 'Forma', key: 'payment_method' },
    { 
      label: 'Valor', 
      key: 'amount', 
      numeric: true, 
      render: (r) => {
        const isOut = r.type === 'sangria';
        return `<strong style="color: ${isOut ? 'var(--danger)' : 'var(--success)'};">${isOut ? '-' : '+'}${formatCurrency(r.amount)}</strong>`;
      }
    }
  ];

  container.innerHTML = renderTable({ columns, rows: sessionMovements });
}

// -------------------------------------------------------------
// MODAIS DE OPERAÇÕES DE CAIXA
// -------------------------------------------------------------
function openSessionModal() {
  const bodyHtml = `
    <div>
      <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 16px;">
        Informe o valor do fundo de troco em moedas e notas presente na gaveta para iniciar as operações.
      </p>
      <div class="form-group">
        <label class="form-label" for="inp-opening-val">Fundo de Troco Inicial (R$) <span class="required">*</span></label>
        <input type="number" id="inp-opening-val" class="form-control" value="100.00" min="0" step="10" style="font-size: 1.25rem; font-weight: 700;" />
      </div>
      <div class="form-group">
        <label class="form-label" for="inp-opening-notes">Observações do Turno</label>
        <input type="text" id="inp-opening-notes" class="form-control" placeholder="Ex: Turno da Manhã" />
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-open" class="btn btn-outline">Cancelar</button>
    <button id="btn-confirm-open" class="btn btn-primary" style="font-weight: 700;">
      Confirmar Abertura
    </button>
  `;

  openModal({
    title: 'Abertura de Turno de Caixa',
    bodyHtml,
    footerHtml,
    size: 'sm'
  });

  document.getElementById('btn-cancel-open')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-open')?.addEventListener('click', async () => {
    const val = Number(document.getElementById('inp-opening-val')?.value) || 0;
    const notes = document.getElementById('inp-opening-notes')?.value || '';

    try {
      await dbOpenCashSession(val, notes);
      closeModal();
      showToast('Caixa aberto com sucesso!', 'success');
      await loadCashSession();
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  });
}

function openMovementModal(type) {
  const isSangria = type === 'sangria';

  const bodyHtml = `
    <div>
      <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 16px;">
        ${isSangria 
          ? 'Registro de retirada de dinheiro da gaveta (ex: sangria para cofre ou pagamento de frete/entregador).' 
          : 'Reforço de moedas ou cédulas na gaveta.'}
      </p>
      <div class="form-group">
        <label class="form-label" for="inp-mov-amount">Valor (R$) <span class="required">*</span></label>
        <input type="number" id="inp-mov-amount" class="form-control" min="1" step="5" style="font-size: 1.25rem; font-weight: 700;" required />
      </div>
      <div class="form-group">
        <label class="form-label" for="inp-mov-desc">Motivo / Justificativa <span class="required">*</span></label>
        <input type="text" id="inp-mov-desc" class="form-control" placeholder="${isSangria ? 'Ex: Depósito no cofre / Pagamento freteiro' : 'Ex: Reforço de troco'}" required />
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-mov" class="btn btn-outline">Cancelar</button>
    <button id="btn-confirm-mov" class="btn ${isSangria ? 'btn-danger' : 'btn-primary'}" style="font-weight: 700;">
      Confirmar ${isSangria ? 'Sangria' : 'Suprimento'}
    </button>
  `;

  openModal({
    title: isSangria ? 'Sangria de Caixa' : 'Suprimento de Caixa',
    bodyHtml,
    footerHtml,
    size: 'sm'
  });

  document.getElementById('btn-cancel-mov')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-mov')?.addEventListener('click', async () => {
    const amount = Number(document.getElementById('inp-mov-amount')?.value) || 0;
    const desc = document.getElementById('inp-mov-desc')?.value.trim();

    if (amount <= 0 || !desc) {
      showToast('Preencha o valor e a justificativa.', 'warning');
      return;
    }

    try {
      await dbCreateCashMovement(activeSession.id, type, 'dinheiro', amount, desc);
      closeModal();
      showToast(`${isSangria ? 'Sangria' : 'Suprimento'} registrada!`, 'success');
      await loadCashSession();
    } catch (err) {
      showToast(`Erro: ${err.message}`, 'error');
    }
  });
}

function openCloseSessionModal(calculatedDrawerBalance) {
  const bodyHtml = `
    <div>
      <div style="background: var(--bg-surface-subtle); padding: 14px; border-radius: var(--radius-md); margin-bottom: 16px; text-align: center;">
        <div style="font-size: 0.8125rem; color: var(--text-muted); text-transform: uppercase;">Saldo Calculado na Gaveta</div>
        <div style="font-size: 1.5rem; font-weight: 800; color: var(--primary);">${formatCurrency(calculatedDrawerBalance)}</div>
      </div>

      <div class="form-group">
        <label class="form-label" for="inp-counted-val">Valor Real Contado em Cédulas e Moedas (R$) <span class="required">*</span></label>
        <input type="number" id="inp-counted-val" class="form-control" value="${calculatedDrawerBalance}" min="0" step="1" style="font-size: 1.25rem; font-weight: 800;" />
        <div class="form-feedback">Conte o dinheiro físico presente na gaveta neste momento.</div>
      </div>

      <div class="form-group">
        <label class="form-label" for="inp-closing-notes">Observações do Fechamento</label>
        <textarea id="inp-closing-notes" class="form-control" rows="2" placeholder="Ex: Fechamento regular sem divergências"></textarea>
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-close" class="btn btn-outline">Cancelar</button>
    <button id="btn-confirm-close" class="btn btn-primary" style="font-weight: 700;">
      Encerrar Turno Definitivamente
    </button>
  `;

  openModal({
    title: 'Fechamento de Turno & Conferência Cega',
    bodyHtml,
    footerHtml,
    size: 'sm'
  });

  document.getElementById('btn-cancel-close')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-close')?.addEventListener('click', async () => {
    const counted = Number(document.getElementById('inp-counted-val')?.value) || 0;
    const notes = document.getElementById('inp-closing-notes')?.value || '';

    try {
      await dbCloseCashSession(activeSession.id, counted, notes);
      closeModal();
      showToast('Caixa encerrado com sucesso!', 'success');
      await loadCashSession();
    } catch (err) {
      showToast(`Erro ao fechar caixa: ${err.message}`, 'error');
    }
  });
}
