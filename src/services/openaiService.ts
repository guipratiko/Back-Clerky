/**
 * Service para integração com OpenAI API
 */

import axios from 'axios';

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
 * Chamar API da OpenAI para processar mensagem
 */
export async function callOpenAI(
  apiKey: string,
  model: string,
  prompt: string,
  message: string
): Promise<string> {
  try {
    // Substituir {message} no prompt pela mensagem recebida
    const finalPrompt = prompt.replace(/{message}/g, message);

    const response = await axios.post(
      'https://api.openai.com/v1/chat/completions',
      {
        model,
        messages: [
          {
            role: 'system',
            content: finalPrompt,
          },
          {
            role: 'user',
            content: message,
          },
        ],
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

    console.log(`✅ OpenAI respondeu com sucesso (modelo: ${model})`);
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

