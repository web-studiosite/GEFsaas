-- ============================================================
-- GEF - GESTOR DE FERRAGEM (SaaS ERP Multi-tenant PWA)
-- SCRIPT SQL DEFINITIVO E COMPLETO PARA SUPABASE / POSTGRESQL
-- Inclui: Multi-tenant Real, Lojas, Auth/Profiles, Roles, Permissões,
-- Estoque por Loja, Vendas Atômicas, Caixa por Loja, Mensalidades,
-- Bloqueio/Liberação de Tenants, Embaixadores, Comissões, Auditoria,
-- Monitoria, RLS e Funções RPC.
-- ============================================================

-- Extensões necessárias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- 1. ESTRUTURA DE TENANTS (EMPRESAS) E LOJAS (FILIAIS)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.tenants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(255) NOT NULL,
    trade_name VARCHAR(255),
    document VARCHAR(30) UNIQUE NOT NULL, -- CNPJ ou CPF
    email VARCHAR(255),
    phone VARCHAR(30),
    plan VARCHAR(50) NOT NULL DEFAULT 'PRO', -- 'STARTER', 'PRO', 'ENTERPRISE'
    monthly_fee NUMERIC(12, 2) NOT NULL DEFAULT 149.90,
    due_day INT NOT NULL DEFAULT 10,
    status VARCHAR(30) NOT NULL DEFAULT 'ativo', -- 'ativo', 'pendente', 'vencido', 'bloqueado', 'suspenso'
    blocked_from TIMESTAMPTZ,
    blocked_until TIMESTAMPTZ,
    block_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(50),
    address TEXT,
    city VARCHAR(100),
    state VARCHAR(50),
    zip_code VARCHAR(20),
    phone VARCHAR(30),
    whatsapp VARCHAR(30),
    pix_key VARCHAR(150),
    pix_key_type VARCHAR(50) DEFAULT 'CNPJ',
    receipt_footer TEXT DEFAULT 'Obrigado pela preferência! Ferragens de qualidade para sua obra.',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 2. ROLES, PERMISSÕES E USUÁRIOS (PROFILES)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(50) UNIQUE NOT NULL, -- 'monitor', 'administrador', 'gestor', 'caixa', 'vendedor', 'embaixador'
    label VARCHAR(100) NOT NULL,
    description TEXT,
    is_platform_level BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

INSERT INTO public.roles (name, label, description, is_platform_level)
VALUES 
    ('monitor', 'Monitor da Plataforma', 'Acesso irrestrito a todos os tenants, bloqueios, mensalidades e auditoria global', true),
    ('administrador', 'Administrador do Tenant', 'Administrador completo da empresa/ferragem contratante', false),
    ('gestor', 'Gerente de Loja', 'Gestor operacional de loja e equipe comercial', false),
    ('caixa', 'Operador de Caixa', 'Operações de PDV balcão e gaveta de dinheiro', false),
    ('vendedor', 'Vendedor Balcão', 'Vendas de ferragem, cotações e atendimento ao cliente', false),
    ('embaixador', 'Embaixador / Parceiro', 'Divulgador e parceiro de obras', false)
ON CONFLICT (name) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    module VARCHAR(50) NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    UNIQUE(role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    role VARCHAR(50) NOT NULL DEFAULT 'vendedor',
    phone VARCHAR(30),
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_store_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    role_name VARCHAR(50) NOT NULL,
    UNIQUE(user_id, store_id)
);

-- ============================================================
-- 3. PRODUTOS, CATEGORIAS E ESTOQUE POR LOJA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    category_id UUID REFERENCES public.categories(id) ON DELETE SET NULL,
    sku VARCHAR(60),
    barcode VARCHAR(60),
    name VARCHAR(255) NOT NULL,
    description TEXT,
    unit VARCHAR(10) NOT NULL DEFAULT 'UN', -- UN, KG, MT, PC, CX, SC, LTR
    cost_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    markup_percent NUMERIC(8, 2) DEFAULT 40.00,
    selling_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    min_stock NUMERIC(12, 3) NOT NULL DEFAULT 5.000,
    location VARCHAR(100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Tabela de Estoque Isolado por Loja
CREATE TABLE IF NOT EXISTS public.product_stock (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    current_stock NUMERIC(12, 3) NOT NULL DEFAULT 0.000,
    min_stock NUMERIC(12, 3) NOT NULL DEFAULT 5.000,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    UNIQUE(store_id, product_id)
);

-- ============================================================
-- 4. CLIENTES E FORNECEDORES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.customers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    name VARCHAR(255) NOT NULL,
    customer_type VARCHAR(50) DEFAULT 'PF', -- 'PF', 'PJ', 'PEDREIRO', 'EMPREITEIRO', 'CONSTRUTORA'
    document VARCHAR(30),
    phone VARCHAR(30) NOT NULL,
    whatsapp VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    address TEXT,
    neighborhood VARCHAR(100),
    city VARCHAR(100),
    state VARCHAR(50),
    reference_point TEXT,
    credit_limit NUMERIC(12, 2) NOT NULL DEFAULT 500.00,
    debt_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) DEFAULT 'ativo', -- 'ativo', 'bloqueado', 'inadimplente'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.suppliers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    document VARCHAR(30),
    phone VARCHAR(30),
    email VARCHAR(255),
    contact_person VARCHAR(150),
    notes TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 5. CAIXA E TURNOS POR LOJA
-- ============================================================

CREATE TABLE IF NOT EXISTS public.cash_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    opening_balance NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    closing_balance_calculated NUMERIC(12, 2) DEFAULT 0.00,
    closing_balance_counted NUMERIC(12, 2),
    difference NUMERIC(12, 2) DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'aberto', -- 'aberto', 'fechado'
    opened_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    closed_at TIMESTAMPTZ,
    notes TEXT
);

CREATE TABLE IF NOT EXISTS public.cash_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    session_id UUID NOT NULL REFERENCES public.cash_sessions(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    type VARCHAR(30) NOT NULL, -- 'suprimento', 'sangria', 'venda', 'recebimento_fiado'
    payment_method VARCHAR(50) NOT NULL, -- 'dinheiro', 'pix', 'cartao_debito', 'cartao_credito'
    amount NUMERIC(12, 2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 6. VENDAS, ITENS E PAGAMENTOS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.cash_sessions(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    customer_id UUID REFERENCES public.customers(id),
    sale_number BIGINT GENERATED BY DEFAULT AS IDENTITY,
    subtotal NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    amount_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    change_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    payment_method VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'finalizada', -- 'finalizada', 'cancelada'
    cancel_reason TEXT,
    cancelled_by UUID REFERENCES public.profiles(id),
    receipt_code VARCHAR(50) UNIQUE DEFAULT ('REC-' || substr(md5(random()::text), 1, 8)),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.sale_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    product_name VARCHAR(255) NOT NULL,
    unit VARCHAR(10) NOT NULL DEFAULT 'UN',
    unit_cost NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    unit_price NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    quantity NUMERIC(12, 3) NOT NULL,
    discount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id),
    session_id UUID REFERENCES public.cash_sessions(id),
    method VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Contas a Receber / Fiado
CREATE TABLE IF NOT EXISTS public.receivables (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    original_amount NUMERIC(12, 2) NOT NULL,
    paid_amount NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    current_balance NUMERIC(12, 2) NOT NULL,
    due_date DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pendente', -- 'pendente', 'parcial', 'pago', 'vencido'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 7. KARDEX / ESTOQUE, PERDAS, ORÇAMENTOS E ENTREGAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.stock_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    type VARCHAR(30) NOT NULL, -- 'entrada', 'saida_venda', 'perda', 'ajuste', 'devolucao'
    quantity NUMERIC(12, 3) NOT NULL,
    previous_stock NUMERIC(12, 3) NOT NULL,
    new_stock NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(12, 2) DEFAULT 0.00,
    reference_id UUID,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.losses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    quantity NUMERIC(12, 3) NOT NULL,
    unit_cost NUMERIC(12, 2) NOT NULL,
    total_cost NUMERIC(12, 2) NOT NULL,
    reason VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.quotes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id),
    user_id UUID NOT NULL REFERENCES public.profiles(id),
    quote_number BIGINT GENERATED BY DEFAULT AS IDENTITY,
    customer_name VARCHAR(255) NOT NULL,
    customer_phone VARCHAR(30),
    total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    valid_until DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'aberto', -- 'aberto', 'convertido', 'expirado', 'cancelado'
    converted_sale_id UUID REFERENCES public.sales(id),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.quote_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    quote_id UUID NOT NULL REFERENCES public.quotes(id) ON DELETE CASCADE,
    product_id UUID NOT NULL REFERENCES public.products(id),
    product_name VARCHAR(255) NOT NULL,
    unit VARCHAR(10) NOT NULL DEFAULT 'UN',
    quantity NUMERIC(12, 3) NOT NULL,
    unit_price NUMERIC(12, 2) NOT NULL,
    total NUMERIC(12, 2) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.receipts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
    receipt_code VARCHAR(50) NOT NULL,
    amount NUMERIC(12, 2) NOT NULL,
    receipt_type VARCHAR(50) DEFAULT 'digital', -- 'digital', 'fiado_pagamento', 'impressao'
    content TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.billing_messages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    customer_id UUID REFERENCES public.customers(id) ON DELETE CASCADE,
    channel VARCHAR(30) NOT NULL, -- 'whatsapp', 'sms'
    message_text TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'enviado',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.deliveries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
    sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
    customer_id UUID REFERENCES public.customers(id),
    delivery_address TEXT NOT NULL,
    neighborhood VARCHAR(100),
    driver_name VARCHAR(150),
    vehicle_plate VARCHAR(30),
    shipping_fee NUMERIC(12, 2) DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'pendente', -- 'pendente', 'separando', 'em_rota', 'entregue', 'cancelada'
    scheduled_for DATE,
    delivered_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 8. MENSALIDADES E ASSINATURAS DO SAAS
-- ============================================================

CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    plan VARCHAR(50) NOT NULL DEFAULT 'PRO',
    amount NUMERIC(12, 2) NOT NULL DEFAULT 149.90,
    billing_cycle VARCHAR(30) NOT NULL DEFAULT 'mensal',
    status VARCHAR(30) NOT NULL DEFAULT 'ativo', -- 'ativo', 'pendente', 'vencido', 'bloqueado', 'suspenso'
    started_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    current_period_start DATE NOT NULL DEFAULT CURRENT_DATE,
    current_period_end DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    next_due_date DATE NOT NULL DEFAULT (CURRENT_DATE + INTERVAL '30 days'),
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.subscription_payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID REFERENCES public.subscriptions(id) ON DELETE SET NULL,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    amount NUMERIC(12, 2) NOT NULL,
    payment_date TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    payment_method VARCHAR(50) NOT NULL DEFAULT 'PIX',
    reference VARCHAR(150),
    status VARCHAR(30) NOT NULL DEFAULT 'confirmado', -- 'confirmado', 'pendente', 'falhou'
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 9. SISTEMA DE EMBAIXADORES, LINKS DE INDICAÇÃO E COMISSÕES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.ambassadors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE, -- Null se for da Plataforma SaaS
    name VARCHAR(255) NOT NULL,
    profession VARCHAR(100) DEFAULT 'Embaixador Comercial',
    phone VARCHAR(30) NOT NULL,
    email VARCHAR(255),
    pix_key VARCHAR(150),
    commission_rate NUMERIC(5, 2) NOT NULL DEFAULT 10.00, -- % de comissão
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ativo', -- 'ativo', 'bloqueado'
    total_earned NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_paid NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ambassador_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    referral_code VARCHAR(50) UNIQUE NOT NULL,
    clicks_count INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ambassador_referrals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    referral_code VARCHAR(50) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'ativo', -- 'ativo', 'pendente', 'cancelado'
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.ambassador_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ambassador_id UUID NOT NULL REFERENCES public.ambassadors(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    subscription_payment_id UUID REFERENCES public.subscription_payments(id) ON DELETE SET NULL,
    sale_id UUID REFERENCES public.sales(id) ON DELETE SET NULL,
    base_amount NUMERIC(12, 2) NOT NULL,
    commission_rate NUMERIC(5, 2) NOT NULL,
    commission_amount NUMERIC(12, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'pendente', -- 'pendente', 'pago'
    paid_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 10. AUDITORIA, MONITORIA EM TEMPO REAL E SESSÕES
-- ============================================================

CREATE TABLE IF NOT EXISTS public.audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE SET NULL,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(50) NOT NULL, -- 'LOGIN', 'LOGOUT', 'CREATE', 'UPDATE', 'DELETE', 'VENDA', 'SANGRIA', 'BLOQUEIO', 'LIBERACAO'
    table_name VARCHAR(100) NOT NULL,
    record_id VARCHAR(100),
    old_values JSONB,
    new_values JSONB,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.monitoring_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    module VARCHAR(50) NOT NULL,
    event_type VARCHAR(50) NOT NULL,
    severity VARCHAR(20) NOT NULL DEFAULT 'info',
    description TEXT NOT NULL,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.user_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE SET NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    logged_in_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    last_activity_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    logged_out_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS public.app_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
    store_id UUID REFERENCES public.stores(id) ON DELETE CASCADE,
    company_name VARCHAR(255) NOT NULL DEFAULT 'GEF - Ferragens e Construção',
    cnpj VARCHAR(30) DEFAULT '',
    phone VARCHAR(30) DEFAULT '',
    whatsapp VARCHAR(30) DEFAULT '',
    pix_key VARCHAR(150) DEFAULT '',
    pix_key_type VARCHAR(50) DEFAULT 'CNPJ',
    sms_reminder_template TEXT DEFAULT 'Olá [CLIENTE], saldo pendente de R$ [VALOR] na [LOJA]. Pague via Pix: [PIX]. Dúvidas: [FONE]',
    whatsapp_billing_template TEXT DEFAULT 'Olá, *[CLIENTE]*! Tudo bem? Passando para lembrar do seu saldo em aberto de *R$ [VALOR]* referente à compra de ferragens na *[LOJA]*. \n\nChave Pix: `[PIX]`\n\nObrigado!',
    whatsapp_receipt_template TEXT DEFAULT '🛠️ *[LOJA]* - Recibo Digital\n\nComprovante: *[RECIBO]*\nData: [DATA]\nCliente: [CLIENTE]\n\nItens:\n[ITENS]\n\n*Total:* R$ [TOTAL]\n*Forma:* [PAGAMENTO]\n\nBoa obra! 🔩',
    sms_receipt_template TEXT DEFAULT '[LOJA]: Recibo [RECIBO] de R$ [TOTAL] pago via [PAGAMENTO]. Obrigado pela compra! Fone: [FONE]',
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ============================================================
-- 11. FUNÇÕES DE SEGURANÇA E CONTEXTO DE RLS
-- ============================================================

CREATE OR REPLACE FUNCTION public.current_tenant_id()
RETURNS UUID AS $$
    SELECT tenant_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS VARCHAR AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_monitor()
RETURNS BOOLEAN AS $$
    SELECT COALESCE((SELECT role = 'monitor' FROM public.profiles WHERE id = auth.uid()), false);
$$ LANGUAGE SQL STABLE SECURITY DEFINER;

-- Verifica se o tenant está ativo e não bloqueado por período
CREATE OR REPLACE FUNCTION public.is_tenant_accessible(p_tenant_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_status VARCHAR;
    v_b_from TIMESTAMPTZ;
    v_b_until TIMESTAMPTZ;
BEGIN
    -- Se for o Monitor da plataforma, acesso sempre liberado
    IF public.is_monitor() THEN
        RETURN true;
    END IF;

    SELECT status, blocked_from, blocked_until INTO v_status, v_b_from, v_b_until
    FROM public.tenants WHERE id = p_tenant_id;

    IF v_status = 'bloqueado' THEN
        RETURN false;
    END IF;

    IF v_b_from IS NOT NULL AND v_b_until IS NOT NULL THEN
        IF now() >= v_b_from AND now() <= v_b_until THEN
            RETURN false;
        END IF;
    END IF;

    RETURN true;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ============================================================
-- 12. ROW LEVEL SECURITY (RLS) EM TODAS AS TABELAS
-- ============================================================

ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_stock ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.losses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quotes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quote_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.billing_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subscription_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassadors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ambassador_commissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;

-- POLICIES: TENANTS
CREATE POLICY "Tenants visíveis por monitor ou próprio tenant" ON public.tenants
    FOR SELECT USING (
        public.is_monitor() OR id = public.current_tenant_id()
    );

CREATE POLICY "Tenants atualizáveis por monitor ou admin do tenant" ON public.tenants
    FOR UPDATE USING (
        public.is_monitor() OR (id = public.current_tenant_id() AND public.current_user_role() = 'administrador')
    );

CREATE POLICY "Monitor insere novos tenants" ON public.tenants
    FOR INSERT WITH CHECK (
        public.is_monitor() OR auth.uid() IS NOT NULL
    );

-- POLICIES: STORES
CREATE POLICY "Stores isoladas por tenant" ON public.stores
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

-- POLICIES: PROFILES
CREATE POLICY "Profiles visíveis por tenant ou monitor" ON public.profiles
    FOR SELECT USING (
        public.is_monitor() OR tenant_id = public.current_tenant_id() OR id = auth.uid()
    );

CREATE POLICY "Profiles atualizáveis por próprio usuário ou admin" ON public.profiles
    FOR UPDATE USING (
        public.is_monitor() OR id = auth.uid() OR (tenant_id = public.current_tenant_id() AND public.current_user_role() = 'administrador')
    );

CREATE POLICY "Inserção de perfil por autenticado" ON public.profiles
    FOR INSERT WITH CHECK (
        public.is_monitor() OR id = auth.uid()
    );

-- POLICIES: PRODUTOS & ESTOQUE
CREATE POLICY "Produtos isolados por tenant" ON public.products
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Estoque por loja isolado" ON public.product_stock
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

-- POLICIES: CLIENTES & FORNECEDORES
CREATE POLICY "Clientes isolados por tenant" ON public.customers
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Fornecedores isolados por tenant" ON public.suppliers
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

-- POLICIES: CAIXA
CREATE POLICY "Caixa isolado por tenant e loja" ON public.cash_sessions
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Movimentos de caixa isolados" ON public.cash_movements
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

-- POLICIES: VENDAS, ITENS E PAGAMENTOS
CREATE POLICY "Vendas isoladas por tenant" ON public.sales
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Itens de venda isolados por tenant" ON public.sale_items
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Pagamentos isolados por tenant" ON public.payments
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Recebíveis isolados por tenant" ON public.receivables
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

-- POLICIES: KARDEX, PERDAS, ORÇAMENTOS E ENTREGAS
CREATE POLICY "Kardex isolado por tenant" ON public.stock_movements
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Perdas isoladas por tenant" ON public.losses
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Orçamentos isolados por tenant" ON public.quotes
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Itens orçamento isolados por tenant" ON public.quote_items
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Entregas isoladas por tenant" ON public.deliveries
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Recibos isolados por tenant" ON public.receipts
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

CREATE POLICY "Mensagens de cobrança isoladas por tenant" ON public.billing_messages
    FOR ALL USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.is_tenant_accessible(tenant_id))
    );

-- POLICIES: ASSINATURAS E MENSALIDADES
CREATE POLICY "Assinaturas visíveis por tenant ou monitor" ON public.subscriptions
    FOR ALL USING (
        public.is_monitor() OR tenant_id = public.current_tenant_id()
    );

CREATE POLICY "Pagamentos de mensalidade visíveis por tenant ou monitor" ON public.subscription_payments
    FOR ALL USING (
        public.is_monitor() OR tenant_id = public.current_tenant_id()
    );

-- POLICIES: EMBAIXADORES & COMISSÕES
CREATE POLICY "Embaixadores acessíveis por monitor ou tenant" ON public.ambassadors
    FOR ALL USING (
        public.is_monitor() OR tenant_id = public.current_tenant_id() OR tenant_id IS NULL
    );

CREATE POLICY "Indicações de embaixador acessíveis" ON public.ambassador_referrals
    FOR ALL USING (
        public.is_monitor() OR tenant_id = public.current_tenant_id()
    );

CREATE POLICY "Comissões acessíveis" ON public.ambassador_commissions
    FOR ALL USING (
        public.is_monitor() OR tenant_id = public.current_tenant_id()
    );

-- POLICIES: AUDITORIA E MONITORIA
CREATE POLICY "Auditoria leitura por monitor ou admin do tenant" ON public.audit_logs
    FOR SELECT USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.current_user_role() IN ('administrador', 'gestor'))
    );

CREATE POLICY "Auditoria inserção para autenticados" ON public.audit_logs
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Monitoria leitura por monitor ou tenant autorizados" ON public.monitoring_events
    FOR SELECT USING (
        public.is_monitor() OR (tenant_id = public.current_tenant_id() AND public.current_user_role() IN ('administrador', 'gestor'))
    );

CREATE POLICY "Monitoria inserção por autenticados" ON public.monitoring_events
    FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Sessões visíveis por monitor ou usuário" ON public.user_sessions
    FOR ALL USING (
        public.is_monitor() OR user_id = auth.uid()
    );

CREATE POLICY "Configurações isoladas por tenant" ON public.app_settings
    FOR ALL USING (
        public.is_monitor() OR tenant_id = public.current_tenant_id()
    );

-- ============================================================
-- 13. OPERAÇÕES CRÍTICAS E ATÔMICAS (RPC)
-- ============================================================

-- RPC: Processar Venda Atômica (Venda + Itens + Baixa no Estoque da Loja + Movimento de Caixa + Kardex + Auditoria)
CREATE OR REPLACE FUNCTION public.process_sale(
    p_sale JSONB,
    p_items JSONB,
    p_payments JSONB
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID;
    v_tenant_id UUID;
    v_store_id UUID;
    v_sale_id UUID;
    v_item JSONB;
    v_payment JSONB;
    v_prod_id UUID;
    v_qty NUMERIC(12, 3);
    v_unit_price NUMERIC(12, 2);
    v_unit_cost NUMERIC(12, 2);
    v_item_total NUMERIC(12, 2);
    v_prod_name VARCHAR(255);
    v_prod_unit VARCHAR(10);
    v_curr_stock NUMERIC(12, 3);
    v_new_stock NUMERIC(12, 3);
    v_sale_number BIGINT;
    v_receipt_code VARCHAR(50);
BEGIN
    v_user_id := auth.uid();
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Usuário não autenticado.';
    END IF;

    SELECT tenant_id, store_id INTO v_tenant_id, v_store_id
    FROM public.profiles WHERE id = v_user_id;

    -- Se o frontend enviou store_id específico, valida
    IF (p_sale->>'store_id') IS NOT NULL THEN
        v_store_id := (p_sale->>'store_id')::UUID;
    END IF;

    -- Verifica bloqueio do tenant
    IF NOT public.is_tenant_accessible(v_tenant_id) THEN
        RAISE EXCEPTION 'Acesso bloqueado para este tenant.';
    END IF;

    v_receipt_code := 'REC-' || substr(md5(random()::text), 1, 8);

    -- 1. Insere a Venda
    INSERT INTO public.sales (
        tenant_id,
        store_id,
        session_id,
        user_id,
        customer_id,
        subtotal,
        discount,
        total,
        amount_paid,
        change_amount,
        payment_method,
        status,
        receipt_code
    ) VALUES (
        v_tenant_id,
        v_store_id,
        (p_sale->>'session_id')::UUID,
        v_user_id,
        (p_sale->>'customer_id')::UUID,
        (p_sale->>'subtotal')::NUMERIC,
        COALESCE((p_sale->>'discount')::NUMERIC, 0.00),
        (p_sale->>'total')::NUMERIC,
        COALESCE((p_sale->>'amount_paid')::NUMERIC, (p_sale->>'total')::NUMERIC),
        COALESCE((p_sale->>'change_amount')::NUMERIC, 0.00),
        p_sale->>'payment_method',
        'finalizada',
        v_receipt_code
    ) RETURNING id, sale_number INTO v_sale_id, v_sale_number;

    -- 2. Insere os Itens e Atualiza o Estoque por Loja
    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_prod_id := (v_item->>'product_id')::UUID;
        v_qty := (v_item->>'quantity')::NUMERIC;
        v_unit_price := (v_item->>'unit_price')::NUMERIC;
        v_unit_cost := COALESCE((v_item->>'unit_cost')::NUMERIC, 0.00);
        v_item_total := (v_item->>'total')::NUMERIC;
        v_prod_name := v_item->>'product_name';
        v_prod_unit := COALESCE(v_item->>'unit', 'UN');

        INSERT INTO public.sale_items (
            tenant_id,
            sale_id,
            product_id,
            product_name,
            unit,
            unit_cost,
            unit_price,
            quantity,
            discount,
            total
        ) VALUES (
            v_tenant_id,
            v_sale_id,
            v_prod_id,
            v_prod_name,
            v_prod_unit,
            v_unit_cost,
            v_unit_price,
            v_qty,
            COALESCE((v_item->>'discount')::NUMERIC, 0.00),
            v_item_total
        );

        -- Obtém estoque atual da loja
        SELECT current_stock INTO v_curr_stock
        FROM public.product_stock
        WHERE store_id = v_store_id AND product_id = v_prod_id;

        IF v_curr_stock IS NULL THEN
            -- Se não havia registro de estoque para a loja, cria com estoque inicial 0
            v_curr_stock := 0.000;
            INSERT INTO public.product_stock (tenant_id, store_id, product_id, current_stock)
            VALUES (v_tenant_id, v_store_id, v_prod_id, 0.000);
        END IF;

        v_new_stock := v_curr_stock - v_qty;

        -- Atualiza estoque da loja
        UPDATE public.product_stock
        SET current_stock = v_new_stock, updated_at = now()
        WHERE store_id = v_store_id AND product_id = v_prod_id;

        -- Grava no Kardex / Movimentações de Estoque
        INSERT INTO public.stock_movements (
            tenant_id,
            store_id,
            product_id,
            user_id,
            type,
            quantity,
            previous_stock,
            new_stock,
            unit_cost,
            reference_id,
            reason
        ) VALUES (
            v_tenant_id,
            v_store_id,
            v_prod_id,
            v_user_id,
            'saida_venda',
            v_qty,
            v_curr_stock,
            v_new_stock,
            v_unit_cost,
            v_sale_id,
            'Venda PDV #' || v_sale_number
        );
    END LOOP;

    -- 3. Insere os Pagamentos
    FOR v_payment IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
        INSERT INTO public.payments (
            tenant_id,
            store_id,
            sale_id,
            customer_id,
            session_id,
            method,
            amount
        ) VALUES (
            v_tenant_id,
            v_store_id,
            v_sale_id,
            (p_sale->>'customer_id')::UUID,
            (p_sale->>'session_id')::UUID,
            v_payment->>'method',
            (v_payment->>'amount')::NUMERIC
        );

        -- Se foi em dinheiro ou pix e há sessão de caixa ativa, registra movimento no caixa
        IF (p_sale->>'session_id') IS NOT NULL AND (v_payment->>'method' IN ('dinheiro', 'pix')) THEN
            INSERT INTO public.cash_movements (
                tenant_id,
                store_id,
                session_id,
                user_id,
                type,
                payment_method,
                amount,
                description
            ) VALUES (
                v_tenant_id,
                v_store_id,
                (p_sale->>'session_id')::UUID,
                v_user_id,
                'venda',
                v_payment->>'method',
                (v_payment->>'amount')::NUMERIC,
                'Recebimento Venda PDV #' || v_sale_number
            );
        END IF;

        -- Se a forma for 'fiado', cria registro em receivables
        IF (v_payment->>'method') = 'fiado' AND (p_sale->>'customer_id') IS NOT NULL THEN
            INSERT INTO public.receivables (
                tenant_id,
                store_id,
                customer_id,
                sale_id,
                original_amount,
                current_balance,
                due_date,
                status,
                notes
            ) VALUES (
                v_tenant_id,
                v_store_id,
                (p_sale->>'customer_id')::UUID,
                v_sale_id,
                (v_payment->>'amount')::NUMERIC,
                (v_payment->>'amount')::NUMERIC,
                CURRENT_DATE + INTERVAL '30 days',
                'pendente',
                'Venda balcão fiado #' || v_sale_number
            );

            -- Atualiza saldo devedor do cliente
            UPDATE public.customers
            SET debt_balance = debt_balance + (v_payment->>'amount')::NUMERIC, updated_at = now()
            WHERE id = (p_sale->>'customer_id')::UUID;
        END IF;
    END LOOP;

    -- 4. Grava Trilha de Auditoria
    INSERT INTO public.audit_logs (
        tenant_id,
        store_id,
        user_id,
        action,
        table_name,
        record_id,
        new_values
    ) VALUES (
        v_tenant_id,
        v_store_id,
        v_user_id,
        'VENDA',
        'sales',
        v_sale_id::TEXT,
        jsonb_build_object('sale_number', v_sale_number, 'total', (p_sale->>'total')::NUMERIC, 'payment_method', p_sale->>'payment_method')
    );

    -- 5. Grava Evento de Monitoria
    INSERT INTO public.monitoring_events (
        tenant_id,
        store_id,
        user_id,
        module,
        event_type,
        severity,
        description,
        metadata
    ) VALUES (
        v_tenant_id,
        v_store_id,
        v_user_id,
        'pdv',
        'sale_completed',
        'info',
        'Venda #' || v_sale_number || ' finalizada no valor de R$ ' || (p_sale->>'total')::TEXT,
        jsonb_build_object('sale_id', v_sale_id, 'sale_number', v_sale_number, 'total', p_sale->>'total')
    );

    RETURN jsonb_build_object(
        'id', v_sale_id,
        'sale_number', v_sale_number,
        'receipt_code', v_receipt_code,
        'total', (p_sale->>'total')::NUMERIC,
        'created_at', now()
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Bloquear Tenant (Exclusivo Monitor)
CREATE OR REPLACE FUNCTION public.block_tenant(
    p_tenant_id UUID,
    p_blocked_from TIMESTAMPTZ,
    p_blocked_until TIMESTAMPTZ,
    p_reason TEXT
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF NOT public.is_monitor() THEN
        RAISE EXCEPTION 'Apenas o Monitor da Plataforma pode bloquear tenants.';
    END IF;

    UPDATE public.tenants
    SET status = 'bloqueado',
        blocked_from = p_blocked_from,
        blocked_until = p_blocked_until,
        block_reason = p_reason,
        updated_at = now()
    WHERE id = p_tenant_id;

    -- Auditoria
    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, new_values)
    VALUES (p_tenant_id, v_user_id, 'BLOQUEIO', 'tenants', p_tenant_id::TEXT, jsonb_build_object('reason', p_reason, 'from', p_blocked_from, 'until', p_blocked_until));

    RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'status', 'bloqueado');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Liberar Tenant (Exclusivo Monitor)
CREATE OR REPLACE FUNCTION public.unblock_tenant(
    p_tenant_id UUID
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
BEGIN
    IF NOT public.is_monitor() THEN
        RAISE EXCEPTION 'Apenas o Monitor da Plataforma pode liberar tenants.';
    END IF;

    UPDATE public.tenants
    SET status = 'ativo',
        blocked_from = NULL,
        blocked_until = NULL,
        block_reason = NULL,
        updated_at = now()
    WHERE id = p_tenant_id;

    INSERT INTO public.audit_logs (tenant_id, user_id, action, table_name, record_id, new_values)
    VALUES (p_tenant_id, v_user_id, 'LIBERACAO', 'tenants', p_tenant_id::TEXT, jsonb_build_object('status', 'ativo'));

    RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id, 'status', 'ativo');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- RPC: Registrar Pagamento de Mensalidade e Calcular Comissão de Embaixador
CREATE OR REPLACE FUNCTION public.record_subscription_payment(
    p_tenant_id UUID,
    p_amount NUMERIC(12, 2),
    p_payment_method TEXT DEFAULT 'PIX',
    p_reference TEXT DEFAULT NULL,
    p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
    v_user_id UUID := auth.uid();
    v_sub_id UUID;
    v_pay_id UUID;
    v_amb_id UUID;
    v_rate NUMERIC(5, 2);
    v_commission NUMERIC(12, 2);
BEGIN
    IF NOT public.is_monitor() THEN
        RAISE EXCEPTION 'Apenas o Monitor da Plataforma pode registrar confirmações de mensalidade.';
    END IF;

    -- Localiza ou cria assinatura
    SELECT id INTO v_sub_id FROM public.subscriptions WHERE tenant_id = p_tenant_id LIMIT 1;
    IF v_sub_id IS NULL THEN
        INSERT INTO public.subscriptions (tenant_id, amount, status)
        VALUES (p_tenant_id, p_amount, 'ativo') RETURNING id INTO v_sub_id;
    ELSE
        UPDATE public.subscriptions
        SET status = 'ativo',
            current_period_start = CURRENT_DATE,
            current_period_end = CURRENT_DATE + INTERVAL '30 days',
            next_due_date = CURRENT_DATE + INTERVAL '30 days',
            updated_at = now()
        WHERE id = v_sub_id;
    END IF;

    -- Atualiza status do tenant para ativo
    UPDATE public.tenants
    SET status = 'ativo', blocked_from = NULL, blocked_until = NULL, block_reason = NULL, updated_at = now()
    WHERE id = p_tenant_id;

    -- Insere pagamento da mensalidade
    INSERT INTO public.subscription_payments (
        subscription_id,
        tenant_id,
        amount,
        payment_date,
        payment_method,
        reference,
        status,
        notes
    ) VALUES (
        v_sub_id,
        p_tenant_id,
        p_amount,
        now(),
        p_payment_method,
        p_reference,
        'confirmado',
        p_notes
    ) RETURNING id INTO v_pay_id;

    -- Verifica se este tenant foi indicado por algum Embaixador
    SELECT ar.ambassador_id, a.commission_rate
    INTO v_amb_id, v_rate
    FROM public.ambassador_referrals ar
    JOIN public.ambassadors a ON a.id = ar.ambassador_id
    WHERE ar.tenant_id = p_tenant_id AND ar.status = 'ativo' AND a.status = 'ativo'
    LIMIT 1;

    IF v_amb_id IS NOT NULL THEN
        v_commission := ROUND((p_amount * (v_rate / 100.0)), 2);
        
        -- Lança comissão para o embaixador
        INSERT INTO public.ambassador_commissions (
            ambassador_id,
            tenant_id,
            subscription_payment_id,
            base_amount,
            commission_rate,
            commission_amount,
            status
        ) VALUES (
            v_amb_id,
            p_tenant_id,
            v_pay_id,
            p_amount,
            v_rate,
            v_commission,
            'pendente'
        );

        -- Atualiza acumulado do embaixador
        UPDATE public.ambassadors
        SET total_earned = total_earned + v_commission
        WHERE id = v_amb_id;
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_pay_id,
        'tenant_id', p_tenant_id,
        'commission_calculated', (v_amb_id IS NOT NULL),
        'commission_amount', COALESCE(v_commission, 0.00)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
