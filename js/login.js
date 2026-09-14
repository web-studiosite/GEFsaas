/**
 * GEF - Gestor de Ferragem
 * login.js - Controlador da Tela de Autenticação e Registro de Tenant
 */

import { loginUser } from './auth.js';
import { supabase, isSupabaseConfigured } from './supabase.js';
import { navigateTo } from './router.js';
import { showToast } from './toast.js';

export async function init() {
  const loginForm = document.getElementById('login-form');
  const registerForm = document.getElementById('register-form');
  const tabBtnLogin = document.getElementById('tab-btn-login');
  const tabBtnRegister = document.getElementById('tab-btn-register');
  const alertContainer = document.getElementById('login-alert-container');

  const emailInput = document.getElementById('login-email');
  const passwordInput = document.getElementById('login-password');
  const btnSubmitLogin = document.getElementById('btn-submit-login');

  // Verifica se há código de indicação de embaixador na URL (?ref=... ou #login?ref=...)
  const urlParams = new URLSearchParams(window.location.search || window.location.hash.split('?')[1] || '');
  const refCode = urlParams.get('ref');
  const regReferralInput = document.getElementById('reg-referral-code');
  if (refCode && regReferralInput) {
    regReferralInput.value = refCode.toUpperCase();
    // Alterna para aba de cadastro automaticamente quando houver link de indicação
    activateTab('register');
  }

  function activateTab(tab) {
    if (!loginForm || !registerForm) return;
    if (tab === 'login') {
      loginForm.style.display = 'block';
      registerForm.style.display = 'none';
      tabBtnLogin.style.background = '#d97706';
      tabBtnLogin.style.color = '#ffffff';
      tabBtnRegister.style.background = 'transparent';
      tabBtnRegister.style.color = '#94a3b8';
    } else {
      loginForm.style.display = 'none';
      registerForm.style.display = 'block';
      tabBtnRegister.style.background = '#d97706';
      tabBtnRegister.style.color = '#ffffff';
      tabBtnLogin.style.background = 'transparent';
      tabBtnLogin.style.color = '#94a3b8';
    }
  }

  tabBtnLogin?.addEventListener('click', () => activateTab('login'));
  tabBtnRegister?.addEventListener('click', () => activateTab('register'));

  function showAlert(message, type = 'danger') {
    if (!alertContainer) return;
    const bg = type === 'danger' ? '#7f1d1d' : '#14532d';
    const border = type === 'danger' ? '#ef4444' : '#22c55e';
    alertContainer.innerHTML = `
      <div style="background: ${bg}; border: 1px solid ${border}; color: #ffffff; padding: 12px 14px; border-radius: 6px; font-size: 0.875rem; margin-bottom: 16px;">
        ${message}
      </div>
    `;
  }

  // 1. SUBMIT LOGIN
  loginForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertContainer) alertContainer.innerHTML = '';

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;

    if (!email || !password) {
      showAlert('Preencha o e-mail e a senha.');
      return;
    }

    try {
      btnSubmitLogin.disabled = true;
      btnSubmitLogin.textContent = 'Autenticando no Supabase...';

      await loginUser(email, password);
      showToast('Login realizado com sucesso!', 'success');
      navigateTo('dashboard');
    } catch (err) {
      console.error('Falha de login:', err);
      showAlert(err.message || 'Falha ao autenticar.');
    } finally {
      btnSubmitLogin.disabled = false;
      btnSubmitLogin.textContent = 'Entrar no Sistema';
    }
  });

  // 2. SUBMIT REGISTRO DE NOVO TENANT
  registerForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (alertContainer) alertContainer.innerHTML = '';

    if (!isSupabaseConfigured() || !supabase) {
      showAlert('Supabase não configurado. Defina a URL e a chave pública antes de criar contas.');
      return;
    }

    const companyName = document.getElementById('reg-company-name')?.value.trim();
    const documentVal = document.getElementById('reg-document')?.value.trim();
    const adminName = document.getElementById('reg-admin-name')?.value.trim();
    const email = document.getElementById('reg-email')?.value.trim();
    const password = document.getElementById('reg-password')?.value;
    const referralCode = document.getElementById('reg-referral-code')?.value.trim();
    const btnSubmitReg = document.getElementById('btn-submit-register');

    if (!companyName || !documentVal || !adminName || !email || !password) {
      showAlert('Preencha todos os campos obrigatórios.');
      return;
    }

    try {
      btnSubmitReg.disabled = true;
      btnSubmitReg.textContent = 'Criando empresa e credenciais...';

      // 1. Cria usuário no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { full_name: adminName }
        }
      });

      if (authError) throw authError;
      const user = authData.user;
      if (!user) throw new Error('Não foi possível registrar o usuário no Supabase Auth.');

      // 2. Cria Tenant no PostgreSQL
      const { data: tenant, error: tenantError } = await supabase
        .from('tenants')
        .insert([{
          name: companyName,
          trade_name: companyName,
          document: documentVal,
          email: email,
          status: 'ativo'
        }])
        .select()
        .single();

      if (tenantError) throw tenantError;

      // 3. Cria Loja Matriz
      const { data: store, error: storeError } = await supabase
        .from('stores')
        .insert([{
          tenant_id: tenant.id,
          name: `${companyName} - Matriz`,
          code: 'LOJA-01'
        }])
        .select()
        .single();

      if (storeError) throw storeError;

      // 4. Cria Perfil de Administrador do Tenant
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: user.id,
          tenant_id: tenant.id,
          store_id: store.id,
          full_name: adminName,
          email: email,
          role: 'administrador',
          is_active: true
        }]);

      if (profileError) throw profileError;

      // 5. Se houver código de indicação de Embaixador, registra vínculo
      if (referralCode) {
        try {
          const { data: amb } = await supabase
            .from('ambassadors')
            .select('id')
            .eq('referral_code', referralCode.toUpperCase())
            .single();

          if (amb) {
            await supabase.from('ambassador_referrals').insert([{
              ambassador_id: amb.id,
              tenant_id: tenant.id,
              referral_code: referralCode.toUpperCase(),
              status: 'ativo'
            }]);
          }
        } catch (ambErr) {
          console.warn('Vínculo de embaixador não aplicado:', ambErr);
        }
      }

      showToast('Empresa e conta criadas com sucesso!', 'success');

      // Tenta login direto
      await loginUser(email, password);
      navigateTo('dashboard');
    } catch (err) {
      console.error('Erro no registro:', err);
      showAlert(`Erro ao cadastrar: ${err.message}`);
    } finally {
      btnSubmitReg.disabled = false;
      btnSubmitReg.textContent = 'Criar Minha Conta & Ferragem';
    }
  });
}
