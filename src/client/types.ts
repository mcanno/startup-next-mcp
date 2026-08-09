import { z } from "zod";

/**
 * Transferido tal cual desde hermes-startup-next/src/client/types.ts (agente
 * jubilado, ver Diseno_servidor_MCP_startup-next.md) -- este servidor MCP
 * reusa el mismo contrato HTTP ya verificado contra producción, sin
 * reescribirlo. Replica el contrato documentado en diseno_startup_next.md
 * (secciones 1 y 9).
 */

// ---- POST /informes/parse ----------------------------------------------

export const opcionPropuestaSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  resumen: z.string(),
});
export type OpcionPropuesta = z.infer<typeof opcionPropuestaSchema>;

export const parseInformeResponseSchema = z.object({
  opciones_propuestas: z.array(opcionPropuestaSchema).min(1),
  startup_id: z.string(),
  // CONFIRMADO (no supuesto): POST /informes/parse NUNCA devuelve report_id,
  // en ningún camino -- el cliente genera su propio report_id local.
});
export type ParseInformeResponse = z.infer<typeof parseInformeResponseSchema>;

// ---- POST /runs ----------------------------------------------------------

export const comentarioAsesorSchema = z.object({
  texto: z.string(),
  autor: z.string().optional(),
  aplica_a: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
});
export type ComentarioAsesor = z.infer<typeof comentarioAsesorSchema>;

export const createRunResponseSchema = z.object({
  run_id: z.string(),
  status: z.literal("draft"),
});
export type CreateRunResponse = z.infer<typeof createRunResponseSchema>;

// ---- Estado de un run (GET /runs/{id}, y respuesta de /start) -----------

export const runStatusSchema = z.enum([
  "draft",
  "needs_clarification",
  "running",
  "approved",
  "max_cycles_reached",
  "sin_especialista",
  "peticion_incoherente",
  "failed",
]);
export type RunStatus = z.infer<typeof runStatusSchema>;

export const hallazgoOntologiaSchema = z.object({
  rule_id: z.string(),
  hallazgos: z.string(),
});

export const accionNextSchema = z.object({
  id: z.string(),
  titulo: z.string(),
  descripcion: z.string().optional(),
  justificacion: z.string().optional(),
  opciones_descartadas: z.array(z.string()).optional(),
  validado_contra_ontologia: z.boolean().optional(),
  hallazgos_ontologia: z.array(hallazgoOntologiaSchema).optional(),
  conflicto_comentario_asesor: z
    .object({
      detectado: z.boolean(),
      rule_id: z.string().optional(),
      descripcion: z.string().optional(),
    })
    .optional(),
  especialista_requerido: z.string().optional(),
  especialista_disponible: z.boolean().optional(),
  resuelto_sin_aclaracion_completa: z.boolean().optional(),
});
export type AccionNext = z.infer<typeof accionNextSchema>;

export const recomendacionSchema = z.object({
  titulo: z.string(),
  detalle: z.string(),
  fuentes: z.array(z.string()).optional(),
});

export const informeFinalSchema = z.object({
  recomendaciones: z.array(recomendacionSchema),
  consideraciones_metodologicas: z.array(hallazgoOntologiaSchema).optional(),
  aprobado: z.boolean().optional(),
});
export type InformeFinal = z.infer<typeof informeFinalSchema>;

export const noRespuestaSchema = z.object({
  tipo: z.enum(["ontologia", "sin_especialista", "peticion_incoherente"]),
  especialista_faltante: z.string().optional(),
  motivo_principal: z.string(),
  hallazgos_ontologia: z.array(hallazgoOntologiaSchema).optional(),
  otros_motivos: z.array(z.string()).optional(),
  ciclos_intentados: z.number(),
});
export type NoRespuesta = z.infer<typeof noRespuestaSchema>;

export const runStateSchema = z.object({
  run_id: z.string(),
  startup_id: z.string(),
  status: runStatusSchema,
  pregunta: z.string().optional(),
  accion_next: accionNextSchema.optional(),
  cycle: z.number().optional(),
  max_cycles: z.number().optional(),
  especialista_usado: z.string().optional(),
  informe_final: informeFinalSchema.nullable().optional(),
  no_respuesta: noRespuestaSchema.nullable().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});
export type RunState = z.infer<typeof runStateSchema>;

const TERMINAL_STATUSES: RunStatus[] = [
  "approved",
  "max_cycles_reached",
  "sin_especialista",
  "peticion_incoherente",
  "failed",
];

export function isTerminalStatus(status: RunStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}
