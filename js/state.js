/**
 * GEF - Gestor de Ferragem
 * state.js - Estado Global Reativo da Aplicação
 */

const state = {
  currentUser: null,
  userProfile: null,
  currentStore: null,
  activeCashSession: null,
  storesList: [],
  posCart: {
    items: [],
    customerId: null,
    customerData: null,
    discountAmount: 0,
    subtotal: 0,
    total: 0
  },
  isOnline: navigator.onLine
};

const listeners = new Map();

export function getState(key) {
  if (!key) return state;
  return state[key];
}

export function setState(key, value) {
  state[key] = value;
  if (listeners.has(key)) {
    listeners.get(key).forEach(cb => {
      try {
        cb(value, state);
      } catch (e) {
        console.error(`Erro no listener do state [${key}]:`, e);
      }
    });
  }
}

export function subscribe(key, callback) {
  if (!listeners.has(key)) {
    listeners.set(key, new Set());
  }
  listeners.get(key).add(callback);
  return () => listeners.get(key).delete(callback);
}

// Funções utilitárias para o carrinho do PDV
export function updateCartCalculations() {
  const cart = state.posCart;
  let subtotal = 0;
  cart.items.forEach(item => {
    item.total = Number((item.quantity * item.unit_price).toFixed(2));
    subtotal += item.total;
  });
  cart.subtotal = Number(subtotal.toFixed(2));
  cart.total = Math.max(0, Number((cart.subtotal - cart.discountAmount).toFixed(2)));
  setState('posCart', { ...cart });
}

export function clearCart() {
  setState('posCart', {
    items: [],
    customerId: null,
    customerData: null,
    discountAmount: 0,
    subtotal: 0,
    total: 0
  });
}
