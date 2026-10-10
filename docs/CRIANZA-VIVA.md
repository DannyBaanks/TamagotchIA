# Crianza Viva — evidencia y estado

Implementación de la parte P0 del Compose *"TamagotchIA — Crianza Viva"*.
Este documento es el resultado, separado del encargo: dice **qué se construyó, qué se
demostró y qué no**. Nada de aquí se afirma sin una prueba que lo respalde.

## La idea en una frase

Dos criaturas nacen iguales (misma especie, misma semilla). La forma en que las cuidas
las vuelve diferentes, y esa diferencia vive en el **estado canónico del juego**, no en el
modelo que les presta la voz.

## Qué se construyó

| Pieza | Archivo | Qué hace |
| --- | --- | --- |
| Huella de crianza | `src/engine/fingerprint.ts` | Proyecta los eventos que ya existían en 4 ejes (afecto, curiosidad, juego, calma) de 0–100, con la evidencia de cada punto |
| Prueba de independencia | `src/persona/independence.ts` | Hash de la identidad canónica; cambiar de voz no debe moverlo |
| Escena A/B | `src/ui/abDemo.ts` | Dos crianzas reproducibles sobre mundos desechables |
| Tarjeta «Así me has criado» | `src/app.ts` | Hasta 3 rasgos, cada uno con el conteo real que lo respalda |
| Especie Claw | `src/species.ts`, `src/avatar/render.ts` | El cangrejo: cuerpo nuevo compilado por código |

### La huella

Es una **proyección**, no una segunda fuente de verdad: se puede reconstruir siempre desde
los eventos, no se escribe nunca en el mundo y está versionada (`care-fingerprint-rules/1`),
así que una evidencia vieja no se lee con reglas nuevas.

Dos frenos evitan que aporrear un botón fabrique personalidad:

- **Saturación suave**: doblar las acciones nunca dobla la puntuación.
- **Tope por sesión**: dentro de una misma sesión (eventos a menos de 30 min) una acción
  cuenta como máximo 3 veces.

### Claw, el cangrejo

Es una tercera especie jugable, dibujada **enteramente por el compilador** `criatura/1`
—ni un archivo de imagen, ni arte de terceros—. Su cuerpo (`cangrejo`) aporta caparazón
ancho, dos pinzas, cuatro patas y antenas con la punta encendida. La paleta es la del logo
de la garra, medida sobre el original: cuerpo `#ce3434`, pupila `#00dec6`.

## Qué se demostró

Cada fila viene de un test que puede fallar. La matriz de falsación del Compose, traducida:

| ID | Qué se probó | Dónde | Estado |
| --- | --- | --- | --- |
| F01 | Misma historia → misma huella | `tests/fingerprint.test.ts` | **DEMONSTRATED** |
| F02 | Historias A/B distintas → diferencias **justificadas por eventos** | `tests/fingerprint.test.ts`, `tests/abDemo.test.ts` | **DEMONSTRATED** |
| F03 | Cambiar de voz (o que falle) no mueve el hash canónico | `tests/independence.test.ts` | **DEMONSTRATED** |
| F06 | Eventos duplicados o reordenados → misma huella | `tests/fingerprint.test.ts` | **DEMONSTRATED** |
| F09 | Cada rasgo mostrado cita un conteo real y no filtra internos | `tests/fingerprint.test.ts` | **DEMONSTRATED** |
| F10 | Sin evidencia suficiente no se nombra el rasgo | `tests/fingerprint.test.ts` | **DEMONSTRATED** |
| F11 | La demo A/B no toca ningún almacenamiento | `tests/abDemo.test.ts` | **DEMONSTRATED** |
| Claw | Compila en las 6 poses, con la paleta propia y distinto de las otras especies | `tests/claw.test.ts` | **DEMONSTRATED** |
| F04 | Que un LLM invente un evento y sea neutralizado | — | **INFERRED** (el validador de la voz ya rechaza fuera de contrato; no hay prueba nueva) |
| F05 | Reabrir e importar un respaldo conserva la huella | `tests/independence.test.ts` (round-trip por serialización) | **PARTIAL** |
| F07 | Manipular el reloj o una ausencia larga | — | **NOT_DEMONSTRATED** (lo cubre el motor existente; sin prueba nueva aquí) |
| F08 | Juego completo sin conexión ni clave | — | **NOT_DEMONSTRATED aquí** (es comportamiento previo del proyecto) |
| F12 | UI móvil real, con teclado y tacto | — | **NOT_DEMONSTRATED** (sin dispositivo físico) |

### Los números de la escena A/B

Salida real, no un ejemplo redactado a mano:

```
Criada con cariño      →  Cariñosa:   Me diste mimos 6 veces
                          Tranquila:  Descansamos juntos 6 veces

Criada con aventuras   →  Curiosa:    Exploramos juntos 3 veces
                          Juguetona:  Jugamos 5 veces
```

Nacieron del mismo huevo (semilla `7`), con el mismo reloj. Lo único distinto fue el cuidado.

## Cómo se comprobó

```
$ npm test
 Test Files  10 passed (10)
      Tests  108 passed (108)

$ npm run check      # tsc --noEmit, sin errores
$ npm run build      # ✓ built in 479ms
```

Antes de este trabajo la suite tenía **79** tests; ahora tiene **108**. Los 79 anteriores
siguen intactos: no se relajó ni se borró ninguno.

## Qué NO se hizo (y por qué)

- **No se tocó el motor de simulación.** Hambre, energía, evolución y el contrato de la voz
  quedan como estaban. La huella *lee* eventos; no añade reglas al juego.
- **P1 y P2 quedaron fuera.** «Teatro de recuerdos», «Reencuentro gentil», «Jardín de
  posibilidades» y los encuentros CANON son propuestas del Compose, no entregas. No se
  implementaron y no se presentan como hechas.
- **Rituales emergentes** (la P1 prioritaria) no se empezó: el plan pedía P0 probado primero
  y eso es lo que hay.
- **GUS sigue siendo un catálogo, no inferencia probada en móvil.** No se afirma lo
  contrario.
- **No se probó en un teléfono físico.** El layout se verificó en viewport móvil, que no es
  lo mismo. Por eso F12 es `NOT_DEMONSTRATED`.
- **No se publicó nada en X ni se envió formulario.**

## Límites conocidos

- La huella resume **cuatro ejes**: es una lectura legible, no un diagnóstico psicológico.
- El tope por sesión puede dejar fuera historias legítimas muy concentadas en el tiempo;
  es el precio de que sostener un botón no cuente como personalidad.
- Claw no trae sprites animados: el compilador dibuja fotogramas por pose, así que se
  comporta como Shinji (`animated: false`) y no como el GIF de Malbolgato.
