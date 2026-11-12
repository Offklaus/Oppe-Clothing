// Só formatação de tela. Preços e totais já chegam formatados do servidor.
export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const doisDigitos = (n) => String(n).padStart(2, '0');
