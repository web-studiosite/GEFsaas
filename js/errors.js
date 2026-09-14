/**
 * GEF - Gestor de Ferragem
 * errors.js - Tratamento Centralizado de Erros e Mensagens
 */

export function handleDatabaseError(error, context = '') {
  console.error(`[GEF Erro DB - ${context}]:`, error);

  if (!error) return 'Ocorreu um erro inesperado.';

  const message = error.message || '';
  const code = error.code || '';

  if (code === '42P01') {
    return 'Tabelas do banco de dados ainda não foram criadas no Supabase. Por favor, execute o script SQL nas Configurações.';
  }

  if (code === '23505') {
    return 'Já existe um registro com estes mesmos dados exclusivos (CPF, CNPJ, Código ou SKU).';
  }

  if (code === '23503') {
    return 'Este registro não pode ser excluído ou modificado pois está vinculado a outras operações (vendas, caixa ou estoque).';
  }

  if (message.includes('Invalid login credentials') || message.includes('Email not confirmed')) {
    return 'E-mail ou senha incorretos.';
  }

  if (message.includes('JWT expired') || message.includes('session expired')) {
    return 'Sua sessão expirou. Por favor, faça login novamente.';
  }

  if (message.includes('Failed to fetch')) {
    return 'Não foi possível conectar ao servidor Supabase. Verifique sua conexão com a internet ou as credenciais configuradas.';
  }

  return message || 'Falha ao processar solicitação no banco de dados.';
}

export function displayModuleError(containerElement, errorMessage, onRetry) {
  if (!containerElement) return;

  containerElement.innerHTML = `
    <div class="empty-state" style="padding: 40px 20px;">
      <div class="empty-state-icon" style="color: var(--danger);">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>
      <h3>Não foi possível carregar este módulo</h3>
      <p style="color: var(--text-secondary); max-width: 500px; margin: 10px auto 20px auto;">
        ${errorMessage}
      </p>
      ${onRetry ? '<button id="btn-retry-module" class="btn btn-primary">Tentar Novamente</button>' : ''}
    </div>
  `;

  if (onRetry) {
    const btn = containerElement.querySelector('#btn-retry-module');
    if (btn) btn.addEventListener('click', onRetry);
  }
}
