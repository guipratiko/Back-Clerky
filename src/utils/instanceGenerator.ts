/**
 * Gera um nome aleatório para instância
 * Formato: 5 letras + 5 números (ex: "Rf35Ty657u")
 */
export const generateInstanceName = (): string => {
  const letters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  
  let result = '';
  
  // 5 letras aleatórias
  for (let i = 0; i < 5; i++) {
    result += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  
  // 5 números aleatórios
  for (let i = 0; i < 5; i++) {
    result += numbers.charAt(Math.floor(Math.random() * numbers.length));
  }
  
  return result;
};

