# Guía de TamagotchIA

## El comando

```bash
cd "/home/danny/Development/ISyCo Git/TamagotchIA"
npm run dev
```

Abre `http://localhost:5173/` en el navegador. Para verlo como en el teléfono, activa en Chrome la vista móvil con `F12` y luego `Ctrl+Shift+M`.

## La regla de oro

**El motor decide y el modelo solo habla.** Hambre, energía, salud, evolución y recuerdos los cambia únicamente el motor (`src/engine/`). El modelo de lenguaje recibe un resumen y devuelve una frase con una cara; si inventa algo, lo que devuelve no toca el juego. Sin modelo, sin internet y sin clave, todo sigue funcionando con la voz local.

## Los comandos, uno por uno

### Correr los tests

```console
$ npm test
 ✓ tests/persona.test.ts (17 tests) 40ms
 ✓ tests/engine.test.ts (17 tests) 145ms

 Test Files  3 passed (3)
      Tests  41 passed (41)
   Start at  11:14:19
   Duration  409ms (transform 133ms, setup 0ms, collect 214ms, tests 194ms, environment 0ms, prepare 198ms)
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

## Respaldo

Ajustes → **Exportar respaldo** descarga `tamagotchia-<nombre>-<fecha>.json`. **Importar** lo carga en otro teléfono. El archivo lleva un checksum, así que uno editado a mano se rechaza con «el checksum no coincide».

## Trampas

1. **Desde el celular por la IP de tu red no se instala ni funciona offline.** Por `http://192.168.x.x` el navegador no lo trata como sitio seguro, y sin eso no hay service worker. Medido el 2026-09-24:

   ```text
   http://127.0.0.1:5177/     isSecureContext: true   serviceWorker: true
   http://192.168.1.102:5177/ isSecureContext: false  serviceWorker: false
   ```

   Se puede jugar y la partida se guarda, pero para **instalarla en el teléfono** necesita HTTPS. El camino más corto es publicar `dist/` en GitHub Pages.

2. **Muchos proveedores no dejan que un navegador les hable directo (CORS).** Si «Probar la voz» dice `Failed to fetch`, el problema casi nunca es tu clave: es que ese endpoint no acepta peticiones desde una página web. OpenRouter sí las acepta. Con Ollama hay que arrancarlo permitiendo el origen de la app (`OLLAMA_ORIGINS`). **NO PROBADO** con cada proveedor.

3. **«Ollama (en este aparato)» en el teléfono apunta al teléfono.** `localhost` siempre es el aparato donde está abierta la app. Para usar el Ollama de tu PC desde el celular, pon la IP de la PC (`http://192.168.1.102:11434/v1`), y recuerda la trampa 2.

4. **Una criatura descuidada no crece.** Si pasa 25 horas sin comer se enferma, y enferma no evoluciona. No es un bug: está cubierto por el test `a neglected creature gets sick and does not grow`.

5. **El reloj de debug se queda guardado.** Si usaste `+24 h` en el panel de debug, la app sigue viviendo adelantada hasta que pulses **Reloj real**.

6. **Cambiar la hora del teléfono hacia atrás no hace nada.** El motor ignora un reloj que retrocede. Si lo adelantas mucho, solo se simulan 72 horas como máximo.
