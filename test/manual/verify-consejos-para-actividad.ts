/**
 * ARNÉS DE VERIFICACIÓN -- script manual, no parte del producto (mismo
 * criterio que test/manual/verify-mcp-client.ts).
 *
 * Verifica la Fase MCP-B (consejos_para_actividad) con un cliente MCP real
 * (StdioClientTransport + Client del propio SDK), spawneando dist/server.js
 * como proceso hijo real -- mismo criterio que verify-mcp-client.ts.
 *
 * Cubre:
 *  1. tools/list muestra las DOS herramientas (siguiente_accion y
 *     consejos_para_actividad) con sus esquemas.
 *  2. consejos_para_actividad SIN tensión (solo actividad) contra
 *     startup-next.fly.dev en producción.
 *  3. LA VERIFICACIÓN CLAVE: la misma actividad, una vez sin
 *     actividad_recomendada y otra vez con una actividad_recomendada
 *     distinta (tensión) -- imprime ambas respuestas completas para
 *     comparar si el especialista modula de verdad o no. No hay assert
 *     automático de "modula" -- es un juicio de contenido que se hace leyendo
 *     la salida, exactamente lo que Diseno_servidor_MCP_startup-next.md pide
 *     verificar antes de dar por buena la asunción.
 *
 * Uso:
 *   npm run build
 *   set -a; source .env.local; set +a
 *   npx tsx test/manual/verify-consejos-para-actividad.ts
 */
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport, getDefaultEnvironment } from "@modelcontextprotocol/sdk/client/stdio.js";

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`FALLO: ${msg}`);
  console.log(`OK: ${msg}`);
}

async function main() {
  for (const v of ["STARTUP_NEXT_BASE_URL", "API_KEY_HERMES"]) {
    if (!process.env[v]) {
      throw new Error(`Falta ${v} en el entorno de este arnés -- correlo con: set -a; source .env.local; set +a`);
    }
  }

  const transport = new StdioClientTransport({
    command: "node",
    args: ["dist/server.js"],
    env: {
      ...getDefaultEnvironment(),
      STARTUP_NEXT_BASE_URL: process.env.STARTUP_NEXT_BASE_URL!,
      API_KEY_HERMES: process.env.API_KEY_HERMES!,
      ...(process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS } : {}),
    },
    stderr: "pipe",
  });

  const client = new Client({ name: "verify-consejos-para-actividad", version: "0.0.1" });

  console.log("=== Conectando (spawnea dist/server.js como proceso hijo real) ===");
  await client.connect(transport);
  assert(true, "conectado -- initialize de JSON-RPC completado sin corromper el canal");

  transport.stderr?.on("data", (chunk) => {
    process.stderr.write(`[servidor MCP, stderr] ${chunk}`);
  });

  console.log("\n=== Listando herramientas ===");
  const { tools } = await client.listTools();
  console.log(`Herramientas encontradas: ${tools.map((t) => t.name).join(", ")}`);

  const siguienteAccion = tools.find((t) => t.name === "siguiente_accion");
  assert(siguienteAccion !== undefined, 'la herramienta "siguiente_accion" sigue apareciendo en tools/list');

  const consejos = tools.find((t) => t.name === "consejos_para_actividad");
  assert(consejos !== undefined, 'la herramienta "consejos_para_actividad" aparece en tools/list');
  assert(!!consejos?.inputSchema?.properties?.actividad, 'el esquema de entrada incluye "actividad"');
  assert(!!consejos?.inputSchema?.properties?.contexto_historico, 'el esquema de entrada incluye "contexto_historico"');
  assert(
    !!consejos?.inputSchema?.properties?.actividad_recomendada,
    'el esquema de entrada incluye "actividad_recomendada"'
  );
  assert(
    (consejos?.inputSchema?.required ?? []).includes("actividad"),
    '"actividad" es obligatoria en el esquema (required la incluye)'
  );
  assert(
    !(consejos?.inputSchema?.required ?? []).includes("contexto_historico") &&
      !(consejos?.inputSchema?.required ?? []).includes("actividad_recomendada"),
    '"contexto_historico" y "actividad_recomendada" NO son obligatorias'
  );

  // --- Llamada 1: SIN tensión ------------------------------------------
  const actividad = "Contratar un equipo de ventas outbound de 5 personas para acelerar el crecimiento cuanto antes";

  console.log("\n\n=== Llamada 1/2: consejos_para_actividad SIN actividad_recomendada (sin tensión) ===");
  console.log(`actividad: "${actividad}"`);

  // timeout generoso: el default del SDK (60s) es menor que
  // MCP_POLL_TIMEOUT_MS (180s por defecto, ver .env.example) -- una llamada
  // real que dispare varios ciclos especialista/validador puede tardar más
  // de 60s sin que sea un fallo del servidor.
  const CALL_TIMEOUT_MS = 240_000;

  const resultSinTension = await client.callTool(
    { name: "consejos_para_actividad", arguments: { actividad } },
    undefined,
    { timeout: CALL_TIMEOUT_MS }
  );

  const contentSinTension = resultSinTension.content as Array<{ type: string; text?: string }>;
  assert(!resultSinTension.isError, `la llamada sin tensión no devolvió isError (fue ${JSON.stringify(resultSinTension.isError)})`);
  assert(Array.isArray(contentSinTension) && contentSinTension.length > 0, "la respuesta sin tensión trae content no vacío");
  const textoSinTension = contentSinTension[0]?.text ?? "";
  assert(textoSinTension.length > 0, "el texto de la respuesta sin tensión no está vacío");

  console.log("\n--- RESPUESTA SIN TENSIÓN ---");
  console.log(textoSinTension);
  console.log("--- fin ---");

  // --- Llamada 2: CON tensión (misma actividad, actividad_recomendada distinta) ---
  const actividadRecomendada =
    "Hacer más entrevistas con clientes potenciales para terminar de validar el problema antes de escalar ventas";

  console.log("\n\n=== Llamada 2/2: consejos_para_actividad CON actividad_recomendada distinta (tensión) ===");
  console.log(`actividad: "${actividad}"`);
  console.log(`actividad_recomendada: "${actividadRecomendada}"`);

  const resultConTension = await client.callTool(
    { name: "consejos_para_actividad", arguments: { actividad, actividad_recomendada: actividadRecomendada } },
    undefined,
    { timeout: CALL_TIMEOUT_MS }
  );

  const contentConTension = resultConTension.content as Array<{ type: string; text?: string }>;
  assert(!resultConTension.isError, `la llamada con tensión no devolvió isError (fue ${JSON.stringify(resultConTension.isError)})`);
  assert(Array.isArray(contentConTension) && contentConTension.length > 0, "la respuesta con tensión trae content no vacío");
  const textoConTension = contentConTension[0]?.text ?? "";
  assert(textoConTension.length > 0, "el texto de la respuesta con tensión no está vacío");

  console.log("\n--- RESPUESTA CON TENSIÓN ---");
  console.log(textoConTension);
  console.log("--- fin ---");

  console.log(
    "\n\n=== Comparación manual pendiente: leer ambas respuestas de arriba y juzgar si la de tensión " +
      "modula de verdad (menciona el apartamiento, da consejos de vigilancia distintos) o es la misma " +
      "con una coletilla. Ese juicio se reporta aparte, no lo hace este script. ==="
  );

  console.log("\n=== TODAS LAS VERIFICACIONES MECÁNICAS PASARON ===");

  await client.close();
}

main().catch((err) => {
  console.error("\nVERIFICACIÓN FALLIDA:", err);
  process.exit(1);
});
