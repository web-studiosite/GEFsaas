/**
 * GEF - Gestor de Ferragem Moçambique
 * pos.js - Ponto de Venda / Frente de Caixa Rápido para Moçambique
 * Moeda: Metical (MT / MZN) | Pagamentos: Numerário, M-Pesa, e-Mola, mKesh, POS, NIB, Fiado
 * Cálculo de Lucro Bruto e Margem da Venda em tempo real
 */

import { getState, setState } from './state.js';
import { 
  formatCurrency, 
  formatQuantity, 
  formatDate, 
  formatDateTime, 
  formatPhone, 
  buildWhatsAppLink, 
  buildSmsLink, 
  buildSaleReceiptText, 
  formatPaymentMethodName, 
  generateReceiptCode 
} from './utils.js';
import { getStoredConfig } from './config.js';
import { dbGetProducts, dbGetCustomers, dbProcessSale, dbSaveReceipt, dbGetActiveCashSession } from './database.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

let allProducts = [];
let allCustomers = [];
let activeSession = null;

export async function init() {
  initPosState();
  await loadInitialData();
  setupEventListeners();
  renderProductsList();
  renderCart();
  populateCustomerSelect();
}

function initPosState() {
  if (!getState('posCart')) {
    setState('posCart', {
      items: [],
      customerId: null,
      customerData: null,
      discountAmount: 0,
      subtotal: 0,
      total: 0
    });
  }
}

async function loadInitialData() {
  try {
    const [products, customers, session] = await Promise.all([
      dbGetProducts(),
      dbGetCustomers(),
      dbGetActiveCashSession()
    ]);
    allProducts = products || [];
    allCustomers = customers || [];
    activeSession = session;
  } catch (e) {
    console.error('Erro ao carregar dados do POS:', e);
    showToast('Aviso: Verifique a conexão com o Supabase nas Configurações.', 'warning');
  }
}

function setupEventListeners() {
  // Busca em tempo real de produtos (Nome, SKU ou Código)
  const searchInput = document.getElementById('pos-search-input');
  const clearSearchBtn = document.getElementById('pos-btn-clear-search');

  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase().trim();
      if (clearSearchBtn) clearSearchBtn.style.display = q ? 'inline-block' : 'none';
      filterProducts(q);
    });

    // Tecla de atalho F2 para focar na busca
    window.addEventListener('keydown', (e) => {
      if (e.key === 'F2') {
        e.preventDefault();
        searchInput.focus();
        searchInput.select();
      }
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      if (searchInput) searchInput.value = '';
      clearSearchBtn.style.display = 'none';
      filterProducts('');
      searchInput?.focus();
    });
  }

  // Seletor de Cliente
  const customerSelect = document.getElementById('pos-customer-select');
  if (customerSelect) {
    customerSelect.addEventListener('change', (e) => {
      const customerId = e.target.value;
      const cart = getState('posCart');
      cart.customerId = customerId || null;
      cart.customerData = allCustomers.find(c => c.id === customerId) || null;
      updateCustomerInfoBadge();
    });
  }

  // Limpar Carrinho
  document.getElementById('pos-btn-clear-cart')?.addEventListener('click', () => {
    if (confirm('Tem certeza de que deseja limpar todos os itens do carrinho?')) {
      clearCart();
      renderCart();
      showToast('Carrinho limpo.', 'info');
    }
  });

  // Campo de Desconto
  const discountInput = document.getElementById('pos-discount-input');
  if (discountInput) {
    discountInput.addEventListener('input', (e) => {
      const val = Math.max(0, Number(e.target.value) || 0);
      const cart = getState('posCart');
      cart.discountAmount = val;
      updateCartCalculations();
      renderCartTotalsOnly();
    });
  }

  // Botão de Finalizar Venda
  document.getElementById('pos-btn-checkout')?.addEventListener('click', openPaymentModal);
}

function filterProducts(query) {
  if (!query) {
    renderProductsList(allProducts);
    return;
  }
  const filtered = allProducts.filter(p => {
    const nameMatch = (p.name || '').toLowerCase().includes(query);
    const skuMatch = (p.sku || '').toLowerCase().includes(query);
    const barcodeMatch = (p.barcode || '').toLowerCase().includes(query);
    return nameMatch || skuMatch || barcodeMatch;
  });
  renderProductsList(filtered);
}

function renderProductsList(products = allProducts) {
  const container = document.getElementById('pos-products-list');
  if (!container) return;

  if (products.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 10px;">
        <svg style="width: 42px; height: 42px; margin: 0 auto 10px auto; color: var(--border-strong);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
        </svg>
        <p style="font-size: 0.875rem;">Nenhum produto ou material de ferragem encontrado.</p>
      </div>
    `;
    return;
  }

  const cardsHtml = products.map(prod => {
    const isLowStock = Number(prod.current_stock) <= Number(prod.min_stock);
    const unitStr = (prod.unit || 'UN').toUpperCase();

    return `
      <div class="pos-product-card" data-id="${prod.id}" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border-bottom: 1px solid var(--border-subtle); cursor: pointer; transition: background 0.15s ease;">
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 0.9375rem; color: var(--text-primary);">${prod.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted); display: flex; gap: 12px; margin-top: 2px;">
            <span>SKU: ${prod.sku || '-'}</span>
            <span>Stock: <strong style="${isLowStock ? 'color:var(--danger);' : ''}">${formatQuantity(prod.current_stock, unitStr)}</strong></span>
            ${prod.location ? `<span>Local: ${prod.location}</span>` : ''}
          </div>
        </div>
        <div style="text-align: right; margin-left: 16px;">
          <div style="font-size: 1.125rem; font-weight: 800; color: var(--primary);">
            ${formatCurrency(prod.selling_price)}
          </div>
          <button class="btn btn-outline btn-sm btn-add-prod" data-id="${prod.id}" style="margin-top: 4px;">
            + Adicionar
          </button>
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div>${cardsHtml}</div>`;

  container.querySelectorAll('.pos-product-card').forEach(el => {
    el.addEventListener('click', () => {
      const prodId = el.getAttribute('data-id');
      const prod = allProducts.find(p => p.id === prodId);
      if (prod) addProductToCart(prod);
    });
  });
}

function addProductToCart(product) {
  const cart = getState('posCart');
  const existing = cart.items.find(i => i.id === product.id);

  if (existing) {
    existing.quantity = Number((existing.quantity + 1).toFixed(3));
  } else {
    cart.items.push({
      id: product.id,
      product_id: product.id,
      name: product.name,
      sku: product.sku,
      unit: (product.unit || 'UN').toUpperCase(),
      cost_price: Number(product.cost_price) || 0,
      unit_price: Number(product.selling_price) || 0,
      quantity: 1,
      discount: 0,
      total: Number(product.selling_price) || 0
    });
  }

  updateCartCalculations();
  renderCart();
  showToast(`Adicionado: ${product.name}`, 'info', 1200);
}

function renderCart() {
  const cart = getState('posCart');
  const container = document.getElementById('pos-cart-items');
  const subtotalEl = document.getElementById('pos-subtotal');
  const totalEl = document.getElementById('pos-total');
  const checkoutBtn = document.getElementById('pos-btn-checkout');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(cart.subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(cart.total);

  if (checkoutBtn) {
    checkoutBtn.disabled = cart.items.length === 0 || cart.total <= 0;
  }

  if (!container) return;

  if (cart.items.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px 10px;">
        <svg style="width: 42px; height: 42px; margin: 0 auto 10px auto; color: var(--border-strong);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <p style="font-size: 0.875rem;">Nenhum produto adicionado ao carrinho.</p>
      </div>
    `;
    return;
  }

  const itemsHtml = cart.items.map((item, index) => {
    return `
      <div style="padding: 10px 0; border-bottom: 1px dashed var(--border-subtle); display: flex; align-items: center; justify-content: space-between; gap: 8px;">
        <div style="flex: 1;">
          <div style="font-weight: 600; font-size: 0.875rem;">${item.name}</div>
          <div style="font-size: 0.75rem; color: var(--text-muted);">
            ${formatCurrency(item.unit_price)} / ${item.unit}
          </div>
        </div>

        <div style="display: flex; align-items: center; gap: 4px;">
          <button class="btn btn-outline btn-sm btn-qty-dec" data-idx="${index}" style="padding: 2px 6px;">-</button>
          <input 
            type="number" 
            class="form-control inp-item-qty" 
            data-idx="${index}" 
            value="${item.quantity}" 
            step="${['KG', 'MT', 'LTR'].includes(item.unit) ? '0.1' : '1'}" 
            min="0.01" 
            style="width: 60px; padding: 2px 4px; text-align: center; font-size: 0.8125rem;" 
          />
          <button class="btn btn-outline btn-sm btn-qty-inc" data-idx="${index}" style="padding: 2px 6px;">+</button>
        </div>

        <div style="width: 85px; text-align: right; font-weight: 700; font-size: 0.875rem;">
          ${formatCurrency(item.total)}
        </div>

        <button class="btn-icon btn-remove-item" data-idx="${index}" title="Remover" style="color: var(--danger); padding: 4px;">
          &times;
        </button>
      </div>
    `;
  }).join('');

  container.innerHTML = `<div>${itemsHtml}</div>`;

  container.querySelectorAll('.btn-qty-inc').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-idx'));
      cart.items[idx].quantity = Number((cart.items[idx].quantity + 1).toFixed(3));
      updateCartCalculations();
      renderCart();
    });
  });

  container.querySelectorAll('.btn-qty-dec').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-idx'));
      if (cart.items[idx].quantity > 1) {
        cart.items[idx].quantity = Number((cart.items[idx].quantity - 1).toFixed(3));
      } else {
        cart.items.splice(idx, 1);
      }
      updateCartCalculations();
      renderCart();
    });
  });

  container.querySelectorAll('.inp-item-qty').forEach(inp => {
    inp.addEventListener('change', (e) => {
      const idx = Number(inp.getAttribute('data-idx'));
      const val = Math.max(0.01, Number(e.target.value) || 1);
      cart.items[idx].quantity = val;
      updateCartCalculations();
      renderCart();
    });
  });

  container.querySelectorAll('.btn-remove-item').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-idx'));
      cart.items.splice(idx, 1);
      updateCartCalculations();
      renderCart();
    });
  });
}

function renderCartTotalsOnly() {
  const cart = getState('posCart');
  const subtotalEl = document.getElementById('pos-subtotal');
  const totalEl = document.getElementById('pos-total');
  const checkoutBtn = document.getElementById('pos-btn-checkout');

  if (subtotalEl) subtotalEl.textContent = formatCurrency(cart.subtotal);
  if (totalEl) totalEl.textContent = formatCurrency(cart.total);
  if (checkoutBtn) {
    checkoutBtn.disabled = cart.items.length === 0 || cart.total <= 0;
  }
}

function updateCartCalculations() {
  const cart = getState('posCart');
  let sub = 0;
  cart.items.forEach(it => {
    it.total = Number((it.quantity * it.unit_price).toFixed(2));
    sub += it.total;
  });
  cart.subtotal = Number(sub.toFixed(2));
  cart.total = Math.max(0, Number((cart.subtotal - (cart.discountAmount || 0)).toFixed(2)));
}

function clearCart() {
  const cart = getState('posCart');
  cart.items = [];
  cart.discountAmount = 0;
  cart.subtotal = 0;
  cart.total = 0;
  const discInp = document.getElementById('pos-discount-input');
  if (discInp) discInp.value = '0';
}

function populateCustomerSelect() {
  const sel = document.getElementById('pos-customer-select');
  if (!sel) return;

  const currentVal = sel.value;
  sel.innerHTML = '<option value="">Consumidor Balcão (Avulso)</option>';

  allCustomers.forEach(cust => {
    const opt = document.createElement('option');
    opt.value = cust.id;
    opt.textContent = `${cust.name} ${cust.phone ? `(${formatPhone(cust.phone)})` : ''}`;
    sel.appendChild(opt);
  });

  if (currentVal) sel.value = currentVal;
}

function updateCustomerInfoBadge() {
  const cart = getState('posCart');
  const badge = document.getElementById('pos-customer-debt-info');
  if (!badge) return;

  if (!cart.customerData) {
    badge.style.display = 'none';
    return;
  }

  const cust = cart.customerData;
  const debt = Number(cust.debt_balance || 0);
  const limit = Number(cust.credit_limit || 0);
  const isBlocked = cust.status === 'bloqueado';

  badge.style.display = 'block';
  badge.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center;">
      <span><strong>${cust.name}</strong> ${isBlocked ? '<span style="color:var(--danger); font-weight:800;">[BLOQUEADO]</span>' : ''}</span>
      <span>Saldo Devedor: <strong>${formatCurrency(debt)}</strong> / Limite: ${formatCurrency(limit)}</span>
    </div>
  `;
}

// -------------------------------------------------------------
// MODAL DE FECHAMENTO DE VENDA COM MEIOS DE MOÇAMBIQUE
// -------------------------------------------------------------
function openPaymentModal() {
  const cart = getState('posCart');
  const config = getStoredConfig();

  if (cart.items.length === 0 || cart.total <= 0) {
    showToast('Adicione produtos para fechar a venda.', 'warning');
    return;
  }

  const selectedCustomer = cart.customerData;

  const bodyHtml = `
    <div>
      <div style="background: var(--bg-surface-subtle); padding: 14px; border-radius: var(--radius-md); margin-bottom: 18px; text-align: center;">
        <div style="font-size: 0.8125rem; color: var(--text-muted); text-transform: uppercase;">Total da Venda</div>
        <div style="font-size: 2rem; font-weight: 900; color: var(--primary);">${formatCurrency(cart.total)}</div>
        <div style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 2px;">
          Cliente: <strong>${selectedCustomer?.name || 'Consumidor Balcão (Avulso)'}</strong>
        </div>
      </div>

      <!-- Métodos de Pagamento em Moçambique -->
      <div class="form-group" style="margin-bottom: 16px;">
        <label class="form-label">Forma de Pagamento (Moçambique)</label>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
          <label class="btn btn-primary pay-opt-label" style="display:flex; flex-direction:column; padding:10px 4px; text-align:center; font-size:0.8125rem;">
            <input type="radio" name="pay_method" value="numerario" checked style="display:none;" />
            💵 <strong>Numerário</strong>
            <span style="font-size:0.7rem; opacity:0.8;">Espécie em MT</span>
          </label>
          <label class="btn btn-outline pay-opt-label" style="display:flex; flex-direction:column; padding:10px 4px; text-align:center; font-size:0.8125rem;">
            <input type="radio" name="pay_method" value="mpesa" style="display:none;" />
            🔴 <strong>M-Pesa</strong>
            <span style="font-size:0.7rem; opacity:0.8;">Vodacom</span>
          </label>
          <label class="btn btn-outline pay-opt-label" style="display:flex; flex-direction:column; padding:10px 4px; text-align:center; font-size:0.8125rem;">
            <input type="radio" name="pay_method" value="emola" style="display:none;" />
            🟡 <strong>e-Mola</strong>
            <span style="font-size:0.7rem; opacity:0.8;">Movitel</span>
          </label>
          <label class="btn btn-outline pay-opt-label" style="display:flex; flex-direction:column; padding:10px 4px; text-align:center; font-size:0.8125rem;">
            <input type="radio" name="pay_method" value="pos_cartao" style="display:none;" />
            💳 <strong>POS Bancário</strong>
            <span style="font-size:0.7rem; opacity:0.8;">BIM / BCI / Standard</span>
          </label>
          <label class="btn btn-outline pay-opt-label" style="display:flex; flex-direction:column; padding:10px 4px; text-align:center; font-size:0.8125rem;">
            <input type="radio" name="pay_method" value="transferencia" style="display:none;" />
            🏦 <strong>NIB Bancário</strong>
            <span style="font-size:0.7rem; opacity:0.8;">Transferência</span>
          </label>
          <label class="btn btn-outline pay-opt-label" style="display:flex; flex-direction:column; padding:10px 4px; text-align:center; font-size:0.8125rem;">
            <input type="radio" name="pay_method" value="fiado" style="display:none;" />
            📝 <strong>A Prazo</strong>
            <span style="font-size:0.7rem; opacity:0.8;">Conta Corrente</span>
          </label>
        </div>
      </div>

      <!-- Detalhes Numerário: Troco em MT -->
      <div id="pay-box-numerario" style="display: block; background: #f8fafc; border: 1px solid var(--border-subtle); border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <div class="form-group" style="margin-bottom: 8px;">
          <label class="form-label">Valor Entregue pelo Cliente em Espécie (MT)</label>
          <input type="number" id="inp-cash-received" class="form-control" value="${cart.total}" min="${cart.total}" step="5" />
        </div>
        <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 1rem; color: var(--success);">
          <span>Troco a Devolver:</span>
          <span id="cash-change-val">0,00 MT</span>
        </div>
      </div>

      <!-- Detalhes M-Pesa -->
      <div id="pay-box-mpesa" style="display: none; background: #fef2f2; border: 1px solid #fecaca; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <p style="font-size: 0.8125rem; color: #991b1b; margin-bottom: 6px; font-weight: 600;">Recebimento por M-Pesa (Vodacom):</p>
        <div style="display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px dashed #ef4444; margin-bottom: 8px;">
          <span style="font-family: var(--font-mono); font-size: 1.125rem; font-weight: 800; color: #b91c1c;">
            ${config.mpesaNumber || config.phone}
          </span>
          <button type="button" id="btn-copy-mpesa" class="btn btn-outline btn-sm">Copiar Número</button>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size:0.75rem;">Código de Transação / Confirmação M-Pesa</label>
          <input type="text" id="inp-mpesa-ref" class="form-control" placeholder="Ex: PP230914.1500.A12345" />
        </div>
      </div>

      <!-- Detalhes e-Mola -->
      <div id="pay-box-emola" style="display: none; background: #fefce8; border: 1px solid #fef08a; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <p style="font-size: 0.8125rem; color: #854d0e; margin-bottom: 6px; font-weight: 600;">Recebimento por e-Mola (Movitel):</p>
        <div style="display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px dashed #eab308; margin-bottom: 8px;">
          <span style="font-family: var(--font-mono); font-size: 1.125rem; font-weight: 800; color: #a16207;">
            ${config.emolaNumber || config.phone}
          </span>
          <button type="button" id="btn-copy-emola" class="btn btn-outline btn-sm">Copiar Número</button>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size:0.75rem;">Código de Confirmação e-Mola</label>
          <input type="text" id="inp-emola-ref" class="form-control" placeholder="Ex: TXN-EM-847291" />
        </div>
      </div>

      <!-- Detalhes NIB Bancário -->
      <div id="pay-box-transferencia" style="display: none; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <p style="font-size: 0.8125rem; color: #1e40af; margin-bottom: 6px; font-weight: 600;">Transferência Bancária / NIB:</p>
        <div style="display: flex; align-items: center; justify-content: space-between; background: #fff; padding: 8px 12px; border-radius: 4px; border: 1px dashed #3b82f6; margin-bottom: 8px;">
          <div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${config.bankName}</div>
            <span style="font-family: var(--font-mono); font-size: 0.9375rem; font-weight: 800; color: #1d4ed8;">
              ${config.bankNib}
            </span>
          </div>
          <button type="button" id="btn-copy-nib" class="btn btn-outline btn-sm">Copiar NIB</button>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size:0.75rem;">Comprovativo Bancário / Ref.</label>
          <input type="text" id="inp-bank-ref" class="form-control" placeholder="Ex: TRF-2023-BIM-9842" />
        </div>
      </div>

      <!-- Detalhes POS Cartão -->
      <div id="pay-box-pos-cartao" style="display: none; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <p style="font-size: 0.8125rem; color: #166534; margin-bottom: 6px;">
          Passe o cartão de débito ou crédito no terminal POS físico da loja e confirme a transação.
        </p>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size:0.75rem;">Nº da Autorização / Terminal POS</label>
          <input type="text" id="inp-pos-auth" class="form-control" placeholder="Ex: AUT-928192" />
        </div>
      </div>

      <!-- Detalhes Fiado (A Prazo) -->
      <div id="pay-box-fiado" style="display: none; background: #fffbeb; border: 1px solid #fde68a; border-radius: var(--radius-sm); padding: 14px; margin-bottom: 16px;">
        <p style="font-size: 0.8125rem; color: #92400e; margin-bottom: 8px;">
          Venda a prazo registrada na conta corrente do cliente em Moçambique.
        </p>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label">Data de Vencimento</label>
          <input type="date" id="inp-fiado-due-date" class="form-control" value="${new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]}" />
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-cancel-checkout" class="btn btn-outline">Cancelar</button>
    <button id="btn-confirm-checkout" class="btn btn-primary" style="padding: 10px 24px; font-weight: 700;">
      Confirmar & Emitir Factura-Recibo
    </button>
  `;

  openModal({
    title: 'Fechamento de Venda & Pagamento',
    bodyHtml,
    footerHtml,
    size: 'md'
  });

  setupPaymentModalListeners(cart);
}

function setupPaymentModalListeners(cart) {
  let selectedMethod = 'numerario';
  const radios = document.querySelectorAll('input[name="pay_method"]');
  const boxNumerario = document.getElementById('pay-box-numerario');
  const boxMpesa = document.getElementById('pay-box-mpesa');
  const boxEmola = document.getElementById('pay-box-emola');
  const boxPosCartao = document.getElementById('pay-box-pos-cartao');
  const boxTransferencia = document.getElementById('pay-box-transferencia');
  const boxFiado = document.getElementById('pay-box-fiado');
  const inpCash = document.getElementById('inp-cash-received');
  const changeEl = document.getElementById('cash-change-val');

  radios.forEach(r => {
    r.parentElement.addEventListener('click', () => {
      radios.forEach(x => {
        x.checked = false;
        x.parentElement.classList.remove('btn-primary');
        x.parentElement.classList.add('btn-outline');
      });
      r.checked = true;
      r.parentElement.classList.remove('btn-outline');
      r.parentElement.classList.add('btn-primary');

      selectedMethod = r.value;
      if (boxNumerario) boxNumerario.style.display = selectedMethod === 'numerario' ? 'block' : 'none';
      if (boxMpesa) boxMpesa.style.display = selectedMethod === 'mpesa' ? 'block' : 'none';
      if (boxEmola) boxEmola.style.display = selectedMethod === 'emola' ? 'block' : 'none';
      if (boxPosCartao) boxPosCartao.style.display = selectedMethod === 'pos_cartao' ? 'block' : 'none';
      if (boxTransferencia) boxTransferencia.style.display = selectedMethod === 'transferencia' ? 'block' : 'none';
      if (boxFiado) boxFiado.style.display = selectedMethod === 'fiado' ? 'block' : 'none';
    });
  });

  // Cálculo de troco instantâneo em MT
  if (inpCash) {
    inpCash.addEventListener('input', (e) => {
      const rec = Number(e.target.value) || 0;
      const change = Math.max(0, rec - cart.total);
      if (changeEl) changeEl.textContent = formatCurrency(change);
    });
  }

  // Copiar M-Pesa / e-Mola / NIB
  document.getElementById('btn-copy-mpesa')?.addEventListener('click', () => {
    const config = getStoredConfig();
    navigator.clipboard.writeText(config.mpesaNumber || config.phone);
    showToast('Número M-Pesa copiado com sucesso!', 'success');
  });

  document.getElementById('btn-copy-emola')?.addEventListener('click', () => {
    const config = getStoredConfig();
    navigator.clipboard.writeText(config.emolaNumber || config.phone);
    showToast('Número e-Mola copiado com sucesso!', 'success');
  });

  document.getElementById('btn-copy-nib')?.addEventListener('click', () => {
    const config = getStoredConfig();
    navigator.clipboard.writeText(config.bankNib);
    showToast('NIB Bancário copiado!', 'success');
  });

  document.getElementById('btn-cancel-checkout')?.addEventListener('click', closeModal);

  // Confirmação e Gravação da Venda
  document.getElementById('btn-confirm-checkout')?.addEventListener('click', async () => {
    if (selectedMethod === 'fiado') {
      if (!cart.customerId) {
        showToast('Para vender A Prazo (Fiado), selecione um cliente cadastrado no topo do carrinho.', 'warning');
        return;
      }
      const customer = cart.customerData;
      if (customer && customer.status === 'bloqueado') {
        showToast('Este cliente está BLOQUEADO para novas compras a prazo.', 'error');
        return;
      }
    }

    const cashReceived = selectedMethod === 'numerario' ? (Number(inpCash?.value) || cart.total) : cart.total;
    const change = Math.max(0, cashReceived - cart.total);
    const dueDate = document.getElementById('inp-fiado-due-date')?.value;

    const confirmBtn = document.getElementById('btn-confirm-checkout');
    if (confirmBtn) {
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'A processar venda no Supabase...';
    }

    try {
      // 1. Grava a venda com cálculo de lucro e congelamento de custo
      const saleResult = await dbProcessSale({
        session_id: activeSession?.id || null,
        customer_id: cart.customerId,
        subtotal: cart.subtotal,
        discount: cart.discountAmount,
        total: cart.total,
        amount_paid: cashReceived,
        change_amount: change,
        payment_method: selectedMethod,
        dueDate: dueDate,
        items: cart.items
      }, cart.items);

      closeModal();
      showToast('Venda finalizada e liquidada com sucesso!', 'success');

      // 2. Abre o Modal de Recibo Digital com Card de Lucro Real
      openReceiptModal(saleResult, cart.items, cart.customerData);

      // 3. Limpa o carrinho
      clearCart();
      renderCart();

    } catch (err) {
      console.error('Falha ao concluir venda:', err);
      showToast(`Erro ao finalizar venda: ${err.message}`, 'error');
      if (confirmBtn) {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Confirmar & Emitir Factura-Recibo';
      }
    }
  });
}

// -------------------------------------------------------------
// MODAL DE RECIBO DIGITAL COM CARD DE LUCRO REAL DA VENDA
// -------------------------------------------------------------
export function openReceiptModal(sale, items, customer) {
  const config = getStoredConfig();
  const receiptCode = sale.receipt_code || generateReceiptCode();
  const phone = customer?.whatsapp || customer?.phone || '';

  // Cálculos de Lucro Bruto e Custo da Venda
  let totalCost = 0;
  items.forEach(it => {
    const cost = Number(it.cost_price || it.unit_cost || 0);
    const qty = Number(it.quantity || 1);
    totalCost += (cost * qty);
  });
  const saleTotal = Number(sale.total || 0);
  const grossProfit = saleTotal - totalCost;
  const marginPercent = saleTotal > 0 ? ((grossProfit / saleTotal) * 100).toFixed(1) : '0.0';

  // Monta texto do recibo para WhatsApp (Moçambique)
  const receiptTextWhatsApp = buildSaleReceiptText(sale, items, customer, config);

  // Monta texto compacto para SMS (Moçambique)
  const receiptTextSMS = `Recibo ${receiptCode} de ${formatCurrency(sale.total)} da Ferragem ${config.companyName}. Kanimambo pela confianca!`;

  const waLink = buildWhatsAppLink(phone, receiptTextWhatsApp);
  const smsLink = buildSmsLink(phone, receiptTextSMS);

  // Salva recibo no banco
  dbSaveReceipt(sale.id, customer?.id, receiptCode, sale.total, 'digital', receiptTextWhatsApp).catch(e => console.warn('Recibo persist:', e));

  const bodyHtml = `
    <div>
      <!-- Card de Lucro Real da Venda -->
      <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: var(--radius-md); padding: 12px 16px; margin-bottom: 16px;">
        <div style="font-size: 0.75rem; font-weight: 700; color: #166534; text-transform: uppercase; margin-bottom: 6px;">
          📊 Performance Financeira Desta Venda (Congelada)
        </div>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; text-align: center;">
          <div>
            <div style="font-size: 0.75rem; color: #15803d;">Custo dos Materiais</div>
            <div style="font-weight: 700; font-size: 0.9375rem; color: #166534;">${formatCurrency(totalCost)}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: #15803d;">Lucro Bruto Real</div>
            <div style="font-weight: 900; font-size: 1.0625rem; color: #15803d;">+${formatCurrency(grossProfit)}</div>
          </div>
          <div>
            <div style="font-size: 0.75rem; color: #15803d;">Margem de Lucro</div>
            <div style="font-weight: 800; font-size: 0.9375rem; color: #15803d;">${marginPercent}%</div>
          </div>
        </div>
      </div>

      <!-- Ações de Envio do Recibo -->
      <div style="display: flex; gap: 10px; margin-bottom: 18px; flex-wrap: wrap;">
        <!-- Botão WhatsApp -->
        <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp" style="flex: 1; padding: 10px; font-weight: 700;">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2z"></path>
          </svg>
          <span>Enviar WhatsApp</span>
        </a>

        <!-- Botão SMS -->
        <a href="${smsLink}" class="btn btn-sms" style="flex: 1; padding: 10px; font-weight: 700;">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
          </svg>
          <span>Enviar SMS</span>
        </a>

        <!-- Botão Imprimir -->
        <button id="btn-print-receipt" class="btn btn-outline" style="flex: 1; padding: 10px;">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 6 2 18 2 18 9"></polyline>
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path>
            <rect x="6" y="14" width="12" height="8"></rect>
          </svg>
          <span>Imprimir Recibo</span>
        </button>
      </div>

      <!-- Cupom Térmico / Factura-Recibo Formatado na Tela -->
      <div class="receipt-paper" id="printable-receipt">
        <div style="text-align: center; margin-bottom: 8px;">
          <div style="font-weight: 900; font-size: 1rem;">${config.companyName}</div>
          <div>${config.address}</div>
          <div>NUIT: ${config.document} | Tel: ${config.phone}</div>
        </div>

        <div class="receipt-divider"></div>
        <div class="receipt-row">
          <span>COMPROVATIVO:</span>
          <span class="receipt-bold">${receiptCode}</span>
        </div>
        <div class="receipt-row">
          <span>DATA:</span>
          <span>${new Date().toLocaleDateString('pt-MZ')} ${new Date().toLocaleTimeString('pt-MZ', {hour:'2-digit', minute:'2-digit'})}</span>
        </div>
        <div class="receipt-row">
          <span>CLIENTE:</span>
          <span class="receipt-bold">${customer?.name || 'CONSUMIDOR BALCÃO'}</span>
        </div>
        <div class="receipt-divider"></div>

        <div style="font-weight: 700; margin-bottom: 6px;">ITENS DA FERRAGEM:</div>
        ${items.map(item => `
          <div style="margin-bottom: 4px;">
            <div>${item.name}</div>
            <div class="receipt-row" style="color: #475569; font-size: 0.75rem;">
              <span>${formatQuantity(item.quantity, item.unit)} x ${formatCurrency(item.unit_price)}</span>
              <span>${formatCurrency(item.total)}</span>
            </div>
          </div>
        `).join('')}

        <div class="receipt-divider"></div>
        <div class="receipt-row receipt-bold" style="font-size: 1rem;">
          <span>TOTAL A PAGAR:</span>
          <span>${formatCurrency(sale.total)}</span>
        </div>
        <div class="receipt-row">
          <span>FORMA DE PAGAMENTO:</span>
          <span>${formatPaymentMethodName(sale.payment_method)}</span>
        </div>
        ${sale.change_amount > 0 ? `
          <div class="receipt-row">
            <span>TROCO ENTREGUE:</span>
            <span>${formatCurrency(sale.change_amount)}</span>
          </div>
        ` : ''}

        <div class="receipt-divider"></div>
        <div style="text-align: center; font-size: 0.75rem; color: #475569; margin-top: 10px;">
          ${config.tradeName}<br/>
          Kanimambo pela preferência e boa obra! 🔩
        </div>
      </div>
    </div>
  `;

  const footerHtml = `
    <button id="btn-close-receipt-modal" class="btn btn-primary" style="width: 100%;">
      Próxima Venda (Novo Atendimento)
    </button>
  `;

  openModal({
    title: 'Factura-Recibo Emitida com Sucesso',
    bodyHtml,
    footerHtml,
    size: 'md'
  });

  document.getElementById('btn-print-receipt')?.addEventListener('click', () => {
    window.print();
  });

  document.getElementById('btn-close-receipt-modal')?.addEventListener('click', closeModal);
}
