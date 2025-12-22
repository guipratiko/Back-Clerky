/**
 * Funções auxiliares para trabalhar com dados do PostgreSQL
 * Elimina duplicações de código em services
 */

/**
 * Faz parse seguro de campos JSONB do PostgreSQL
 * O PostgreSQL pode retornar JSONB como string ou objeto dependendo da versão/driver
 */
export const parseJsonbField = <T = any>(
  field: string | object | null | undefined,
  defaultValue: T
): T => {
  if (!field) {
    return defaultValue;
  }

  if (typeof field === 'object') {
    return field as T;
  }

  if (typeof field === 'string') {
    try {
      return JSON.parse(field) as T;
    } catch {
      return defaultValue;
    }
  }

  return defaultValue;
};

/**
 * Converte valor para JSON string de forma segura
 */
export const stringifyJsonb = (value: any): string | null => {
  if (value === null || value === undefined) {
    return null;
  }
  try {
    return JSON.stringify(value);
  } catch {
    return null;
  }
};

