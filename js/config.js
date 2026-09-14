/**
 * GEF - Gestor de Ferragem Moçambique
 * config.js - Configurações Gerais do Sistema para Moçambique
 */

// Chaves padrão para o Supabase (podem ser substituídas nas Configurações da aplicação)
export const DEFAULT_CONFIG = {
  // Configuração padrão do Supabase
  supabaseUrl: 'https://xyzcompany.supabase.co',
  supabaseAnonKey: 'public-anon-key-placeholder',

  // Dados da Empresa / Loja Padrão em Moçambique
  companyName: 'GEF - Gestor de Ferragem Moçambique',
  tradeName: 'Ferragens & Materiais de Construção de Moçambique',
  document: '400123456', // NUIT Moçambicano (9 dígitos)
  phone: '+258 84 123 4567',
  whatsapp: '+258 84 123 4567',
  email: 'contacto@gefferragem.co.mz',
  address: 'Av. 24 de Julho, 1850, Bairro Central',
  city: 'Maputo',
  province: 'Maputo Cidade',
  country: 'Moçambique',
  zipCode: '1100',

  // Configurações Financeiras de Moçambique
  currencyCode: 'MZN',
  currencySymbol: 'MT',
  mpesaNumber: '+258 84 123 4567',
  emolaNumber: '+258 86 123 4567',
  mkeshNumber: '+258 82 123 4567',
  bankName: 'Millennium BIM',
  bankNib: '0001 0000 12345678901 23',

  // Modelos de Cobrança WhatsApp e SMS (Contexto Moçambique)
  whatsappBillingTemplate: 
    'Olá, *[CLIENTE]*! Tudo bem?\nPassando para lembrar do seu saldo em aberto de *[VALOR] MT* referente à compra de materiais e ferragens na *[LOJA]*.\n\nFormas de pagamento móvel e bancário:\n- M-Pesa: `[MPESA]`\n- e-Mola: `[EMOLA]`\n- Conta BIM (NIB): `[NIB]`\n\nCaso já tenha efectuado a liquidação, por favor desconsidere esta mensagem. Kanimambo / Muito obrigado!',

  smsBillingTemplate: 
    'Ola [CLIENTE], saldo pendente de [VALOR] MT na [LOJA]. Pague via M-Pesa: [MPESA] ou BIM: [NIB]. Kanimambo! Duvidas: [FONE]',

  // Modelos de Recibo WhatsApp e SMS
  whatsappReceiptTemplate: 
    '🛠️ *[LOJA]* - Recibo Digital\n\n*Comprovativo:* [RECIBO]\n*Data:* [DATA]\n*Cliente:* [CLIENTE]\n\n*Itens:*\n[ITENS]\n\n*Total:* [TOTAL] MT\n*Forma de Pagamento:* [PAGAMENTO]\n*[STATUS_FIADO]*\n\n_Kanimambo pela preferência e boa obra! 🔩_',

  smsReceiptTemplate: 
    '[LOJA]: Recibo [RECIBO] de [TOTAL] MT pago via [PAGAMENTO]. Kanimambo pela confianca! Fone: [FONE]',

  // Modelos de Cotação WhatsApp e SMS
  whatsappQuoteTemplate: 
    '📋 *COTAÇÃO DE FERRAGENS - [LOJA]*\n\n*Cotação Nº:* [NUMERO]\n*Cliente:* [CLIENTE]\n*Validade até:* [VALIDADE]\n\n*Itens Cotados:*\n[ITENS]\n\n*Total Estimado:* [TOTAL] MT\n\nPara aprovar a sua cotação, basta responder a esta mensagem. Garantimos o melhor preço para a sua obra!',

  smsQuoteTemplate: 
    '[LOJA]: Cotacao [NUMERO] no valor de [TOTAL] MT gerada com sucesso. Valida ate [VALIDADE]. Fone: [FONE]'
};

// Carrega configurações salvas ou mescla com padrão
export function getStoredConfig() {
  try {
    const custom = localStorage.getItem('gef_custom_config');
    if (custom) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(custom) };
    }
  } catch (e) {
    console.error('Erro ao ler configurações locais:', e);
  }
  return { ...DEFAULT_CONFIG };
}

export function saveStoredConfig(newConfig) {
  try {
    const merged = { ...getStoredConfig(), ...newConfig };
    localStorage.setItem('gef_custom_config', JSON.stringify(merged));
    return merged;
  } catch (e) {
    console.error('Erro ao salvar configurações locais:', e);
    return newConfig;
  }
}
