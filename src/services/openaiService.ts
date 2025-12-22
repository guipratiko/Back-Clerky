/**
 * Service para integração com OpenAI API
 */

import axios from 'axios';
import { ConversationMessage } from './openaiMemoryService';

export interface OpenAIResponse {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * Chamar API da OpenAI para processar mensagem com memória
 */
export async function callOpenAI(
  apiKey: string,
  model: string,
  systemPrompt: string,
  message: string,
  conversationHistory: ConversationMessage[] = []
): Promise<string> {
  try {
    // Construir array de mensagens com histórico
    const messages: Array<{ role: string; content: string }> = [
      {
        role: 'system',
        content: systemPrompt,
      },
    ];

    // Adicionar histórico de conversa (últimas 15 mensagens para não exceder limites)
    const recentHistory = conversationHistory.slice(-15);
    recentHistory.forEach((msg) => {
      messages.push({
        role: msg.role,
        content: msg.content,
      });
    });

    // Adicionar mensagem atual
    messages.push({
      role: 'user',
      content: message,
    });

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages,
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        timeout: 30000, // 30 segundos
      }
    );

    const content = response.data.choices[0]?.message?.content;
    if (!content) {
      throw new Error('Resposta da OpenAI não contém conteúdo');
    }

    console.log(`✅ OpenAI respondeu com sucesso (modelo: ${model}, histórico: ${recentHistory.length} mensagens)`);
    return content;
  } catch (error: unknown) {
    if (axios.isAxiosError(error)) {
      const errorMessage = error.response?.data?.error?.message || error.message;
      console.error(`❌ Erro ao chamar OpenAI:`, errorMessage);
      throw new Error(`Erro ao processar com OpenAI: ${errorMessage}`);
    }
    throw new Error(`Erro desconhecido ao chamar OpenAI: ${error instanceof Error ? error.message : 'Erro desconhecido'}`);
  }
}

