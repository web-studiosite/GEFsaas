/**
 * GEF - Gestor de Ferragem
 * permissions.js - Controle de Acesso Baseado em Roles (RBAC Multi-tenant)
 */

export const ROLE_PERMISSIONS = {
  monitor: {
    label: 'Monitor da Plataforma (Nível Global)',
    modules: ['dashboard', 'monitoria', 'embaixadores', 'auditoria', 'configuracoes'],
    isPlatformLevel: true,
    canBlockTenants: true,
    canManageSubscriptions: true,
    canManageAmbassadors: true,
    canViewAllStores: true
  },
  administrador: {
    label: 'Administrador do Tenant',
    modules: ['dashboard', 'pos', 'vendas', 'orcamentos', 'produtos', 'estoque', 'perdas', 'caixa', 'clientes', 'entregas', 'relatorios', 'configuracoes', 'embaixadores', 'auditoria'],
    isPlatformLevel: false,
    canEditSettings: true,
    canManageUsers: true,
    canCancelSales: true,
    canPerformSangria: true
  },
  gestor: {
    label: 'Gerente de Loja',
    modules: ['dashboard', 'pos', 'vendas', 'orcamentos', 'produtos', 'estoque', 'perdas', 'caixa', 'clientes', 'entregas', 'relatorios', 'embaixadores'],
    isPlatformLevel: false,
    canEditSettings: false,
    canManageUsers: false,
    canCancelSales: true,
    canPerformSangria: true
  },
  caixa: {
    label: 'Operador de Caixa',
    modules: ['dashboard', 'pos', 'vendas', 'caixa', 'clientes'],
    isPlatformLevel: false,
    canEditSettings: false,
    canManageUsers: false,
    canCancelSales: false,
    canPerformSangria: true
  },
  vendedor: {
    label: 'Vendedor Balcão',
    modules: ['dashboard', 'pos', 'vendas', 'orcamentos', 'produtos', 'clientes', 'entregas'],
    isPlatformLevel: false,
    canEditSettings: false,
    canManageUsers: false,
    canCancelSales: false,
    canPerformSangria: false
  },
  embaixador: {
    label: 'Embaixador / Parceiro de Obras',
    modules: ['dashboard', 'embaixadores'],
    isPlatformLevel: false,
    canEditSettings: false,
    canManageUsers: false,
    canCancelSales: false,
    canPerformSangria: false
  }
};

export function hasPermission(role, moduleName) {
  if (!role) return false;
  const roleKey = role.toLowerCase();
  // Se for monitor, permite monitoria e módulos da plataforma
  const roleConfig = ROLE_PERMISSIONS[roleKey];
  if (!roleConfig) return false;
  return roleConfig.modules.includes(moduleName);
}

export function getRoleLabel(role) {
  return ROLE_PERMISSIONS[role?.toLowerCase()]?.label || role || 'Usuário';
}
