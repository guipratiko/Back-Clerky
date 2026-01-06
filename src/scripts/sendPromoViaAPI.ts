/**
 * Script para enviar notificação promocional via API
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/sendPromoViaAPI.ts
 * 
 * Ou com parâmetros:
 * EMAIL=seu@email.com PASSWORD=suasenha ts-node-dev --transpile-only src/scripts/sendPromoViaAPI.ts
 */

import dotenv from 'dotenv';
import axios from 'axios';

// Carregar variáveis de ambiente
dotenv.config();

// Permitir especificar a URL do servidor via variável de ambiente
// Exemplo: API_URL=https://back.clerky.com.br npm run send-promo-api
const API_BASE_URL = process.env.API_URL || process.env.BACKEND_URL || 'http://localhost:4331';

interface LoginResponse {
  status: string;
  token: string;
  user: any;
}

interface SendPromotionResponse {
  status: string;
  message: string;
  result: {
    totalDevices: number;
    successCount: number;
    failedCount: number;
    errors: string[];
  };
}

async function sendPromoViaAPI() {
  try {
    // Credenciais do usuário (pode ser passado via variáveis de ambiente)
    const email = process.env.EMAIL || process.argv[2] || '';
    const password = process.env.PASSWORD || process.argv[3] || '';

    if (!email || !password) {
      console.error('❌ Email e senha são obrigatórios');
      console.log('\nUso:');
      console.log('  EMAIL=seu@email.com PASSWORD=suasenha npm run send-promo-api');
      console.log('  ou');
      console.log('  ts-node-dev --transpile-only src/scripts/sendPromoViaAPI.ts seu@email.com suasenha');
      console.log('\nPara produção:');
      console.log('  API_URL=https://back.clerky.com.br EMAIL=seu@email.com PASSWORD=suasenha npm run send-promo-api');
      process.exit(1);
    }

    console.log(`🌐 Servidor: ${API_BASE_URL}`);
    console.log('🔐 Fazendo login...');
    
    // Fazer login para obter token
    const loginResponse = await axios.post<LoginResponse>(
      `${API_BASE_URL}/api/auth/login`,
      { email, password },
      {
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    if (loginResponse.data.status !== 'success' || !loginResponse.data.token) {
      console.error('❌ Erro ao fazer login:', loginResponse.data);
      process.exit(1);
    }

    const token = loginResponse.data.token;
    console.log('✅ Login realizado com sucesso');
    console.log(`👤 Usuário: ${loginResponse.data.user.name} (${loginResponse.data.user.email})\n`);

    // Dados da notificação promocional
    const promotionData = {
      title: '🎉 Promoção Especial!',
      body: 'Aproveite nossa oferta especial por tempo limitado!',
      data: {
        promoId: 'promo-' + Date.now(),
        url: 'https://clerky.com.br/promo',
      },
      filters: {
        platform: 'ios' as const,
        // isPremium: true, // Descomente para enviar apenas para premium
        // isPremium: false, // Descomente para enviar apenas para não-premium
      },
    };

    console.log('📤 Enviando notificação promocional...');
    console.log(`Título: ${promotionData.title}`);
    console.log(`Corpo: ${promotionData.body}\n`);

    // Enviar notificação promocional
    const promoResponse = await axios.post<SendPromotionResponse>(
      `${API_BASE_URL}/api/admin/send-promotion`,
      promotionData,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        timeout: 30000, // 30 segundos (pode demorar se houver muitos dispositivos)
      }
    );

    if (promoResponse.data.status === 'success') {
      console.log('✅ Notificação promocional enviada com sucesso!\n');
      console.log('📊 Resultado:');
      console.log(`   Total de dispositivos: ${promoResponse.data.result.totalDevices}`);
      console.log(`   ✅ Sucessos: ${promoResponse.data.result.successCount}`);
      console.log(`   ❌ Falhas: ${promoResponse.data.result.failedCount}`);

      if (promoResponse.data.result.errors.length > 0) {
        console.log('\n⚠️ Erros encontrados:');
        promoResponse.data.result.errors.forEach((error, index) => {
          console.log(`   ${index + 1}. ${error}`);
        });
      }
    } else {
      console.error('❌ Erro ao enviar notificação:', promoResponse.data);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        console.error('❌ Erro da API:', error.response.status, error.response.data);
      } else if (error.request) {
        console.error('❌ Erro de conexão: Servidor não respondeu');
        console.error('   Verifique se o servidor está rodando em', API_BASE_URL);
      } else {
        console.error('❌ Erro:', error.message);
      }
    } else {
      console.error('❌ Erro desconhecido:', error);
    }
    process.exit(1);
  }
}

// Executar
sendPromoViaAPI();

