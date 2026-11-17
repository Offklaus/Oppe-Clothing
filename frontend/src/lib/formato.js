export const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;

export const doisDigitos = (n) => String(n).padStart(2, '0');
