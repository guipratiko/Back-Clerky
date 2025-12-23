/**
 * Service para gerar prompts de agentes de IA baseado em formulário assistido
 */

export interface AssistedConfig {
  // 1. Empresa
  companyName?: string;
  businessDescription?: string;
  marketTime?: string;
  tone?: 'formal' | 'informal';
  excludedClientTypes?: string;

  // 2. Produtos
  products?: Array<{
    name: string;
    type: 'físico' | 'digital' | 'serviço';
    isMain?: boolean;
    shortDescription?: string;
    benefits?: string;
    problemSolved?: string;
    price?: string;
    priceType?: 'fixo' | 'negociável';
    displayType?: 'exato' | 'a partir de';
    hasDiscount?: boolean;
    discountConditions?: string;
    hasCombo?: boolean;
    specialConditions?: string;
    minMargin?: string;
    objectionExpensive?: string;
    objectionThinking?: string;
    objectionComparing?: string;
    cannotPromise?: string;
    cannotSay?: string;
    requiresHuman?: string;
  }>;

  // 3. Público-Alvo
  idealClient?: string;
  clientArrivesDecided?: boolean;
  mainPains?: string;
  problemsSolved?: string;
  comparisonWithCompetitors?: string;

  // 4. Objeções
  commonObjections?: string;
  humanResponses?: string;
  objectionsNotToOvercome?: string;
  insistenceLevel?: string;

  // 5. Valores e Negociação
  canNegotiate?: boolean;
  minMargin?: string;
  variableConditions?: string;
  responseToExpensive?: string;

  // 6. Tom e Personalidade
  style?: 'direto' | 'consultivo' | 'amigável';
  language?: 'simples' | 'técnica';
  useEmojis?: boolean;
  posture?: 'vendedor' | 'consultor';
  useExamples?: boolean;

  // 7. Limites do Agente
  canTalkAboutCompetitors?: boolean;
  canPromiseDeadlines?: boolean;
  forbiddenPhrases?: string;
  whenToEscalate?: string;
  whenToEndConversation?: string;

  // 8. Fluxo da Conversa
  openingForm?: string;
  askNeedOrWait?: boolean;
  canSuggestProducts?: boolean;
  nextStepAfterPrice?: string;
  closingForm?: string;

  // 9. Informações Permitidas
  paymentMethods?: string;
  averageDeadlines?: string;
  returnPolicy?: string;
  mandatoryText?: string;
  identifyAsAI?: boolean;

  // 10. Sucesso do Agente
  successCriteria?: string;
  expectedClientBehavior?: string;
  priority?: 'fechamento' | 'esclarecimento';
  canAskConfirmation?: boolean;
  perfectConversation?: string;
}

/**
 * Gera o prompt final baseado na configuração assistida
 */
export function generatePromptFromConfig(config: AssistedConfig): string {
  let prompt = '';

  // 1. Contexto do Negócio
  prompt += '# CONTEXTO DO NEGÓCIO\n\n';
  if (config.companyName) {
    prompt += `Você é um assistente virtual da empresa ${config.companyName}.\n`;
  }
  if (config.businessDescription) {
    prompt += `${config.businessDescription}\n`;
  }
  if (config.marketTime) {
    prompt += `Tempo de mercado: ${config.marketTime}\n`;
  }
  prompt += '\n';

  // 2. Tom e Personalidade
  prompt += '# TOM E PERSONALIDADE\n\n';
  if (config.tone) {
    prompt += `Tom de atendimento: ${config.tone === 'formal' ? 'Formal e profissional' : 'Informal e descontraído'}\n`;
  }
  if (config.style) {
    const styleMap = {
      direto: 'Direto ao ponto, sem rodeios',
      consultivo: 'Consultivo, ajudando o cliente a decidir',
      amigável: 'Amigável e acolhedor',
    };
    prompt += `Estilo: ${styleMap[config.style]}\n`;
  }
  if (config.language) {
    prompt += `Linguagem: ${config.language === 'simples' ? 'Simples e acessível' : 'Técnica e detalhada'}\n`;
  }
  if (config.useEmojis !== undefined) {
    prompt += `Uso de emojis: ${config.useEmojis ? 'Sim, use emojis moderadamente' : 'Não use emojis'}\n`;
  }
  if (config.posture) {
    prompt += `Postura: ${config.posture === 'vendedor' ? 'Vendedor proativo' : 'Consultor que ajuda'}\n`;
  }
  prompt += '\n';

  // 3. Produtos
  if (config.products && config.products.length > 0) {
    prompt += '# PRODUTOS E SERVIÇOS\n\n';
    config.products.forEach((product, index) => {
      prompt += `## ${product.name}\n`;
      if (product.type) {
        prompt += `Tipo: ${product.type}\n`;
      }
      if (product.shortDescription) {
        prompt += `Descrição: ${product.shortDescription}\n`;
      }
      if (product.benefits) {
        prompt += `Benefícios: ${product.benefits}\n`;
      }
      if (product.problemSolved) {
        prompt += `Problema que resolve: ${product.problemSolved}\n`;
      }
      if (product.price) {
        const priceDisplay = product.displayType === 'a partir de' ? `A partir de ${product.price}` : product.price;
        prompt += `Preço: ${priceDisplay}\n`;
        if (product.priceType === 'negociável') {
          prompt += `Preço é negociável. ${product.minMargin ? `Margem mínima: ${product.minMargin}` : ''}\n`;
        } else {
          prompt += 'Preço é fixo, não negociável.\n';
        }
      }
      if (product.hasCombo) {
        prompt += `Possui combo: ${product.specialConditions || 'Sim'}\n`;
      }
      if (product.objectionExpensive) {
        prompt += `Objeção "está caro": ${product.objectionExpensive}\n`;
      }
      if (product.objectionThinking) {
        prompt += `Objeção "vou pensar": ${product.objectionThinking}\n`;
      }
      if (product.objectionComparing) {
        prompt += `Objeção "vou comparar": ${product.objectionComparing}\n`;
      }
      if (product.cannotPromise) {
        prompt += `Não pode prometer: ${product.cannotPromise}\n`;
      }
      if (product.requiresHuman) {
        prompt += `Encaminhar para humano quando: ${product.requiresHuman}\n`;
      }
      prompt += '\n';
    });
  }

  // 4. Público-Alvo
  if (config.idealClient || config.mainPains) {
    prompt += '# PÚBLICO-ALVO\n\n';
    if (config.idealClient) {
      prompt += `Cliente ideal: ${config.idealClient}\n`;
    }
    if (config.mainPains) {
      prompt += `Principais dores: ${config.mainPains}\n`;
    }
    if (config.problemsSolved) {
      prompt += `Problemas resolvidos: ${config.problemsSolved}\n`;
    }
    if (config.excludedClientTypes) {
      prompt += `Tipo de cliente que NÃO deve ser atendido: ${config.excludedClientTypes}\n`;
    }
    prompt += '\n';
  }

  // 5. Objeções
  if (config.commonObjections || config.humanResponses) {
    prompt += '# OBJEÇÕES COMUNS\n\n';
    if (config.commonObjections) {
      prompt += `Objeções mais comuns: ${config.commonObjections}\n`;
    }
    if (config.humanResponses) {
      prompt += `Respostas usadas por vendedores humanos: ${config.humanResponses}\n`;
    }
    if (config.objectionsNotToOvercome) {
      prompt += `Objeções que NÃO deve contornar: ${config.objectionsNotToOvercome}\n`;
    }
    if (config.insistenceLevel) {
      prompt += `Nível de insistência: ${config.insistenceLevel}\n`;
    }
    prompt += '\n';
  }

  // 6. Negociação
  if (config.canNegotiate !== undefined || config.responseToExpensive) {
    prompt += '# NEGOCIAÇÃO E VALORES\n\n';
    if (config.canNegotiate) {
      prompt += 'Pode negociar preços.\n';
      if (config.minMargin) {
        prompt += `Margem mínima: ${config.minMargin}\n`;
      }
    } else {
      prompt += 'NÃO pode negociar preços, apenas informar valores.\n';
    }
    if (config.responseToExpensive) {
      prompt += `Resposta padrão para "está caro": ${config.responseToExpensive}\n`;
    }
    prompt += '\n';
  }

  // 7. Limites
  prompt += '# LIMITES E REGRAS\n\n';
  if (config.canTalkAboutCompetitors !== undefined) {
    prompt += `Pode falar de concorrentes: ${config.canTalkAboutCompetitors ? 'Sim' : 'Não'}\n`;
  }
  if (config.canPromiseDeadlines !== undefined) {
    prompt += `Pode prometer prazos ou resultados: ${config.canPromiseDeadlines ? 'Sim' : 'Não'}\n`;
  }
  if (config.forbiddenPhrases) {
    prompt += `Frases proibidas: ${config.forbiddenPhrases}\n`;
  }
  if (config.whenToEscalate) {
    prompt += `Quando escalar para humano: ${config.whenToEscalate}\n`;
  }
  if (config.whenToEndConversation) {
    prompt += `Quando encerrar a conversa: ${config.whenToEndConversation}\n`;
  }
  prompt += '\n';

  // 8. Fluxo da Conversa
  if (config.openingForm || config.closingForm) {
    prompt += '# FLUXO DA CONVERSA\n\n';
    if (config.openingForm) {
      prompt += `Forma de abertura: ${config.openingForm}\n`;
    }
    if (config.askNeedOrWait !== undefined) {
      prompt += `${config.askNeedOrWait ? 'Perguntar sobre a necessidade do cliente' : 'Aguardar o cliente falar'}\n`;
    }
    if (config.canSuggestProducts !== undefined) {
      prompt += `Pode sugerir produtos: ${config.canSuggestProducts ? 'Sim' : 'Não'}\n`;
    }
    if (config.nextStepAfterPrice) {
      prompt += `Próximo passo após informar preço: ${config.nextStepAfterPrice}\n`;
    }
    if (config.closingForm) {
      prompt += `Forma de encerramento: ${config.closingForm}\n`;
    }
    prompt += '\n';
  }

  // 9. Informações Permitidas
  if (config.paymentMethods || config.averageDeadlines) {
    prompt += '# INFORMAÇÕES PERMITIDAS\n\n';
    if (config.paymentMethods) {
      prompt += `Formas de pagamento: ${config.paymentMethods}\n`;
    }
    if (config.averageDeadlines) {
      prompt += `Prazos médios: ${config.averageDeadlines}\n`;
    }
    if (config.returnPolicy) {
      prompt += `Política de troca/devolução: ${config.returnPolicy}\n`;
    }
    if (config.mandatoryText) {
      prompt += `Texto padrão obrigatório: ${config.mandatoryText}\n`;
    }
    if (config.identifyAsAI !== undefined) {
      prompt += `Identificar como IA: ${config.identifyAsAI ? 'Sim, identifique-se como assistente virtual' : 'Não, aja como atendente humano'}\n`;
    }
    prompt += '\n';
  }

  // 10. Objetivos e Sucesso
  if (config.successCriteria || config.priority) {
    prompt += '# OBJETIVOS E SUCESSO\n\n';
    if (config.successCriteria) {
      prompt += `Critério de sucesso: ${config.successCriteria}\n`;
    }
    if (config.priority) {
      prompt += `Prioridade: ${config.priority === 'fechamento' ? 'Fechamento de venda' : 'Esclarecimento de dúvidas'}\n`;
    }
    if (config.canAskConfirmation !== undefined) {
      prompt += `Pode pedir confirmação de interesse: ${config.canAskConfirmation ? 'Sim' : 'Não'}\n`;
    }
    if (config.perfectConversation) {
      prompt += `Conversa perfeita: ${config.perfectConversation}\n`;
    }
    prompt += '\n';
  }

  // Regras Gerais
  prompt += '# REGRAS GERAIS\n\n';
  prompt += '- Seja sempre educado e profissional\n';
  prompt += '- Não invente informações que não foram fornecidas\n';
  prompt += '- Se não souber algo, peça os dados faltantes ou encaminhe para humano\n';
  prompt += '- Mantenha as respostas claras e objetivas\n';
  prompt += '- Use CTA (call-to-action) quando apropriado\n';
  prompt += '- Formate as respostas de forma clara e legível\n';

  return prompt;
}

