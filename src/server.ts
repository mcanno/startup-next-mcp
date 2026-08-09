/**
 * Servidor MCP de startup-next -- Diseno_servidor_MCP_startup-next.md.
 * Transporte stdio: cualquier host MCP (Hermes Agent u otro) lo lanza como
 * proceso hijo y le habla por stdin/stdout con JSON-RPC.
 *
 * REGLA CRÍTICA, absoluta desde la primera línea de este archivo: con
 * transporte stdio, stdout está reservado ÍNTEGRAMENTE para los mensajes
 * JSON-RPC del protocolo. NUNCA usar console.log ni escribir a stdout por
 * ningún otro medio -- corrompería el protocolo y rompería el servidor para
 * cualquier cliente. Todo el logging va a stderr (console.error), que Node
 * dirige a stderr por definición (a diferencia de console.log, que va a
 * stdout). Es, a propósito, lo contrario del agente jubilado (src/server.ts
 * de hermes-startup-next), que usaba stdout para hablarle al fundador.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { getHermesApiKey, getStartupNextBaseUrl } from "./config/env.js";
import { ejecutarSiguienteAccion, siguienteAccionInputShape } from "./tools/siguienteAccion.js";

async function main() {
  // Fail fast, igual que el agente jubilado: validar la config obligatoria
  // ANTES de conectar el transporte, para nunca quedar "vivo" pero incapaz
  // de responder ninguna llamada real.
  getStartupNextBaseUrl();
  getHermesApiKey();

  const server = new McpServer({
    name: "startup-next-mcp",
    version: "0.1.0",
  });

  server.registerTool(
    "siguiente_accion",
    {
      description:
        "Dado el estado actual de una startup (y, opcionalmente, su contexto histórico), " +
        "devuelve la actividad más recomendable a continuación, según la metodología y los " +
        "especialistas de startup-next.",
      inputSchema: siguienteAccionInputShape,
      annotations: {
        title: "Siguiente acción recomendada",
        readOnlyHint: true, // no escribe estado en ningún lado, ver Diseno_servidor_MCP_startup-next.md
        openWorldHint: true, // llama a un servicio externo (startup-next) por HTTP
      },
    },
    async (args) => ejecutarSiguienteAccion(args)
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("[startup-next-mcp] Servidor MCP conectado por stdio, esperando llamadas.");
}

main().catch((err) => {
  console.error("[startup-next-mcp] Fallo fatal en el arranque:", err);
  process.exit(1);
});
