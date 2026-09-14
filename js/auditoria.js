/**
 * GEF - Gestor de Ferragem
 * auditoria.js - Registro e Consulta de Trilha de Auditoria
 */

import { dbGetAuditLogs } from './database.js';
import { formatDateTime } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';

export async function init() {
  await loadAuditLogs();
}

async function loadAuditLogs() {
  const container = document.getElementById('auditoria-table-container');
  showLoading(container, 'Carregando trilha de auditoria...');

  try {
    const logs = await dbGetAuditLogs(100);

    if (!logs || logs.length === 0) {
      container.innerHTML = renderEmptyState({
        title: 'Nenhum registro de auditoria',
        message: 'Alterações cadastrais e operações sensíveis são gravadas de forma permanente aqui.'
      });
      return;
    }

    const columns = [
      { label: 'Data / Hora', key: 'created_at', render: (r) => formatDateTime(r.created_at) },
      { label: 'Usuário', key: 'user', render: (r) => r.user?.full_name || 'Sistema' },
      { label: 'Ação', key: 'action', render: (r) => `<strong>${r.action}</strong>` },
      { label: 'Tabela / Entidade', key: 'entity_name', render: (r) => `<code>${r.entity_name}</code>` },
      { label: 'ID Registro', key: 'entity_id', render: (r) => `<span style="font-size:0.75rem; color:var(--text-muted);">${r.entity_id?.slice(0, 8) || '-'}</span>` },
      { label: 'Endereço IP', key: 'ip_address', render: (r) => r.ip_address || '127.0.0.1' }
    ];

    container.innerHTML = renderTable({ columns, rows: logs });
  } catch (err) {
    console.error('Erro em auditoria:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}
