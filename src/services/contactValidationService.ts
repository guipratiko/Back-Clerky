/**
 * Serviço para validação de números de WhatsApp
 * Utiliza a Evolution API para verificar se um número existe no WhatsApp
 */

import { requestEvolutionAPI } from '../utils/evolutionAPI';
import { normalizePhone } from '../utils/numberNormalizer';
import { EVOLUTION_CONFIG } from '../config/constants';

export interface ValidationResult {
  jid: string; // JID completo (ex: 556298448536@s.whatsapp.net)
  exists: boolean; // Se o número existe no WhatsApp
  number: string; // Número normalizado
  name?: string; // Nome do contato (se disponível)
  lid?: string; // Lid (se disponível)
}

export interface ContactValidationData {
  phone: string; // Número normalizado
  name?: string; // Nome fornecido (se houver)
  validated?: boolean; // Se foi validado
  validationResult?: ValidationResult; // Resultado da validação
}

/**
 * Valida um único número de telefone
 * @param instanceName - Nome da instância do WhatsApp
 * @param phone - Número de telefone (será normalizado)
 * @returns Resultado da validação
 */
export const validatePhoneNumber = async (
  instanceName: string,
  phone: string
): Promise<ValidationResult | null> => {
  try {
    // Normalizar número
    const normalizedPhone = normalizePhone(phone);
    if (!normalizedPhone) {
      return null;
    }

    // Chamar endpoint de validação da Evolution API
    // Tentar diferentes endpoints possíveis na ordem de prioridade
    let response;
    let endpointUsed = '';
    
    // 1. Tentar endpoint /chat/whatsappNumbers (endpoint correto que retorna name)
    try {
      response = await requestEvolutionAPI(
        'POST',
        `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
        {
          numbers: [normalizedPhone],
        }
      );
      endpointUsed = '/chat/whatsappNumbers';
    } catch (error: unknown) {
      // Se falhar, tentar endpoint alternativo
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        try {
          // 2. Tentar endpoint /misc/check-number-status
          response = await requestEvolutionAPI(
            'POST',
            `/misc/check-number-status/${encodeURIComponent(instanceName)}`,
            {
              numbers: [normalizedPhone],
            }
          );
          endpointUsed = '/misc/check-number-status';
        } catch (error2: any) {
          // Se falhar, tentar terceiro endpoint
          if (error2.message?.includes('404') || error2.message?.includes('Not Found')) {
            try {
              response = await requestEvolutionAPI(
                'POST',
                `/chat/checkNumber/${encodeURIComponent(instanceName)}`,
                {
                  numbers: [normalizedPhone],
                }
              );
              endpointUsed = '/chat/checkNumber';
            } catch (error3: any) {
              // Se todos falharem, retornar null (número não pode ser validado)
              console.warn(`⚠️ Endpoint de validação não disponível. Número ${normalizedPhone} será aceito sem validação.`);
              return null;
            }
          } else {
            throw error2;
          }
        }
      } else {
        throw error;
      }
    }

    // A resposta deve ser um array com os resultados
    if (Array.isArray(response.data) && response.data.length > 0) {
      const result = response.data[0] as ValidationResult;
      // Log para debug
      if (result.name) {
        console.log(`✅ Nome capturado da API (${endpointUsed}): ${result.name} para número ${normalizedPhone}`);
      }
      return result;
    }

    return null;
  } catch (error) {
    console.error('Erro ao validar número:', error);
    return null;
  }
};

/**
 * Valida múltiplos números de telefone
 * @param instanceName - Nome da instância do WhatsApp
 * @param phones - Array de números de telefone
 * @returns Array de resultados de validação
 */
export const validatePhoneNumbers = async (
  instanceName: string,
  phones: string[]
): Promise<ValidationResult[]> => {
  try {
    // Normalizar todos os números
    const normalizedPhones = phones
      .map((phone) => normalizePhone(phone))
      .filter((phone): phone is string => phone !== null);

    if (normalizedPhones.length === 0) {
      return [];
    }

    // Chamar endpoint de validação da Evolution API
    // Tentar diferentes endpoints possíveis na ordem de prioridade
    let response;
    let endpointAvailable = false;
    let endpointUsed = '';
    
    // 1. Tentar endpoint /chat/whatsappNumbers (endpoint correto que retorna name)
    try {
      response = await requestEvolutionAPI(
        'POST',
        `/chat/whatsappNumbers/${encodeURIComponent(instanceName)}`,
        {
          numbers: normalizedPhones,
        }
      );
      endpointAvailable = true;
      endpointUsed = '/chat/whatsappNumbers';
    } catch (error: unknown) {
      // Se falhar, tentar endpoint alternativo
      const errorMessage = error instanceof Error ? error.message : '';
      if (errorMessage.includes('404') || errorMessage.includes('Not Found')) {
        try {
          // 2. Tentar endpoint /misc/check-number-status
          response = await requestEvolutionAPI(
            'POST',
            `/misc/check-number-status/${encodeURIComponent(instanceName)}`,
            {
              numbers: normalizedPhones,
            }
          );
          endpointAvailable = true;
          endpointUsed = '/misc/check-number-status';
        } catch (error2: any) {
          // Se falhar, tentar terceiro endpoint
          if (error2.message?.includes('404') || error2.message?.includes('Not Found')) {
            try {
              response = await requestEvolutionAPI(
                'POST',
                `/chat/checkNumber/${encodeURIComponent(instanceName)}`,
                {
                  numbers: normalizedPhones,
                }
              );
              endpointAvailable = true;
              endpointUsed = '/chat/checkNumber';
            } catch (error3: any) {
              // Se todos falharem, retornar array vazio (números não podem ser validados)
              console.warn(`⚠️ Endpoint de validação não disponível. ${normalizedPhones.length} número(s) serão aceitos sem validação.`);
              // Retornar array vazio para indicar que validação não está disponível
              return [];
            }
          } else {
            throw error2;
          }
        }
      } else {
        throw error;
      }
    }

    // A resposta deve ser um array com os resultados
    if (Array.isArray(response.data)) {
      const results = response.data as ValidationResult[];
      // Log para debug - contar quantos nomes foram capturados
      const namesCaptured = results.filter(r => r.name).length;
      if (namesCaptured > 0) {
        console.log(`✅ ${namesCaptured} nome(s) capturado(s) da API (${endpointUsed})`);
      }
      return results;
    }

    return [];
  } catch (error) {
    console.error('Erro ao validar números:', error);
    // Retornar array vazio para indicar que validação falhou
    return [];
  }
};

/**
 * Valida e enriquece dados de contatos
 * @param instanceName - Nome da instância do WhatsApp
 * @param contacts - Array de contatos com phone e name opcional
 * @returns Array de contatos validados e enriquecidos
 */
export const validateContacts = async (
  instanceName: string,
  contacts: Array<{ phone: string; name?: string }>
): Promise<ContactValidationData[]> => {
  // Extrair números únicos
  const uniquePhones = Array.from(
    new Set(contacts.map((c) => normalizePhone(c.phone)).filter(Boolean) as string[])
  );

  // Validar todos os números
  const validationResults = await validatePhoneNumbers(instanceName, uniquePhones);

  // Se não houver resultados de validação (endpoint não disponível), aceitar todos
  const validationAvailable = validationResults.length > 0;

  // Criar mapa de resultados por número
  const resultsMap = new Map<string, ValidationResult>();
  for (const result of validationResults) {
    if (result.exists) {
      resultsMap.set(result.number, result);
    }
  }

  // Enriquecer contatos com resultados de validação
  const validatedContacts: ContactValidationData[] = [];

  for (const contact of contacts) {
    const normalizedPhone = normalizePhone(contact.phone);
    if (!normalizedPhone) {
      continue; // Pular números inválidos (não conseguiu normalizar)
    }

    const validationResult = resultsMap.get(normalizedPhone);

    if (validationAvailable) {
      // Validação disponível - usar resultados reais
      if (validationResult && validationResult.exists) {
        // Número válido
        // Prioridade: nome fornecido > nome da validação
        // Mas se não tiver nome fornecido, usar o nome da validação
        const finalName = contact.name || validationResult.name || undefined;
        
        // Nome enriquecido da API (log removido para reduzir verbosidade)
        
        validatedContacts.push({
          phone: normalizedPhone,
          name: finalName,
          validated: true,
          validationResult,
        });
      } else {
        // Número inválido ou não existe
        validatedContacts.push({
          phone: normalizedPhone,
          name: contact.name,
          validated: false,
        });
      }
    } else {
      // Validação não disponível - aceitar todos os números normalizados
      validatedContacts.push({
        phone: normalizedPhone,
        name: contact.name,
        validated: true, // Aceitar todos se validação não estiver disponível
        validationResult: undefined,
      });
    }
  }

  return validatedContacts;
};

/**
 * Filtra apenas contatos válidos
 * @param contacts - Array de contatos validados
 * @returns Array apenas com contatos válidos
 */
export const filterValidContacts = (
  contacts: ContactValidationData[]
): ContactValidationData[] => {
  return contacts.filter((c) => c.validated === true);
};

