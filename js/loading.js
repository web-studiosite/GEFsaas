/**
 * GEF - Gestor de Ferragem
 * loading.js - Componente de Carregamento
 */

export function renderLoading(message = 'Carregando dados da ferragem...') {
  return `
    <div class="loading-container">
      <div class="loading-spinner"></div>
      <p style="font-size:0.875rem; color:var(--text-muted); font-weight:500;">${message}</p>
    </div>
  `;
}

export function showLoading(container, message) {
  if (typeof container === 'string') {
    container = document.querySelector(container);
  }
  if (container) {
    container.innerHTML = renderLoading(message);
  }
}
