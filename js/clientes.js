/**
 * GEF - Gestor de Ferragem
 * clientes.js - Lista de Contatos, Sistema de Cobrança WhatsApp/SMS e Recibos
 */

import { dbGetCustomers, dbSaveCustomer, dbGetReceivables, dbRegisterReceivablePayment, dbLogBillingMessage, dbSaveReceipt } from './database.js';
import { formatCurrency, formatDate, formatDateTime, formatPhone, sanitizePhone, buildWhatsAppLink, buildSmsLink, parseTemplate, generateReceiptCode } from './utils.js';
import { isValidCPF, isValidCNPJ, isValidPhone } from './validation.js';
import { getStoredConfig } from './config.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

let allCustomers = [];
let allReceivables = [];

export async function init() {
  setupTabs();
  setupActions();
  await loadCustomers();
}

function setupTabs() {
  const tabLista = document.getElementById('tab-btn-lista');
  const tabCobranca = document.getElementById('tab-btn-cobranca');
  const contentLista = document.getElementById('tab-content-lista');
  const contentCobranca = document.getElementById('tab-content-cobranca');

  tabLista?.addEventListener('click', () => {
    tabLista.style.borderBottomColor = 'var(--primary)';
    tabLista.style.fontWeight = '700';
    tabCobranca.style.borderBottomColor = 'transparent';
    tabCobranca.style.fontWeight = '600';
    if (contentLista) contentLista.style.display = 'block';
    if (contentCobranca) contentCobranca.style.display = 'none';
    loadCustomers();
  });

  tabCobranca?.addEventListener('click', () => {
    tabCobranca.style.borderBottomColor = 'var(--primary)';
    tabCobranca.style.fontWeight = '700';
    tabLista.style.borderBottomColor = 'transparent';
    tabLista.style.fontWeight = '600';
    if (contentCobranca) contentCobranca.style.display = 'block';
    if (contentLista) contentLista.style.display = 'none';
    loadReceivables();
  });
}

function setupActions() {
  document.getElementById('btn-novo-cliente')?.addEventListener('click', () => openCustomerFormModal());

  const searchInput = document.getElementById('clientes-search-input');
  searchInput?.addEventListener('input', () => filterCustomers());

  const filterStatus = document.getElementById('clientes-filter-status');
  filterStatus?.addEventListener('change', () => filterCustomers());
}

// -------------------------------------------------------------
// ABA 1: LISTA DE CONTATOS DE CLIENTES
// -------------------------------------------------------------
async function loadCustomers() {
  const container = document.getElementById('clientes-table-container');
  showLoading(container, 'Carregando lista de contatos de clientes...');

  try {
    allCustomers = await dbGetCustomers();
    renderCustomersTable(allCustomers);
  } catch (err) {
    console.error('Erro ao carregar clientes:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function filterCustomers() {
  const query = (document.getElementById('clientes-search-input')?.value || '').toLowerCase().trim();
  const status = document.getElementById('clientes-filter-status')?.value || '';

  const filtered = allCustomers.filter(c => {
    const matchQuery = !query || 
      (c.name && c.name.toLowerCase().includes(query)) ||
      (c.phone && c.phone.includes(query)) ||
      (c.document && c.document.includes(query)) ||
      (c.neighborhood && c.neighborhood.toLowerCase().includes(query));

    const matchStatus = !status || c.status === status;
    return matchQuery && matchStatus;
  });

  renderCustomersTable(filtered);
}

function renderCustomersTable(customers) {
  const container = document.getElementById('clientes-table-container');
  if (!container) return;

  if (!customers || customers.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhum cliente encontrado',
      message: 'Cadastre seu primeiro cliente para gerenciar contatos, vendas e fiado.',
      actionText: 'Cadastrar Cliente',
      actionId: 'btn-empty-novo-cliente'
    });
    document.getElementById('btn-empty-novo-cliente')?.addEventListener('click', () => openCustomerFormModal());
    return;
  }

  const columns = [
    {
      label: 'Nome / Razão Social',
      key: 'name',
      render: (row) => `
        <div>
          <div style="font-weight:700;">${row.name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            ${row.customer_type || 'PF'} | Doc: ${row.document || 'Não informado'}
          </div>
        </div>
      `
    },
    {
      label: 'Telefone / WhatsApp',
      key: 'phone',
      render: (row) => {
        const phone = row.whatsapp || row.phone;
        if (!phone) return '-';
        const waLink = buildWhatsAppLink(phone, `Olá ${row.name}, tudo bem? Aqui é da Ferragem GEF.`);
        return `
          <div style="display:flex; align-items:center; gap:8px;">
            <span>${formatPhone(phone)}</span>
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm" style="padding:2px 8px; font-size:0.6875rem;" title="Abrir conversa no WhatsApp">
              WhatsApp
            </a>
          </div>
        `;
      }
    },
    {
      label: 'Endereço da Obra',
      key: 'address',
      render: (row) => `
        <div style="font-size:0.8125rem;">
          <div>${row.address || 'Sem endereço'}</div>
          <div style="color:var(--text-muted); font-size:0.75rem;">${row.neighborhood ? `${row.neighborhood} - ` : ''}${row.city || ''}</div>
        </div>
      `
    },
    {
      label: 'Limite Fiado',
      key: 'credit_limit',
      numeric: true,
      render: (row) => formatCurrency(row.credit_limit)
    },
    {
      label: 'Saldo Devedor',
      key: 'debt_balance',
      numeric: true,
      render: (row) => {
        const debt = Number(row.debt_balance) || 0;
        if (debt > 0) {
          return `<strong style="color:var(--danger);">${formatCurrency(debt)}</strong>`;
        }
        return `<span style="color:var(--success); font-weight:600;">Em dia</span>`;
      }
    },
    {
      label: 'Status',
      key: 'status',
      render: (row) => {
        const statusMap = {
          ativo: '<span class="badge badge-success">Ativo</span>',
          bloqueado: '<span class="badge badge-danger">Bloqueado</span>',
          inadimplente: '<span class="badge badge-warning">Inadimplente</span>'
        };
        return statusMap[row.status] || `<span class="badge badge-neutral">${row.status}</span>`;
      }
    },
    {
      label: 'Ações',
      key: 'actions',
      render: (row) => `
        <div class="table-row-actions">
          <button class="btn btn-outline btn-sm btn-edit-customer" data-id="${row.id}">Editar</button>
        </div>
      `
    }
  ];

  container.innerHTML = renderTable({ columns, rows: customers });

  // Listeners de edição
  container.querySelectorAll('.btn-edit-customer').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const cust = allCustomers.find(c => c.id === id);
      if (cust) openCustomerFormModal(cust);
    });
  });
}

// -------------------------------------------------------------
// FORMULÁRIO DE CADASTRO / EDIÇÃO DE CLIENTE
// -------------------------------------------------------------
function openCustomerFormModal(customer = null) {
  const isEditing = Boolean(customer?.id);

  const bodyHtml = `
    <form id="customer-form">
      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label" for="cust-name">Nome Completo / Razão Social <span class="required">*</span></label>
          <input type="text" id="cust-name" class="form-control" value="${customer?.name || ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="cust-type">Perfil / Categoria</label>
          <select id="cust-type" class="form-control">
            <option value="PF" ${customer?.customer_type === 'PF' ? 'selected' : ''}>Pessoa Física</option>
            <option value="PJ" ${customer?.customer_type === 'PJ' ? 'selected' : ''}>Pessoa Jurídica (Empresa)</option>
            <option value="PEDREIRO" ${customer?.customer_type === 'PEDREIRO' ? 'selected' : ''}>Pedreiro / Autônomo</option>
            <option value="EMPREITEIRO" ${customer?.customer_type === 'EMPREITEIRO' ? 'selected' : ''}>Empreiteiro</option>
            <option value="CONSTRUTORA" ${customer?.customer_type === 'CONSTRUTORA' ? 'selected' : ''}>Construtora</option>
          </select>
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="cust-doc">CPF ou CNPJ</label>
          <input type="text" id="cust-doc" class="form-control" placeholder="000.000.000-00" value="${customer?.document || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="cust-phone">Telefone Principal <span class="required">*</span></label>
          <input type="tel" id="cust-phone" class="form-control" placeholder="(11) 98888-7777" value="${customer?.phone || ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="cust-whatsapp">WhatsApp (para cobrança/recibo)</label>
          <input type="tel" id="cust-whatsapp" class="form-control" placeholder="(11) 98888-7777" value="${customer?.whatsapp || ''}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label" for="cust-address">Endereço Principal / Canteiro de Obras</label>
          <input type="text" id="cust-address" class="form-control" placeholder="Rua, Número, Bairro" value="${customer?.address || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="cust-neighborhood">Bairro</label>
          <input type="text" id="cust-neighborhood" class="form-control" value="${customer?.neighborhood || ''}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="cust-city">Cidade</label>
          <input type="text" id="cust-city" class="form-control" value="${customer?.city || 'São Paulo'}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="cust-credit-limit">Limite para Fiado (R$)</label>
          <input type="number" id="cust-credit-limit" class="form-control" value="${customer?.credit_limit || 500}" min="0" step="50" />
        </div>
        <div class="form-group">
          <label class="form-label" for="cust-status">Status de Crédito</label>
          <select id="cust-status" class="form-control">
            <option value="ativo" ${customer?.status === 'ativo' ? 'selected' : ''}>Ativo (Liberado)</option>
            <option value="bloqueado" ${customer?.status === 'bloqueado' ? 'selected' : ''}>Bloqueado para Fiado</option>
            <option value="inadimplente" ${customer?.status === 'inadimplente' ? 'selected' : ''}>Inadimplente</option>
          </select>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="cust-notes">Ponto de Referência / Observações de Entrega</label>
        <textarea id="cust-notes" class="form-control" rows="2" placeholder="Ex: Canteiro de obras ao lado da padaria, entregar apenas com encarregado">${customer?.notes || ''}</textarea>
      </div>
    </form>
  `;

  const footerHtml = `
    <button id="btn-cancel-cust" class="btn btn-outline">Cancelar</button>
    <button id="btn-save-cust" class="btn btn-primary">
      ${isEditing ? 'Atualizar Cliente' : 'Salvar Cliente'}
    </button>
  `;

  openModal({
    title: isEditing ? 'Editar Cliente' : 'Cadastrar Novo Cliente',
    bodyHtml,
    footerHtml,
    size: 'lg'
  });

  document.getElementById('btn-cancel-cust')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-cust')?.addEventListener('click', async () => {
    const name = document.getElementById('cust-name')?.value.trim();
    const phone = document.getElementById('cust-phone')?.value.trim();
    const whatsapp = document.getElementById('cust-whatsapp')?.value.trim() || phone;
    const documentVal = document.getElementById('cust-doc')?.value.trim();

    if (!name) {
      showToast('O nome do cliente é obrigatório.', 'warning');
      return;
    }
    if (!phone) {
      showToast('Informe ao menos um número de telefone com DDD.', 'warning');
      return;
    }

    const payload = {
      id: customer?.id,
      name,
      customer_type: document.getElementById('cust-type')?.value,
      document: documentVal,
      phone,
      whatsapp,
      address: document.getElementById('cust-address')?.value.trim(),
      neighborhood: document.getElementById('cust-neighborhood')?.value.trim(),
      city: document.getElementById('cust-city')?.value.trim(),
      credit_limit: Number(document.getElementById('cust-credit-limit')?.value) || 0,
      status: document.getElementById('cust-status')?.value || 'ativo',
      notes: document.getElementById('cust-notes')?.value.trim()
    };

    try {
      const saveBtn = document.getElementById('btn-save-cust');
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Salvando...';
      }

      await dbSaveCustomer(payload);
      showToast('Cliente salvo com sucesso!', 'success');
      closeModal();
      await loadCustomers();
    } catch (err) {
      console.error('Erro ao salvar cliente:', err);
      showToast(`Erro ao salvar: ${err.message}`, 'error');
      const saveBtn = document.getElementById('btn-save-cust');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEditing ? 'Atualizar Cliente' : 'Salvar Cliente';
      }
    }
  });
}

// -------------------------------------------------------------
// ABA 2: CENTRAL DE COBRANÇA WHATSAPP & SMS
// -------------------------------------------------------------
async function loadReceivables() {
  const container = document.getElementById('cobranca-table-container');
  showLoading(container, 'Carregando débitos e faturas em aberto...');

  try {
    allReceivables = await dbGetReceivables();
    const totalDebt = allReceivables.reduce((acc, r) => acc + Number(r.current_balance || 0), 0);

    const kpiTotal = document.getElementById('cobranca-kpi-total');
    if (kpiTotal) kpiTotal.textContent = formatCurrency(totalDebt);

    const kpiCount = document.getElementById('cobranca-kpi-count');
    if (kpiCount) kpiCount.textContent = `${allReceivables.length} faturas pendentes`;

    renderReceivablesTable(allReceivables);
  } catch (err) {
    console.error('Erro em loadReceivables:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function renderReceivablesTable(receivables) {
  const container = document.getElementById('cobranca-table-container');
  if (!container) return;

  if (!receivables || receivables.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Tudo em dia!',
      message: 'Não há cobranças de fiado pendentes no momento.'
    });
    return;
  }

  const config = getStoredConfig();

  const columns = [
    {
      label: 'Cliente',
      key: 'customer',
      render: (row) => {
        const cust = row.customer || {};
        return `
          <div>
            <div style="font-weight:700;">${cust.name || 'Cliente'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">
              Tel: ${formatPhone(cust.whatsapp || cust.phone)}
            </div>
          </div>
        `;
      }
    },
    {
      label: 'Vencimento',
      key: 'due_date',
      render: (row) => {
        const isLate = new Date(row.due_date) < new Date();
        return `
          <span style="${isLate ? 'color:var(--danger); font-weight:700;' : ''}">
            ${formatDate(row.due_date)} ${isLate ? '⚠️ (Vencido)' : ''}
          </span>
        `;
      }
    },
    {
      label: 'Valor Original',
      key: 'original_amount',
      numeric: true,
      render: (row) => formatCurrency(row.original_amount)
    },
    {
      label: 'Saldo Devedor',
      key: 'current_balance',
      numeric: true,
      render: (row) => `<strong style="color:var(--danger); font-size:0.9375rem;">${formatCurrency(row.current_balance)}</strong>`
    },
    {
      label: 'Cobrança WhatsApp & SMS',
      key: 'cobranca_actions',
      render: (row) => {
        const cust = row.customer || {};
        const phone = cust.whatsapp || cust.phone || '';

        const msgWhatsApp = parseTemplate(config.whatsappBillingTemplate, {
          customerName: cust.name,
          amount: row.current_balance,
          date: formatDate(row.due_date),
          pixKey: config.pixKey,
          storeName: config.companyName
        });

        const msgSMS = parseTemplate(config.smsBillingTemplate, {
          customerName: cust.name,
          amount: row.current_balance,
          date: formatDate(row.due_date),
          pixKey: config.pixKey,
          storeName: config.companyName
        });

        const waLink = buildWhatsAppLink(phone, msgWhatsApp);
        const smsLink = buildSmsLink(phone, msgSMS);

        if (!phone) {
          return '<span style="font-size:0.75rem; color:var(--text-muted);">Sem telefone cadastrado</span>';
        }

        return `
          <div style="display:flex; gap:6px;">
            <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm btn-log-wa" data-rec-id="${row.id}" data-cust-id="${cust.id}">
              WhatsApp
            </a>
            <a href="${smsLink}" class="btn btn-sms btn-sm btn-log-sms" data-rec-id="${row.id}" data-cust-id="${cust.id}">
              SMS
            </a>
          </div>
        `;
      }
    },
    {
      label: 'Amortizar / Quitar',
      key: 'pay_action',
      render: (row) => `
        <button class="btn btn-success btn-sm btn-pay-receivable" data-id="${row.id}">
          Receber Fiado
        </button>
      `
    }
  ];

  container.innerHTML = renderTable({ columns, rows: receivables });

  // Listeners para Receber Pagamento de Fiado
  container.querySelectorAll('.btn-pay-receivable').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-id');
      const rec = allReceivables.find(r => r.id === recId);
      if (rec) openReceivePaymentModal(rec);
    });
  });

  // Log de disparo ao clicar
  container.querySelectorAll('.btn-log-wa').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-rec-id');
      const custId = btn.getAttribute('data-cust-id');
      const rec = allReceivables.find(r => r.id === recId);
      if (rec) {
        dbLogBillingMessage(custId, recId, 'whatsapp', rec.customer?.whatsapp || '', rec.current_balance, 'whatsapp_billing_template', 'Cobrança enviada via WhatsApp');
        showToast('Cobrança WhatsApp iniciada e registrada no histórico!', 'info');
      }
    });
  });

  container.querySelectorAll('.btn-log-sms').forEach(btn => {
    btn.addEventListener('click', () => {
      const recId = btn.getAttribute('data-rec-id');
      const custId = btn.getAttribute('data-cust-id');
      const rec = allReceivables.find(r => r.id === recId);
      if (rec) {
        dbLogBillingMessage(custId, recId, 'sms', rec.customer?.phone || '', rec.current_balance, 'sms_billing_template', 'Cobrança enviada via SMS');
        showToast('SMS gerado e registrado no histórico!', 'info');
      }
    });
  });
}

// -------------------------------------------------------------
// MODAL PARA RECEBER PAGAMENTO DE FIADO & EMITIR RECIBO
// -------------------------------------------------------------
function openReceivePaymentModal(receivable) {
  const cust = receivable.customer || {};
  const config = getStoredConfig();

  const bodyHtml = `
    <div>
      <div style="background: var(--bg-surface-subtle); padding: 14px; border-radius: var(--radius-md); margin-bottom: 16px;">
        <div style="font-size: 0.8125rem; color: var(--text-muted);">Cliente Devedor:</div>
        <div style="font-size: 1.125rem; font-weight: 700;">${cust.name || 'Cliente'}</div>
        <div style="margin-top: 6px; display: flex; justify-content: space-between;">
          <span>Saldo Total em Aberto:</span>
          <strong style="color: var(--danger); font-size: 1.125rem;">${formatCurrency(receivable.current_balance)}</strong>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label" for="pay-amount">Valor a Receber / Amortizar (R$)</label>
        <input 
          type="number" 
          id="pay-amount" 
          class="form-control" 
          value="${receivable.current_balance}" 
          min="0.50" 
          max="${receivable.current_balance}" 
          step="0.50" 
          style="font-size: 1.125rem; font-weight: 700;"
        />
        <div class="form-feedback">Você pode dar baixa total ou parcial do valor.</div>
      </div>

      <div class="form-group">
        <label class="form-label" for="pay-method-select">Forma de Pagamento</label>
        <select id="pay-method-select" class="form-control">
          <option value="dinheiro">Dinheiro (Entra no Caixa)</option>
          <option value="pix">Pix (Transferência / QR Code)</option>
          <option value="cartao_debito">Cartão de Débito</option>
          <option value="cartao_credito">Cartão de Crédito</option>
        </select>
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-pay" class="btn btn-outline">Cancelar</button>
    <button id="btn-confirm-pay" class="btn btn-success" style="font-weight:700;">
      Confirmar Recebimento & Emitir Recibo
    </button>
  `;

  openModal({
    title: 'Recebimento de Fiado',
    bodyHtml,
    footerHtml,
    size: 'md'
  });

  document.getElementById('btn-cancel-pay')?.addEventListener('click', closeModal);

  document.getElementById('btn-confirm-pay')?.addEventListener('click', async () => {
    const amountVal = Number(document.getElementById('pay-amount')?.value) || 0;
    const method = document.getElementById('pay-method-select')?.value || 'dinheiro';

    if (amountVal <= 0) {
      showToast('Informe um valor válido maior que zero.', 'warning');
      return;
    }

    if (amountVal > receivable.current_balance) {
      showToast('O valor não pode ser superior ao saldo devedor.', 'warning');
      return;
    }

    const btn = document.getElementById('btn-confirm-pay');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'Processando...';
    }

    try {
      const result = await dbRegisterReceivablePayment(receivable.id, cust.id, amountVal, method);
      closeModal();
      showToast(`Pagamento de ${formatCurrency(amountVal)} registrado com sucesso!`, 'success');

      // Abre Modal com Recibo de Pagamento de Fiado pronto para WhatsApp e SMS!
      openFiadoReceiptModal(cust, amountVal, result.newBalance, method, receivable);

      // Recarrega lista
      await loadReceivables();
    } catch (err) {
      console.error('Erro ao registrar pagamento:', err);
      showToast(`Falha: ${err.message}`, 'error');
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Confirmar Recebimento & Emitir Recibo';
      }
    }
  });
}

// -------------------------------------------------------------
// RECIBO DE PAGAMENTO DE FIADO (WHATSAPP & SMS)
// -------------------------------------------------------------
function openFiadoReceiptModal(customer, amountPaid, newBalance, method, receivable) {
  const config = getStoredConfig();
  const receiptCode = generateReceiptCode();
  const phone = customer.whatsapp || customer.phone || '';

  const receiptTextWhatsApp = 
    `🛠️ *[RECIBO DE PAGAMENTO DE FERRAGEM]*\n\n` +
    `*Loja:* ${config.companyName}\n` +
    `*Comprovante:* ${receiptCode}\n` +
    `*Data/Hora:* ${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', {hour:'2-digit', minute:'2-digit'})}\n` +
    `*Cliente:* ${customer.name}\n\n` +
    `*Valor Pago:* R$ ${Number(amountPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n` +
    `*Forma:* ${method.toUpperCase()}\n` +
    `*Saldo Devedor Restante:* R$ ${Number(newBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}\n\n` +
    `_Agradecemos a preferência e pontualidade! Boas obras! 🔩_`;

  const receiptTextSMS = 
    `${config.companyName}: Recibo ${receiptCode} de pagamento de R$ ${Number(amountPaid).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Saldo restante: R$ ${Number(newBalance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}. Obrigado!`;

  const waLink = buildWhatsAppLink(phone, receiptTextWhatsApp);
  const smsLink = buildSmsLink(phone, receiptTextSMS);

  // Registra no banco
  dbSaveReceipt(receivable.sale_id, customer.id, receiptCode, amountPaid, 'fiado_pagamento', receiptTextWhatsApp);

  const bodyHtml = `
    <div>
      <div style="display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap;">
        <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp" style="flex:1; padding:12px; font-weight:700;">
          Enviar Recibo via WhatsApp
        </a>
        <a href="${smsLink}" class="btn btn-sms" style="flex:1; padding:12px; font-weight:700;">
          Enviar Recibo via SMS
        </a>
        <button id="btn-print-fiado-receipt" class="btn btn-outline" style="flex:1; padding:12px;">
          Imprimir Cupom
        </button>
      </div>

      <div class="receipt-paper">
        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-weight: 900; font-size: 1rem;">${config.companyName}</div>
          <div>COMPROVANTE DE PAGAMENTO DE FIADO</div>
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-row">
          <span>COMPROVANTE:</span>
          <span class="receipt-bold">${receiptCode}</span>
        </div>
        <div class="receipt-row">
          <span>CLIENTE:</span>
          <span class="receipt-bold">${customer.name}</span>
        </div>
        <div class="receipt-row">
          <span>FORMA:</span>
          <span>${method.toUpperCase()}</span>
        </div>
        <div class="receipt-divider"></div>
        <div class="receipt-row receipt-bold" style="font-size: 1rem; color: #15803d;">
          <span>VALOR RECEBIDO:</span>
          <span>${formatCurrency(amountPaid)}</span>
        </div>
        <div class="receipt-row" style="color: #64748b; margin-top: 6px;">
          <span>SALDO DEVEDOR ATUAL:</span>
          <span class="receipt-bold">${formatCurrency(newBalance)}</span>
        </div>
        <div class="receipt-divider"></div>
        <div style="text-align: center; font-size: 0.75rem; color: #64748b; margin-top: 10px;">
          Obrigado pela preferência!
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-close-fiado-rec" class="btn btn-primary" style="width: 100%;">
      Fechar
    </button>
  `;

  openModal({
    title: 'Comprovante de Pagamento Gerado',
    bodyHtml,
    footerHtml,
    size: 'md'
  });

  document.getElementById('btn-print-fiado-receipt')?.addEventListener('click', () => window.print());
  document.getElementById('btn-close-fiado-rec')?.addEventListener('click', closeModal);
}
