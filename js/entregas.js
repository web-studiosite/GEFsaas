/**
 * GEF - Gestor de Ferragem
 * entregas.js - Logística de Transporte para Canteiros de Obra
 */

import { dbGetDeliveries } from './database.js';
import { formatCurrency, formatDateTime, buildWhatsAppLink } from './utils.js';
import { renderTable } from './table.js';
import { renderEmptyState } from './empty-state.js';
import { showLoading } from './loading.js';
import { showToast } from './toast.js';

let deliveries = [];

export async function init() {
  await loadDeliveries();
}

async function loadDeliveries() {
  const container = document.getElementById('entregas-table-container');
  showLoading(container, 'Carregando romaneios de entregas...');

  try {
    deliveries = await dbGetDeliveries();
    renderDeliveriesTable(deliveries);
  } catch (err) {
    console.error('Erro em entregas:', err);
    if (container) {
      container.innerHTML = `<div style="padding:20px; color:var(--danger);">${err.message}</div>`;
    }
  }
}

function renderDeliveriesTable(items) {
  const container = document.getElementById('entregas-table-container');
  if (!container) return;

  if (!items || items.length === 0) {
    container.innerHTML = renderEmptyState({
      title: 'Nenhuma entrega pendente',
      message: 'Não há pedidos de ferragens agendados para transporte rodoviário no momento.'
    });
    return;
  }

  const columns = [
    { label: 'Romaneio', key: 'delivery_number', render: (r) => `<strong>#${r.delivery_number}</strong>` },
    { label: 'Cliente & Obra', key: 'customer', render: (r) => `<div><strong>${r.customer?.name || 'Cliente'}</strong><div style="font-size:0.75rem; color:var(--text-muted);">${r.destination_address}</div></div>` },
    { label: 'Motorista / Veículo', key: 'driver', render: (r) => `${r.driver_name || 'Frota Loja'} (${r.vehicle_plate || 'Próprio'})` },
    { label: 'Taxa Frete', key: 'shipping_fee', numeric: true, render: (r) => formatCurrency(r.shipping_fee) },
    { 
      label: 'Status', 
      key: 'status', 
      render: (r) => {
        const badges = {
          pendente: '<span class="badge badge-warning">Pendente</span>',
          em_transito: '<span class="badge badge-primary">Caminhão em Rota</span>',
          entregue: '<span class="badge badge-success">Entregue na Obra</span>',
          cancelado: '<span class="badge badge-danger">Cancelado</span>'
        };
        return badges[r.status] || r.status;
      }
    },
    {
      label: 'Avisar Encarregado',
      key: 'actions',
      render: (r) => {
        const cust = r.customer || {};
        const phone = cust.whatsapp || cust.phone || '';
        const waText = `🚚 Olá ${cust.name}! Os materiais da sua obra (Entrega #${r.delivery_number}) estão em transporte. Previsão de chegada hoje. Qualquer dúvida, fale conosco!`;
        const waLink = buildWhatsAppLink(phone, waText);

        return phone ? `
          <a href="${waLink}" target="_blank" rel="noopener noreferrer" class="btn btn-whatsapp btn-sm">
            Avisar no WhatsApp
          </a>
        ` : '-';
      }
    }
  ];

  container.innerHTML = renderTable({ columns, rows: items });
}
