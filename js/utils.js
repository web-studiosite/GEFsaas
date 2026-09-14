/**
 * GEF - Gestor de Ferragem Moçambique
 * utils.js - Formatação de Valores (Meticais MZN/MT), Datas, Links WhatsApp/SMS e Recibos
 */

import { getStoredConfig } from './config.js';

// Formata número como moeda de Moçambique (ex: 1 250,00 MT)
export function formatCurrency(value) {
  const num = Number(value) || 0;
  const formatted = num.toLocaleString('pt-MZ', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `${formatted} MT`;
}

// Formata quantidade de ferragem respeitando unidades (ex: 2.50 KG, 12.00 MT, 15 UN, 5 SC)
export function formatQuantity(qty, unit = 'UN') {
  const num = Number(qty) || 0;
  const unitUpper = (unit || 'UN').toUpperCase();
  if (['KG', 'MT', 'LTR'].includes(unitUpper)) {
    return `${num.toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} ${unitUpper}`;
  }
  return `${Math.round(num).toLocaleString('pt-MZ')} ${unitUpper}`;
}

// Formata data ISO para DD/MM/AAAA (padrão Moçambique)
export function formatDate(isoDate) {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('pt-MZ');
  } catch (e) {
    return isoDate;
  }
}

// Formata data ISO para DD/MM/AAAA HH:MM
export function formatDateTime(isoDate) {
  if (!isoDate) return '-';
  try {
    const d = new Date(isoDate);
    return d.toLocaleDateString('pt-MZ') + ' ' + d.toLocaleTimeString('pt-MZ', { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return isoDate;
  }
}

// Limpa caracteres especiais de número de telefone (deixa apenas dígitos)
export function sanitizePhone(phone) {
  if (!phone) return '';
  return String(phone).replace(/\D/g, '');
}

// Formata telefone para padrão Moçambique (+258 84 123 4567 ou 84 123 4567)
export function formatPhone(phone) {
  const clean = sanitizePhone(phone);
  if (!clean) return '-';

  // Se já tiver DDI 258 (ex: 258841234567 - 12 dígitos)
  if (clean.length === 12 && clean.startsWith('258')) {
    const op = clean.slice(3, 5);
    const part1 = clean.slice(5, 8);
    const part2 = clean.slice(8);
    return `+258 ${op} ${part1} ${part2}`;
  }

  // Se tiver 9 dígitos locais moçambicanos (ex: 841234567)
  if (clean.length === 9) {
    const op = clean.slice(0, 2);
    const part1 = clean.slice(2, 5);
    const part2 = clean.slice(5);
    return `+258 ${op} ${part1} ${part2}`;
  }

  return phone;
}

// Normaliza telefone para o padrão do WhatsApp Moçambique (258 + 9 dígitos)
export function normalizeWhatsAppNumber(phone) {
  let clean = sanitizePhone(phone);
  if (!clean) return '';

  // Se tem 9 dígitos (ex: 841234567, 861234567, 821234567), adiciona 258
  if (clean.length === 9) {
    clean = '258' + clean;
  }
  return clean;
}

// Constrói link direto da API do WhatsApp
export function buildWhatsAppLink(phone, messageText) {
  const normalizedPhone = normalizeWhatsAppNumber(phone);
  const encodedText = encodeURIComponent(messageText);
  return `https://wa.me/${normalizedPhone}?text=${encodedText}`;
}

// Constrói link de envio SMS nativo para telemóvel
export function buildSmsLink(phone, messageText) {
  const clean = sanitizePhone(phone);
  const encodedText = encodeURIComponent(messageText);
  return `sms:${clean}?body=${encodedText}`;
}

// Gerador de código legível de recibo
export function generateReceiptCode() {
  const timestamp = Date.now().toString(36).toUpperCase().slice(-5);
  const random = Math.floor(100 + Math.random() * 900);
  return `REC-${timestamp}${random}`;
}

// Substitui tags em templates de mensagem
export function parseTemplate(template, data = {}) {
  let result = template || '';
  const config = getStoredConfig();

  const formattedAmount = data.amount
    ? Number(data.amount).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '0,00';

  const replacements = {
    '[CLIENTE]': data.customerName || 'Cliente',
    '[VALOR]': formattedAmount,
    '[TOTAL]': data.total || formattedAmount,
    '[LOJA]': data.storeName || config.companyName,
    '[MPESA]': data.mpesaNumber || config.mpesaNumber || config.phone,
    '[EMOLA]': data.emolaNumber || config.emolaNumber || config.phone,
    '[MKESH]': data.mkeshNumber || config.mkeshNumber || config.phone,
    '[NIB]': data.bankNib || config.bankNib || '',
    '[FONE]': data.phone || config.phone,
    '[DATA]': data.date || new Date().toLocaleDateString('pt-MZ'),
    '[RECIBO]': data.receiptCode || generateReceiptCode(),
    '[NUMERO]': data.number || '001',
    '[VALIDADE]': data.validUntil || '7 dias',
    '[PAGAMENTO]': data.paymentMethod || 'Numerário',
    '[ITENS]': data.itemsText || '',
    '[STATUS_FIADO]': data.debtStatusText || ''
  };

  for (const [tag, val] of Object.entries(replacements)) {
    result = result.split(tag).join(val);
  }

  return result;
}

// Monta texto detalhado do recibo de venda de ferragem para WhatsApp (Moçambique)
export function buildSaleReceiptText(sale, items, customer, store) {
  const config = getStoredConfig();
  const storeName = store?.name || config.companyName;

  let itemsListText = '';
  if (Array.isArray(items)) {
    itemsListText = items.map((item, idx) => {
      const unitStr = item.unit || 'UN';
      const qtyStr = formatQuantity(item.quantity, unitStr);
      return `${idx + 1}. ${item.product_name || item.name} (${qtyStr} x ${formatCurrency(item.unit_price)})\n   Subtotal: ${formatCurrency(item.total)}`;
    }).join('\n');
  }

  let debtStatusText = '';
  if (sale.payment_method === 'fiado') {
    debtStatusText = `⚠️ Compra a Prazo (Crédito em Conta)\nVencimento: ${formatDate(sale.due_date)}\nSaldo Devedor do Cliente: ${formatCurrency(customer?.debt_balance || sale.total)}`;
  } else if (sale.change_amount > 0) {
    debtStatusText = `Troco: ${formatCurrency(sale.change_amount)}`;
  }

  return parseTemplate(config.whatsappReceiptTemplate, {
    customerName: customer?.name || 'Consumidor Balcão',
    storeName: storeName,
    amount: sale.total,
    total: Number(sale.total).toLocaleString('pt-MZ', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    receiptCode: sale.receipt_code || generateReceiptCode(),
    date: formatDateTime(sale.created_at || new Date().toISOString()),
    paymentMethod: formatPaymentMethodName(sale.payment_method),
    itemsText: itemsListText,
    debtStatusText: debtStatusText,
    mpesaNumber: store?.mpesa_number || config.mpesaNumber,
    emolaNumber: store?.emola_number || config.emolaNumber,
    bankNib: store?.bank_nib || config.bankNib,
    phone: store?.phone || config.phone
  });
}

// Traduz nome do método de pagamento para Moçambique
export function formatPaymentMethodName(method) {
  const map = {
    numerario: 'Numerário (Espécie)',
    dinheiro: 'Numerário (Espécie)',
    mpesa: 'M-Pesa (Vodacom)',
    emola: 'e-Mola (Movitel)',
    mkesh: 'mKesh (Tmcel)',
    pos_cartao: 'POS / Cartão Bancário',
    cartao_debito: 'Cartão de Débito (POS)',
    cartao_credito: 'Cartão de Crédito (POS)',
    transferencia: 'Transferência Bancária / NIB',
    deposito: 'Depósito Bancário',
    fiado: 'A Prazo (Crédito em Conta)',
    multiplo: 'Múltiplos Meios'
  };
  return map[method] || method || 'Outro';
}
