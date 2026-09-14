/**
 * GEF - Gestor de Ferragem
 * estoque.js - Controle de Entradas e Kardex de Estoque
 */

import { dbGetStockMovements, dbAddStockEntry, dbGetProducts } from './database.js';
import { getState } from './state.js';
import { formatQuantity, formatDateTime } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

let movements = [];
let products = [];

export async function init() {
  document.getElementById('btn-nova-entrada')?.addEventListener('click', openStockEntryModal);
  await loadStockData();
}

async function loadStockData() {
  const container = document.getElementById('estoque-table-container');
  showLoading(container, 'Carregando movimentações do estoque...');

  try {
    const [movs, prods] = await Promise.all([
      dbGetStockMovements(),
      dbGetProducts()
    ]);

    movements = movs || [];
    products = prods || [];

    renderMovementsTable(movements);
  } catch (err) {
    console.error('Erro em estoque:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function renderMovementsTable(items) {
  const container = document.getElementById('estoque-table-container');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhuma movimentação no Kardex',
      message: 'Registre entradas de notas de compra ou ajustes para alimentar o histórico de estoque.',
      actionText: 'Dar Entrada de Mercadoria',
      actionId: 'btn-empty-stock-entry'
    });
    document.getElementById('btn-empty-stock-entry')?.addEventListener('click', openStockEntryModal);
    return;
  }

  const columns = [
    { label: 'Data / Hora', key: 'created_at', render: (r) => formatDateTime(r.created_at) },
    { label: 'Material / Ferragem', key: 'product', render: (r) => `<strong>${r.product?.name || 'Item'}</strong>` },
    { 
      label: 'Tipo', 
      key: 'type', 
      render: (r) => {
        const isEntry = r.type.includes('entrada');
        return `<span class="badge ${isEntry ? 'badge-success' : 'badge-neutral'}">${r.type.toUpperCase()}</span>`;
      }
    },
    { 
      label: 'Qtd Movimentada', 
      key: 'quantity', 
      numeric: true, 
      render: (r) => {
        const isEntry = r.type.includes('entrada');
        return `<strong>${isEntry ? '+' : '-'}${formatQuantity(r.quantity, r.product?.unit)}</strong>`;
      }
    },
    { label: 'Estoque Anterior', key: 'previous_stock', numeric: true, render: (r) => formatQuantity(r.previous_stock, r.product?.unit) },
    { label: 'Novo Estoque', key: 'new_stock', numeric: true, render: (r) => `<strong>${formatQuantity(r.new_stock, r.product?.unit)}</strong>` },
    { label: 'Motivo / Referência', key: 'reason' },
    { label: 'Responsável', key: 'user', render: (r) => r.user?.full_name || 'Sistema' }
  ];

  container.innerHTML = renderTable({ columns, rows: items });
}

function openStockEntryModal() {
  const bodyHtml = `
    <div>
      <div class="form-group">
        <label class="form-label" for="entry-product">Material de Ferragem <span class="required">*</span></label>
        <select id="entry-product" class="form-control">
          <option value="">Selecione o produto...</option>
          ${products.map(p => `<option value="${p.id}">${p.name} (Atual: ${p.current_stock} ${p.unit})</option>`).join('')}
        </select>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="entry-qty">Quantidade de Entrada <span class="required">*</span></label>
          <input type="number" id="entry-qty" class="form-control" value="1" min="0.1" step="1" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="entry-type">Tipo de Entrada</label>
          <select id="entry-type" class="form-control">
            <option value="entrada_compra">Entrada por Compra / Fornecedor</option>
            <option value="entrada_ajuste">Ajuste de Inventário / Contagem</option>
            <option value="entrada_devolucao">Devolução de Cliente</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="entry-reason">Nota Fiscal / Fornecedor / Justificativa</label>
        <input type="text" id="entry-reason" class="form-control" placeholder="Ex: NF 1420 - Gerdau Aços" />
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-entry" class="btn btn-outline">Cancelar</button>
    <button id="btn-confirm-entry" class="btn btn-primary" style="font-weight: 700;">Confirmar Entrada</button>
  `;

  openModal({
    title: 'Dar Entrada de Mercadoria no Estoque',
    bodyHtml,
    footerHtml,
    size: 'md'
  });

  document.getElementById('btn-cancel-entry')?.addEventListener('click', closeModal);
  document.getElementById('btn-confirm-entry')?.addEventListener('click', async () => {
    const prodId = document.getElementById('entry-product')?.value;
    const qty = Number(document.getElementById('entry-qty')?.value) || 0;
    const type = document.getElementById('entry-type')?.value;
    const reason = document.getElementById('entry-reason')?.value || 'Entrada manual';

    if (!prodId || qty <= 0) {
      showToast('Selecione o produto e informe uma quantidade positiva.', 'warning');
      return;
    }

    try {
      const prod = products.find(p => p.id === prodId);
      await dbAddStockEntry(prodId, qty, type, reason);

      closeModal();
      showToast(`Entrada de ${qty} ${prod ? prod.unit : 'UN'} registrada com sucesso!`, 'success');
      await loadStockData();
    } catch (err) {
      showToast(`Falha ao registrar entrada: ${err.message}`, 'error');
    }
  });
}
