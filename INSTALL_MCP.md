# Instalar startup-next-mcp en Hermes Agent

Instrucciones para conectar este servidor MCP (commit `5f3c0ce`) al Hermes
Agent del emprendedor. Ver `Diseno_servidor_MCP_startup-next.md` (docs-mios)
para el porqué de las decisiones de diseño; este documento es solo el cómo.

Fuente para el formato de configuración de Hermes: la documentación oficial
en hermes-agent.nousresearch.com (`/docs/user-guide/features/mcp` y
`/docs/guides/use-mcp-with-hermes`), leída el 2026-08-11. **La sintaxis exacta
la define Nous y puede cambiar entre versiones de Hermes** — si algo de lo de
abajo no coincide con lo que ves en tu instalación, manda `hermes --version`
y compara contra el changelog antes de asumir que este documento está mal.

## Requisito de arquitectura: misma máquina

El transporte es **stdio**: Hermes lanza este servidor como proceso hijo y le
habla por stdin/stdout. Eso significa que `startup-next-mcp` **tiene que vivir
en el mismo servidor dedicado donde ya corre Hermes con el canal de
Telegram**. No hay despliegue remoto posible con este transporte — no es una
URL a la que Hermes se conecta, es un binario que Hermes ejecuta localmente.

## 1. Llevar el código al servidor dedicado

Hoy `startup-next-mcp` no tiene remoto configurado (`git remote -v` vacío).
Antes de poder hacer `git clone` en el servidor dedicado hace falta uno de
estos dos caminos:

**Opción A — subir el repo a un remoto (recomendado si vas a iterar)**
```bash
# en tu máquina, dentro de startup-next-mcp/
git remote add origin <url-de-tu-repo-privado>
git push -u origin master
```
Luego, en el servidor dedicado:
```bash
git clone <url-de-tu-repo-privado> startup-next-mcp
cd startup-next-mcp
```

**Opción B — copiar el proyecto directamente (sin remoto)**
```bash
# desde tu máquina
rsync -av --exclude node_modules --exclude dist \
  startup-next-mcp/ usuario@servidor-dedicado:~/startup-next-mcp/
```

Con cualquiera de las dos, una vez el código está en el servidor:

```bash
cd ~/startup-next-mcp

# Instalar con npm 10.9.8, el mismo criterio con el que se generó el
# lockfile (ver commit 5f3c0ce) — evita el problema de raíz en vez de
# regenerar el lockfile después.
npx npm@10.9.8 ci

# Compilar TypeScript -> dist/
npm run build
```

Verificar que `dist/server.js` existe antes de seguir:
```bash
ls dist/server.js
```

Requisito del `package.json`: Node >= 18 en el servidor dedicado.

## 2. Variables de entorno

El servidor falla rápido (antes de conectar el transporte) si faltan estas
dos:

| Variable | De dónde sale | Valor |
|---|---|---|
| `STARTUP_NEXT_BASE_URL` | El central desplegado | `https://startup-next.fly.dev` |
| `API_KEY_HERMES` | Credencial de invocador "hermes" reservada en startup-next. Pídesela a quien administra el backend (hoy es una key compartida, no por-emprendedor — ver "Pendientes" en el documento de diseño) | (secreto, no la pegues en texto plano en ningún sitio versionado) |

Opcionales (tienen default, ver `.env.example`):

| Variable | Default | Qué hace |
|---|---|---|
| `MCP_POLL_INTERVAL_MS` | `3000` | Cada cuánto se consulta `GET /runs/{id}` mientras el run está `running` |
| `MCP_POLL_TIMEOUT_MS` | `180000` | Cuánto esperar como máximo antes de dar el run por fallido |

**Estas variables no se ponen en un `.env` en el servidor.** Hermes lanza el
proceso hijo con el `env` que tú declares en su propio bloque de
configuración (ver sección 4) — es Hermes quien se las pasa al arrancar el
servidor MCP, no un `.env` local. El `.env.example` del repo sigue siendo útil
para probar el servidor a mano (`npm run dev`) antes de conectarlo a Hermes.

## 3. El comando que Hermes ejecuta

Ruta absoluta al `dist/server.js` compilado en el paso 1, por ejemplo si
clonaste en `/home/usuario/startup-next-mcp`:

```
node /home/usuario/startup-next-mcp/dist/server.js
```

Ajusta la ruta a donde realmente quede el repo en tu servidor dedicado.

## 4. Bloque de configuración para Hermes

Hermes declara servidores MCP stdio bajo `mcp_servers:` en
`~/.hermes/config.yaml` (ruta y nombre de archivo definidos por Nous — puede
diferir según tu instalación). Formato de referencia leído de la doc oficial:

```yaml
mcp_servers:
  startup_next:
    command: "node"
    args: ["/home/usuario/startup-next-mcp/dist/server.js"]
    env:
      STARTUP_NEXT_BASE_URL: "https://startup-next.fly.dev"
      API_KEY_HERMES: "<la-credencial-real>"
    enabled: true
```

Alternativa por CLI (registra `command`/`args`; la doc oficial no muestra un
flag `--env` para `hermes mcp add` — **verificar al usarlo**, y si no existe,
añadir el bloque `env:` a mano en `config.yaml` después de que `add` cree la
entrada):

```bash
hermes mcp add startup_next --command node --args /home/usuario/startup-next-mcp/dist/server.js
```

Tras editar `config.yaml` a mano (o si el `add` no cubrió el `env`), recarga
sin reiniciar Hermes:

```
/reload-mcp
```

(comando de chat, se ejecuta dentro de la conversación con Hermes, no en la
shell).

**Nota sobre nombre de la herramienta expuesta:** Hermes registra las
herramientas de un servidor MCP con la convención `mcp_<nombre-servidor>_<nombre-herramienta>`.
Con el nombre de servidor `startup_next` de arriba, la herramienta
`siguiente_accion` de este repo aparecerá ante el modelo de Hermes como
`mcp_startup_next_siguiente_accion`. Si usas otro nombre de servidor en el
YAML, el nombre expuesto cambia en consecuencia.

## 5. Verificar que Hermes ve `siguiente_accion`

Por CLI, en el servidor dedicado:

```bash
hermes mcp list          # el servidor "startup_next" debe aparecer, enabled
hermes mcp test startup_next   # prueba de conectividad directa
```

Si `test` falla con algo como "fetch failed" al llamar a startup-next.fly.dev
(y no un error de arranque del propio servidor MCP), revisa si el servidor
dedicado tiene un certificado interceptor configurado vía
`NODE_EXTRA_CA_CERTS` que Hermes no esté heredando al proceso hijo — fue la
causa real de un fallo idéntico durante la verificación de este servidor (ver
commit `5f3c0ce` y `HANDOFF_HERMES.md` en el repo jubilado). No es lo más
probable en un servidor dedicado limpio, pero si aparece, es el primer sitio
donde mirar.

Dentro de una conversación con Hermes (Telegram o CLI), como confirmación
adicional:

> Dime qué herramientas MCP tienes disponibles ahora mismo.

Debería mencionar `mcp_startup_next_siguiente_accion` (o el nombre que resulte
del servidor que declaraste) entre las disponibles.

## 6. Prueba end-to-end

Por Telegram (o CLI), al Hermes ya conectado:

> Soy fundador de una startup. Llevamos 3 meses, tenemos una idea validada
> con 12 entrevistas pero todavía no hemos construido nada. ¿Cuál debería ser
> nuestra siguiente acción?

Lo que se espera:

1. Hermes reconoce que puede resolver esto con la herramienta MCP y la invoca
   (puede mostrarlo explícitamente o no, según cómo tengas configurada la
   verbosidad de tool-calls).
2. La llamada real es a `siguiente_accion` con `situacion` compuesta a partir
   de tu mensaje (y `contexto_historico` si Hermes ya tenía memoria de esta
   startup).
3. La respuesta trae una actividad recomendada concreta (p. ej. de la fase
   `mvp` o `pmf`) con las recomendaciones y fuentes que ya devuelve
   startup-next en producción — el mismo tipo de salida verificada en
   `test/manual/verify-mcp-client.ts` contra `startup-next.fly.dev`.

Si Hermes responde sin pasar por la herramienta (contesta "de memoria", sin
recomendación citada de un especialista), la conexión MCP no se está usando —
revisar `hermes mcp list` y `/reload-mcp` antes de sospechar del servidor.

## Cosas que este documento no resuelve

- **`consejos_para_actividad` no existe todavía** (Fase MCP-B) — solo
  `siguiente_accion` está implementada y verificable con estos pasos.
- **La credencial `API_KEY_HERMES` es compartida**, no por-emprendedor —
  quien siga esta guía debe pedirla a quien administra startup-next.
- La sintaxis exacta de `hermes mcp add` y del `config.yaml` puede haber
  cambiado desde la lectura de la doc (2026-08-11) — si algo no coincide,
  la doc oficial de Hermes manda sobre este archivo.
