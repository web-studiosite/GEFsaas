/**
 * GEF - Gestor de Ferragem
 * navbar.js - Barra Superior e Indicadores de Turno
 */

import { getState, subscribe } from './state.js';
import { navigateTo } from './router.js';
import { logoutUser } from './auth.js';
import { getRoleLabel } from './permissions.js';

export function setupNavbar() {
  const navbar = document.getElementById('app-navbar');
  if (!navbar) return;

  renderNavbarContent();

  // Re-renderiza quando o perfil ou o caixa mudar
  subscribe('userProfile', renderNavbarContent);
  subscribe('activeCashSession', renderNavbarContent);
}

export function renderNavbarContent() {
  const navbar = document.getElementById('app-navbar');
  if (!navbar) return;

  const profile = getState('userProfile');
  const cashSession = getState('activeCashSession');
  const isCashOpen = Boolean(cashSession && cashSession.status === 'aberto');

  navbar.innerHTML = `
    <div class="navbar-left">
      <button id="btn-sidebar-toggle" class="navbar-toggle-btn btn-icon" aria-label="Abrir Menu">
        <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="3" y1="12" x2="21" y2="12"></line>
          <line x1="3" y1="6" x2="21" y2="6"></line>
          <line x1="3" y1="18" x2="21" y2="18"></line>
        </svg>
      </button>
      <div class="navbar-title">
        <span id="page-current-title">Painel de Controle</span>
      </div>
      <div class="navbar-store-selector">
        🏪 Loja Matriz - Ferragens
      </div>
    </div>

    <div class="navbar-right">
      <!-- Indicador de Caixa -->
      <div id="nav-cash-indicator" class="cash-status-indicator ${isCashOpen ? 'cash-status-open' : 'cash-status-closed'}" title="Clique para gerenciar o caixa">
        <span class="status-dot"></span>
        <span>${isCashOpen ? 'Caixa Aberto' : 'Caixa Fechado'}</span>
      </div>

      <!-- Atalho Rápido PDV -->
      <button id="btn-nav-pos" class="btn btn-primary btn-sm">
        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="9" cy="21" r="1"></circle>
          <circle cx="20" cy="21" r="1"></circle>
          <path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>
        </svg>
        <span>PDV Balcão</span>
      </button>

      <!-- Logout -->
      <button id="btn-nav-logout" class="btn btn-outline btn-sm" title="Sair do sistema">
        <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
          <polyline points="16 17 21 12 16 7"></polyline>
          <line x1="21" y1="12" x2="9" y2="12"></line>
        </svg>
      </button>
    </div>
  `;

  // Listeners
  const toggleBtn = navbar.querySelector('#btn-sidebar-toggle');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const sidebar = document.getElementById('app-sidebar');
      const backdrop = document.querySelector('.sidebar-backdrop');
      if (sidebar) sidebar.classList.toggle('sidebar-open');
      if (backdrop) backdrop.classList.toggle('active');
    });
  }

  const cashIndicator = navbar.querySelector('#nav-cash-indicator');
  if (cashIndicator) {
    cashIndicator.addEventListener('click', () => navigateTo('caixa'));
  }

  const posBtn = navbar.querySelector('#btn-nav-pos');
  if (posBtn) {
    posBtn.addEventListener('click', () => navigateTo('pos'));
  }

  const logoutBtn = navbar.querySelector('#btn-nav-logout');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      if (confirm('Deseja realmente sair do GEF?')) {
        await logoutUser();
        navigateTo('login');
      }
    });
  }
}
