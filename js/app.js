/**
 * GEF - Gestor de Ferragem
 * app.js - Ponto de Entrada da Aplicação e Inicializador
 */

import { initAuth } from './auth.js';
import { setupNavbar } from './navbar.js';
import { setupSidebar } from './sidebar.js';
import { initRouter, navigateTo } from './router.js';
import { getStoredConfig } from './config.js';
import { dbGetActiveCashSession } from './database.js';
import { setState } from './state.js';

async function bootstrap() {
  console.log('Iniciando GEF - Gestor de Ferragem...');

  // 1. Registro do Service Worker (PWA Offline)
  registerServiceWorker();

  // 2. Carrega configurações salvas da Ferragem
  getStoredConfig();

  // 3. Inicializa Sessão de Autenticação (Supabase Auth / Local Dev)
  await initAuth();

  // 4. Carrega status inicial do caixa se autenticado
  try {
    const cashSession = await dbGetActiveCashSession();
    setState('activeCashSession', cashSession);
  } catch (e) {
    console.warn('Não foi possível verificar sessão de caixa na inicialização:', e);
  }

  // 5. Configura componentes estruturais
  setupNavbar();
  setupSidebar();
  setupGlobalBackdrop();
  setupKeyboardShortcuts();

  // 6. Inicia o Roteador SPA
  initRouter();
}

function registerServiceWorker() {
  if ('serviceWorker' in navigator && window.location.protocol.startsWith('http')) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('./sw.js')
        .then(reg => {
          console.log('PWA Service Worker registrado com sucesso no escopo:', reg.scope);
        })
        .catch(err => {
          console.warn('Falha no registro do Service Worker:', err);
        });
    });
  }
}

function setupGlobalBackdrop() {
  const backdrop = document.querySelector('.sidebar-backdrop');
  const sidebar = document.getElementById('app-sidebar');

  if (backdrop && sidebar) {
    backdrop.addEventListener('click', () => {
      sidebar.classList.remove('sidebar-open');
      backdrop.classList.remove('active');
    });
  }
}

function setupKeyboardShortcuts() {
  window.addEventListener('keydown', (e) => {
    // Atalho F2: Acessar PDV imediatamente de qualquer tela
    if (e.key === 'F2') {
      e.preventDefault();
      navigateTo('pos');
    }
  });
}

// Inicializa a aplicação quando o DOM estiver pronto
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', bootstrap);
} else {
  bootstrap();
}
