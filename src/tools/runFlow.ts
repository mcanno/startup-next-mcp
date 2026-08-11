import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { getRun } from "../client/startupNextClient.js";
import { isTerminalStatus, type RunState } from "../client/types.js";
import { getPollIntervalMs, getPollTimeoutMs } from "../config/env.js";

/**
 * Lógica compartida entre las herramientas MCP que envuelven el flujo
 * parse -> runs/start/poll de startup-next (siguiente_accion,
 * consejos_para_actividad) -- ambas arrancan un run y necesitan la misma
 * espera hasta un estado terminal. Lo único que cambia entre herramientas es
 * qué texto_libre se compone antes de llamar a parseInforme() y cómo se
 * presenta el resultado ya aprobado.
 */

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Lleva el run desde el estado que devuelve startRun() hasta un estado
 * terminal, o hasta needs_clarification (que NO se responde automáticamente
 * -- ver nota en startupNextClient.ts: inventar una respuesta violaría el
 * principio de no fallar/asumir en silencio del proyecto. Se devuelve tal
 * cual para que quien llamó la herramienta MCP decida cómo re-preguntar).
 */
export async function esperarResolucion(initialState: RunState): Promise<RunState> {
  let state = initialState;

  if (state.status === "draft") {
    throw new Error(
      `Run ${state.run_id} sigue en "draft" tras llamar a startRun() -- respuesta inesperada del backend.`
    );
  }
  if (state.status === "needs_clarification") return state;
  if (isTerminalStatus(state.status)) return state;

  const pollIntervalMs = getPollIntervalMs();
  const pollTimeoutMs = getPollTimeoutMs();
  const deadline = Date.now() + pollTimeoutMs;

  while (state.status === "running") {
    if (Date.now() > deadline) {
      throw new Error(
        `Run ${state.run_id}: se superó MCP_POLL_TIMEOUT_MS (${pollTimeoutMs}ms) esperando un estado terminal. ` +
          `Último estado: cycle=${state.cycle}/${state.max_cycles}.`
      );
    }
    await sleep(pollIntervalMs);
    state = await getRun(state.run_id);
    if (state.status === "needs_clarification") return state;
  }

  return state;
}

export function textoResult(text: string): CallToolResult {
  return { content: [{ type: "text", text }] };
}

/** Desenlaces terminales sin recomendación aprobada (max_cycles_reached,
 * sin_especialista, peticion_incoherente) -- misma presentación sin importar
 * qué herramienta disparó el run. */
export function formatearSinRespuesta(state: RunState): CallToolResult {
  const nr = state.no_respuesta;
  if (!nr) {
    return textoResult(`No se llegó a una recomendación aprobada (status: ${state.status}).`);
  }
  const lineas = [
    `No se llegó a una recomendación aprobada. Tipo: ${nr.tipo}.`,
    `Motivo: ${nr.motivo_principal}`,
    `Ciclos intentados: ${nr.ciclos_intentados}`,
  ];
  if (nr.especialista_faltante) lineas.push(`Especialista todavía no implementado: ${nr.especialista_faltante}.`);
  return textoResult(lineas.join("\n"));
}
