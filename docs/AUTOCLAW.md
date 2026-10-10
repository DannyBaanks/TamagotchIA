# Trabajo hecho con AutoClaw

Este documento deja por escrito **qué se cambió, por qué, y cómo comprobarlo**. No es un
escaparate: cada afirmación de aquí se puede verificar con los comandos de abajo.

## Qué se hizo

Una revisión de coherencia entre lo que el repositorio **dice** y lo que el repositorio
**es**. El código del juego no se tocó; los 79 tests existentes siguen pasando.

### 1. Conteos de tests que no eran ciertos

| Dónde | Decía | Realidad medida |
| --- | --- | --- |
| `README.md` | "55 tests" | **79 tests** en 6 archivos |
| `GUIA.md` | "5 passed (5)" / "75 passed (75)" | **6 passed (6)** / **79 passed (79)** |

Comprobación:

```console
$ npm test
 Test Files  6 passed (6)
      Tests  79 passed (79)
```

### 2. El ROADMAP describía otra arquitectura

La sección "Arquitectura base" pedía *backend Python + FastAPI, SQLite y pytest*. En este
repositorio no hay backend, ni SQLite, ni pytest: la app es TypeScript con Vite, el motor
vive dentro del dispositivo y el guardado es versionado en `localStorage`.

No era un olvido aislado: el propio `SPEC.md` ya documenta esa decisión en su tabla
"Antes / Ahora" (*un servidor Python no vive en un teléfono*). El ROADMAP se quedó atrás.

Se alinearon la arquitectura base y los cuatro milestones que la repetían (esqueleto,
persistencia, credenciales y pruebas de robustez). Ahora la arquitectura descartada aparece
**una sola vez y explicada**, en lugar de repartida como si fuera la vigente.

### 3. Dos funciones que existían y no estaban contadas

- **Adoptar con tu propio GIF/PNG** (`28c3c8e`): importador de mascota propia desde el
  teléfono. No estaba en el README.
- **GUS, voz 100% offline** (`3c62934`): catálogo de modelos GGUF con SHA-256 fijado, para
  hablar sin internet ni clave. Estaba en la GUIA a medias (dos de los tres modelos) y no
  aparecía en el README.

Ambas quedaron documentadas, y la lista de GUS ahora coincide con la fuente de verdad,
`src/persona/gus.ts`.

## Cómo se comprobó

```console
$ npm test          # 79 tests en verde, 6 archivos
$ npm run check     # tsc --noEmit, sin errores
$ npm run build     # build de producción en dist/
```

## Qué NO se hizo

- **No se tocó el motor del juego.** Ni hambre, ni energía, ni evolución, ni el contrato de
  la voz. El cambio es de documentación y coherencia.
- **No se añadieron funciones nuevas.** El trabajo fue hacer que lo documentado sea verdad,
  no inventar capacidades.
- **No se afirma que se haya probado en un teléfono físico** ni contra un proveedor de IA
  real desde la app. La GUIA sigue diciendo `NO PROBADO` donde corresponde, y eso se respeta.
- **No se cambió el comportamiento de la app**, así que la demo publicada sigue funcionando
  igual que antes.

## Alcance

Esta revisión la hizo **AutoClaw** a petición del autor, sobre un repositorio que ya existía
y ya funcionaba. El trabajo previo del proyecto (motor, avatares, voz, GUS, importador) es
del autor y de las sesiones anteriores; lo de aquí es la puesta en orden de la documentación
y la verificación de que los números son reales.
