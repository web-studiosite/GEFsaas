/**
 * GEF - Gestor de Ferragem
 * dashboard.js - Controlador do Painel Principal
 */

import { dbGetSales, dbGetReceivables, dbGetProducts, dbGetActiveCashSession } from './database.js';
import { isSupabaseConfigured } from './supabase.js';
import { formatCurrency, formatDateTime, formatDate, buildWhatsAppLink, buildSmsLink, parseTemplate } from './utils.js';
import { getStoredConfig } from './config.js';
import { navigateTo } from './router.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showToast } from './toast.js';

export async function init() {
  setupActions();
  checkSupabaseBanner();
  await loadDashboardData();
}

function setupActions() {
  document.getElementById('dash-btn-pos')?.addEventListener('click', () => navigateTo('pos'));
  document.getElementById('dash-btn-clientes')?.addEventListener('click', () => navigateTo('clientes'));
  document.getElementById('dash-btn-config')?.addEventListener('click', () => navigateTo('configuracoes'));
  document.getElementById('dash-btn-ver-vendas')?.addEventListener('click', () => navigateTo('vendas'));
  document.getElementById('dash-btn-ver-fiado')?.addEventListener('click', () => navigateTo('clientes'));
}

function checkSupabaseBanner() {
  const banner = document.getElementById('dash-db-banner');
  if (banner) {
    banner.style.display = isSupabaseConfigured() ? 'none' : 'flex';
  }
}

async function loadDashboardData() {
  try {
    // 1. Carrega dados em paralelo
    const [sales, receivables, products, cashSession] = await Promise.all([
      dbGetSales('', 'finalizada', 10).catch(() => []),
      dbGetReceivables('').catch(() => []),
      dbGetProducts('', '').catch(() => []),
      dbGetActiveCashSession().catch(() => null)
    ]);

    // 2. Calcula KPIs
    const todayStr = new Date().toISOString().split('T')[0];
    const todaySales = sales.filter(s => s.created_at && s.created_at.startsWith(todayStr));
    const totalTodayRevenue = todaySales.reduce((acc, s) => acc + Number(s.total || 0), 0);
    const totalDebt = receivables.reduce((acc, r) => acc + Number(r.current_balance || 0), 0);
    const lowStockCount = products.filter(p => Number(p.current_stock) <= Number(p.min_stock)).length;

    // Atualiza elementos de KPI
    const kpiRevenue = document.getElementById('kpi-revenue');
    if (kpiRevenue) kpiRevenue.textContent = formatCurrency(totalTodayRevenue);

    const kpiSalesCount = document.getElementById('kpi-sales-count');
    if (kpiSalesCount) kpiSalesCount.textContent = `${todaySales.length} vendas hoje`;

    const kpiDebt = document.getElementById('kpi-debt');
    if (kpiDebt) kpiDebt.textContent = formatCurrency(totalDebt);

    const kpiDebtorsCount = document.getElementById('kpi-debtors-count');
    if (kpiDebtorsCount) kpiDebtorsCount.textContent = `${receivables.length} faturas em aberto`;

    const kpiCash = document.getElementById('kpi-cash');
    const kpiCashStatus = document.getElementById('kpi-cash-status');
    if (cashSession && cashSession.status === 'aberto') {
      if (kpiCash) kpiCash.textContent = formatCurrency(cashSession.opening_balance);
      if (kpiCashStatus) kpiCashStatus.textContent = 'Caixa Aberto';
    } else {
      if (kpiCash) kpiCash.textContent = 'R$ 0,00';
      if (kpiCashStatus) kpiCashStatus.textContent = 'Caixa Fechado';
    }

    const kpiLowStock = document.getElementById('kpi-low-stock');
    if (kpiLowStock) kpiLowStock.textContent = `${lowStockCount} itens`;

    // 3. Renderiza Vendas Recentes
    renderRecentSalesTable(sales.slice(0, 5));

    // 4. Renderiza Cobranças Prioritárias
    renderPriorityReceivables(receivables.slice(0, 5));

  } catch (err) {
    console.error('Erro ao carregar dados do dashboard:', err);
  }
}

function renderRecentSalesTable(sales) {
  const container = document.getElementById('dash-sales-table-container');
  if (!container) return;

  if (!sales || sales.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhuma venda registrada',
      message: 'Abra o PDV para realizar a primeira venda de ferragens da loja.',
      actionText: 'Abrir PDV Balcão',
      actionId: 'empty-pos-btn'
    });
    document.getElementById('empty-pos-btn')?.addEventListener('click', () => navigateTo('pos'));
    return;
  }

  const columns = [
    { label: 'Nº Venda', key: 'sale_number', render: (row) => `<strong>#${row.sale_number}</strong>` },
    { label: 'Data/Hora', key: 'created_at', render: (row) => formatDateTime(row.created_at) },
    { label: 'Cliente', key: 'customer', render: (row) => row.customer?.name || 'Consumidor Balcão' },
    { label: 'Total', key: 'total', numeric: true, render: (row) => `<strong>${formatCurrency(row.total)}</strong>` },
    { label: 'Pagamento', key: 'payment_method', render: (row) => `<span class="badge badge-neutral">${row.payment_method.toUpperCase()}</span>` }
  ];

  container.innerHTML = renderTable({ columns, rows: sales });
}

function renderPriorityReceivables(receivables) {
  const container = document.getElementById('dash-receivables-container');
  if (!container) return;

  if (!receivables || receivables.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhuma pendência de fiado',
      message: 'Todos os clientes estão com as contas em dia! Excelente controle.'
    });
    return;
  }

  const config = getStoredConfig();

  const rowsHtml = receivables.map(rec => {
    const cust = rec.customer || {};
    const phone = cust.whatsapp || cust.phone || '';

    // Monta texto e links
    const billingMsg = parseTemplate(config.whatsappBillingTemplate, {
      customerName: cust.name,
      amount: rec.current_balance,
      date: formatDate(rec.due_date),
      pixKey: config.pixKey,
      storeName: config.companyName
    });

    const smsMsg = parseTemplate(config.smsBillingTemplate, {
      customerName: cust.name,
      amount: rec.current_balance,
      date: formatDate(rec.due_date),
      pixKey: config.pixKey,
      storeName: config.companyName
    });

    const waLink = buildWhatsAppLink(phone, billingMsg);
    const smsLink = buildSmsLink(phone, smsMsg);

    return `
      <div style="padding: 12px 14px; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); margin-bottom: 10px; display: flex; align-items: center; justify-content: space-between; gap: 12px; background: var(--bg-surface);">
        <div>
          <div style="font-weight: 700; font-size: 0.875rem;">${cust.name || 'Cliente'}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            Vencimento: ${formatDate(rec.due_date)} | Telefone: ${cust.phone || '-'}
          </div>
        </div>
        <div style="text-align: right; display: flex; align-items: center; gap: 10px;">
          <div style="font-weight: 800; color: var(--danger); font-size: 0.9375rem;">
            ${formatCurrency(rec.current_balance)}
          </div>
          ${phone ? `
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm" title="Cobrar por WhatsApp">
              WhatsApp
            </a>
            <a href="${smsLink}" class="btn btn-sms btn-sm" title="Cobrar por SMS">
              SMS
            </a>
          ` : '<span style="font-size:0.75rem;color:var(--text-muted);">Sem fone</span>'}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div>${rowsHtml}</div>`;
}
