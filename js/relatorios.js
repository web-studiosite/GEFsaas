/**
 * GEF - Gestor de Ferragem
 * relatorios.js - Relatórios e Análise Comercial
 */

import { dbGetSales } from './database.js';
import { formatCurrency, formatPaymentMethodName } from './utils.js';
import { showLoading } from './loading.js';

export async function init() {
  await loadReports();
}

async function loadReports() {
  const paymentContainer = document.getElementById('rel-payment-breakdown');
  const topProdContainer = document.getElementById('rel-top-products');

  showLoading(paymentContainer, 'Processando vendas...');
  showLoading(topProdContainer, 'Calculando produtos...');

  try {
    const sales = await dbGetSales('', 'finalizada', 500);

    const totalRevenue = sales.reduce((acc, s) => acc + Number(s.total || 0), 0);
    let cashPixTotal = 0;
    let fiadoTotal = 0;
    const paymentMethods = {};
    const productStats = {};

    sales.forEach(s => {
      const tot = Number(s.total || 0);
      const meth = s.payment_method || 'outros';
      paymentMethods[meth] = (paymentMethods[meth] || 0) + tot;

      if (meth === 'dinheiro' || meth === 'pix') cashPixTotal += tot;
      if (meth === 'fiado') fiadoTotal += tot;

      if (s.items && Array.isArray(s.items)) {
        s.items.forEach(item => {
          const name = item.product_name || 'Material';
          if (!productStats[name]) productStats[name] = { qty: 0, total: 0 };
          productStats[name].qty += Number(item.quantity || 0);
          productStats[name].total += Number(item.total || 0);
        });
      }
    });

    document.getElementById('rel-kpi-total').textContent = formatCurrency(totalRevenue);
    document.getElementById('rel-kpi-sales').textContent = `${sales.length} vendas registradas`;
    document.getElementById('rel-kpi-cash-pix').textContent = formatCurrency(cashPixTotal);
    document.getElementById('rel-kpi-fiado').textContent = formatCurrency(fiadoTotal);

    // Renderiza Distribuição de Pagamento
    const methodKeys = Object.keys(paymentMethods);
    if (methodKeys.length === 0) {
      paymentContainer.innerHTML = '<div style="color:var(--text-muted); text-align:center;">Nenhuma venda para distribuir.</div>';
    } else {
      paymentContainer.innerHTML = methodKeys.map(k => {
        const val = paymentMethods[k];
        const pct = totalRevenue > 0 ? ((val / totalRevenue) * 100).toFixed(1) : 0;
        return `
          <div style="margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; font-size: 0.875rem; margin-bottom: 4px;">
              <span><strong>${formatPaymentMethodName(k)}</strong> (${pct}%)</span>
              <strong>${formatCurrency(val)}</strong>
            </div>
            <div style="background: var(--bg-surface-subtle); height: 8px; border-radius: 4px; overflow: hidden;">
              <div style="background: var(--primary); height: 100%; width: ${pct}%;"></div>
            </div>
          </div>
        `;
      }).join('');
    }

    // Renderiza Top Produtos
    const topProducts = Object.entries(productStats)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 5);

    if (topProducts.length === 0) {
      topProdContainer.innerHTML = '<div style="color:var(--text-muted); text-align:center;">Nenhum produto vendido ainda.</div>';
    } else {
      topProdContainer.innerHTML = topProducts.map(([name, stat], idx) => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border-subtle);">
          <div>
            <div style="font-weight: 700; font-size: 0.875rem;">#${idx + 1} ${name}</div>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${stat.qty} unidades comercializadas</div>
          </div>
          <div style="font-weight: 800; color: var(--primary); font-size: 0.9375rem;">
            ${formatCurrency(stat.total)}
          </div>
        </div>
      `).join('');
    }

  } catch (err) {
    console.error('Erro em relatorios:', err);
  }
}
