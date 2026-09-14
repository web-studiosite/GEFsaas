/**
 * GEF - Gestor de Ferragem
 * table.js - Renderização Segura de Tabelas
 */

export function renderTable({ columns, rows, emptyMessage = 'Nenhum dado para exibir.' }) {
  if (!rows || rows.length === 0) {
    return `<div style="padding: 24px; text-align: center; color: var(--text-muted);">${emptyMessage}</div>`;
  }

  const ths = columns.map(c => `<th class="${c.numeric ? 'table-numeric' : ''}">${c.label}</th>`).join('');
  
  const trs = rows.map(row => {
    const tds = columns.map(c => {
      let val = '';
      if (typeof c.render === 'function') {
        val = c.render(row);
      } else {
        val = row[c.key] ?? '-';
      }
      return `<td class="${c.numeric ? 'table-numeric' : ''}">${val}</td>`;
    }).join('');
    return `<tr>${tds}</tr>`;
  }).join('');

  return `
    <div class="table-responsive">
      <table class="table">
        <thead><tr>${ths}</tr></thead>
        <tbody>${trs}</tbody>
      </table>
    </div>
  `;
}
