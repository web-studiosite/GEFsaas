/**
 * GEF - Gestor de Ferragem
 * produtos.js - Catálogo de Ferragens, Preços e Estoques
 */

import { dbGetProducts, dbSaveProduct } from './database.js';
import { formatCurrency, formatQuantity } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

let allProducts = [];

export async function init() {
  setupActions();
  await loadProducts();
}

function setupActions() {
  document.getElementById('btn-novo-produto')?.addEventListener('click', () => openProductModal());
  document.getElementById('produtos-search-input')?.addEventListener('input', () => filterProducts());
  document.getElementById('produtos-filter-stock')?.addEventListener('change', () => filterProducts());
}

async function loadProducts() {
  const container = document.getElementById('produtos-table-container');
  showLoading(container, 'Carregando catálogo de ferragens...');

  try {
    allProducts = await dbGetProducts('', '');
    renderProductsTable(allProducts);
  } catch (err) {
    console.error('Erro ao carregar produtos:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function filterProducts() {
  const query = (document.getElementById('produtos-search-input')?.value || '').toLowerCase().trim();
  const stockFilter = document.getElementById('produtos-filter-stock')?.value || '';

  const filtered = allProducts.filter(p => {
    const matchQuery = !query ||
      (p.name && p.name.toLowerCase().includes(query)) ||
      (p.sku && p.sku.toLowerCase().includes(query)) ||
      (p.barcode && p.barcode.toLowerCase().includes(query));

    let matchStock = true;
    if (stockFilter === 'baixo') {
      matchStock = Number(p.current_stock) <= Number(p.min_stock) && Number(p.current_stock) > 0;
    } else if (stockFilter === 'zerado') {
      matchStock = Number(p.current_stock) <= 0;
    }

    return matchQuery && matchStock;
  });

  renderProductsTable(filtered);
}

function renderProductsTable(products) {
  const container = document.getElementById('produtos-table-container');
  if (!container) return;

  if (!products || products.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhum material encontrado',
      message: 'Cadastre o primeiro item de ferragem ou material de construção da loja.',
      actionText: 'Cadastrar Ferragem',
      actionId: 'btn-empty-novo-prod'
    });
    document.getElementById('btn-empty-novo-prod')?.addEventListener('click', () => openProductModal());
    return;
  }

  const columns = [
    {
      label: 'Código / SKU',
      key: 'sku',
      render: (row) => `<code>${row.sku || '-'}</code>`
    },
    {
      label: 'Nome do Material',
      key: 'name',
      render: (row) => `
        <div>
          <div style="font-weight:700;">${row.name}</div>
          <div style="font-size:0.75rem; color:var(--text-muted);">
            Local: ${row.location || 'Não especificado'} ${row.brand ? `| Marca: ${row.brand}` : ''}
          </div>
        </div>
      `
    },
    {
      label: 'Unid.',
      key: 'unit',
      render: (row) => `<span class="badge badge-neutral">${row.unit || 'UN'}</span>`
    },
    {
      label: 'Estoque Atual',
      key: 'current_stock',
      numeric: true,
      render: (row) => {
        const isLow = Number(row.current_stock) <= Number(row.min_stock);
        return `
          <strong style="${isLow ? 'color:var(--danger);' : ''}">
            ${formatQuantity(row.current_stock, row.unit)}
          </strong>
        `;
      }
    },
    {
      label: 'Preço Venda',
      key: 'selling_price',
      numeric: true,
      render: (row) => `<strong style="color:var(--primary); font-size:0.9375rem;">${formatCurrency(row.selling_price)}</strong>`
    },
    {
      label: 'Custo',
      key: 'cost_price',
      numeric: true,
      render: (row) => formatCurrency(row.cost_price)
    },
    {
      label: 'Ações',
      key: 'actions',
      render: (row) => `
        <button class="btn btn-outline btn-sm btn-edit-prod" data-id="${row.id}">
          Editar
        </button>
      `
    }
  ];

  container.innerHTML = renderTable({ columns, rows: products });

  container.querySelectorAll('.btn-edit-prod').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.getAttribute('data-id');
      const prod = allProducts.find(p => p.id === id);
      if (prod) openProductModal(prod);
    });
  });
}

function openProductModal(product = null) {
  const isEditing = Boolean(product?.id);

  const bodyHtml = `
    <form id="product-form">
      <div class="form-row">
        <div class="form-group" style="grid-column: span 2;">
          <label class="form-label" for="prod-name">Nome do Material / Ferragem <span class="required">*</span></label>
          <input type="text" id="prod-name" class="form-control" placeholder="Ex: Barra de Ferro 3/8 CA-50 12m" value="${product?.name || ''}" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-sku">Código SKU / Referência</label>
          <input type="text" id="prod-sku" class="form-control" placeholder="FER-001" value="${product?.sku || ''}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="prod-unit">Unidade Comercial <span class="required">*</span></label>
          <select id="prod-unit" class="form-control">
            <option value="UN" ${product?.unit === 'UN' ? 'selected' : ''}>UN (Unidade)</option>
            <option value="KG" ${product?.unit === 'KG' ? 'selected' : ''}>KG (Quilograma)</option>
            <option value="MT" ${product?.unit === 'MT' ? 'selected' : ''}>MT (Metro Linear)</option>
            <option value="PC" ${product?.unit === 'PC' ? 'selected' : ''}>PC (Peça)</option>
            <option value="CX" ${product?.unit === 'CX' ? 'selected' : ''}>CX (Caixa)</option>
            <option value="SC" ${product?.unit === 'SC' ? 'selected' : ''}>SC (Saco - Cimento)</option>
            <option value="LTR" ${product?.unit === 'LTR' ? 'selected' : ''}>LTR (Litro)</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-barcode">Código de Barras (EAN-13)</label>
          <input type="text" id="prod-barcode" class="form-control" placeholder="789..." value="${product?.barcode || ''}" />
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-location">Localização na Loja / Prateleira</label>
          <input type="text" id="prod-location" class="form-control" placeholder="Ex: Prateleira C2, Galpão A" value="${product?.location || ''}" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="prod-cost">Preço de Custo (R$)</label>
          <input type="number" id="prod-cost" class="form-control" value="${product?.cost_price || 0}" step="0.01" min="0" />
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-selling">Preço de Venda Balcão (R$) <span class="required">*</span></label>
          <input type="number" id="prod-selling" class="form-control" value="${product?.selling_price || 0}" step="0.01" min="0" required />
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-wholesale">Preço p/ Pedreiro / Atacado (R$)</label>
          <input type="number" id="prod-wholesale" class="form-control" value="${product?.wholesale_price || 0}" step="0.01" min="0" />
        </div>
      </div>

      <div class="form-row">
        <div class="form-group">
          <label class="form-label" for="prod-stock">Estoque Atual</label>
          <input type="number" id="prod-stock" class="form-control" value="${product?.current_stock || 0}" step="0.1" />
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-min-stock">Estoque Mínimo de Alerta</label>
          <input type="number" id="prod-min-stock" class="form-control" value="${product?.min_stock || 10}" step="0.1" />
        </div>
        <div class="form-group">
          <label class="form-label" for="prod-brand">Marca / Fabricante</label>
          <input type="text" id="prod-brand" class="form-control" placeholder="Ex: Gerdau, Votoran, Tigre" value="${product?.brand || ''}" />
        </div>
      </div>
    </form>
  `;

  const footerHtml = `
    <button id="btn-cancel-prod" class="btn btn-outline">Cancelar</button>
    <button id="btn-save-prod" class="btn btn-primary">
      ${isEditing ? 'Atualizar Material' : 'Salvar Material'}
    </button>
  `;

  openModal({
    title: isEditing ? 'Editar Ferragem' : 'Cadastrar Nova Ferragem',
    bodyHtml,
    footerHtml,
    size: 'lg'
  });

  document.getElementById('btn-cancel-prod')?.addEventListener('click', closeModal);

  document.getElementById('btn-save-prod')?.addEventListener('click', async () => {
    const name = document.getElementById('prod-name')?.value.trim();
    const sellingPrice = Number(document.getElementById('prod-selling')?.value) || 0;

    if (!name) {
      showToast('O nome do material é obrigatório.', 'warning');
      return;
    }
    if (sellingPrice <= 0) {
      showToast('O preço de venda deve ser maior que zero.', 'warning');
      return;
    }

    const payload = {
      id: product?.id,
      name,
      sku: document.getElementById('prod-sku')?.value.trim(),
      barcode: document.getElementById('prod-barcode')?.value.trim(),
      unit: document.getElementById('prod-unit')?.value || 'UN',
      location: document.getElementById('prod-location')?.value.trim(),
      cost_price: Number(document.getElementById('prod-cost')?.value) || 0,
      selling_price: sellingPrice,
      wholesale_price: Number(document.getElementById('prod-wholesale')?.value) || 0,
      current_stock: Number(document.getElementById('prod-stock')?.value) || 0,
      min_stock: Number(document.getElementById('prod-min-stock')?.value) || 10,
      brand: document.getElementById('prod-brand')?.value.trim(),
      is_active: true
    };

    const saveBtn = document.getElementById('btn-save-prod');
    if (saveBtn) {
      saveBtn.disabled = true;
      saveBtn.textContent = 'Salvando...';
    }

    try {
      await dbSaveProduct(payload);
      showToast('Material cadastrado com sucesso!', 'success');
      closeModal();
      await loadProducts();
    } catch (err) {
      console.error('Erro ao salvar produto:', err);
      showToast(`Falha: ${err.message}`, 'error');
      if (saveBtn) {
        saveBtn.disabled = false;
        saveBtn.textContent = isEditing ? 'Atualizar Material' : 'Salvar Material';
      }
    }
  });
}
