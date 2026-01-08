/**
 * Script de teste para verificar o handler de GROUP_PARTICIPANTS_UPDATE
 * 
 * Uso: ts-node-dev --transpile-only src/scripts/testGroupWebhook.ts
 */

import axios from 'axios';

const BASE_URL = process.env.BASE_URL || 'http://localhost:4331';
const INSTANCE_NAME = process.env.TEST_INSTANCE_NAME || 'test_instance';

/**
 * Testa o webhook de GROUP_PARTICIPANTS_UPDATE
 */
async function testGroupParticipantsUpdate() {
  console.log('🧪 Testando webhook GROUP_PARTICIPANTS_UPDATE\n');

  const testPayloads = [
    {
      name: 'Participante adicionado ao grupo',
      payload: {
        event: 'GROUP_PARTICIPANTS_UPDATE',
        instance: INSTANCE_NAME,
        data: {
          groupJid: '120363123456789012@g.us',
          groupName: 'Grupo de Teste',
          action: 'add',
          participants: [
            {
              id: '556298448536@s.whatsapp.net',
              name: 'João Silva',
              isAdmin: false,
            },
          ],
          actionBy: {
            id: '556299999999@s.whatsapp.net',
            name: 'Admin do Grupo',
          },
        },
      },
    },
    {
      name: 'Participante removido do grupo',
      payload: {
        event: 'GROUP_PARTICIPANTS_UPDATE',
        instance: INSTANCE_NAME,
        data: {
          groupJid: '120363123456789012@g.us',
          groupName: 'Grupo de Teste',
          action: 'remove',
          participants: [
            {
              id: '556298448536@s.whatsapp.net',
              name: 'João Silva',
              isAdmin: false,
            },
          ],
        },
      },
    },
    {
      name: 'Participante promovido a admin',
      payload: {
        event: 'GROUP_PARTICIPANTS_UPDATE',
        instance: INSTANCE_NAME,
        data: {
          groupJid: '120363123456789012@g.us',
          groupName: 'Grupo de Teste',
          action: 'promote',
          participants: [
            {
              id: '556298448536@s.whatsapp.net',
              name: 'João Silva',
              isAdmin: true,
            },
          ],
        },
      },
    },
  ];

  for (const test of testPayloads) {
    try {
      console.log(`📤 Testando: ${test.name}`);
      console.log(`   Payload:`, JSON.stringify(test.payload, null, 2));

      const response = await axios.post(
        `${BASE_URL}/webhook/api/${INSTANCE_NAME}`,
        test.payload,
        {
          headers: {
            'Content-Type': 'application/json',
          },
          timeout: 10000,
        }
      );

      console.log(`   ✅ Status: ${response.status}`);
      console.log(`   📋 Resposta:`, JSON.stringify(response.data, null, 2));
      console.log('');
    } catch (error: any) {
      if (axios.isAxiosError(error)) {
        console.error(`   ❌ Erro: ${error.message}`);
        if (error.response) {
          console.error(`   📋 Status: ${error.response.status}`);
          console.error(`   📋 Dados:`, JSON.stringify(error.response.data, null, 2));
        }
      } else {
        console.error(`   ❌ Erro:`, error);
      }
      console.log('');
    }
  }

  console.log('✅ Testes concluídos!');
  console.log('\n💡 Dica: Verifique os logs do servidor para ver o processamento completo.');
}

// Executar se chamado diretamente
if (require.main === module) {
  testGroupParticipantsUpdate();
}

export { testGroupParticipantsUpdate };
