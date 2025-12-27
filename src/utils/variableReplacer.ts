/**
 * Utilitário para substituição de variáveis dinâmicas em templates
 * 
 * Variáveis disponíveis:
 * - $firstName - Primeiro nome
 * - $lastName - Último nome
 * - $fullName - Nome completo
 * - $formattedPhone - Número formatado (ex: (62)9 9844-8536)
 * - $originalPhone - Número original/normalizado (ex: 5562998448536)
 */

import { formatBrazilianPhone } from './numberNormalizer';

export interface ContactData {
  phone: string; // Número normalizado (ex: 5562998448536)
  name?: string; // Nome do contato
  formattedPhone?: string; // Número formatado (opcional, será calculado se não fornecido)
}

/**
 * Extrai o primeiro nome de um nome completo
 */
const getFirstName = (fullName?: string): string => {
  if (!fullName || !fullName.trim()) {
    return '';
  }
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || '';
};

/**
 * Extrai o último nome de um nome completo
 */
const getLastName = (fullName?: string): string => {
  if (!fullName || !fullName.trim()) {
    return '';
  }
  const parts = fullName.trim().split(/\s+/);
  if (parts.length <= 1) {
    return '';
  }
  // Retornar tudo exceto o primeiro nome
  return parts.slice(1).join(' ') || '';
};

/**
 * Substitui variáveis em um texto usando dados do contato e variáveis do Typebot
 * @param text - Texto com variáveis (ex: "Olá $firstName, como vai?")
 * @param contact - Dados do contato
 * @param defaultName - Nome padrão caso não tenha nome
 * @param typebotVariables - Variáveis do Typebot (ex: { Name: "Marcos", Telefone: "+5562984049128" })
 * @returns Texto com variáveis substituídas
 */
export const replaceVariables = (
  text: string,
  contact: ContactData,
  defaultName: string = 'Cliente',
  typebotVariables?: Record<string, any>
): string => {
  if (!text || typeof text !== 'string') {
    return text;
  }

  // Determinar nome a ser usado (prioridade: contact.name > defaultName)
  const contactName = contact.name || defaultName;

  // Calcular valores das variáveis do contato
  const firstName = getFirstName(contactName);
  const lastName = getLastName(contactName);
  const fullName = contactName;
  const formattedPhone = contact.formattedPhone || formatBrazilianPhone(contact.phone);
  const originalPhone = contact.phone;

  // Mapa de variáveis para valores (variáveis padrão do contato)
  const variables: Record<string, string> = {
    $firstName: firstName,
    $lastName: lastName,
    $fullName: fullName,
    $formattedPhone: formattedPhone,
    $originalPhone: originalPhone,
  };

  // Adicionar variáveis do Typebot (com prefixo $)
  if (typebotVariables && typeof typebotVariables === 'object') {
    for (const [key, value] of Object.entries(typebotVariables)) {
      // Converter chave para variável com $ (ex: "Name" -> "$Name")
      const variableKey = `$${key}`;
      // Converter valor para string
      variables[variableKey] = value != null ? String(value) : '';
    }
  }

  // Substituir todas as variáveis
  let result = text;
  for (const [variable, value] of Object.entries(variables)) {
    // Usar regex global para substituir todas as ocorrências
    const regex = new RegExp(variable.replace(/\$/g, '\\$'), 'g');
    result = result.replace(regex, value);
  }

  return result;
};

/**
 * Substitui variáveis em um objeto JSON (para templates de sequência)
 * @param content - Conteúdo do template (pode ser string ou objeto)
 * @param contact - Dados do contato
 * @param defaultName - Nome padrão
 * @returns Conteúdo com variáveis substituídas
 */
export const replaceVariablesInContent = (
  content: any,
  contact: ContactData,
  defaultName: string = 'Cliente'
): any => {
  if (typeof content === 'string') {
    return replaceVariables(content, contact, defaultName);
  }

  if (Array.isArray(content)) {
    return content.map((item) => replaceVariablesInContent(item, contact, defaultName));
  }

  if (content && typeof content === 'object') {
    const result: any = {};
    for (const [key, value] of Object.entries(content)) {
      result[key] = replaceVariablesInContent(value, contact, defaultName);
    }
    return result;
  }

  return content;
};

/**
 * Lista de variáveis disponíveis para exibição no frontend
 */
export const AVAILABLE_VARIABLES = [
  { variable: '$firstName', label: 'Primeiro Nome', description: 'Primeiro nome do contato' },
  { variable: '$lastName', label: 'Último Nome', description: 'Último nome do contato' },
  { variable: '$fullName', label: 'Nome Completo', description: 'Nome completo do contato' },
  { variable: '$formattedPhone', label: 'Número Formatado', description: 'Número formatado (ex: (62) 99844-8536)' },
  { variable: '$originalPhone', label: 'Número Original', description: 'Número original/normalizado' },
];

