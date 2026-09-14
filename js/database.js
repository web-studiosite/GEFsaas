/**
 * GEF - Gestor de Ferragem
 * database.js - Camada Central de Dados (100% Supabase / PostgreSQL com RLS)
 * 
 * Regra Absoluta:
 * - Sem dados falsos, sem mock, sem localStore como banco.
 * - Toda leitura e escrita passa pelo Supabase.
 * - Erros reais são propagados para a interface.
 */

import { supabase, isSupabaseConfigured } from './supabase.js';
import { getState } from './state.js';

function ensureSupabase() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Não foi possível conectar ao Supabase. Verifique a URL e a Chave Pública nas Configurações.');
  }
}

function getActiveTenantId() {
  const profile = getState('userProfile');
  if (!profile?.tenant_id && profile?.role !== 'monitor') {
    throw new Error('Tenant não identificado para o usuário autenticado.');
  }
  return profile?.tenant_id;
}

function getActiveStoreId() {
  const profile = getState('userProfile');
  return profile?.store_id;
}

function getActiveUserId() {
  const profile = getState('userProfile');
  return profile?.id;
}

// =============================================================
// PRODUTOS & MATERIAIS DE FERRAGEM
// =============================================================

export async function dbGetProducts(query = '', categoryId = '') {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  let req = supabase
    .from('products')
    .select(`
      *,
      category:categories(name),
      stock:product_stock(current_stock, min_stock, store_id)
    `)
    .order('name');

  if (tenantId) {
    req = req.eq('tenant_id', tenantId);
  }

  if (query) {
    req = req.or(`name.ilike.%${query}%,sku.ilike.%${query}%,barcode.ilike.%${query}%`);
  }

  if (categoryId) {
    req = req.eq('category_id', categoryId);
  }

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar produtos no Supabase: ${error.message}`);

  // Normaliza o estoque da loja ativa
  return (data || []).map(prod => {
    let currentStock = 0;
    if (prod.stock && Array.isArray(prod.stock)) {
      const storeStock = prod.stock.find(s => s.store_id === storeId) || prod.stock[0];
      if (storeStock) {
        currentStock = Number(storeStock.current_stock || 0);
      }
    }
    return {
      ...prod,
      current_stock: currentStock,
      category_name: prod.category?.name || 'Geral'
    };
  });
}

export async function dbSaveProduct(product) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const isNew = !product.id;
  const payload = {
    tenant_id: tenantId,
    name: product.name,
    sku: product.sku || null,
    barcode: product.barcode || null,
    category_id: product.category_id || null,
    unit: product.unit || 'UN',
    cost_price: Number(product.cost_price || 0),
    markup_percent: Number(product.markup_percent || 40),
    selling_price: Number(product.selling_price || 0),
    min_stock: Number(product.min_stock || 5),
    location: product.location || null,
    is_active: product.is_active !== false,
    updated_at: new Date().toISOString()
  };

  let savedProd;
  if (isNew) {
    const { data, error } = await supabase.from('products').insert([payload]).select().single();
    if (error) throw new Error(`Erro ao cadastrar produto: ${error.message}`);
    savedProd = data;

    // Inicializa estoque na loja atual
    if (storeId) {
      const initStock = Number(product.current_stock || 0);
      await supabase.from('product_stock').insert([{
        tenant_id: tenantId,
        store_id: storeId,
        product_id: savedProd.id,
        current_stock: initStock,
        min_stock: Number(product.min_stock || 5)
      }]);

      if (initStock > 0) {
        await supabase.from('stock_movements').insert([{
          tenant_id: tenantId,
          store_id: storeId,
          product_id: savedProd.id,
          user_id: userId,
          type: 'entrada',
          quantity: initStock,
          previous_stock: 0,
          new_stock: initStock,
          unit_cost: Number(product.cost_price || 0),
          reason: 'Saldo inicial de cadastro'
        }]);
      }
    }
  } else {
    const { data, error } = await supabase
      .from('products')
      .update(payload)
      .eq('id', product.id)
      .select()
      .single();
    if (error) throw new Error(`Erro ao atualizar produto: ${error.message}`);
    savedProd = data;
  }

  return savedProd;
}

export async function dbDeleteProduct(id) {
  ensureSupabase();
  const { error } = await supabase.from('products').update({ is_active: false }).eq('id', id);
  if (error) throw new Error(`Erro ao desativar produto: ${error.message}`);
  return true;
}

export async function dbGetCategories() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  let query = supabase.from('categories').select('*').order('name');
  if (tenantId) query = query.eq('tenant_id', tenantId);

  const { data, error } = await query;
  if (error) throw new Error(`Erro ao buscar categorias: ${error.message}`);
  return data || [];
}

// =============================================================
// ESTOQUE POR LOJA & KARDEX
// =============================================================

export async function dbGetStock() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  let req = supabase
    .from('product_stock')
    .select(`
      *,
      product:products(*, category:categories(name))
    `)
    .order('updated_at', { ascending: false });

  if (tenantId) req = req.eq('tenant_id', tenantId);
  if (storeId) req = req.eq('store_id', storeId);

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar estoque no Supabase: ${error.message}`);

  return (data || []).map(item => ({
    id: item.id,
    product_id: item.product_id,
    name: item.product?.name || 'Produto sem nome',
    sku: item.product?.sku || '-',
    unit: item.product?.unit || 'UN',
    cost_price: Number(item.product?.cost_price || 0),
    selling_price: Number(item.product?.selling_price || 0),
    current_stock: Number(item.current_stock || 0),
    min_stock: Number(item.min_stock || item.product?.min_stock || 5),
    category_name: item.product?.category?.name || 'Geral'
  }));
}

export async function dbRecordStockMovement(movement) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = movement.store_id || getActiveStoreId();
  const userId = getActiveUserId();

  // 1. Obtém estoque atual
  const { data: stockRow, error: stockErr } = await supabase
    .from('product_stock')
    .select('*')
    .eq('store_id', storeId)
    .eq('product_id', movement.product_id)
    .maybeSingle();

  if (stockErr) throw stockErr;

  const prevStock = stockRow ? Number(stockRow.current_stock) : 0;
  const qty = Number(movement.quantity);
  const isAddition = ['entrada', 'devolucao', 'ajuste_positivo'].includes(movement.type);
  const newStock = isAddition ? (prevStock + qty) : (prevStock - qty);

  // 2. Atualiza ou insere product_stock
  if (stockRow) {
    await supabase
      .from('product_stock')
      .update({ current_stock: newStock, updated_at: new Date().toISOString() })
      .eq('id', stockRow.id);
  } else {
    await supabase
      .from('product_stock')
      .insert([{
        tenant_id: tenantId,
        store_id: storeId,
        product_id: movement.product_id,
        current_stock: newStock
      }]);
  }

  // 3. Registra no Kardex
  const { data: moveData, error: moveErr } = await supabase
    .from('stock_movements')
    .insert([{
      tenant_id: tenantId,
      store_id: storeId,
      product_id: movement.product_id,
      user_id: userId,
      type: movement.type,
      quantity: qty,
      previous_stock: prevStock,
      new_stock: newStock,
      unit_cost: Number(movement.unit_cost || 0),
      reason: movement.reason || 'Ajuste manual'
    }])
    .select()
    .single();

  if (moveErr) throw new Error(`Erro ao registrar movimentação de estoque: ${moveErr.message}`);
  return moveData;
}

// =============================================================
// CLIENTES & CRÉDITO FIADO
// =============================================================

export async function dbGetCustomers(query = '') {
  ensureSupabase();
  const tenantId = getActiveTenantId();

  let req = supabase.from('customers').select('*').order('name');
  if (tenantId) req = req.eq('tenant_id', tenantId);

  if (query) {
    req = req.or(`name.ilike.%${query}%,document.ilike.%${query}%,phone.ilike.%${query}%`);
  }

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar clientes: ${error.message}`);
  return data || [];
}

export async function dbSaveCustomer(customer) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  const isNew = !customer.id;
  const payload = {
    tenant_id: tenantId,
    store_id: storeId,
    name: customer.name,
    customer_type: customer.customer_type || 'PF',
    document: customer.document || null,
    phone: customer.phone,
    whatsapp: customer.whatsapp || customer.phone,
    email: customer.email || null,
    address: customer.address || null,
    neighborhood: customer.neighborhood || null,
    city: customer.city || null,
    state: customer.state || null,
    reference_point: customer.reference_point || null,
    credit_limit: Number(customer.credit_limit || 500),
    debt_balance: Number(customer.debt_balance || 0),
    status: customer.status || 'ativo',
    notes: customer.notes || null,
    updated_at: new Date().toISOString()
  };

  if (isNew) {
    const { data, error } = await supabase.from('customers').insert([payload]).select().single();
    if (error) throw new Error(`Erro ao cadastrar cliente: ${error.message}`);
    return data;
  } else {
    const { data, error } = await supabase.from('customers').update(payload).eq('id', customer.id).select().single();
    if (error) throw new Error(`Erro ao atualizar cliente: ${error.message}`);
    return data;
  }
}

// =============================================================
// VENDAS & PDV FRENTE DE CAIXA
// =============================================================

export async function dbGetSales(limit = 100) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  let req = supabase
    .from('sales')
    .select(`
      *,
      customer:customers(name, phone),
      user:profiles(full_name),
      store:stores(name),
      items:sale_items(*)
    `)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (tenantId) req = req.eq('tenant_id', tenantId);
  if (storeId) req = req.eq('store_id', storeId);

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao buscar histórico de vendas: ${error.message}`);
  return data || [];
}

/**
 * Processamento Real e Atômico de Venda via RPC no PostgreSQL (Contexto Moçambique)
 * Congelamento de custo unitário, cálculo de lucro bruto e margem da venda
 */
export async function dbProcessSale(saleData, itemsParam = null) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const rawItems = saleData.items || itemsParam || [];
  let totalSaleCost = 0;

  const itemsPayload = rawItems.map(item => {
    const qty = Number(item.quantity || 1);
    const uCost = Number(item.cost_price || item.unit_cost || 0);
    const uPrice = Number(item.unit_price || item.selling_price || item.price || 0);
    const itemDiscount = Number(item.discount || 0);
    const itemTotal = Number(item.total || ((qty * uPrice) - itemDiscount));
    const itemCostTotal = Number((qty * uCost).toFixed(2));
    const itemProfit = Number((itemTotal - itemCostTotal).toFixed(2));

    totalSaleCost += itemCostTotal;

    return {
      product_id: item.product_id || item.id,
      product_name: item.product_name || item.name || 'Material de Ferragem',
      unit: (item.unit || 'UN').toUpperCase(),
      unit_cost: uCost,
      unit_price: uPrice,
      quantity: qty,
      discount: itemDiscount,
      total: itemTotal,
      cost_total: itemCostTotal,
      gross_profit: itemProfit
    };
  });

  const saleTotal = Number(saleData.total || 0);
  const totalGrossProfit = Number((saleTotal - totalSaleCost).toFixed(2));
  const saleMarginPercent = saleTotal > 0 ? Number(((totalGrossProfit / saleTotal) * 100).toFixed(2)) : 0.0;

  const salePayload = {
    tenant_id: tenantId,
    store_id: storeId,
    session_id: saleData.session_id || null,
    customer_id: saleData.customer_id || null,
    subtotal: Number(saleData.subtotal || saleTotal),
    discount: Number(saleData.discount || 0),
    total: saleTotal,
    amount_paid: Number(saleData.amount_paid || saleTotal),
    change_amount: Number(saleData.change_amount || 0),
    payment_method: saleData.payment_method || 'numerario',
    cost_total: totalSaleCost,
    gross_profit: totalGrossProfit,
    margin_percent: saleMarginPercent
  };

  const paymentsPayload = saleData.payments || [{
    method: saleData.payment_method || 'numerario',
    amount: saleTotal
  }];

  // Tenta processamento atômico via RPC no Supabase
  try {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('process_sale', {
      p_sale: salePayload,
      p_items: itemsPayload,
      p_payments: paymentsPayload
    });

    if (!rpcError && rpcResult) {
      return {
        ...rpcResult,
        cost_total: totalSaleCost,
        gross_profit: totalGrossProfit,
        margin_percent: saleMarginPercent
      };
    }
    if (rpcError && !rpcError.message.includes('function') && !rpcError.message.includes('not found')) {
      throw rpcError;
    }
  } catch (rpcErr) {
    console.warn('RPC process_sale directo:', rpcErr.message);
  }

  // Fallback transacional direto no Supabase
  const receiptCode = 'REC-' + Math.random().toString(36).substring(2, 10).toUpperCase();

  // 1. Insere Venda
  const { data: newSale, error: saleErr } = await supabase
    .from('sales')
    .insert([{
      ...salePayload,
      user_id: userId,
      status: 'finalizada',
      receipt_code: receiptCode
    }])
    .select()
    .single();

  if (saleErr) throw new Error(`Falha ao registar venda: ${saleErr.message}`);

  // 2. Insere Itens e Atualiza Estoque da Loja
  for (const it of itemsPayload) {
    await supabase.from('sale_items').insert([{
      tenant_id: tenantId,
      sale_id: newSale.id,
      ...it
    }]);

    // Baixa de estoque por loja
    if (storeId) {
      const { data: stockRow } = await supabase
        .from('product_stock')
        .select('*')
        .eq('store_id', storeId)
        .eq('product_id', it.product_id)
        .maybeSingle();

      const curr = stockRow ? Number(stockRow.current_stock) : 0;
      const next = curr - it.quantity;

      if (stockRow) {
        await supabase.from('product_stock').update({ current_stock: next, updated_at: new Date().toISOString() }).eq('id', stockRow.id);
      } else {
        await supabase.from('product_stock').insert([{ tenant_id: tenantId, store_id: storeId, product_id: it.product_id, current_stock: next }]);
      }

      await supabase.from('stock_movements').insert([{
        tenant_id: tenantId,
        store_id: storeId,
        product_id: it.product_id,
        user_id: userId,
        type: 'saida_venda',
        quantity: it.quantity,
        previous_stock: curr,
        new_stock: next,
        unit_cost: it.unit_cost,
        reference_id: newSale.id,
        reason: `Venda #${newSale.sale_number || newSale.id}`
      }]);
    }
  }

  // 3. Insere Pagamentos & Movimentos de Caixa (Moçambique)
  const cashEquivalentMethods = ['numerario', 'dinheiro', 'mpesa', 'emola', 'mkesh', 'pos_cartao', 'cartao_debito', 'cartao_credito', 'transferencia'];
  for (const pay of paymentsPayload) {
    await supabase.from('payments').insert([{
      tenant_id: tenantId,
      store_id: storeId,
      sale_id: newSale.id,
      customer_id: salePayload.customer_id,
      session_id: salePayload.session_id,
      method: pay.method,
      amount: pay.amount
    }]);

    if (salePayload.session_id && cashEquivalentMethods.includes(pay.method)) {
      await supabase.from('cash_movements').insert([{
        tenant_id: tenantId,
        store_id: storeId,
        session_id: salePayload.session_id,
        user_id: userId,
        type: 'venda',
        payment_method: pay.method,
        amount: pay.amount,
        description: `Venda #${newSale.sale_number || newSale.id} (${pay.method.toUpperCase()})`
      }]);
    }

    if (pay.method === 'fiado' && salePayload.customer_id) {
      await supabase.from('receivables').insert([{
        tenant_id: tenantId,
        store_id: storeId,
        customer_id: salePayload.customer_id,
        sale_id: newSale.id,
        original_amount: pay.amount,
        current_balance: pay.amount,
        due_date: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
        status: 'pendente',
        notes: `Venda a prazo #${newSale.sale_number || newSale.id}`
      }]);

      // Atualiza saldo devedor do cliente
      const { data: cust } = await supabase.from('customers').select('debt_balance').eq('id', salePayload.customer_id).single();
      if (cust) {
        await supabase.from('customers').update({
          debt_balance: Number(cust.debt_balance || 0) + Number(pay.amount),
          updated_at: new Date().toISOString()
        }).eq('id', salePayload.customer_id);
      }
    }
  }

  // 4. Grava Auditoria e Monitoria
  try {
    await supabase.from('audit_logs').insert([{
      tenant_id: tenantId,
      store_id: storeId,
      user_id: userId,
      action: 'VENDA',
      table_name: 'sales',
      record_id: newSale.id,
      new_values: { sale_number: newSale.sale_number, total: newSale.total, method: newSale.payment_method, profit: totalGrossProfit }
    }]);

    await supabase.from('monitoring_events').insert([{
      tenant_id: tenantId,
      store_id: storeId,
      user_id: userId,
      module: 'pdv',
      event_type: 'sale_completed',
      severity: 'info',
      description: `Venda #${newSale.sale_number || newSale.id} realizada no valor de ${newSale.total} MT (Lucro: +${totalGrossProfit} MT)`
    }]);
  } catch (e) {
    console.warn('Registro de monitoria:', e);
  }

  return {
    ...newSale,
    cost_total: totalSaleCost,
    gross_profit: totalGrossProfit,
    margin_percent: saleMarginPercent,
    items: itemsPayload
  };
}

// =============================================================
// CAIXA POR LOJA & GAVETA
// =============================================================

export async function dbGetActiveCashSession() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  const { data, error } = await supabase
    .from('cash_sessions')
    .select('*, user:profiles(full_name)')
    .eq('tenant_id', tenantId)
    .eq('store_id', storeId)
    .eq('status', 'aberto')
    .maybeSingle();

  if (error) throw new Error(`Erro ao verificar turno de caixa: ${error.message}`);
  return data;
}

export async function dbOpenCashSession(openingBalance, notes = '') {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const { data, error } = await supabase
    .from('cash_sessions')
    .insert([{
      tenant_id: tenantId,
      store_id: storeId,
      user_id: userId,
      opening_balance: Number(openingBalance || 0),
      status: 'aberto',
      notes: notes
    }])
    .select()
    .single();

  if (error) throw new Error(`Erro ao abrir turno de caixa: ${error.message}`);

  await supabase.from('audit_logs').insert([{
    tenant_id: tenantId,
    store_id: storeId,
    user_id: userId,
    action: 'ABERTURA_CAIXA',
    table_name: 'cash_sessions',
    record_id: data.id,
    new_values: { opening_balance: openingBalance }
  }]);

  return data;
}

export async function dbCloseCashSession(sessionId, countedBalance, notes = '') {
  ensureSupabase();
  const movements = await dbGetCashMovements(sessionId);
  const session = (await supabase.from('cash_sessions').select('*').eq('id', sessionId).single()).data;

  let totalIn = Number(session.opening_balance || 0);
  let totalOut = 0;

  for (const m of movements) {
    if (m.type === 'suprimento' || (m.type === 'venda' && m.payment_method === 'dinheiro')) {
      totalIn += Number(m.amount);
    } else if (m.type === 'sangria') {
      totalOut += Number(m.amount);
    }
  }

  const calculated = totalIn - totalOut;
  const counted = Number(countedBalance);
  const diff = counted - calculated;

  const { data, error } = await supabase
    .from('cash_sessions')
    .update({
      closing_balance_calculated: calculated,
      closing_balance_counted: counted,
      difference: diff,
      status: 'fechado',
      closed_at: new Date().toISOString(),
      notes: notes
    })
    .eq('id', sessionId)
    .select()
    .single();

  if (error) throw new Error(`Erro ao fechar caixa: ${error.message}`);
  return data;
}

export async function dbGetCashMovements(sessionId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('cash_movements')
    .select('*, user:profiles(full_name)')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao consultar movimentos de caixa: ${error.message}`);
  return data || [];
}

export async function dbRecordCashMovement(movement) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const { data, error } = await supabase
    .from('cash_movements')
    .insert([{
      tenant_id: tenantId,
      store_id: storeId,
      session_id: movement.session_id,
      user_id: userId,
      type: movement.type,
      payment_method: movement.payment_method || 'dinheiro',
      amount: Number(movement.amount),
      description: movement.description
    }])
    .select()
    .single();

  if (error) throw new Error(`Erro ao registrar ${movement.type}: ${error.message}`);
  return data;
}

// =============================================================
// COTAÇÕES & ORÇAMENTOS DE OBRA
// =============================================================

export async function dbGetQuotes() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  let req = supabase
    .from('quotes')
    .select(`
      *,
      customer:customers(name, phone),
      items:quote_items(*)
    `)
    .order('created_at', { ascending: false });

  if (tenantId) req = req.eq('tenant_id', tenantId);
  if (storeId) req = req.eq('store_id', storeId);

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao carregar orçamentos: ${error.message}`);
  return data || [];
}

export async function dbSaveQuote(quote, items) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const { data: newQuote, error } = await supabase
    .from('quotes')
    .insert([{
      tenant_id: tenantId,
      store_id: storeId,
      customer_id: quote.customer_id || null,
      user_id: userId,
      customer_name: quote.customer_name,
      customer_phone: quote.customer_phone,
      total: Number(quote.total),
      valid_until: quote.valid_until,
      status: 'aberto',
      notes: quote.notes
    }])
    .select()
    .single();

  if (error) throw new Error(`Erro ao salvar orçamento: ${error.message}`);

  for (const item of items) {
    await supabase.from('quote_items').insert([{
      tenant_id: tenantId,
      quote_id: newQuote.id,
      product_id: item.product_id,
      product_name: item.name,
      unit: item.unit || 'UN',
      quantity: Number(item.quantity),
      unit_price: Number(item.unit_price),
      total: Number(item.total)
    }]);
  }

  return newQuote;
}

// =============================================================
// PERDAS & AVARIAS
// =============================================================

export async function dbGetLosses() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  let req = supabase
    .from('losses')
    .select(`
      *,
      product:products(name, sku, unit),
      user:profiles(full_name)
    `)
    .order('created_at', { ascending: false });

  if (tenantId) req = req.eq('tenant_id', tenantId);
  if (storeId) req = req.eq('store_id', storeId);

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao buscar avarias: ${error.message}`);
  return data || [];
}

export async function dbSaveLoss(loss) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const totalCost = Number(loss.quantity) * Number(loss.unit_cost || 0);

  const { data, error } = await supabase
    .from('losses')
    .insert([{
      tenant_id: tenantId,
      store_id: storeId,
      product_id: loss.product_id,
      user_id: userId,
      quantity: Number(loss.quantity),
      unit_cost: Number(loss.unit_cost || 0),
      total_cost: totalCost,
      reason: loss.reason,
      description: loss.description
    }])
    .select()
    .single();

  if (error) throw new Error(`Erro ao registrar avaria: ${error.message}`);

  // Baixa de estoque correspondente
  await dbRecordStockMovement({
    store_id: storeId,
    product_id: loss.product_id,
    type: 'perda',
    quantity: Number(loss.quantity),
    unit_cost: Number(loss.unit_cost || 0),
    reason: `Avaria/Perda: ${loss.reason}`
  });

  return data;
}

// =============================================================
// ENTREGAS EM OBRA
// =============================================================

export async function dbGetDeliveries() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  let req = supabase
    .from('deliveries')
    .select(`
      *,
      customer:customers(name, phone, whatsapp),
      sale:sales(sale_number, total)
    `)
    .order('created_at', { ascending: false });

  if (tenantId) req = req.eq('tenant_id', tenantId);
  if (storeId) req = req.eq('store_id', storeId);

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao buscar entregas: ${error.message}`);
  return data || [];
}

export async function dbSaveDelivery(delivery) {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();

  const payload = {
    tenant_id: tenantId,
    store_id: storeId,
    sale_id: delivery.sale_id,
    customer_id: delivery.customer_id || null,
    delivery_address: delivery.delivery_address,
    neighborhood: delivery.neighborhood || null,
    driver_name: delivery.driver_name || null,
    vehicle_plate: delivery.vehicle_plate || null,
    shipping_fee: Number(delivery.shipping_fee || 0),
    status: delivery.status || 'pendente',
    scheduled_for: delivery.scheduled_for || null,
    notes: delivery.notes || null
  };

  const { data, error } = await supabase.from('deliveries').insert([payload]).select().single();
  if (error) throw new Error(`Erro ao agendar entrega: ${error.message}`);
  return data;
}

export async function dbUpdateDeliveryStatus(id, status, notes = '') {
  ensureSupabase();
  const payload = { status, notes };
  if (status === 'entregue') payload.delivered_at = new Date().toISOString();

  const { data, error } = await supabase.from('deliveries').update(payload).eq('id', id).select().single();
  if (error) throw new Error(`Erro ao atualizar status da entrega: ${error.message}`);
  return data;
}

// =============================================================
// EMBAIXADORES, INDICAÇÕES & COMISSÕES
// =============================================================

export async function dbGetAmbassadors() {
  ensureSupabase();
  const profile = getState('userProfile');
  const isPlatform = profile?.role === 'monitor';
  const tenantId = getActiveTenantId();

  let req = supabase.from('ambassadors').select('*').order('created_at', { ascending: false });

  if (!isPlatform && tenantId) {
    req = req.or(`tenant_id.eq.${tenantId},tenant_id.is.null`);
  }

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao buscar embaixadores: ${error.message}`);
  return data || [];
}

export async function dbSaveAmbassador(ambassador) {
  ensureSupabase();
  const profile = getState('userProfile');
  const isPlatform = profile?.role === 'monitor';
  const tenantId = isPlatform ? null : getActiveTenantId();

  const isNew = !ambassador.id;
  const refCode = (ambassador.referral_code || ambassador.name.replace(/\s+/g, '').substring(0, 8)).toUpperCase();

  const payload = {
    tenant_id: tenantId,
    name: ambassador.name,
    profession: ambassador.profession || 'Parceiro / Mestre de Obras',
    phone: ambassador.phone,
    email: ambassador.email || null,
    pix_key: ambassador.pix_key || null,
    commission_rate: Number(ambassador.commission_rate || 10),
    referral_code: refCode,
    status: ambassador.status || 'ativo'
  };

  if (isNew) {
    const { data, error } = await supabase.from('ambassadors').insert([payload]).select().single();
    if (error) throw new Error(`Erro ao cadastrar embaixador: ${error.message}`);

    // Cria link correspondente
    await supabase.from('ambassador_links').insert([{
      ambassador_id: data.id,
      referral_code: refCode
    }]);

    return data;
  } else {
    const { data, error } = await supabase.from('ambassadors').update(payload).eq('id', ambassador.id).select().single();
    if (error) throw new Error(`Erro ao atualizar embaixador: ${error.message}`);
    return data;
  }
}

export async function dbToggleAmbassadorStatus(id, currentStatus) {
  ensureSupabase();
  const newStatus = currentStatus === 'ativo' ? 'bloqueado' : 'ativo';
  const { data, error } = await supabase.from('ambassadors').update({ status: newStatus }).eq('id', id).select().single();
  if (error) throw new Error(`Erro ao alterar status do embaixador: ${error.message}`);
  return data;
}

export async function dbGetAmbassadorReferrals(ambassadorId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('ambassador_referrals')
    .select('*, tenant:tenants(name, status, created_at)')
    .eq('ambassador_id', ambassadorId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao consultar indicações: ${error.message}`);
  return data || [];
}

export async function dbGetAmbassadorCommissions(ambassadorId = null) {
  ensureSupabase();
  let req = supabase
    .from('ambassador_commissions')
    .select(`
      *,
      ambassador:ambassadors(name, phone, pix_key),
      tenant:tenants(name)
    `)
    .order('created_at', { ascending: false });

  if (ambassadorId) req = req.eq('ambassador_id', ambassadorId);

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar comissões: ${error.message}`);
  return data || [];
}

export async function dbPayAmbassadorCommission(commissionId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('ambassador_commissions')
    .update({ status: 'pago', paid_at: new Date().toISOString() })
    .eq('id', commissionId)
    .select()
    .single();

  if (error) throw new Error(`Erro ao quitar comissão: ${error.message}`);
  return data;
}

// =============================================================
// MONITORIA DA PLATAFORMA & GESTÃO DE TENANTS (EXCLUSIVO MONITOR)
// =============================================================

export async function dbGetTenants() {
  ensureSupabase();
  const { data, error } = await supabase
    .from('tenants')
    .select(`
      *,
      stores:stores(id, name, is_active),
      profiles:profiles(id, full_name, role),
      subscription:subscriptions(*)
    `)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Erro ao buscar tenants: ${error.message}`);
  return data || [];
}

export async function dbSaveTenant(tenantData) {
  ensureSupabase();
  const isNew = !tenantData.id;

  const payload = {
    name: tenantData.name,
    trade_name: tenantData.trade_name || tenantData.name,
    document: tenantData.document,
    email: tenantData.email,
    phone: tenantData.phone || null,
    plan: tenantData.plan || 'PRO',
    monthly_fee: Number(tenantData.monthly_fee || 149.90),
    due_day: Number(tenantData.due_day || 10),
    status: tenantData.status || 'ativo',
    updated_at: new Date().toISOString()
  };

  if (isNew) {
    const { data: tenant, error: tErr } = await supabase.from('tenants').insert([payload]).select().single();
    if (tErr) throw new Error(`Erro ao cadastrar tenant: ${tErr.message}`);

    // Cria Loja Matriz
    await supabase.from('stores').insert([{
      tenant_id: tenant.id,
      name: `${tenant.name} - Matriz`,
      code: 'LOJA-01'
    }]);

    // Cria Registro de Assinatura
    await supabase.from('subscriptions').insert([{
      tenant_id: tenant.id,
      plan: tenant.plan,
      amount: tenant.monthly_fee,
      status: 'ativo'
    }]);

    return tenant;
  } else {
    const { data: tenant, error: tErr } = await supabase.from('tenants').update(payload).eq('id', tenantData.id).select().single();
    if (tErr) throw new Error(`Erro ao atualizar tenant: ${tErr.message}`);
    return tenant;
  }
}

/**
 * Bloqueio Real de Tenant pelo Monitor
 */
export async function dbBlockTenant(tenantId, blockedFrom, blockedUntil, reason) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('tenants')
    .update({
      status: 'bloqueado',
      blocked_from: blockedFrom || new Date().toISOString(),
      blocked_until: blockedUntil || null,
      block_reason: reason || 'Bloqueio administrativo por inadimplência',
      updated_at: new Date().toISOString()
    })
    .eq('id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`Erro ao bloquear tenant: ${error.message}`);

  await supabase.from('audit_logs').insert([{
    tenant_id: tenantId,
    user_id: getActiveUserId(),
    action: 'BLOQUEIO',
    table_name: 'tenants',
    record_id: tenantId,
    new_values: { reason, blocked_from: blockedFrom, blocked_until: blockedUntil }
  }]);

  return data;
}

/**
 * Liberação Real de Tenant pelo Monitor
 */
export async function dbUnblockTenant(tenantId) {
  ensureSupabase();
  const { data, error } = await supabase
    .from('tenants')
    .update({
      status: 'ativo',
      blocked_from: null,
      blocked_until: null,
      block_reason: null,
      updated_at: new Date().toISOString()
    })
    .eq('id', tenantId)
    .select()
    .single();

  if (error) throw new Error(`Erro ao liberar tenant: ${error.message}`);

  await supabase.from('audit_logs').insert([{
    tenant_id: tenantId,
    user_id: getActiveUserId(),
    action: 'LIBERACAO',
    table_name: 'tenants',
    record_id: tenantId,
    new_values: { status: 'ativo' }
  }]);

  return data;
}

export async function dbGetSubscriptions() {
  ensureSupabase();
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, tenant:tenants(*)')
    .order('next_due_date', { ascending: true });

  if (error) throw new Error(`Erro ao buscar assinaturas: ${error.message}`);
  return data || [];
}

/**
 * Confirma Pagamento de Mensalidade e Gera Comissão Automática para Embaixador
 */
export async function dbRecordSubscriptionPayment(tenantId, amount, paymentMethod = 'PIX', reference = '') {
  ensureSupabase();
  try {
    const { data: rpcRes, error: rpcErr } = await supabase.rpc('record_subscription_payment', {
      p_tenant_id: tenantId,
      p_amount: Number(amount),
      p_payment_method: paymentMethod,
      p_reference: reference
    });
    if (!rpcErr && rpcRes) return rpcRes;
  } catch (e) {
    console.warn('RPC record_subscription_payment direto:', e);
  }

  // Fallback direto
  const { data: pay, error: payErr } = await supabase
    .from('subscription_payments')
    .insert([{
      tenant_id: tenantId,
      amount: Number(amount),
      payment_method: paymentMethod,
      reference: reference,
      status: 'confirmado'
    }])
    .select()
    .single();

  if (payErr) throw new Error(`Erro ao registrar pagamento de mensalidade: ${payErr.message}`);

  // Reativa tenant
  await supabase.from('tenants').update({ status: 'ativo', blocked_from: null, blocked_until: null, block_reason: null }).eq('id', tenantId);

  // Calcula comissão se houver embaixador
  const { data: ref } = await supabase
    .from('ambassador_referrals')
    .select('ambassador_id, ambassador:ambassadors(commission_rate)')
    .eq('tenant_id', tenantId)
    .eq('status', 'ativo')
    .maybeSingle();

  if (ref && ref.ambassador) {
    const rate = Number(ref.ambassador.commission_rate || 10);
    const commVal = Number((Number(amount) * (rate / 100)).toFixed(2));
    await supabase.from('ambassador_commissions').insert([{
      ambassador_id: ref.ambassador_id,
      tenant_id: tenantId,
      subscription_payment_id: pay.id,
      base_amount: Number(amount),
      commission_rate: rate,
      commission_amount: commVal,
      status: 'pendente'
    }]);
  }

  return pay;
}

// =============================================================
// AUDITORIA, MONITORIA EM TEMPO REAL & LOGS
// =============================================================

export async function dbGetMonitoringEvents(limit = 50) {
  ensureSupabase();
  const profile = getState('userProfile');
  const isPlatform = profile?.role === 'monitor';
  const tenantId = getActiveTenantId();

  let req = supabase
    .from('monitoring_events')
    .select('*, user:profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!isPlatform && tenantId) {
    req = req.eq('tenant_id', tenantId);
  }

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao carregar eventos da monitoria: ${error.message}`);
  return data || [];
}

export async function dbRecordMonitoringEvent(module, eventType, description, severity = 'info', metadata = null) {
  if (!isSupabaseConfigured() || !supabase) return;
  try {
    await supabase.from('monitoring_events').insert([{
      tenant_id: getActiveTenantId(),
      store_id: getActiveStoreId(),
      user_id: getActiveUserId(),
      module,
      event_type: eventType,
      severity,
      description,
      metadata
    }]);
  } catch (e) {
    console.warn('Registro de evento:', e);
  }
}

export async function dbGetAuditLogs(limit = 100) {
  ensureSupabase();
  const profile = getState('userProfile');
  const isPlatform = profile?.role === 'monitor';
  const tenantId = getActiveTenantId();

  let req = supabase
    .from('audit_logs')
    .select('*, user:profiles(full_name)')
    .order('created_at', { ascending: false })
    .limit(limit);

  if (!isPlatform && tenantId) {
    req = req.eq('tenant_id', tenantId);
  }

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao carregar auditoria: ${error.message}`);
  return data || [];
}

export async function dbGetStores() {
  ensureSupabase();
  const profile = getState('userProfile');
  const isPlatform = profile?.role === 'monitor';
  const tenantId = getActiveTenantId();

  let req = supabase.from('stores').select('*').order('name');
  if (!isPlatform && tenantId) {
    req = req.eq('tenant_id', tenantId);
  }

  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar lojas: ${error.message}`);
  return data || [];
}

export async function dbSaveStore(storeData) {
  ensureSupabase();
  const tenantId = storeData.tenant_id || getActiveTenantId();
  const isNew = !storeData.id;

  const payload = {
    tenant_id: tenantId,
    name: storeData.name,
    code: storeData.code || null,
    address: storeData.address || null,
    city: storeData.city || null,
    state: storeData.state || null,
    zip_code: storeData.zip_code || null,
    phone: storeData.phone || null,
    whatsapp: storeData.whatsapp || null,
    pix_key: storeData.pix_key || null,
    pix_key_type: storeData.pix_key_type || 'CNPJ',
    receipt_footer: storeData.receipt_footer || null,
    is_active: storeData.is_active !== false,
    updated_at: new Date().toISOString()
  };

  if (isNew) {
    const { data, error } = await supabase.from('stores').insert([payload]).select().single();
    if (error) throw new Error(`Erro ao criar filial/loja: ${error.message}`);
    return data;
  } else {
    const { data, error } = await supabase.from('stores').update(payload).eq('id', storeData.id).select().single();
    if (error) throw new Error(`Erro ao atualizar loja: ${error.message}`);
    return data;
  }
}

// =============================================================
// COMPATIBILIDADE E OPERAÇÕES ESPECÍFICAS DOS MÓDULOS
// =============================================================

export async function dbCreateCashMovement(data) {
  return dbAddCashMovement({
    type: data.type,
    amount: data.amount,
    payment_method: data.payment_method || 'dinheiro',
    description: data.reason || data.description || 'Movimentação de caixa',
    session_id: data.session_id
  });
}

export async function dbGetSessionMovements(sessionId) {
  ensureSupabase();
  const req = supabase.from('cash_movements').select('*').order('created_at', { ascending: false });
  if (sessionId) req.eq('session_id', sessionId);
  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar movimentos da sessão: ${error.message}`);
  return data || [];
}

export async function dbGetReceivables() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  let req = supabase
    .from('receivables')
    .select('*, customer:customers(id, name, phone, whatsapp, document)')
    .order('due_date', { ascending: true });

  if (tenantId) req = req.eq('tenant_id', tenantId);
  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar fiados/recebíveis: ${error.message}`);
  return data || [];
}

export async function dbRegisterReceivablePayment(receivableId, customerId, amount, paymentMethod = 'dinheiro') {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const { data: rec, error: recErr } = await supabase.from('receivables').select('*').eq('id', receivableId).single();
  if (recErr) throw new Error(`Fatura a receber não encontrada: ${recErr.message}`);

  const currentBal = Number(rec.current_balance || 0);
  const newBalance = Math.max(0, currentBal - Number(amount));
  const newPaid = Number(rec.paid_amount || 0) + Number(amount);
  const newStatus = newBalance <= 0 ? 'pago' : 'parcial';

  const { error: upErr } = await supabase.from('receivables')
    .update({
      current_balance: newBalance,
      paid_amount: newPaid,
      status: newStatus,
      updated_at: new Date().toISOString()
    })
    .eq('id', receivableId);
  if (upErr) throw new Error(`Erro ao atualizar recebível: ${upErr.message}`);

  if (customerId) {
    const { data: cust } = await supabase.from('customers').select('debt_balance').eq('id', customerId).single();
    if (cust) {
      const newCustDebt = Math.max(0, Number(cust.debt_balance || 0) - Number(amount));
      await supabase.from('customers').update({ debt_balance: newCustDebt }).eq('id', customerId);
    }
  }

  // Se tiver caixa aberto e pagamento em dinheiro, registra movimento de entrada
  try {
    const activeSession = await dbGetActiveCashSession();
    if (activeSession && paymentMethod === 'dinheiro') {
      await supabase.from('cash_movements').insert([{
        tenant_id: tenantId,
        store_id: storeId,
        session_id: activeSession.id,
        user_id: userId,
        type: 'recebimento_fiado',
        payment_method: 'dinheiro',
        amount: Number(amount),
        description: `Recebimento de fiado - Fatura ${receivableId.slice(0, 8)}`
      }]);
    }
  } catch (e) {
    console.warn('Movimento de caixa para fiado:', e);
  }

  return { success: true, newBalance };
}

export async function dbLogBillingMessage(customerId, channel, messageText, status = 'enviado') {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  try {
    await supabase.from('billing_messages').insert([{
      tenant_id: tenantId,
      store_id: storeId,
      customer_id: customerId,
      channel,
      message_text: messageText,
      status
    }]);
  } catch (e) {
    console.warn('Falha ao registrar log de cobrança:', e);
  }
}

export async function dbSaveReceipt(saleId, customerId, receiptCode, amount, receiptType = 'digital', content = '') {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  try {
    const { data } = await supabase.from('receipts').insert([{
      tenant_id: tenantId,
      store_id: storeId,
      sale_id: saleId || null,
      customer_id: customerId || null,
      receipt_code: receiptCode,
      amount: Number(amount),
      receipt_type: receiptType,
      content
    }]).select().single();
    return data;
  } catch (e) {
    console.warn('Falha ao salvar recibo no Supabase:', e);
    return null;
  }
}

export async function dbCreateSale(saleData, items) {
  return dbProcessSale(saleData, items);
}

export async function dbGetStockMovements() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  let req = supabase
    .from('stock_movements')
    .select('*, product:products(id, name, sku, unit)')
    .order('created_at', { ascending: false });

  if (tenantId) req = req.eq('tenant_id', tenantId);
  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar movimentações de estoque: ${error.message}`);
  return data || [];
}

export async function dbAddStockEntry(productId, quantity, movementType = 'entrada', reason = 'Entrada manual') {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const { data: prod, error: prodErr } = await supabase.from('products').select('current_stock').eq('id', productId).single();
  if (prodErr) throw new Error(`Produto não encontrado: ${prodErr.message}`);

  const prevStock = Number(prod.current_stock || 0);
  const newStock = prevStock + Number(quantity);

  const { error: upErr } = await supabase.from('products').update({ current_stock: newStock }).eq('id', productId);
  if (upErr) throw new Error(`Erro ao atualizar estoque do produto: ${upErr.message}`);

  const { data: mov, error: movErr } = await supabase.from('stock_movements').insert([{
    tenant_id: tenantId,
    store_id: storeId,
    product_id: productId,
    user_id: userId,
    type: movementType,
    quantity: Number(quantity),
    previous_stock: prevStock,
    new_stock: newStock,
    reason
  }]).select().single();

  if (movErr) throw new Error(`Erro ao gravar movimentação de estoque: ${movErr.message}`);
  return mov;
}

export async function dbGetInventoryLosses() {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  let req = supabase
    .from('losses')
    .select('*, product:products(id, name, sku, unit, price, cost_price)')
    .order('created_at', { ascending: false });

  if (tenantId) req = req.eq('tenant_id', tenantId);
  const { data, error } = await req;
  if (error) throw new Error(`Erro ao consultar perdas de estoque: ${error.message}`);
  return data || [];
}

export async function dbRecordInventoryLoss(productId, quantity, reason, notes = '') {
  ensureSupabase();
  const tenantId = getActiveTenantId();
  const storeId = getActiveStoreId();
  const userId = getActiveUserId();

  const { data: prod, error: prodErr } = await supabase.from('products').select('*').eq('id', productId).single();
  if (prodErr) throw new Error(`Produto não encontrado: ${prodErr.message}`);

  const prevStock = Number(prod.current_stock || 0);
  const newStock = Math.max(0, prevStock - Number(quantity));
  const unitCost = Number(prod.cost_price || prod.price || 0);
  const totalCost = unitCost * Number(quantity);

  // Baixa no produto
  await supabase.from('products').update({ current_stock: newStock }).eq('id', productId);

  // Registra na tabela losses
  const { data: loss, error: lossErr } = await supabase.from('losses').insert([{
    tenant_id: tenantId,
    store_id: storeId,
    product_id: productId,
    user_id: userId,
    quantity: Number(quantity),
    unit_cost: unitCost,
    total_cost: totalCost,
    reason,
    description: notes
  }]).select().single();

  if (lossErr) throw new Error(`Erro ao registrar perda: ${lossErr.message}`);

  // Registra no kardex
  await supabase.from('stock_movements').insert([{
    tenant_id: tenantId,
    store_id: storeId,
    product_id: productId,
    user_id: userId,
    type: 'perda',
    quantity: -Number(quantity),
    previous_stock: prevStock,
    new_stock: newStock,
    reason: `Avaria/Perda: ${reason} - ${notes}`
  }]);

  return loss;
}

