/**
 * GEF - Gestor de Ferragem
 * orcamentos.js - Cotações de Obra e Envio por WhatsApp/SMS
 */

import { dbGetQuotes, dbSaveQuote, dbGetCustomers, dbGetProducts } from './database.js';
import { getState, setState } from './state.js';
import { formatCurrency, formatDate, buildWhatsAppLink, buildSmsLink, generateReceiptCode } from './utils.js';
import { getStoredConfig } from './config.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';
import { navigateTo } from './router.js';

let allQuotes = [];
let allCustomers = [];
let allProducts = [];

export async function init() {
  setupActions();
  await loadQuotes();
}

function setupActions() {
  document.getElementById('btn-novo-orcamento')?.addEventListener('click', () => openQuoteModal());
}

async function loadQuotes() {
  const container = document.getElementById('orcamentos-table-container');
  showLoading(container, 'Carregando orçamentos da ferragem...');

  try {
    const [quotesRes, custs, prods] = await Promise.all([
      dbGetQuotes(),
      dbGetCustomers(),
      dbGetProducts()
    ]);

    allQuotes = quotesRes || [];
    allCustomers = custs || [];
    allProducts = prods || [];

    renderQuotesTable(allQuotes);
  } catch (err) {
    console.error('Erro em orcamentos:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function renderQuotesTable(quotes) {
  const container = document.getElementById('orcamentos-table-container');
  if (!container) return;

  if (!quotes || quotes.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhum orçamento emitido',
      message: 'Crie propostas comerciais de ferragens para clientes, mestres de obras e construtoras.',
      actionText: 'Novo Orçamento',
      actionId: 'btn-empty-quote'
    });
    document.getElementById('btn-empty-quote')?.addEventListener('click', () => openQuoteModal());
    return;
  }

  const columns = [
    { label: 'Nº Orçamento', key: 'quote_number', render: (r) => `<strong>#${r.quote_number}</strong>` },
    { label: 'Cliente', key: 'customer', render: (r) => r.customer?.name || 'Cliente Balcão' },
    { label: 'Válido Até', key: 'valid_until', render: (r) => formatDate(r.valid_until) },
    { label: 'Total', key: 'total', numeric: true, render: (r) => `<strong>${formatCurrency(r.total)}</strong>` },
    { 
      label: 'Status', 
      key: 'status', 
      render: (r) => {
        const badges = {
          pendente: '<span class="badge badge-warning">Aguardando Aprovação</span>',
          aprovado: '<span class="badge badge-success">Aprovado</span>',
          rejeitado: '<span class="badge badge-danger">Recusado</span>',
          convertido: '<span class="badge badge-neutral">Convertido em Venda</span>'
        };
        return badges[r.status] || `<span class="badge">${r.status}</span>`;
      }
    },
    {
      label: 'Ações & Disparo',
      key: 'actions',
      render: (r) => {
        const cust = r.customer || {};
        const phone = cust.whatsapp || cust.phone || '';
        const config = getStoredConfig();

        const waText = `🛠️ *[ORÇAMENTO DE FERRAGEM]*\n*Loja:* ${config.companyName}\n*Proposta:* #${r.quote_number}\n*Total:* ${formatCurrency(r.total)}\n*Validade:* ${formatDate(r.valid_until)}\nChave Pix: ${config.pixKey}\n\nPodemos fechar o pedido? Estamos à disposição!`;
        const waLink = buildWhatsAppLink(phone, waText);
        const smsLink = buildSmsLink(phone, `${config.companyName}: Orcamento #${r.quote_number} no valor de ${formatCurrency(r.total)}. Valido ate ${formatDate(r.valid_until)}.`);

        return `
          <div style="display:flex; gap:6px;">
            ${phone ? `
              <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm" title="Enviar no WhatsApp">WhatsApp</a>
              <a href="${smsLink}" class="btn btn-sms btn-sm" title="Enviar SMS">SMS</a>
            ` : ''}
            <button class="btn btn-primary btn-sm btn-convert-quote" data-id="${r.id}" title="Lançar itens direto no PDV">
              Vender
            </button>
          </div>
        `;
      }
    }
  ];

  container.innerHTML = renderTable({ columns, rows: quotes });

  // Listener para carregar no PDV
  container.querySelectorAll('.btn-convert-quote').forEach(btn => {
    btn.addEventListener('click', () => {
      const qId = btn.getAttribute('data-id');
      const q = allQuotes.find(item => item.id === qId);
      if (q && q.items && q.items.length > 0) {
        // Alimenta o carrinho do PDV
        const posCart = {
          items: q.items.map(i => ({
            id: i.product_id,
            name: i.product_name,
            unit: i.unit || 'UN',
            unit_price: Number(i.unit_price),
            quantity: Number(i.quantity),
            discount: 0,
            total: Number(i.total)
          })),
          customerId: q.customer_id,
          customerData: q.customer,
          discountAmount: 0,
          subtotal: Number(q.total),
          total: Number(q.total)
        };
        setState('posCart', posCart);
        showToast('Orçamento carregado no PDV com sucesso!', 'success');
        navigateTo('pos');
      }
    });
  });
}

function openQuoteModal() {
  let quoteItems = [];

  const bodyHtml = `
    <div>
      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label" for="quote-customer">Cliente Solicitante</label>
          <select id="quote-customer" class="form-control">
            <option value="">Consumidor Balcão</option>
            ${allCustomers.map(c => `<option value="${c.id}">${c.name} (${c.phone})</option>`).join('')}
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="quote-valid">Validade da Proposta</label>
          <input type="date" id="quote-valid" class="form-control" value="${new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0]}" />
        </div>
      </div>

      <div style="background: var(--bg-surface-subtle); padding: 12px; border-radius: var(--radius-sm); margin-bottom: 14px;">
        <label class="form-label" style="font-size:0.8125rem;">Adicionar Material / Ferragem:</label>
        <div style="display:flex; gap:8px;">
          <select id="quote-prod-select" class="form-control" style="flex:1;">
            <option value="">Selecione um produto...</option>
            ${allProducts.map(p => `<option value="${p.id}">${p.name} - ${formatCurrency(p.selling_price)} / ${p.unit}</option>`).join('')}
          </select>
          <input type="number" id="quote-prod-qty" class="form-control" value="1" min="0.1" step="1" style="width:80px;" />
          <button id="btn-add-quote-item" class="btn btn-secondary btn-sm">+ Inserir</button>
        </div>
      </div>

      <div id="quote-items-table" style="max-height: 200px; overflow-y: auto; margin-bottom: 14px;">
        <!-- Itens inseridos -->
      </div>

      <div style="display: flex; justify-content: space-between; font-weight: 800; font-size: 1.125rem; border-top: 1px solid var(--border-subtle); padding-top: 10px;">
        <span>Total do Orçamento:</span>
        <span id="quote-total-val" style="color: var(--primary);">R$ 0,00</span>
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-quote" class="btn btn-outline">Cancelar</button>
    <button id="btn-save-quote" class="btn btn-primary" style="font-weight: 700;">Salvar Orçamento</button>
  `;

  openModal({
    title: 'Elaborar Novo Orçamento de Obra',
    bodyHtml,
    footerHtml,
    size: 'lg'
  });

  const renderCurrentItems = () => {
    const listEl = document.getElementById('quote-items-table');
    const totalEl = document.getElementById('quote-total-val');
    const total = quoteItems.reduce((acc, i) => acc + i.total, 0);

    if (totalEl) totalEl.textContent = formatCurrency(total);
    if (!listEl) return;

    if (quoteItems.length === 0) {
      listEl.innerHTML = '<div style="text-align:center; color:var(--text-muted); padding:10px;">Nenhum item adicionado.</div>';
      return;
    }

    listEl.innerHTML = quoteItems.map((item, idx) => `
      <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-bottom:1px dashed var(--border-subtle);">
        <div><strong>${item.name}</strong> (${item.qty} ${item.unit} x ${formatCurrency(item.price)})</div>
        <div style="display:flex; align-items:center; gap:8px;">
          <strong>${formatCurrency(item.total)}</strong>
          <button class="btn-icon" style="color:var(--danger);" onclick="window._removeQuoteItem(${idx})">&times;</button>
        </div>
      </div>
    `).join('');
  };

  window._removeQuoteItem = (idx) => {
    quoteItems.splice(idx, 1);
    renderCurrentItems();
  };

  renderCurrentItems();

  document.getElementById('btn-add-quote-item')?.addEventListener('click', () => {
    const prodId = document.getElementById('quote-prod-select')?.value;
    const qty = Number(document.getElementById('quote-prod-qty')?.value) || 1;
    const prod = allProducts.find(p => p.id === prodId);

    if (prod) {
      quoteItems.push({
        id: prod.id,
        name: prod.name,
        unit: prod.unit,
        price: Number(prod.selling_price),
        qty: qty,
        total: Number((prod.selling_price * qty).toFixed(2))
      });
      renderCurrentItems();
    }
  });

  document.getElementById('btn-cancel-quote')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-quote')?.addEventListener('click', async () => {
    if (quoteItems.length === 0) {
      showToast('Adicione ao menos um item ao orçamento.', 'warning');
      return;
    }

    const customerId = document.getElementById('quote-customer')?.value || null;
    const validUntil = document.getElementById('quote-valid')?.value;
    const total = quoteItems.reduce((acc, i) => acc + i.total, 0);

    try {
      await dbSaveQuote(
        { customerId, total, validUntil },
        quoteItems
      );

      closeModal();
      showToast('Orçamento salvo com sucesso!', 'success');
      await loadQuotes();
    } catch (err) {
      showToast(`Erro ao salvar: ${err.message}`, 'error');
    }
  });
}
