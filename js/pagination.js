/**
 * GEF - Gestor de Ferragem
 * pagination.js - Controle e Barra de Paginação
 */

export function paginateArray(array, page = 1, pageSize = 15) {
  const total = array.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);
  const start = (currentPage - 1) * pageSize;
  const items = array.slice(start, start + pageSize);

  return {
    items,
    currentPage,
    totalPages,
    totalItems: total,
    pageSize
  };
}

export function renderPaginationControls(pagination, onPageChangeName = 'handlePageChange') {
  if (pagination.totalPages <= 1) return '';

  return `
    <div class="pagination-container">
      <div>Mostrando <strong>${pagination.items.length}</strong> de <strong>${pagination.totalItems}</strong> registros</div>
      <div class="pagination-controls">
        <button class="pagination-btn" ${pagination.currentPage === 1 ? 'disabled' : ''} onclick="${onPageChangeName}(${pagination.currentPage - 1})">
          Anterior
        </button>
        <span style="padding: 0 8px; font-weight: 600;">Página ${pagination.currentPage} de ${pagination.totalPages}</span>
        <button class="pagination-btn" ${pagination.currentPage === pagination.totalPages ? 'disabled' : ''} onclick="${onPageChangeName}(${pagination.currentPage + 1})">
          Próxima
        </button>
      </div>
    </div>
  `;
}
