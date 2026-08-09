/**
 * ARNÉS DE VERIFICACIÓN -- script manual, no parte del producto (mismo
 * criterio que test/manual/verify-*.ts en hermes-startup-next).
 *
 * Verifica el servidor MCP (dist/server.js) de la forma correcta para un
 * servidor stdio SIN un host completo (Hermes Agent): un cliente MCP real
 * (StdioClientTransport + Client del propio SDK), no una llamada a mano al
 * proceso. Lo lanza como proceso hijo real, exactamente como lo haría un
 * host MCP.
 *
 * Qué es REAL acá: el proceso del servidor, el protocolo JSON-RPC completo
 * (initialize, tools/list, tools/call), y la llamada HTTP de
 * siguiente_accion contra startup-next.fly.dev en producción -- mismo
 * criterio que todas las verificaciones anteriores del proyecto.
 *
 * Uso:
 *   npm run build
 *   set -a; source .env.local; set +a
 *   npx tsx test/manual/verify-mcp-client.ts
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
    // getDefaultEnvironment(): el transporte NO hereda todo process.env por
    // default (higiene del propio SDK) -- hay que pasar explícitamente lo
    // que el servidor necesita, igual que lo haría la config real de un host.
    // NODE_EXTRA_CA_CERTS: no forma parte del allowlist del SDK (no lo
    // necesita en general), pero SÍ hace falta en esta máquina de desarrollo
    // -- Avast intercepta TLS acá (ya documentado en
    // hermes-startup-next/HANDOFF_HERMES.md, "Nota de entorno, no de
    // producto") y este proceso necesita confiar en su certificado
    // interceptor para poder llamar a https://startup-next.fly.dev. Sin
    // esto, fetch() falla con "fetch failed" genérico dentro del hijo -- no
    // es un bug del servidor, es un artefacto de ESTE arnés de
    // verificación en ESTA máquina.
    env: {
      ...getDefaultEnvironment(),
      STARTUP_NEXT_BASE_URL: process.env.STARTUP_NEXT_BASE_URL!,
      API_KEY_HERMES: process.env.API_KEY_HERMES!,
      ...(process.env.NODE_EXTRA_CA_CERTS ? { NODE_EXTRA_CA_CERTS: process.env.NODE_EXTRA_CA_CERTS } : {}),
    },
    stderr: "pipe", // para poder mostrar los logs del servidor (van a stderr) por separado del canal MCP
  });

  const client = new Client({ name: "verify-mcp-client", version: "0.0.1" });

  console.log("=== Conectando (spawnea dist/server.js como proceso hijo real) ===");
  await client.connect(transport);
  assert(true, "conectado -- initialize de JSON-RPC completado sin corromper el canal");

  // El stderr del hijo llega por un stream aparte del canal MCP -- si algo
  // se hubiera escrito por error a stdout, tools/list de abajo directamente
  // habría fallado a parsear el JSON-RPC (prueba implícita de la regla
  // stdout/stderr, ver server.ts).
  transport.stderr?.on("data", (chunk) => {
    process.stderr.write(`[servidor MCP, stderr] ${chunk}`);
  });

  console.log("\n=== Listando herramientas ===");
  const { tools } = await client.listTools();
  console.log(`Herramientas encontradas: ${tools.map((t) => t.name).join(", ")}`);
  const siguienteAccion = tools.find((t) => t.name === "siguiente_accion");
  assert(siguienteAccion !== undefined, 'la herramienta "siguiente_accion" aparece en tools/list');
  assert(
    !!siguienteAccion?.inputSchema?.properties?.situacion,
    'el esquema de entrada incluye "situacion"'
  );
  assert(
    !!siguienteAccion?.inputSchema?.properties?.contexto_historico,
    'el esquema de entrada incluye "contexto_historico"'
  );
  assert(
    !(siguienteAccion?.inputSchema?.required ?? []).includes("contexto_historico"),
    '"contexto_historico" NO es obligatorio en el esquema (required no lo incluye)'
  );

  console.log("\n=== Invocando siguiente_accion con una situación real ===");
  const situacion =
    "Ya tenemos encaje producto-mercado confirmado con clientes reales pagando. " +
    "Necesitamos decidir qué barrera competitiva construir para que no nos copie " +
    "el próximo competidor que entre al mercado.";
  console.log(`Situación: "${situacion}"`);

  const result = await client.callTool({
    name: "siguiente_accion",
    arguments: { situacion },
  });

  const content = result.content as Array<{ type: string; text?: string }>;
  console.log("\n--- Respuesta cruda de siguiente_accion (isError=" + JSON.stringify(result.isError) + ") ---");
  console.log(JSON.stringify(content, null, 2));
  console.log("--- fin de la respuesta cruda ---");

  assert(!result.isError, `la llamada no devolvió isError (fue ${JSON.stringify(result.isError)})`);
  assert(Array.isArray(content) && content.length > 0, "la respuesta trae content no vacío");
  assert(content[0]?.type === "text", 'el primer bloque de content es type:"text"');
  const texto = content[0]?.text ?? "";
  console.log("\n--- Respuesta real de siguiente_accion ---");
  console.log(texto);
  console.log("--- fin de la respuesta ---");

  assert(texto.length > 0, "el texto de la respuesta no está vacío");
  assert(
    texto.includes("recomendada") || texto.includes("ACLARACIÓN") || texto.includes("No se llegó"),
    "el texto tiene forma reconocible de una de las tres ramas (aprobado / aclaración / sin respuesta)"
  );

  console.log("\n=== TODAS LAS VERIFICACIONES PASARON ===");

  await client.close();
}

main().catch((err) => {
  console.error("\nVERIFICACIÓN FALLIDA:", err);
  process.exit(1);
});
