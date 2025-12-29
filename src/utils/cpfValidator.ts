/**
 * Validação de CPF (Cadastro de Pessoa Física)
 * Algoritmo de validação dos dígitos verificadores
 */

/**
 * Remove caracteres não numéricos do CPF
 */
export const cleanCPF = (cpf: string): string => {
  return cpf.replace(/\D/g, '');
};

/**
 * Valida se um CPF é válido
 * @param cpf - CPF a ser validado (pode ter ou não formatação)
 * @returns true se o CPF é válido, false caso contrário
 */
export const isValidCPF = (cpf: string): boolean => {
  if (!cpf || typeof cpf !== 'string') {
    return false;
  }

  // Remove caracteres não numéricos
  const clean = cleanCPF(cpf);

  // Deve ter exatamente 11 dígitos
  if (clean.length !== 11) {
    return false;
  }

  // Verifica se todos os dígitos são iguais (CPF inválido)
  if (/^(\d)\1{10}$/.test(clean)) {
    return false;
  }

  // Valida primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(clean.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }
  if (remainder !== parseInt(clean.charAt(9))) {
    return false;
  }

  // Valida segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(clean.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) {
    remainder = 0;
  }
  if (remainder !== parseInt(clean.charAt(10))) {
    return false;
  }

  return true;
};

/**
 * Formata CPF para exibição: 000.000.000-00
 * @param cpf - CPF (pode ter ou não formatação)
 * @returns CPF formatado ou string vazia se inválido
 */
export const formatCPF = (cpf: string): string => {
  const clean = cleanCPF(cpf);
  if (clean.length !== 11) {
    return '';
  }
  return `${clean.substring(0, 3)}.${clean.substring(3, 6)}.${clean.substring(6, 9)}-${clean.substring(9, 11)}`;
};


