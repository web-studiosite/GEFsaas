/**
 * GEF - Gestor de Ferragem
 * supabase.js - Ponto Único de Criação do Cliente Supabase
 */

import { getStoredConfig } from './config.js';

// Importação nativa ES Module do Supabase JS oficial
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

let supabaseClient = null;
let currentConfig = getStoredConfig();

export function initSupabase(url, key) {
  const supabaseUrl = url || currentConfig.supabaseUrl;
  const supabaseKey = key || currentConfig.supabaseAnonKey;

  if (!supabaseUrl || !supabaseKey || supabaseUrl.includes('placeholder') || supabaseUrl.includes('xyzcompany')) {
    console.warn('[GEF Supabase] Supabase URL ou Anon Key não configuradas com projeto real.');
  }

  try {
    supabaseClient = createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    });
  } catch (err) {
    console.error('[GEF Supabase] Falha ao instanciar createClient:', err);
  }

  return supabaseClient;
}

// Inicializa instância padrão
supabaseClient = initSupabase(currentConfig.supabaseUrl, currentConfig.supabaseAnonKey);

export const supabase = supabaseClient;

// Verifica se as chaves configuradas parecem reais
export function isSupabaseConfigured() {
  const cfg = getStoredConfig();
  return (
    cfg.supabaseUrl &&
    cfg.supabaseAnonKey &&
    !cfg.supabaseUrl.includes('placeholder') &&
    !cfg.supabaseUrl.includes('xyzcompany') &&
    cfg.supabaseUrl.startsWith('https://')
  );
}

// Testa a conexão ativa com o Supabase
export async function testSupabaseConnection() {
  if (!supabase) return { ok: false, message: 'Cliente Supabase não inicializado.' };
  try {
    const { data, error } = await supabase.from('products').select('id').limit(1);
    if (error) {
      // Se a tabela ainda não existe, verifica se pelo menos o endpoint respondeu
      if (error.code === '42P01') {
        return { 
          ok: true, 
          tablesMissing: true, 
          message: 'Conectado ao Supabase com sucesso! Porém as tabelas ainda não foram criadas. Execute o script supabase_schema.sql no SQL Editor.' 
        };
      }
      return { ok: false, message: `Erro ao consultar Supabase: ${error.message}` };
    }
    return { ok: true, tablesMissing: false, message: 'Conexão ativa e tabelas prontas!' };
  } catch (e) {
    return { ok: false, message: `Falha de rede ou configuração: ${e.message}` };
  }
}
