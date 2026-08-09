/**
 * Convención heredada de hermes-startup-next/startup-next: leer process.env
 * DENTRO de las funciones que lo necesitan, nunca en una const de nivel de
 * módulo. En ESM los módulos importados se evalúan antes que el código
 * propio del módulo que los importa, así que capturar env vars en consts de
 * módulo puede leerlas como `undefined` según el orden de carga de dotenv.
 */

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Falta la variable de entorno requerida: ${name}. Revisar .env.example.`
    );
  }
  return value;
}

function optionalEnvInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number.parseInt(raw, 10);
  if (Number.isNaN(parsed)) {
    throw new Error(`La variable de entorno ${name} debe ser un entero, recibido: "${raw}"`);
  }
  return parsed;
}

export function getStartupNextBaseUrl(): string {
  return requireEnv("STARTUP_NEXT_BASE_URL").replace(/\/+$/, "");
}

/** Credencial de invocador "hermes" contra startup-next -- ver Diseno_servidor_MCP_startup-next.md,
 * "Credenciales por-startup" (hoy es una key compartida, no per-instancia). */
export function getHermesApiKey(): string {
  return requireEnv("API_KEY_HERMES");
}

export function getPollIntervalMs(): number {
  return optionalEnvInt("MCP_POLL_INTERVAL_MS", 3000);
}

export function getPollTimeoutMs(): number {
  return optionalEnvInt("MCP_POLL_TIMEOUT_MS", 180_000);
}
