/**
 * GEF - Gestor de Ferragem
 * vendas.js - Histórico de Vendas e Reemissão de Recibos WhatsApp/SMS
 */

import { dbGetSales } from './database.js';
import { formatCurrency, formatDateTime, formatPaymentMethodName } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { openReceiptModal } from './pos.js';

let allSales = [];

export async function init() {
  setupFilters();
  await loadSales();
}

function setupFilters() {
  document.getElementById('vendas-search-input')?.addEventListener('input', () => filterSales());
  document.getElementById('vendas-filter-status')?.addEventListener('change', () => filterSales());
}

async function loadSales() {
  const container = document.getElementById('vendas-table-container');
  showLoading(container, 'Carregando histórico de vendas de ferragens...');

  try {
    allSales = await dbGetSales('', '', 100);
    renderSalesTable(allSales);
  } catch (err) {
    console.error('Erro ao carregar vendas:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function filterSales() {
  const query = (document.getElementById('vendas-search-input')?.value || '').toLowerCase().trim();
  const status = document.getElementById('vendas-filter-status')?.value || '';

  const filtered = allSales.filter(s => {
    const matchQuery = !query ||
      String(s.sale_number).includes(query) ||
      (s.customer && s.customer.name && s.customer.name.toLowerCase().includes(query)) ||
      (s.user && s.user.full_name && s.user.full_name.toLowerCase().includes(query));

    const matchStatus = !status || s.status === status;
    return matchQuery && matchStatus;
  });

  renderSalesTable(filtered);
}

function renderSalesTable(sales) {
  const container = document.getElementById('vendas-table-container');
  if (!container) return;

  if (!sales || sales.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhuma venda encontrada',
      message: 'Não há registros de vendas correspondentes aos filtros aplicados.'
    });
    return;
  }

  const columns = [
    {
      label: 'Nº Venda',
      key: 'sale_number',
      render: (row) => `<strong>#${row.sale_number}</strong>`
    },
    {
      label: 'Data / Hora',
      key: 'created_at',
      render: (row) => formatDateTime(row.created_at)
    },
    {
      label: 'Cliente',
      key: 'customer',
      render: (row) => row.customer?.name || 'Consumidor Balcão'
    },
    {
      label: 'Operador',
      key: 'user',
      render: (row) => row.user?.full_name || 'Balcão'
    },
    {
      label: 'Pagamento',
      key: 'payment_method',
      render: (row) => `<span class="badge badge-neutral">${formatPaymentMethodName(row.payment_method)}</span>`
    },
    {
      label: 'Total',
      key: 'total',
      numeric: true,
      render: (row) => `<strong>${formatCurrency(row.total)}</strong>`
    },
    {
      label: 'Status',
      key: 'status',
      render: (row) => row.status === 'finalizada' 
        ? '<span class="badge badge-success">Finalizada</span>' 
        : '<span class="badge badge-danger">Cancelada</span>'
    },
    {
      label: 'Recibo & Cupom',
      key: 'actions',
      render: (row) => `
        <button class="btn btn-outline btn-sm btn-open-receipt" data-id="${row.id}" title="Reenviar Recibo via WhatsApp/SMS ou Imprimir">
          📄 Abrir Recibo
        </button>
      `
    }
  ];

  container.innerHTML = renderTable({ columns, rows: sales });

  // Listener para reabrir modal de recibo
  container.querySelectorAll('.btn-open-receipt').forEach(btn => {
    btn.addEventListener('click', () => {
      const saleId = btn.getAttribute('data-id');
      const sale = allSales.find(s => s.id === saleId);
      if (sale) {
        openReceiptModal(sale, sale.items || [], sale.customer);
      }
    });
  });
}
