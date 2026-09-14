/**
 * GEF - Gestor de Ferragem
 * router.js - Roteador SPA Puro e Gerenciador de Módulos
 */

import { getState } from './state.js';
import { hasPermission } from './permissions.js';
import { displayModuleError } from './errors.js';
import { showLoading } from './loading.js';
import { renderSidebar } from './sidebar.js';
import { getModuleTemplate } from './templates.js';

let currentRoute = 'dashboard';

// Mapeamento dinâmico de controladores
const MODULE_CONTROLLERS = {
  login: () => import('./login.js'),
  dashboard: () => import('./dashboard.js'),
  pos: () => import('./pos.js'),
  vendas: () => import('./vendas.js'),
  orcamentos: () => import('./orcamentos.js'),
  produtos: () => import('./produtos.js'),
  estoque: () => import('./estoque.js'),
  perdas: () => import('./perdas.js'),
  caixa: () => import('./caixa.js'),
  clientes: () => import('./clientes.js'),
  entregas: () => import('./entregas.js'),
  relatorios: () => import('./relatorios.js'),
  configuracoes: () => import('./configuracoes.js'),
  embaixadores: () => import('./embaixadores.js'),
  monitoria: () => import('./monitoria.js'),
  auditoria: () => import('./auditoria.js')
};

export function getCurrentRoute() {
  return currentRoute;
}

export function navigateTo(route) {
  window.location.hash = `#/${route}`;
}

export async function handleRouteChange() {
  const hash = window.location.hash.replace(/^#\/?/, '') || 'dashboard';
  const cleanRoute = hash.split('?')[0].toLowerCase();
  currentRoute = cleanRoute;

  const contentContainer = document.getElementById('app-content');
  const navbar = document.getElementById('app-navbar');
  const sidebar = document.getElementById('app-sidebar');

  // Se for login, ajusta layout para tela cheia
  if (currentRoute === 'login') {
    if (navbar) navbar.style.display = 'none';
    if (sidebar) sidebar.style.display = 'none';
  } else {
    // Verifica autenticação
    const user = getState('currentUser');
    if (!user) {
      navigateTo('login');
      return;
    }

    // Verifica permissão de acesso ao módulo
    const profile = getState('userProfile');
    if (profile && !hasPermission(profile.role, currentRoute)) {
      if (contentContainer) {
        displayModuleError(contentContainer, 'Seu perfil de acesso não tem permissão para visualizar este módulo.', () => navigateTo('dashboard'));
      }
      return;
    }

    if (navbar) navbar.style.display = 'flex';
    if (sidebar) sidebar.style.display = 'flex';
    renderSidebar();
  }

  if (!MODULE_CONTROLLERS[currentRoute]) {
    currentRoute = 'dashboard';
  }

  // Atualiza título na navbar
  const titleEl = document.getElementById('page-current-title');
  if (titleEl) {
    const titles = {
      dashboard: 'Painel Geral da Ferragem',
      pos: 'PDV - Frente de Caixa',
      vendas: 'Histórico de Vendas & Recibos',
      orcamentos: 'Cotações & Orçamentos de Obra',
      produtos: 'Catálogo de Ferragens & Preços',
      estoque: 'Controle de Estoque & Entradas',
      perdas: 'Registro de Perdas & Avarias',
      caixa: 'Turno de Caixa & Sangrias',
      clientes: 'Lista de Clientes & Cobrança WhatsApp/SMS',
      entregas: 'Logística de Entregas em Obra',
      relatorios: 'Relatórios Financeiros & Vendas',
      configuracoes: 'Configurações da Ferragem & Supabase',
      embaixadores: 'Mestres de Obra & Comissões',
      monitoria: 'Monitoria Operacional em Tempo Real',
      auditoria: 'Trilha de Auditoria do Sistema'
    };
    titleEl.textContent = titles[currentRoute] || 'GEF Ferragem';
  }

  // Mostra loading enquanto carrega o HTML e o módulo JS
  showLoading(contentContainer, 'Carregando módulo...');

  try {
    // 1. Carrega o template HTML do módulo (instantâneo via templates.js, com fallback fetch seguro)
    let htmlContent = getModuleTemplate(currentRoute);
    if (!htmlContent) {
      try {
        const pathPrefix = window.location.pathname.includes('/deploy') ? './html/' : './deploy/html/';
        const htmlResponse = await fetch(`${pathPrefix}${currentRoute}.html`);
        if (htmlResponse.ok) {
          htmlContent = await htmlResponse.text();
        }
      } catch (e) {
        console.warn(`Fetch fallback não disponível para ${currentRoute}:`, e);
      }
    }

    if (!htmlContent) {
      throw new Error(`Arquivo de interface do módulo "${currentRoute}" não encontrado.`);
    }
    contentContainer.innerHTML = htmlContent;

    // 2. Importa e inicializa o controlador do módulo
    const moduleController = await MODULE_CONTROLLERS[currentRoute]();
    if (moduleController && typeof moduleController.init === 'function') {
      await moduleController.init();
    }
  } catch (err) {
    console.error(`Erro ao carregar módulo [${currentRoute}]:`, err);
    displayModuleError(
      contentContainer,
      `Falha ao inicializar o módulo "${currentRoute}": ${err.message}`,
      () => handleRouteChange()
    );
  }
}

export function initRouter() {
  window.addEventListener('hashchange', handleRouteChange);
  handleRouteChange();
}
