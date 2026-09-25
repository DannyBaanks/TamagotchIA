# Guía de TamagotchIA

## El comando

```bash
cd TamagotchIA        # la carpeta donde clonaste el repo
npm install           # solo la primera vez
npm run dev
```

Abre `http://localhost:5173/` en el navegador. Para verlo como en el teléfono, activa en Chrome la vista móvil con `F12` y luego `Ctrl+Shift+M`.

## La regla de oro

**El motor decide y el modelo solo habla.** Hambre, energía, salud, evolución y recuerdos los cambia únicamente el motor (`src/engine/`). El modelo de lenguaje recibe un resumen y devuelve una frase con una cara; si inventa algo, lo que devuelve no toca el juego. Sin modelo, sin internet y sin clave, todo sigue funcionando con la voz local.

## Los comandos, uno por uno

### Correr los tests

```console
$ npm test
 ✓ tests/store.test.ts (7 tests) 6ms
 ✓ tests/notify.test.ts (13 tests) 27ms
 ✓ tests/persona.test.ts (17 tests) 43ms
 ✓ tests/engine.test.ts (17 tests) 164ms
 Test Files  4 passed (4)
      Tests  54 passed (54)
   Start at  18:13:54
   Duration  547ms (transform 233ms, setup 0ms, collect 375ms, tests 239ms, environment 1ms, prepare 227ms)
```

### Levantar la app para desarrollar

```console
$ npm run dev

  VITE v6.4.3  ready in 83 ms

  ➜  Local:   http://localhost:5176/
  ➜  Network: http://192.168.1.102:5176/
```

El puerto normal es `5173`; esta salida es de una corrida con `-- --port 5176`. Las líneas `Network` son las direcciones que puedes abrir desde el celular si está en el mismo wifi (lee la trampa 1).

### Compilar la versión final

```console
$ npm run build
dist/index.html                                        0.90 kB │ gzip:  0.45 kB
dist/assets/index-BfWQHFU1.css                        44.16 kB │ gzip: 23.34 kB
dist/assets/index-CkWYg76w.js                         46.02 kB │ gzip: 17.31 kB
✓ built in 186ms
```

(Recorté las líneas de las fuentes.) Lo que sale en `dist/` es la app completa: HTML, JS, arte, manifest y service worker. Se puede servir desde cualquier hosting estático.

### Probar la versión final

```console
$ npm run preview
  ➜  Local:   http://localhost:4173/
  ➜  Network: http://192.168.1.102:4173/
```

Sirve `dist/`; antes corre `npm run build`. Esta es la versión donde funcionan el modo offline y el botón de instalar; en `npm run dev` el service worker está apagado a propósito.

## Cómo leer lo que ves

| Lo que aparece | Qué significa | Qué hacer |
|---|---|---|
| Barra roja que salta | Esa necesidad está abajo del 25 % | Atiéndela; si es Pancita, dale de comer |
| 🍙 🧼 🌙 🎈 💢 arriba de la criatura | Te pide algo: comida, baño, dormir, jugar o está de malas | Lo que pide |
| 🤒 y la criatura se ve verdosa | Está enferma: pasó 6 horas descuidada | Dale de comer y báñala; sana tras 2 horas bien cuidada |
| 💩 en el piso | Limpieza baja | Más → Bañar |
| `z z Z` | Está dormida | Déjala dormir; si la despiertas con poca energía, despierta de malas |
| Burbuja con `• • •` | El modelo está pensando la frase | Espera; si no contesta en 8 s habla la voz local |
| Ajustes → «✓ Responde el modelo» | La voz está conectada | Nada |
| Ajustes → «Usó la voz local porque: …» | El modelo no respondió bien; el motivo viene después de «porque» | Revisa la trampa 2 o 3 |
| Toast «Recuperé la partida anterior» | La partida principal estaba dañada y se cargó el respaldo | Nada: esa es la protección funcionando |

## Poner un modelo como la voz

Ajustes → **La voz**:

1. Marca «Usar un modelo como su voz».
2. Elige un proveedor, o escribe la URL base de cualquier endpoint compatible con OpenAI.
3. Escribe el modelo, por ejemplo uno de OpenRouter.
4. Pega la API key. Se guarda solo en ese teléfono, separada de la partida; no entra en el respaldo exportado.
5. Pulsa **Probar la voz**.

Probado el 24 de septiembre de 2026 contra un endpoint local de prueba que habla el mismo protocolo:

```text
✓ Responde el modelo (15 ms): «¡Yo también te quiero, Mochi! Bueno… tú eres mi persona.»
```

**NO PROBADO** con un proveedor real (OpenRouter, NVIDIA, OpenAI, Ollama): en esta máquina no había clave configurada ni modelo local descargado. Lo que sí quedó comprobado es que la clave viaja solo en el header `Authorization`, nunca en el cuerpo de la petición ni en el save.

## Avisos

Ajustes → **Avisos** → marca **Avisarme** y acepta el permiso del navegador.

- Te avisa cuando **empieza** una necesidad (hambre, suciedad, enfermedad, sueño, soledad), cuando despierta y cuando sale del huevo. Un aviso por episodio: no te repite «tiene hambre» cada minuto.
- Máximo un aviso cada 20 minutos; si hay varios, va primero el más urgente (enfermedad, luego eclosión, luego hambre…).
- En **horas de silencio** (22:00 a 08:00 por defecto) los guarda y te los da al terminar el silencio, solo si sigue siendo cierto. Si ya le diste de comer, ese aviso se descarta.
- Con la app **en pantalla** no avisa: ya lo estás viendo.

**Próximos avisos** es una predicción del motor: simula hacia adelante qué pasaría si no haces nada. Salida real del 2026-09-24, con un huevo recién adoptado:

```text
🐣 ¡El huevo de TontoPT se abrió!   06:14 p.m.
🍙 TontoPT tiene hambre             05:37 a.m. · llega a las 08:00
🌙 TontoPT no puede más de sueño    07:52 a.m. · llega a las 08:00
```

Prueba de entrega del mismo día: con la app en segundo plano, el huevo eclosionó solo y el service worker mostró

```json
{ "title": "🐣 ¡El huevo de TontoPT se abrió!", "body": "Ven a conocer a tu criatura.", "tag": "hatch" }
```

**Con la app cerrada del todo no llegan avisos.** Una PWA sin servidor no puede despertarse sola. La predicción ya existe (`src/engine/forecast.ts`), así que en la versión APK esos horarios se programan como notificaciones locales del sistema. **NO PROBADO** en un teléfono físico.

## Respaldo

Ajustes → **Exportar respaldo** descarga `tamagotchia-<nombre>-<fecha>.json`. **Importar** lo carga en otro teléfono. El archivo lleva un checksum, así que uno editado a mano se rechaza con «el checksum no coincide».

## Trampas

1. **Desde el celular por la IP de tu red no se instala ni funciona offline.** Por `http://192.168.x.x` el navegador no lo trata como sitio seguro, y sin eso no hay service worker. Medido el 2026-09-24:

   ```text
   http://127.0.0.1:5177/     isSecureContext: true   serviceWorker: true
   http://192.168.1.102:5177/ isSecureContext: false  serviceWorker: false
   ```

   Se puede jugar y la partida se guarda, pero para **instalarla en el teléfono** necesita HTTPS. El camino más corto es publicar `dist/` en GitHub Pages.

2. **No todos los proveedores le contestan a una página web (CORS).** Medido el 2026-09-24 desde `https://dannybaanks.github.io`, con una clave falsa:

   ```json
   {
    "nvidia": "bloqueado: TypeError: Failed to fetch",
    "openrouter": "respuesta HTTP 401 (el navegador SÍ pudo leerla)",
    "openai": "respuesta HTTP 401 (el navegador SÍ pudo leerla)"
   }
   ```

   **NVIDIA directo (`nvapi-…`) no funciona en la app web.** Su servidor no manda los encabezados CORS, así que el navegador bloquea la respuesta aunque la clave sea buena. En la app sale así:

   ```text
   Usó la voz local porque: el servicio no le contestó a esta página: sin internet, o no acepta apps web (CORS).
   ```

   Los modelos de NVIDIA están gratis en OpenRouter (`nvidia/nemotron-…:free`). Con una clave mal copiada, OpenRouter responde así:

   ```text
   Usó la voz local porque: la clave no es válida o está mal copiada (HTTP 401).
   ```

   **NO PROBADO** con una clave real: el modelo sugerido `google/gemma-4-31b-it:free` sale de la lista pública de OpenRouter del 2026-09-24, pero nadie lo ha probado todavía con TamagotchIA. Con Ollama hay que arrancarlo permitiendo el origen de la app (`OLLAMA_ORIGINS`).

3. **«Ollama (en este aparato)» en el teléfono apunta al teléfono.** `localhost` siempre es el aparato donde está abierta la app. Para usar el Ollama de tu PC desde el celular, pon la IP de la PC (`http://192.168.1.102:11434/v1`), y recuerda la trampa 2.

4. **Una criatura descuidada no crece.** Si pasa 25 horas sin comer se enferma, y enferma no evoluciona. No es un bug: está cubierto por el test `a neglected creature gets sick and does not grow`.

5. **El reloj de debug se queda guardado.** Si usaste `+24 h` en el panel de debug, la app sigue viviendo adelantada hasta que pulses **Reloj real**.

6. **Cambiar la hora del teléfono hacia atrás no hace nada.** El motor ignora un reloj que retrocede. Si lo adelantas mucho, solo se simulan 72 horas como máximo.

7. **Android puede matar la pestaña en segundo plano.** Mientras el navegador conserve la app viva, avisa (Chrome revisa como mucho una vez por minuto en segundo plano). Si el sistema la cierra para ahorrar batería, deja de avisar hasta que la abras. Es la misma limitación de «app cerrada».

8. **«Probar un aviso» no dice nada.** Si el permiso quedó bloqueado, el navegador ya no vuelve a preguntar: hay que desbloquearlo desde la configuración del sitio (el candado junto a la dirección). Por la IP de la red tampoco funciona (trampa 1).
