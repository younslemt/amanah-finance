// Remplace next/font/google : aucune police téléchargée, repli sur les polices système déclarées dans le thème.
const font = (opts: { variable?: string }) => ({ className: '', variable: '', style: { fontFamily: 'inherit' }, ...(opts ? {} : {}) });
export const Inter = font;
export const Fraunces = font;
