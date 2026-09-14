/**
 * GEF - Gestor de Ferragem
 * sidebar.js - Menu Lateral de Navegação e Módulos
 */

import { getState, subscribe } from './state.js';
import { navigateTo, getCurrentRoute } from './router.js';
import { hasPermission, getRoleLabel } from './permissions.js';

const MENU_SECTIONS = [
  {
    title: 'Operação de Balcão',
    items: [
      { id: 'dashboard', label: 'Painel Geral', icon: '<rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect>' },
      { id: 'pos', label: 'PDV / Caixa Rápido', icon: '<circle cx="9" cy="21" r="1"></circle><circle cx="20" cy="21" r="1"></circle><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"></path>' },
      { id: 'vendas', label: 'Vendas & Recibos', icon: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline>' },
      { id: 'orcamentos', label: 'Orçamentos de Obra', icon: '<path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"></path><rect x="8" y="2" width="8" height="4" rx="1" ry="1"></rect>' }
    ]
  },
  {
    title: 'Clientes & Cobrança',
    items: [
      { id: 'clientes', label: 'Clientes & Fiado', badge: 'Cobrança', icon: '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path>' }
    ]
  },
  {
    title: 'Estoque & Ferragens',
    items: [
      { id: 'produtos', label: 'Catálogo de Ferragens', icon: '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path>' },
      { id: 'estoque', label: 'Entradas & Movimento', icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline><polyline points="17 6 23 6 23 12"></polyline>' },
      { id: 'perdas', label: 'Perdas & Avarias', icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line>' }
    ]
  },
  {
    title: 'Financeiro & Logística',
    items: [
      { id: 'caixa', label: 'Caixa & Fechamento', icon: '<rect x="2" y="4" width="20" height="16" rx="2"></rect><line x1="2" y1="10" x2="22" y2="10"></line>' },
      { id: 'entregas', label: 'Entregas em Obras', icon: '<rect x="1" y="3" width="15" height="13"></rect><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"></polygon><circle cx="5.5" cy="18.5" r="2.5"></circle><circle cx="18.5" cy="18.5" r="2.5"></circle>' },
      { id: 'embaixadores', label: 'Mestres de Obras', icon: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><polyline points="16 11 18 13 22 9"></polyline>' },
      { id: 'relatorios', label: 'Relatórios Gerenciais', icon: '<line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line>' }
    ]
  },
  {
    title: 'Governança & Sistema',
    items: [
      { id: 'monitoria', label: 'Monitoria em Tempo Real', icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>' },
      { id: 'auditoria', label: 'Trilha de Auditoria', icon: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>' },
      { id: 'configuracoes', label: 'Configurações', icon: '<circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path>' }
    ]
  }
];

export function setupSidebar() {
  renderSidebar();
  subscribe('userProfile', renderSidebar);
}

export function renderSidebar() {
  const sidebar = document.getElementById('app-sidebar');
  if (!sidebar) return;

  const profile = getState('userProfile');
  const role = profile?.role || 'vendedor';
  const currentRoute = getCurrentRoute();

  let sectionsHtml = '';

  MENU_SECTIONS.forEach(sec => {
    const visibleItems = sec.items.filter(item => hasPermission(role, item.id));
    if (visibleItems.length > 0) {
      sectionsHtml += `<div class="menu-category-title">${sec.title}</div>`;
      visibleItems.forEach(item => {
        const isActive = currentRoute === item.id;
        sectionsHtml += `
          <a href="#/${item.id}" class="menu-item ${isActive ? 'active' : ''}" data-route="${item.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">${item.icon}</svg>
            <span>${item.label}</span>
            ${item.badge ? `<span class="menu-badge">${item.badge}</span>` : ''}
          </a>
        `;
      });
    }
  });

  const initials = profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'GF';

  sidebar.innerHTML = `
    <div class="sidebar-header">
      <div class="brand-badge">GEF</div>
      <div class="brand-info">
        <h1>GEF FERRAGEM</h1>
        <p>GESTOR COMERCIAL</p>
      </div>
    </div>

    <nav class="sidebar-menu">
      ${sectionsHtml}
    </nav>

    <div class="sidebar-footer">
      <div class="user-snippet">
        <div class="user-avatar">${initials}</div>
        <div class="user-details">
          <div class="user-name text-truncate">${profile?.full_name || 'Operador'}</div>
          <div class="user-role">${getRoleLabel(role)}</div>
        </div>
      </div>
    </div>
  `;

  // Attach click listeners to close sidebar on mobile
  const links = sidebar.querySelectorAll('.menu-item');
  links.forEach(link => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      const route = link.getAttribute('data-route');
      navigateTo(route);

      // Fecha sidebar no mobile
      sidebar.classList.remove('sidebar-open');
      const backdrop = document.querySelector('.sidebar-backdrop');
      if (backdrop) backdrop.classList.remove('active');
    });
  });
}
