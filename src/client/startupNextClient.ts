import { getHermesApiKey, getStartupNextBaseUrl } from "../config/env.js";
import {
  createRunResponseSchema,
  parseInformeResponseSchema,
  runStateSchema,
  type ComentarioAsesor,
  type CreateRunResponse,
  type ParseInformeResponse,
  type RunState,
} from "./types.js";

/**
 * Transferido tal cual desde hermes-startup-next/src/client/startupNextClient.ts
 * (agente jubilado) -- cliente HTTP a startup-next ya verificado contra
 * producción (parse/runs/start/poll/respond). Ver
 * Diseno_servidor_MCP_startup-next.md: "no se reescribe, se transfiere".
 * Sin cambios de comportamiento respecto al original, solo el import de
 * env.js apunta a la copia de este proyecto.
 */

export class StartupNextApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly body: unknown
  ) {
    super(message);
    this.name = "StartupNextApiError";
  }
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Bearer ${getHermesApiKey()}` };
}

async function parseJsonOrThrow(res: Response): Promise<unknown> {
  const text = await res.text();
  let body: unknown = text;
  try {
    body = text ? JSON.parse(text) : undefined;
  } catch {
    // el body no era JSON — se propaga tal cual para no ocultar el error real
  }
  if (!res.ok) {
    throw new StartupNextApiError(
      `startup-next respondió ${res.status} en ${res.url}`,
      res.status,
      body
    );
  }
  return body;
}

/**
 * Paso 0 — extraer opciones (y, si el PDF viene firmado, el startup_id real)
 * de un informe. Exclusivo: PDF o texto libre, nunca ambos.
 */
export async function parseInforme(
  input: { kind: "texto"; texto: string } | { kind: "pdf"; file: Blob; filename: string }
): Promise<ParseInformeResponse> {
  const baseUrl = getStartupNextBaseUrl();
  let res: Response;

  if (input.kind === "texto") {
    res = await fetch(`${baseUrl}/informes/parse`, {
      method: "POST",
      headers: { ...authHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ texto_libre: input.texto }),
    });
  } else {
    const form = new FormData();
    form.set("file", input.file, input.filename);
    res = await fetch(`${baseUrl}/informes/parse`, {
      method: "POST",
      headers: authHeaders(), // no Content-Type manual: fetch fija el boundary del multipart
      body: form,
    });
  }

  const body = await parseJsonOrThrow(res);
  return parseInformeResponseSchema.parse(body);
}

export interface CreateRunInput {
  startupId: string;
  informeSituacionRef: {
    reportId: string;
    source: "startup-advisor" | "texto_libre";
    opcionesPropuestas: ParseInformeResponse["opciones_propuestas"];
  };
  comentarioAsesor?: ComentarioAsesor;
  callbackUrl?: string;
}

/** Paso 1 — crear el run en estado draft, sin disparar el pipeline todavía. */
export async function createRun(input: CreateRunInput): Promise<CreateRunResponse> {
  const baseUrl = getStartupNextBaseUrl();
  const res = await fetch(`${baseUrl}/runs`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({
      startup_id: input.startupId,
      informe_situacion_ref: {
        report_id: input.informeSituacionRef.reportId,
        source: input.informeSituacionRef.source,
        opciones_propuestas: input.informeSituacionRef.opcionesPropuestas,
      },
      comentario_asesor: input.comentarioAsesor,
      requested_by: "hermes",
      callback_url: input.callbackUrl,
    }),
  });
  const body = await parseJsonOrThrow(res);
  return createRunResponseSchema.parse(body);
}

/** Paso 2 — arrancar el orquestador. Devuelve el estado inmediato (202, no bloqueante). */
export async function startRun(runId: string): Promise<RunState> {
  const baseUrl = getStartupNextBaseUrl();
  const res = await fetch(`${baseUrl}/runs/${runId}/start`, {
    method: "POST",
    headers: authHeaders(),
  });
  const body = await parseJsonOrThrow(res);
  return runStateSchema.parse(body);
}

export async function getRun(runId: string): Promise<RunState> {
  const baseUrl = getStartupNextBaseUrl();
  const res = await fetch(`${baseUrl}/runs/${runId}`, {
    method: "GET",
    headers: authHeaders(),
  });
  const body = await parseJsonOrThrow(res);
  return runStateSchema.parse(body);
}

/** Responde una pregunta de needs_clarification y reinvoca al orquestador.
 * No usada por siguiente_accion en esta fase (ver src/tools/siguienteAccion.ts:
 * needs_clarification se devuelve tal cual a quien llamó la herramienta MCP,
 * no se responde automáticamente) -- se transfiere igual porque es parte del
 * mismo cliente ya verificado, por si una fase futura la necesita. */
export async function respondClarification(runId: string, respuesta: string): Promise<RunState> {
  const baseUrl = getStartupNextBaseUrl();
  const res = await fetch(`${baseUrl}/runs/${runId}/respond`, {
    method: "POST",
    headers: { ...authHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ respuesta }),
  });
  const body = await parseJsonOrThrow(res);
  return runStateSchema.parse(body);
}
