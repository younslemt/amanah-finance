export async function cookies() { throw new Error('cookies() indisponible dans l\'aperçu statique (mode démo)'); }
export async function headers() { return new Map<string, string>(); }
