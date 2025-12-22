/**
 * Utilitário para normalização de números de telefone
 * Suporta diversos formatos de entrada e normaliza para formato internacional
 * 
 * Exemplos de entrada aceitos:
 * - +55 0 62 99844-8536
 * - 5562 998448-536
 * - 062 9 9844-8536
 * - 6298448536
 * 
 * Saída: 5562998448536 (DDI 55 como padrão se não fornecido)
 */

/**
 * Remove todos os caracteres não numéricos de uma string
 */
const removeNonNumeric = (value: string): string => {
  return value.replace(/\D/g, '');
};

/**
 * Normaliza um número de telefone para formato internacional
 * @param phone - Número de telefone em qualquer formato
 * @param defaultDDI - DDI padrão a ser usado se não fornecido (padrão: 55 para Brasil)
 * @returns Número normalizado no formato DDI + DDD + número (ex: 5562998448536)
 */
export const normalizePhone = (phone: string, defaultDDI: string = '55'): string | null => {
  if (!phone || typeof phone !== 'string') {
    return null;
  }

  // Remove todos os caracteres não numéricos
  const digitsOnly = removeNonNumeric(phone);

  if (digitsOnly.length === 0) {
    return null;
  }

  // Se começar com 0, remover (ex: 062998448536 -> 6298448536)
  let normalized = digitsOnly.startsWith('0') ? digitsOnly.substring(1) : digitsOnly;

  // Verificar se já tem DDI (começa com 55 para Brasil)
  // Números brasileiros com DDI têm 12 ou 13 dígitos (55 + DDD + número)
  if (normalized.startsWith('55') && (normalized.length === 12 || normalized.length === 13)) {
    // Já tem DDI, retornar como está
    return normalized;
  }

  // Números brasileiros sem DDI:
  // - 10 dígitos: DDD (2) + número fixo (8 dígitos)
  // - 11 dígitos: DDD (2) + número celular (9 dígitos)
  if (normalized.length === 10 || normalized.length === 11) {
    // Número completo sem DDI: adicionar DDI padrão (55)
    return `${defaultDDI}${normalized}`;
  }

  // Se tem 12 ou 13 dígitos mas não começa com 55, pode ser:
  // - Número de outro país (já tem DDI diferente)
  // - Número brasileiro mal formatado (tem DDD duplicado ou algo assim)
  // Por segurança, se começa com DDD brasileiro válido, adicionar 55
  if (normalized.length === 12 || normalized.length === 13) {
    const firstTwo = normalized.substring(0, 2);
    const validDDDs = ['11', '12', '13', '14', '15', '16', '17', '18', '19', '21', '22', '24', '27', '28', '31', '32', '33', '34', '35', '37', '38', '41', '42', '43', '44', '45', '46', '47', '48', '49', '51', '53', '54', '61', '62', '63', '64', '65', '66', '67', '68', '69', '71', '73', '74', '75', '77', '79', '81', '82', '83', '84', '85', '86', '87', '88', '89', '91', '92', '93', '94', '95', '96', '97', '98', '99'];
    if (validDDDs.includes(firstTwo)) {
      // Parece número brasileiro sem DDI, adicionar 55
      return `${defaultDDI}${normalized}`;
    }
    // Pode ser de outro país, retornar como está
    return normalized;
  }

  // Se tem mais de 13 dígitos, provavelmente é de outro país ou formato inválido
  if (normalized.length > 13) {
    return normalized;
  }

  // Número incompleto (menos de 10 dígitos), retornar null
  if (normalized.length < 10) {
    return null;
  }

  // Fallback: adicionar DDI padrão
  return `${defaultDDI}${normalized}`;
};

/**
 * Normaliza uma lista de números de telefone
 * @param phones - Array de números de telefone
 * @param defaultDDI - DDI padrão
 * @returns Array de números normalizados (filtra nulls)
 */
export const normalizePhoneList = (
  phones: string[],
  defaultDDI: string = '55'
): string[] => {
  return phones
    .map((phone) => normalizePhone(phone, defaultDDI))
    .filter((phone): phone is string => phone !== null);
};

/**
 * Formata um número normalizado para exibição
 * @param phone - Número normalizado (ex: 5562998448536)
 * @returns Número formatado (ex: (62) 99844-8536)
 */
export const formatPhoneForDisplay = (phone: string): string => {
  if (!phone || phone.length < 10) {
    return phone;
  }

  // Remover DDI se presente (assumindo DDI de 2 dígitos)
  let number = phone;
  if (phone.length > 10) {
    // Tem DDI, remover
    number = phone.substring(2);
  }

  // Formatar: (DDD) Número
  if (number.length === 10) {
    // Número fixo: (DDD) XXXX-XXXX
    return `(${number.substring(0, 2)}) ${number.substring(2, 6)}-${number.substring(6)}`;
  } else if (number.length === 11) {
    // Número celular: (DDD) 9XXXX-XXXX
    return `(${number.substring(0, 2)}) ${number.substring(2, 7)}-${number.substring(7)}`;
  }

  return phone;
};

