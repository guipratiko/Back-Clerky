/**
 * Service para processar mensagens do Agente de IA
 * - Buffer de mensagens por contato
 * - Transcrição de áudios
 * - Processamento com LLM
 * - Detecção de interesse
 * - Armazenamento de memória no Redis
 */

import axios from 'axios';
import { redisClient } from '../config/databases';
import { OPENAI_CONFIG, TRANSCRIPTION_CONFIG } from '../config/constants';
import { callOpenAI } from './openaiService';
import { sendMessage } from '../utils/evolutionAPI';
import Instance from '../models/Instance';
import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { normalizePhone } from '../utils/numberNormalizer';

interface BufferedMessage {
  contactPhone: string;
  instanceId: string;
  userId: string;
  messages: Array<{
    messageId: string;
    content: string;
    messageType: string;
    timestamp: Date;
    base64?: string; // Para áudios
    transcription?: string; // Transcrição do áudio (quando recebida via callback)
  }>;
  timer?: NodeJS.Timeout;
}

// Buffer de mensagens por contato (aguarda tempo configurável antes de processar)
const messageBuffers = new Map<string, BufferedMessage>();

export interface ContactMemory {
  history: Array<{
    role: 'user' | 'assistant';
    content: string;
    timestamp: string;
  }>;
  structuredData: {
    name?: string;
    phone: string;
    interest?: string;
    detectedInterest?: boolean;
    lastInteraction?: string;
  };
}

/**
 * Obter chave Redis para memória do contato
 */
function getMemoryKey(userId: string, instanceId: string, contactPhone: string): string {
  return `ai_agent:memory:${userId}:${instanceId}:${contactPhone}`;
}

/**
 * Obter memória do contato do Redis
 */
export async function getContactMemory(
  userId: string,
  instanceId: string,
  contactPhone: string
): Promise<ContactMemory> {
  const key = getMemoryKey(userId, instanceId, contactPhone);
  const data = await redisClient.get(key);

  if (!data) {
    return {
      history: [],
      structuredData: {
        phone: contactPhone,
      },
    };
  }

  try {
    return JSON.parse(data);
  } catch {
    return {
      history: [],
      structuredData: {
        phone: contactPhone,
      },
    };
  }
}

/**
 * Salvar memória do contato no Redis
 */
export async function saveContactMemory(
  userId: string,
  instanceId: string,
  contactPhone: string,
  memory: ContactMemory
): Promise<void> {
  const key = getMemoryKey(userId, instanceId, contactPhone);
  // Armazenar por 90 dias
  await redisClient.setex(key, 90 * 24 * 60 * 60, JSON.stringify(memory));
}

/**
 * Adicionar mensagem ao buffer
 */
export function addMessageToBuffer(
  contactPhone: string,
  instanceId: string,
  userId: string,
  messageId: string,
  content: string,
  messageType: string,
  base64?: string
): void {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const existingBuffer = messageBuffers.get(bufferKey);

  const message = {
    messageId,
    content,
    messageType,
    timestamp: new Date(),
    base64,
    transcription: undefined as string | undefined, // Será preenchido quando a transcrição chegar
  };

  if (existingBuffer) {
    // Adicionar mensagem ao buffer existente
    existingBuffer.messages.push(message);

    // Limpar timer anterior
    if (existingBuffer.timer) {
      clearTimeout(existingBuffer.timer);
    }
  } else {
    // Criar novo buffer
    messageBuffers.set(bufferKey, {
      contactPhone,
      instanceId,
      userId,
      messages: [message],
    });
  }
}

/**
 * Atualizar mensagem no buffer com transcrição
 */
export async function updateMessageInBuffer(
  userId: string,
  instanceId: string,
  contactPhone: string,
  messageId: string,
  transcription: string
): Promise<void> {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const buffer = messageBuffers.get(bufferKey);

  if (!buffer) {
    console.warn(`⚠️ Buffer não encontrado para atualizar transcrição: ${bufferKey}`);
    return;
  }

  // Encontrar mensagem no buffer e atualizar com transcrição
  const message = buffer.messages.find((msg) => msg.messageId === messageId);
  if (message) {
    message.transcription = transcription;
    message.content = transcription; // Usar transcrição como conteúdo
    console.log(`✅ Transcrição atualizada no buffer para mensagem ${messageId}`);
  } else {
    console.warn(`⚠️ Mensagem ${messageId} não encontrada no buffer para atualizar transcrição`);
  }
}

/**
 * Processar transcrição de áudio
 */
export async function transcribeAudio(
  base64: string,
  userId: string,
  contactPhone: string,
  instanceId: string,
  messageId: string
): Promise<void> {
  try {
    console.log(`🎤 Enviando áudio para transcrição: ${messageId}`);
    console.log(`📡 URL: ${TRANSCRIPTION_CONFIG.WEBHOOK_URL}`);
    console.log(`📞 Callback: ${TRANSCRIPTION_CONFIG.CALLBACK_URL}`);

    // Enviar para webhook de transcrição
    const response = await axios.post(
      TRANSCRIPTION_CONFIG.WEBHOOK_URL,
      {
        base64,
        userId,
        contactPhone,
        instanceId,
        messageId,
        callbackUrl: TRANSCRIPTION_CONFIG.CALLBACK_URL,
      },
      {
        timeout: 30000,
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    console.log(`✅ Áudio enviado para transcrição com sucesso: ${messageId}`);
    console.log(`📝 Resposta do serviço:`, response.data);
  } catch (error: any) {
    if (axios.isAxiosError(error)) {
      console.error(`❌ Erro ao enviar áudio para transcrição:`, error.message);
      console.error(`📡 Status:`, error.response?.status);
      console.error(`📄 Resposta:`, error.response?.data);
    } else {
      console.error(`❌ Erro desconhecido ao transcrever áudio:`, error);
    }
    // Não lançar erro - a transcrição pode ser feita depois ou via callback
  }
}

/**
 * Processar mensagens do buffer com o agente de IA
 */
export async function processBufferedMessages(
  agentId: string,
  agentPrompt: string,
  waitTime: number,
  contactPhone: string,
  instanceId: string,
  userId: string
): Promise<void> {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const buffer = messageBuffers.get(bufferKey);

  if (!buffer || buffer.messages.length === 0) {
    return;
  }

  // Remover do buffer
  messageBuffers.delete(bufferKey);

  console.log(`🤖 Processando ${buffer.messages.length} mensagem(ns) do contato ${contactPhone}`);

  try {
    // Obter memória do contato
    let memory = await getContactMemory(userId, instanceId, contactPhone);

    // Processar cada mensagem (transcrever áudios se necessário)
    const processedMessages: string[] = [];

    for (const msg of buffer.messages) {
      let finalContent = msg.content;

      if (msg.messageType === 'audioMessage') {
        // Se já tiver transcrição (recebida via callback), usar ela
        if (msg.transcription) {
          finalContent = msg.transcription;
          console.log(`✅ Usando transcrição recebida para mensagem ${msg.messageId}`);
        } else {
          // Se não tiver transcrição ainda, usar placeholder
          // A transcrição deve chegar via callback antes do processamento
          finalContent = '[Aguardando transcrição do áudio...]';
          console.log(`⏳ Aguardando transcrição para mensagem ${msg.messageId}`);
          
          // Se tiver base64, tentar transcrever novamente (caso o envio inicial tenha falhado)
          if (msg.base64) {
            try {
              await transcribeAudio(
                msg.base64,
                userId,
                contactPhone,
                instanceId,
                msg.messageId
              );
            } catch (error) {
              console.error(`❌ Erro ao reenviar áudio para transcrição ${msg.messageId}:`, error);
            }
          }
        }
      }

      processedMessages.push(finalContent);
      memory.history.push({
        role: 'user',
        content: finalContent,
        timestamp: msg.timestamp.toISOString(),
      });
    }

    // Combinar mensagens processadas
    const combinedMessage = processedMessages.join('\n\n');

    // Preparar histórico para OpenAI (formato ConversationMessage)
    const conversationHistory = memory.history
      .slice(-20) // Últimas 20 mensagens
      .map((msg) => ({
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
        timestamp: msg.timestamp,
      }));

    // Chamar OpenAI com prompt do agente e histórico
    const aiResponse = await callOpenAI(
      OPENAI_CONFIG.API_KEY,
      'gpt-4-turbo-preview',
      agentPrompt,
      combinedMessage,
      conversationHistory
    );

    console.log(`✅ Resposta da IA gerada: ${aiResponse.substring(0, 50)}...`);

    // Adicionar resposta à memória
    memory.history.push({
      role: 'assistant',
      content: aiResponse,
      timestamp: new Date().toISOString(),
    });

    // Detectar interesse usando LLM
    const interestDetected = await detectInterest(combinedMessage, aiResponse);

    if (interestDetected) {
      console.log(`🎯 Interesse detectado para contato ${contactPhone}`);
      memory.structuredData.detectedInterest = true;
      memory.structuredData.interest = 'Interesse detectado via análise de mensagem';

      // Mover contato da coluna 1 para coluna 2
      await moveContactToColumn2(instanceId, contactPhone, userId);
    }

    // Atualizar dados estruturados
    memory.structuredData.lastInteraction = new Date().toISOString();

    // Salvar memória atualizada
    await saveContactMemory(userId, instanceId, contactPhone, memory);

    // Enviar resposta via WhatsApp
    const instance = await Instance.findById(instanceId);
    if (!instance) {
      throw new Error('Instância não encontrada');
    }

    const normalizedPhone = normalizePhone(contactPhone, '55');
    if (!normalizedPhone) {
      throw new Error('Número de telefone inválido');
    }

    await sendMessage(instance.instanceName, {
      number: `${normalizedPhone}@s.whatsapp.net`,
      text: aiResponse,
    });

    console.log(`✅ Resposta enviada para ${contactPhone}`);
  } catch (error) {
    console.error(`❌ Erro ao processar mensagens do agente:`, error);
    throw error;
  }
}

/**
 * Detectar interesse usando LLM
 */
async function detectInterest(userMessage: string, aiResponse: string): Promise<boolean> {
  try {
    const prompt = `Analise a seguinte conversa e determine se o usuário demonstrou interesse em comprar, contratar ou avançar no processo comercial.

Mensagem do usuário: "${userMessage}"
Resposta do assistente: "${aiResponse}"

Responda APENAS com "SIM" se houver interesse claro (pedido de preço, demonstração de intenção de compra, solicitação de próximos passos, etc.) ou "NÃO" caso contrário.`;

    const response = await callOpenAI(
      OPENAI_CONFIG.API_KEY,
      'gpt-3.5-turbo',
      prompt,
      userMessage
    );

    const result = response.trim().toUpperCase();
    return result.includes('SIM');
  } catch (error) {
    console.error(`❌ Erro ao detectar interesse:`, error);
    return false;
  }
}

/**
 * Mover contato da coluna 1 para coluna 2
 */
async function moveContactToColumn2(
  instanceId: string,
  contactPhone: string,
  userId: string
): Promise<void> {
  try {
    // Buscar instância para obter token
    const instance = await Instance.findById(instanceId);
    if (!instance || !instance.token) {
      console.error(`⚠️ Instância não encontrada ou sem token: ${instanceId}`);
      return;
    }

    // Buscar colunas do usuário para encontrar coluna 2
    const { CRMColumnService } = await import('./crmColumnService');
    const columns = await CRMColumnService.getColumnsByUserId(userId);
    const column2 = columns.find((col) => col.orderIndex === 1); // Coluna 2 (índice 1)

    if (!column2) {
      console.error(`⚠️ Coluna 2 não encontrada para usuário ${userId}`);
      return;
    }

    // Usar API externa para mover contato
    const normalizedPhone = normalizePhone(contactPhone, '55');
    if (!normalizedPhone) {
      console.error(`⚠️ Número de telefone inválido: ${contactPhone}`);
      return;
    }

    await axios.post(
      `${process.env.API_URL || process.env.BACKEND_URL || 'https://back.clerky.com.br'}/api/v1/webhook/move-contact`,
      {
        phone: normalizedPhone,
        columnId: column2.id,
      },
      {
        headers: {
          Authorization: `Bearer ${instance.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      }
    );

    console.log(`✅ Contato ${contactPhone} movido para coluna 2`);
  } catch (error) {
    console.error(`❌ Erro ao mover contato:`, error);
    // Não falhar o processamento se não conseguir mover
  }
}

/**
 * Agendar processamento após tempo de espera
 */
export function scheduleMessageProcessing(
  agentId: string,
  agentPrompt: string,
  waitTime: number,
  contactPhone: string,
  instanceId: string,
  userId: string
): void {
  const bufferKey = `${userId}:${instanceId}:${contactPhone}`;
  const buffer = messageBuffers.get(bufferKey);

  if (!buffer) {
    return;
  }

  // Limpar timer anterior se existir
  if (buffer.timer) {
    clearTimeout(buffer.timer);
  }

  // Agendar processamento após waitTime segundos
  buffer.timer = setTimeout(async () => {
    try {
      await processBufferedMessages(agentId, agentPrompt, waitTime, contactPhone, instanceId, userId);
    } catch (error) {
      console.error(`❌ Erro ao processar mensagens agendadas:`, error);
    }
  }, waitTime * 1000);

  console.log(`⏳ Processamento agendado para ${waitTime} segundos (contato: ${contactPhone})`);
}

/**
 * Obter leads (contatos com memória)
 */
export async function getLeads(userId: string, instanceId?: string): Promise<ContactMemory[]> {
  const pattern = instanceId
    ? `ai_agent:memory:${userId}:${instanceId}:*`
    : `ai_agent:memory:${userId}:*`;

  const keys = await redisClient.keys(pattern);
  const leads: ContactMemory[] = [];

  for (const key of keys) {
    const data = await redisClient.get(key);
    if (data) {
      try {
        leads.push(JSON.parse(data));
      } catch {
        // Ignorar chaves inválidas
      }
    }
  }

  return leads.sort((a, b) => {
    const dateA = a.structuredData.lastInteraction || '';
    const dateB = b.structuredData.lastInteraction || '';
    return dateB.localeCompare(dateA);
  });
}

