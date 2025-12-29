/**
 * Script para deletar todos os usuários do banco de dados
 * ATENÇÃO: Este script deleta TODOS os usuários. Use apenas em desenvolvimento/testes.
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import User from '../models/User';
import { DATABASE_CONFIG } from '../config/constants';

// Carregar variáveis de ambiente
dotenv.config();

async function deleteAllUsers(): Promise<void> {
  try {
    console.log('\n🗑️  === DELETANDO TODOS OS USUÁRIOS ===\n');
    console.log(`📡 Conectando ao MongoDB: ${DATABASE_CONFIG.URI.split('@')[1]}`);
    
    await mongoose.connect(DATABASE_CONFIG.URI);
    console.log('✅ Conectado ao MongoDB\n');

    // Contar usuários antes
    const countBefore = await User.countDocuments();
    console.log(`📊 Usuários encontrados: ${countBefore}\n`);

    if (countBefore === 0) {
      console.log('⚠️  Nenhum usuário encontrado. Nada para deletar.\n');
      return;
    }

    // Deletar todos os usuários
    console.log('🗑️  Deletando todos os usuários...');
    const result = await User.deleteMany({});
    console.log(`✅ ${result.deletedCount} usuário(s) deletado(s) com sucesso!\n`);

    // Verificar se foram deletados
    const countAfter = await User.countDocuments();
    console.log(`📊 Usuários restantes: ${countAfter}\n`);

    if (countAfter === 0) {
      console.log('✅ Todos os usuários foram deletados com sucesso!');
    } else {
      console.log(`⚠️  Ainda existem ${countAfter} usuário(s) no banco.`);
    }
  } catch (error: any) {
    console.error('\n❌ Erro ao deletar usuários:', error.message);
    throw error;
  } finally {
    await mongoose.connection.close();
    console.log('🔌 Conexão MongoDB fechada\n');
  }
}

// Executar se chamado diretamente
if (require.main === module) {
  deleteAllUsers()
    .then(() => {
      console.log('✅ Script executado com sucesso!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erro ao executar script:', error);
      process.exit(1);
    });
}

export default deleteAllUsers;

