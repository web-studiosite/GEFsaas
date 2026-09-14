/**
 * GEF - Gestor de Ferragem
 * auth.js - Autenticação Real e Exclusiva via Supabase Auth & Profile RLS
 */

import { supabase, isSupabaseConfigured } from './supabase.js';
import { setState, getState } from './state.js';

/**
 * Realiza login através do Supabase Auth com validação de Profile, Tenant e Bloqueio
 */
export async function loginUser(email, password) {
  if (!email || !password) {
    throw new Error('Informe o e-mail e a senha de acesso.');
  }

  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase não configurado. Defina a URL e a Anon Key nas configurações do sistema.');
  }

  // 1. Supabase Auth real
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) {
    if (error.message.includes('Invalid login credentials')) {
      throw new Error('Falha na autenticação: E-mail ou senha incorretos.');
    }
    throw new Error(`Falha na autenticação: ${error.message}`);
  }

  const user = data.user;
  if (!user) {
    throw new Error('Usuário não retornado pelo serviço de autenticação.');
  }

  setState('currentUser', user);

  // 2. Carrega profile real do Supabase
  const profile = await fetchUserProfile(user.id, user.email);
  if (!profile) {
    await supabase.auth.signOut();
    setState('currentUser', null);
    throw new Error('Perfil de usuário não encontrado no banco de dados. Solicite o cadastro ao administrador.');
  }

  // 3. Validação de bloqueio do Tenant (exceto para o Monitor da Plataforma)
  if (profile.role !== 'monitor' && profile.tenant) {
    const isStatusBlocked = ['bloqueado', 'suspenso'].includes(profile.tenant.status);
    let isPeriodBlocked = false;

    if (profile.tenant.blocked_from && profile.tenant.blocked_until) {
      const now = new Date();
      const bFrom = new Date(profile.tenant.blocked_from);
      const bUntil = new Date(profile.tenant.blocked_until);
      if (now >= bFrom && now <= bUntil) {
        isPeriodBlocked = true;
      }
    }

    if (isStatusBlocked || isPeriodBlocked) {
      await supabase.auth.signOut();
      setState('currentUser', null);
      setState('userProfile', null);
      const reason = profile.tenant.block_reason || 'Bloqueio administrativo ou vencimento de mensalidade';
      throw new Error(`Acesso bloqueado para este tenant. Motivo: ${reason}.`);
    }
  }

  setState('userProfile', profile);

  // 4. Registra sessão e auditoria de login
  try {
    await supabase.from('audit_logs').insert([{
      tenant_id: profile.tenant_id,
      store_id: profile.store_id,
      user_id: profile.id,
      action: 'LOGIN',
      table_name: 'auth.users',
      record_id: user.id,
      new_values: { email: user.email, role: profile.role }
    }]);

    await supabase.from('user_sessions').insert([{
      user_id: profile.id,
      tenant_id: profile.tenant_id,
      store_id: profile.store_id,
      user_agent: navigator.userAgent
    }]);
  } catch (e) {
    console.warn('Registro de auditoria de login:', e);
  }

  return { user, profile };
}

/**
 * Logout real do Supabase
 */
export async function logoutUser() {
  const profile = getState('userProfile');
  if (profile && supabase) {
    try {
      await supabase.from('audit_logs').insert([{
        tenant_id: profile.tenant_id,
        store_id: profile.store_id,
        user_id: profile.id,
        action: 'LOGOUT',
        table_name: 'auth.users',
        record_id: profile.id
      }]);
    } catch (e) {
      // silencioso no logout
    }
  }

  setState('currentUser', null);
  setState('userProfile', null);
  setState('activeCashSession', null);

  if (isSupabaseConfigured() && supabase) {
    try {
      await supabase.auth.signOut();
    } catch (e) {
      console.warn('Aviso no signOut:', e);
    }
  }
}

/**
 * Checa a sessão atual ativa no Supabase
 */
export async function checkCurrentSession() {
  if (!isSupabaseConfigured() || !supabase) {
    return null;
  }

  try {
    const { data: { session }, error } = await supabase.auth.getSession();
    if (error || !session?.user) {
      setState('currentUser', null);
      setState('userProfile', null);
      return null;
    }

    setState('currentUser', session.user);
    const profile = await fetchUserProfile(session.user.id, session.user.email);
    
    if (!profile) {
      setState('currentUser', null);
      setState('userProfile', null);
      return null;
    }

    // Valida se o tenant está bloqueado
    if (profile.role !== 'monitor' && profile.tenant) {
      const isStatusBlocked = ['bloqueado', 'suspenso'].includes(profile.tenant.status);
      let isPeriodBlocked = false;
      if (profile.tenant.blocked_from && profile.tenant.blocked_until) {
        const now = new Date();
        if (now >= new Date(profile.tenant.blocked_from) && now <= new Date(profile.tenant.blocked_until)) {
          isPeriodBlocked = true;
        }
      }
      if (isStatusBlocked || isPeriodBlocked) {
        await supabase.auth.signOut();
        setState('currentUser', null);
        setState('userProfile', null);
        return null;
      }
    }

    setState('userProfile', profile);
    return profile;
  } catch (err) {
    console.error('Erro ao verificar sessão atual:', err);
    setState('currentUser', null);
    setState('userProfile', null);
    return null;
  }
}

/**
 * Inicializa listener de autenticação
 */
export async function initAuth() {
  const profile = await checkCurrentSession();

  if (isSupabaseConfigured() && supabase) {
    try {
      supabase.auth.onAuthStateChange(async (event, session) => {
        if (event === 'SIGNED_IN' && session?.user) {
          setState('currentUser', session.user);
          const p = await fetchUserProfile(session.user.id, session.user.email);
          setState('userProfile', p);
        } else if (event === 'SIGNED_OUT') {
          setState('currentUser', null);
          setState('userProfile', null);
          setState('activeCashSession', null);
        }
      });
    } catch (e) {
      console.warn('Erro no listener onAuthStateChange:', e);
    }
  }

  return profile;
}

/**
 * Busca perfil real no PostgreSQL/Supabase
 */
export async function fetchUserProfile(userId, email) {
  if (!supabase) return null;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*, store:stores(*), tenant:tenants(*)')
      .eq('id', userId)
      .single();

    if (error) {
      console.error('Erro ao buscar perfil:', error.message);
      return null;
    }

    return data;
  } catch (e) {
    console.error('Exceção ao buscar perfil do usuário:', e);
    return null;
  }
}
