/**
 * Script para verificar device tokens no banco
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/checkDeviceTokens.ts
 */

import dotenv from 'dotenv';
import { connectAllDatabases } from '../config/databases';
import DeviceToken from '../models/DeviceToken';

// Carregar variáveis de ambiente
dotenv.config();

async function checkDeviceTokens() {
  try {
    console.log('🔌 Conectando aos bancos de dados...');
    await connectAllDatabases();
    console.log('✅ Conectado com sucesso\n');

    // Buscar todos os device tokens
    const allDevices = await DeviceToken.find({});
    console.log(`📱 Total de dispositivos no banco: ${allDevices.length}\n`);

    // Agrupar por plataforma
    const byPlatform = allDevices.reduce((acc: any, device: any) => {
      const platform = device.platform || 'unknown';
      if (!acc[platform]) {
        acc[platform] = [];
      }
      acc[platform].push(device);
      return acc;
    }, {});

    console.log('📊 Distribuição por plataforma:');
    Object.keys(byPlatform).forEach((platform) => {
      console.log(`  ${platform}: ${byPlatform[platform].length} dispositivo(s)`);
    });

    // Mostrar detalhes dos dispositivos iOS
    console.log('\n📱 Dispositivos iOS ativos:');
    const iosDevices = allDevices.filter((d: any) => d.platform === 'ios' && d.isActive);
    iosDevices.forEach((device: any, index: number) => {
      console.log(`\n  ${index + 1}. Device Token: ${device.deviceToken.substring(0, 30)}...`);
      console.log(`     User ID: ${device.userId}`);
      console.log(`     Platform: ${device.platform}`);
      console.log(`     Is Production: ${device.isProduction}`);
      console.log(`     Is Active: ${device.isActive}`);
      console.log(`     App Version: ${device.appVersion || 'N/A'}`);
      console.log(`     Created: ${device.createdAt}`);
    });

    // Mostrar dispositivos Android
    console.log('\n🤖 Dispositivos Android ativos:');
    const androidDevices = allDevices.filter((d: any) => d.platform === 'android' && d.isActive);
    if (androidDevices.length === 0) {
      console.log('  Nenhum dispositivo Android encontrado');
    } else {
      androidDevices.forEach((device: any, index: number) => {
        console.log(`\n  ${index + 1}. Device Token: ${device.deviceToken.substring(0, 30)}...`);
        console.log(`     User ID: ${device.userId}`);
        console.log(`     Platform: ${device.platform}`);
        console.log(`     Is Production: ${device.isProduction}`);
        console.log(`     Is Active: ${device.isActive}`);
      });
    }

    // Verificar formato dos tokens iOS
    console.log('\n🔍 Verificando formato dos tokens iOS:');
    iosDevices.forEach((device: any, index: number) => {
      const token = device.deviceToken;
      const isValidFormat = /^[0-9a-f]{64}$/i.test(token.replace(/\s/g, ''));
      console.log(`  ${index + 1}. Token válido: ${isValidFormat ? '✅' : '❌'} (${token.length} caracteres)`);
    });

    console.log('\n✅ Verificação concluída!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao verificar device tokens:', error);
    process.exit(1);
  }
}

// Executar verificação
checkDeviceTokens();

