/**
 * GEF - Gestor de Ferragem Moçambique
 * configuracoes.js - Gerenciador de Configurações, M-Pesa, e-Mola, NIB, Templates e Conexão Supabase
 */

import { getStoredConfig, saveStoredConfig } from './config.js';
import { isSupabaseConfigured, testSupabaseConnection } from './supabase.js';
import { showToast } from './toast.js';
import { openModal, closeModal } from './modal.js';

export async function init() {
  populateFields();
  setupActions();
  updateSupabaseBadge();
}

function updateSupabaseBadge() {
  const badgeEl = document.getElementById('supabase-status-badge');
  if (!badgeEl) return;

  if (isSupabaseConfigured()) {
    badgeEl.innerHTML = '<span class="badge badge-success">Conectado ao Supabase</span>';
  } else {
    badgeEl.innerHTML = '<span class="badge badge-warning">Aguardando Credenciais</span>';
  }
}

function populateFields() {
  const cfg = getStoredConfig();

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val || '';
  };

  setVal('cfg-supabase-url', cfg.supabaseUrl);
  setVal('cfg-supabase-key', cfg.supabaseAnonKey);
  setVal('cfg-trade-name', cfg.tradeName);
  setVal('cfg-company-name', cfg.companyName);
  setVal('cfg-nuit', cfg.document);
  setVal('cfg-phone', cfg.phone);
  setVal('cfg-mpesa', cfg.mpesaNumber);
  setVal('cfg-emola', cfg.emolaNumber);
  setVal('cfg-nib', cfg.bankNib);
  setVal('cfg-city', cfg.city);
  setVal('cfg-address', cfg.address);
  setVal('cfg-wa-template', cfg.whatsappBillingTemplate);
  setVal('cfg-sms-template', cfg.smsBillingTemplate);
}

function setupActions() {
  document.getElementById('btn-save-all-config')?.addEventListener('click', () => {
    const current = getStoredConfig();

    const getVal = (id) => document.getElementById(id)?.value.trim() || '';

    const updated = {
      ...current,
      supabaseUrl: getVal('cfg-supabase-url'),
      supabaseAnonKey: getVal('cfg-supabase-key'),
      tradeName: getVal('cfg-trade-name') || current.tradeName,
      companyName: getVal('cfg-company-name') || current.companyName,
      document: getVal('cfg-nuit') || current.document,
      phone: getVal('cfg-phone') || current.phone,
      mpesaNumber: getVal('cfg-mpesa') || current.mpesaNumber,
      emolaNumber: getVal('cfg-emola') || current.emolaNumber,
      bankNib: getVal('cfg-nib') || current.bankNib,
      city: getVal('cfg-city') || current.city,
      address: getVal('cfg-address') || current.address,
      whatsappBillingTemplate: document.getElementById('cfg-wa-template')?.value || current.whatsappBillingTemplate,
      smsBillingTemplate: document.getElementById('cfg-sms-template')?.value || current.smsBillingTemplate
    };

    saveStoredConfig(updated);
    showToast('Configurações salvas com sucesso! As alterações já estão activas.', 'success');
    updateSupabaseBadge();
  });

  // Teste de Conexão Supabase
  document.getElementById('btn-test-supabase')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-test-supabase');
    if (btn) {
      btn.disabled = true;
      btn.textContent = 'A testar comunicação...';
    }

    try {
      const ok = await testSupabaseConnection();
      if (ok) {
        showToast('Conexão com o Supabase estabelecida com sucesso! Tabelas acessíveis.', 'success');
      } else {
        showToast('Não foi possível conectar. Verifique a URL, Anon Key ou se as tabelas foram criadas.', 'warning');
      }
    } catch (e) {
      showToast(`Falha no teste: ${e.message}`, 'error');
    } finally {
      if (btn) {
        btn.disabled = false;
        btn.textContent = 'Testar Conexão Agora';
      }
      updateSupabaseBadge();
    }
  });

  // Copiar DDL SQL
  document.getElementById('btn-view-sql')?.addEventListener('click', () => {
    openModal({
      title: 'Script DDL Completo do Banco (Supabase)',
      bodyHtml: `
        <div>
          <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 12px;">
            Copie este script e execute-o no <strong>SQL Editor</strong> do painel do seu projecto Supabase para criar todas as tabelas multi-tenant com RLS, produtos, vendas com lucro real, caixa, clientes e monitoria.
          </p>
          <div style="background: #0f172a; color: #38bdf8; padding: 14px; border-radius: var(--radius-md); font-family: var(--font-mono); font-size: 0.75rem; max-height: 300px; overflow-y: auto;">
            O script completo encontra-se armazenado no ficheiro <code>supabase_schema.sql</code> deste projecto. Clique abaixo para copiar a instrução.
          </div>
        </div>
      `,
      footerHtml: `
        <button id="btn-copy-sql-action" class="btn btn-primary">Copiar Instruções</button>
        <button class="btn btn-outline" onclick="window.location.reload()">Fechar</button>
      `,
      size: 'md'
    });

    document.getElementById('btn-copy-sql-action')?.addEventListener('click', () => {
      navigator.clipboard.writeText('-- Consulte o ficheiro supabase_schema.sql na raiz do projecto para executar no Supabase');
      showToast('Instrução copiada para a área de transferência!', 'info');
      closeModal();
    });
  });
}
