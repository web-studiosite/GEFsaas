/**
 * GEF - Gestor de Ferragem
 * perdas.js - Registro de Avarias e Baixas por Sucata
 */

import { dbGetInventoryLosses, dbRecordInventoryLoss, dbGetProducts } from './database.js';
import { getState } from './state.js';
import { formatCurrency, formatQuantity, formatDateTime } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

let losses = [];
let products = [];

export async function init() {
  document.getElementById('btn-nova-perda')?.addEventListener('click', openLossModal);
  await loadLosses();
}

async function loadLosses() {
  const container = document.getElementById('perdas-table-container');
  showLoading(container, 'Carregando perdas e avarias...');

  try {
    const [lossesRes, prods] = await Promise.all([
      dbGetInventoryLosses(),
      dbGetProducts()
    ]);

    losses = lossesRes || [];
    products = prods || [];
    renderLossesTable(losses);
  } catch (err) {
    console.error('Erro em perdas:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function renderLossesTable(items) {
  const container = document.getElementById('perdas-table-container');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhuma perda registrada',
      message: 'Excelente! Não há avarias ou quebras registradas no inventário de ferragens.'
    });
    return;
  }

  const columns = [
    { label: 'Data', key: 'created_at', render: (r) => formatDateTime(r.created_at) },
    { label: 'Material Avariado', key: 'product', render: (r) => `<strong>${r.product?.name || 'Item'}</strong>` },
    { label: 'Motivo', key: 'reason', render: (r) => `<span class="badge badge-warning">${r.reason.toUpperCase()}</span>` },
    { label: 'Qtd Baixada', key: 'quantity', numeric: true, render: (r) => formatQuantity(r.quantity, r.product?.unit) },
    { label: 'Custo Total Perdido', key: 'total_cost', numeric: true, render: (r) => `<strong style="color:var(--danger);">${formatCurrency(r.total_cost)}</strong>` },
    { label: 'Anotações', key: 'notes' },
    { label: 'Registrado por', key: 'user', render: (r) => r.user?.full_name || 'Operador' }
  ];

  container.innerHTML = renderTable({ columns, rows: items });
}

function openLossModal() {
  const bodyHtml = `
    <div>
      <div class="form-group">
        <label class="form-label" for="loss-product">Material Avariado <span class="required">*</span></label>
        <select id="loss-product" class="form-control">
          <option value="">Selecione o item com avaria...</option>
          ${products.map(p => `<option value="${p.id}">${p.name} (Estoque: ${p.current_stock} ${p.unit})</option>`).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="loss-qty">Quantidade Danificada <span class="required">*</span></label>
          <input type="number" id="loss-qty" class="form-control" value="1" min="0.1" step="1" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="loss-reason">Motivo da Avaria / Descarte</label>
          <select id="loss-reason" class="form-control">
            <option value="ferrugem">Ferrugem / Corrosão</option>
            <option value="cimento_empedrado">Cimento Empedrado (Umidade)</option>
            <option value="quebra_transporte">Quebra em Transporte / Descarga</option>
            <option value="vencimento">Vencimento de Validade (Colas/Tintas)</option>
            <option value="extravio">Extravio / Furto</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="loss-notes">Descrição do Ocorrido</label>
        <textarea id="loss-notes" class="form-control" rows="2" placeholder="Ex: Saco de cimento furado durante chuva intensa"></textarea>
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-loss" class="btn btn-outline">Cancelar</button>
    <button id="btn-confirm-loss" class="btn btn-danger" style="font-weight:700;">Dar Baixa por Avaria</button>
  `;

  openModal({
    title: 'Registro de Perda & Baixa de Estoque',
    bodyHtml,
    footerHtml,
    size: 'md'
  });

  document.getElementById('btn-cancel-loss')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-loss')?.addEventListener('click', async () => {
    const prodId = document.getElementById('loss-product')?.value;
    const qty = Number(document.getElementById('loss-qty')?.value) || 0;
    const reason = document.getElementById('loss-reason')?.value;
    const notes = document.getElementById('loss-notes')?.value || '';

    if (!prodId || qty <= 0) {
      showToast('Selecione o material e a quantidade avariada.', 'warning');
      return;
    }

    try {
      const prod = products.find(p => p.id === prodId);
      await dbRecordInventoryLoss(prodId, qty, reason, notes);

      closeModal();
      showToast(`Baixa de ${qty} ${prod ? prod.unit : 'UN'} registrada com sucesso.`, 'success');
      await loadLosses();
    } catch (err) {
      showToast(`Falha ao registrar perda: ${err.message}`, 'error');
    }
  });
}
