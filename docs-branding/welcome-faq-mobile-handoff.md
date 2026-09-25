# Handoff: soportar el menú del bot de bienvenida en la app móvil de GIA

> Para una sesión futura de Claude que trabaje en el repo de la **app móvil** de GIA
> (fork de `mattermost-mobile`, React Native + TypeScript). Este documento vive en el
> repo `GIA-WEB` (server + webapp) porque ahí se implementó la feature; cópialo al
> repo móvil si hace falta.

---

## 1. Qué es la feature y qué YA está hecho

El bot `system-bot` le manda un **DM de bienvenida interactivo** a cada cuenta nueva:
un saludo + un **menú de opciones** ("¿Qué quieres saber?") con botones. El usuario
pulsa una opción → el bot postea la respuesta (Markdown) y vuelve a mostrar el menú.
Además, si el usuario **escribe texto libre** en ese DM, el bot lo relaciona con las
opciones (por etiqueta o palabras clave) y responde igual.

**Implementado en `GIA-WEB` (server + webapp), verificado end-to-end:**

| Parte | Estado | Dónde |
|---|---|---|
| Config (System Console) | ✅ | `TeamSettings.EnableWelcomeMessageDM` / `WelcomeMessageDMText` / `WelcomeFaqPrompt` / `WelcomeFaqItems[]{Label,Answer,Keywords}` — `server/public/model/config.go`; editor `webapp/channels/src/components/admin_console/welcome_faq_setting.tsx` |
| Postear saludo + menú al crear cuenta | ✅ server | `server/channels/app/welcome_message.go` (`SendWelcomeMessageDM`) → `server/channels/app/welcome_bot.go` (`postWelcomeMenu`) |
| Endpoint del click en botón | ✅ server | `POST /api/v4/welcome_faq/answer` — `server/channels/api4/welcome_faq.go` |
| **Responder a texto libre** | ✅ server | `HandleWelcomeBotReply` en `welcome_bot.go`, enganchado en `server/channels/app/post.go` (`handlePostEvents`, junto al auto-responder) — **funciona en la app móvil sin cambios** |
| Renderer del menú con botones | ✅ **solo webapp** | `webapp/channels/src/components/post_view/welcome_faq_menu/` + branch en `post_message_view.tsx` |

**Lo que falta:** la app móvil no conoce el tipo de post del menú, así que hoy en
móvil **no se ven los botones** (se ve el saludo y el prompt como texto). El texto
libre sí funciona en móvil.

---

## 2. Contrato del servidor (lo que la app debe consumir)

### El post del menú

Cuando el bot postea el menú, el post trae:

```jsonc
{
  "type": "custom_gia_welcome_menu",          // model.PostCustomTypePrefix + "gia_welcome_menu"
  "user_id": "<id del system-bot>",
  "message": "¿Qué quieres saber?",           // fallback de texto plano (== el prompt)
  "props": {
    "gia_welcome_prompt": "¿Qué quieres saber?",
    "gia_welcome_items": [
      { "id": "0", "label": "📱 Descargar la app" },
      { "id": "1", "label": "🔔 Notificaciones" },
      { "id": "2", "label": "🆘 Soporte" }
    ]
  }
}
```

- `id` = índice (string) dentro de la lista de opciones válidas. **Las respuestas NO
  vienen en el post** (se resuelven en el servidor al responder) — la app solo
  necesita `id` + `label`.
- `label` puede traer caracteres de emoji Unicode. **No** trae códigos `:emoji:`
  procesados (igual que en la web hoy).

### El endpoint del click

```
POST /api/v4/welcome_faq/answer
Authorization: Bearer <token de sesión del usuario>   // la app ya lo manda
Content-Type: application/json

{ "option_id": "1" }
```

- Respuesta: `200 { "status": "OK" }`. **No devuelve el contenido**: el servidor
  postea la respuesta + un menú nuevo en el DM, y esos posts llegan por **websocket**
  como cualquier mensaje. La app no tiene que renderizar nada de la respuesta del
  POST, solo disparar la llamada y dejar que el DM se actualice solo.
- Errores: `400 app.welcome_bot.invalid_option` si el `option_id` ya no existe.

### Texto libre (ya funciona, no tocar)

Cualquier mensaje normal que el usuario mande al DM con el system-bot dispara
`HandleWelcomeBotReply` en el servidor. La app no hace nada especial.

---

## 3. Qué tiene que hacer la app móvil (opción recomendada: renderer nativo)

Replicar lo que hace el webapp, en React Native. Alcance chico y aditivo.

### 3.1 Reconocer y renderizar el tipo de post

En `mattermost-mobile`, el renderizado del cuerpo de un post está en
`app/components/post_list/post/body/` (verificar la ruta exacta en tu versión;
buscar dónde se hace el `switch`/detección por `post.type` y dónde caen los tipos
custom / `message_attachments`). Añadir una rama: si
`post.type === 'custom_gia_welcome_menu'` → renderizar un componente nuevo
`WelcomeFaqMenu`.

Referencia web a copiar 1:1 en lógica:
`webapp/channels/src/components/post_view/welcome_faq_menu/welcome_faq_menu.tsx`
- Lee `post.props.gia_welcome_prompt` (string) y `post.props.gia_welcome_items`
  (`Array<{id, label}>`).
- Renderiza el prompt como Markdown (usar el `<Markdown>` de la app,
  `app/components/markdown`).
- Un botón (`<Button>` / `TouchableOpacity` con estilo de la app) por cada item.
- `onPress` → llama al REST (abajo) con `item.id`; **deshabilita todos los botones**
  tras el primer press (el bot manda respuesta + menú nuevo por websocket, así que
  esta instancia del menú queda obsoleta).
- Si `gia_welcome_items` viene vacío → renderizar solo el prompt.

### 3.2 Método REST

En el cliente REST de la app (`app/client/rest/` — hay archivos por dominio;
crear/añadir algo tipo `welcome_faq.ts` o meterlo en el de posts):

```ts
answerWelcomeFaq = async (optionId: string) => {
    return this.doFetch(
        `${this.apiClient.baseUrl}/api/v4/welcome_faq/answer`,
        {method: 'post', body: {option_id: optionId}},
    );
};
```

Ajustar a la firma real de `doFetch` de la app. El token de sesión ya lo pone la
capa de cliente.

### 3.3 Emoji en los botones (opcional, igual que la web)

Hoy el `label` se pinta como texto plano. Si quieres que `:emoji:` (estándar y
personalizados del servidor) se rendericen en el botón, pasa el `label` por el
formateador de emoji de la app (`app/components/markdown` con solo emoji, o el
componente `<Emoji>` por token). Mismo pendiente existe en la web.

### 3.4 Archivos que tocará la sesión futura (repo móvil)

- El `switch`/detección de tipo de post en el body del post (1 rama).
- Componente nuevo `app/components/.../welcome_faq_menu/` (1 archivo + estilos).
- Método REST (`app/client/rest/...`).
- Tipos si hace falta (`app/types` o `@mattermost/types` si está vendorizado).
- i18n de la app (`assets/base/i18n/en.json` / `es.json`) si el componente tiene
  textos propios (p. ej. estado "enviando…").

**No** hace falta migración, ni cambio de esquema, ni tocar el servidor.

---

## 4. Alternativa más barata (CERO código móvil): lista numerada + responder por número

Si no quieres tocar la app móvil ahora, hacer **solo un cambio en el servidor**
(`GIA-WEB`, `server/channels/app/welcome_bot.go`):

1. En `postWelcomeMenu`, construir `post.Message` = prompt + `\n\n` + lista numerada
   de las etiquetas + "Responde con el número o escribe tu duda." (la web ignora
   `Message` porque tiene su renderer; el móvil lo muestra tal cual).
2. En `matchWelcomeFaqItem` (o en `HandleWelcomeBotReply`), aceptar también que el
   mensaje sea solo un número ("2") → esa opción.

Resultado en móvil: el usuario ve la lista numerada y responde "2" (o escribe su
duda). Sin botones, pero funcional. Este cambio es compatible con el renderer nativo
si después se hace (los botones tapan la lista de texto en web/móvil-nativo).

---

## 5. Otra alternativa (más "correcta" pero más grande): SlackAttachment actions

En vez de un tipo de post custom, postear el menú como un `SlackAttachment` con
`Actions` (`post.props.attachments[].actions[]`). La app móvil **ya sabe** renderizar
esos botones nativamente (`app/components/message_attachments/`), igual que la web.

**Contra:** los botones de attachment requieren `Integration.URL`. Para core (sin
plugin) hay que apuntar a `<SiteURL>/api/v4/welcome_faq/action` y Mattermost hace una
llamada HTTP de loopback a ese endpoint con el formato `PostActionIntegrationRequest`
(sin token de sesión → el endpoint quedaría sin auth de sesión; habría que validar el
trigger ID firmado o restringir a localhost). Por eso la implementación actual usó un
tipo de post custom + endpoint `APISessionRequired`. Cambiar a attachments implica
rehacer el endpoint y la parte web. Solo vale la pena si se quiere paridad web/móvil
"gratis" a futuro.

---

## 6. Cómo probar (con el server de dev)

1. En `GIA-WEB`: `cd server && make run`. Apuntar la app móvil (dev) a
   `http://<IP-LAN>:8065`.
2. System Console → Site Configuration → Customization → activar "Enable Welcome
   Message DM", poner prompt y 2-3 opciones (etiqueta / respuesta Markdown / keywords).
3. Panel `team_statistics` → Create User. Iniciar sesión en la app con esa cuenta.
4. Abrir el DM de "Sistema":
   - Debe verse el saludo + el menú (con botones si se hizo el renderer nativo; como
     texto si no).
   - Pulsar una opción → llega la respuesta + menú nuevo.
   - Escribir "como descargo la app" → llega la respuesta de esa opción (esto ya
     funciona hoy sin cambios en la app).

---

## 7. Estado del server/webapp al momento de este handoff (2026-09-08)

Todo lo de `GIA-WEB` está implementado y sin commitear (working tree del branch
`brand/v11.7.8`). Archivos clave:

- `server/channels/app/welcome_bot.go` (nuevo) — `postWelcomeMenu`, `matchWelcomeFaqItem`,
  `AnswerWelcomeFaq`, `HandleWelcomeBotReply`
- `server/channels/app/welcome_message.go` — `SendWelcomeMessageDM` (saludo + menú)
- `server/channels/api4/welcome_faq.go` (nuevo) + registro en `server/channels/api4/api.go`
- `server/channels/app/post.go` — 1 bloque `a.Srv().Go(...)` en `handlePostEvents`
- `server/public/model/config.go` + `server/config/config.json` — `WelcomeFaqItem` + campos
- `webapp/channels/src/components/post_view/welcome_faq_menu/` (nuevo)
- `webapp/channels/src/components/admin_console/welcome_faq_setting.tsx` (nuevo)
- `webapp/channels/src/actions/welcome_faq.ts` (nuevo)
- `webapp/channels/src/components/post_view/post_message_view/post_message_view.tsx`,
  `utils/constants.tsx` (`PostTypes.CUSTOM_GIA_WELCOME_MENU`),
  `webapp/platform/client/src/client4.ts` (`answerWelcomeFaq`),
  `admin_console/admin_definition.tsx`
- i18n: `server/i18n/{en,es}.json` (`app.welcome_bot.*`),
  `webapp/channels/src/i18n/{en,es}.json` (`admin.customization.welcomeFaq.*`)
