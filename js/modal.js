/**
 * GEF - Gestor de Ferragem
 * modal.js - Gerenciador Universal de Modais e Diálogos
 */

let activeModal = null;

export function openModal({ title, bodyHtml, footerHtml = '', size = 'md', onClose = null }) {
  closeModal();

  const backdrop = document.createElement('div');
  backdrop.className = 'modal-backdrop';
  backdrop.id = 'active-modal-backdrop';

  let sizeClass = '';
  if (size === 'lg') sizeClass = 'modal-lg';
  if (size === 'xl') sizeClass = 'modal-xl';

  backdrop.innerHTML = `
    <div class="modal-dialog ${sizeClass}" role="dialog" aria-modal="true">
      <div class="modal-header">
        <h3 class="modal-title">${title}</h3>
        <button id="modal-close-btn" class="btn-icon" aria-label="Fechar Modal">
          <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
      <div class="modal-body" id="modal-body-content">
        ${bodyHtml}
      </div>
      ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
    </div>
  `;

  // Fechamento
  const handleClose = () => {
    closeModal();
    if (typeof onClose === 'function') onClose();
  };

  backdrop.querySelector('#modal-close-btn').addEventListener('click', handleClose);
  backdrop.addEventListener('click', (e) => {
    if (e.target === backdrop) handleClose();
  });

  const escHandler = (e) => {
    if (e.key === 'Escape') {
      handleClose();
      document.removeEventListener('keydown', escHandler);
    }
  };
  document.addEventListener('keydown', escHandler);

  document.body.appendChild(backdrop);
  activeModal = { backdrop, escHandler };

  return backdrop;
}

export function closeModal() {
  if (activeModal) {
    if (activeModal.backdrop && activeModal.backdrop.parentNode) {
      activeModal.backdrop.parentNode.removeChild(activeModal.backdrop);
    }
    if (activeModal.escHandler) {
      document.removeEventListener('keydown', activeModal.escHandler);
    }
    activeModal = null;
  }
}
