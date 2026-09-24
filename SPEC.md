# Tamagotchi AI — Especificación técnica MVP

Estado: propuesta para revisión

## 1. Objetivo

Construir una aplicación local-first donde el jugador cuide una criatura virtual persistente. El motor determinista es la fuente de verdad del juego. El LLM solo convierte eventos y contexto autorizado en una reacción corta de personalidad.

El MVP debe funcionar completamente sin conexión ni API key.

## 2. Alcance del MVP

Incluye:

- una criatura;
- creación y nombre;
- etapas `egg`, `baby`, `child`, `adult`;
- hambre, energía, ánimo, salud, limpieza, curiosidad y vínculo;
- sueño, enfermedad y consecuencias de abandono;
- Feed, Play, Pet, Sleep, Talk y Explore;
- un minijuego de reacción;
- SQLite local y catch-up temporal;
- eventos y memorias significativas;
- proveedor mock, proveedor OpenAI-compatible y fallback local;
- interfaz pixel-art ligera;
- vista de estado para desarrollo.

No incluye multiplayer, cuentas, cloud sync, móvil, voz, cámara, agentes autónomos ni integraciones con otros repositorios.

## 3. Límites arquitectónicos

```text
UI
 ↓
Application services
 ↓
SimulationEngine ── EventStore ── SQLite
       │
       ├── MemoryPolicy
       ├── Persistence
       └── PersonalityProvider
```

Reglas:

- `SimulationEngine` no depende de la UI.
- `PersonalityProvider` no puede mutar `CreatureState`.
- La UI solicita comandos; no edita estadísticas directamente.
- La persistencia guarda el resultado de comandos y eventos.
- Todas las decisiones importantes del juego son funciones deterministas del estado, tiempo y comando.

## 4. Convenciones del estado

Todos los indicadores usan `0..100`.

- `hunger`: `0` lleno, `100` muriendo de hambre.
- `energy`: `0` agotado, `100` lleno de energía.
- `mood`: `0` miserable, `100` feliz.
- `health`: `0` crítico, `100` saludable.
- `cleanliness`: `0` muy sucio, `100` limpio.
- `curiosity`: `0` sin curiosidad, `100` muy curioso.
- `bond`: `0` sin vínculo, `100` vínculo máximo.

La criatura siempre tiene un `last_tick_at`. Cada comando aplica primero el tiempo transcurrido y luego la acción.

## 5. Modelo de dominio

### Creature

- `id`
- `name`
- `species`
- `created_at`
- `age_seconds`
- `stage`
- `experience`
- `personality_seed`
- `personality_traits`
- `favorite_foods`
- `disliked_foods`
- `favorite_activities`
- `last_interaction_at`
- `last_tick_at`

### CreatureState

- `hunger`
- `energy`
- `mood`
- `health`
- `cleanliness`
- `curiosity`
- `bond`
- `asleep`
- `sick`

### Event

- `id`
- `creature_id`
- `timestamp`
- `kind`
- `payload`
- `dedupe_key`

Eventos iniciales: `CREATURE_CREATED`, `FED`, `PLAYED`, `PETTED`, `CLEANED`, `TALKED`, `WENT_TO_SLEEP`, `WOKE_UP`, `BECAME_SICK`, `RECOVERED`, `EVOLVED`, `MINI_GAME_WON` y `MINI_GAME_LOST`.

### Memory

- `id`
- `creature_id`
- `timestamp`
- `category`
- `summary`
- `salience`
- `related_entity`
- `persistence_class`
- `expires_at`

## 6. Simulación

La simulación debe exponer una operación equivalente a:

```text
simulate_elapsed(state, duration, rules) -> state_delta + derived_events
```

Reglas iniciales:

- hambre aumenta despierta y más lentamente dormida;
- energía baja despierta y se recupera dormida;
- limpieza baja con el tiempo;
- el ánimo responde a hambre, energía, cuidados y aburrimiento;
- salud baja solo tras estados negativos sostenidos;
- hambre extrema o salud baja puede producir enfermedad;
- el tiempo de catch-up tiene un límite configurable para evitar saltos absurdos;
- no se usa aleatoriedad en reglas esenciales.

## 7. Comandos de aplicación

Cada comando recibe un `creature_id`, un reloj inyectado y un payload validado. Devuelve el estado actualizado, eventos producidos y una solicitud opcional de reacción narrativa.

Comandos:

- `CreateCreature`
- `Feed`
- `Play`
- `Pet`
- `Sleep`
- `Wake`
- `Talk`
- `Explore`
- `CompleteMiniGame`

El LLM se invoca después de persistir el resultado determinista, nunca antes.

## 8. Contrato del PersonalityProvider

Entrada resumida:

```json
{
  "event": {"kind": "FED", "payload": {"food": "apple"}},
  "state": {"hunger": 42, "mood": 78, "bond": 35},
  "stage": "baby",
  "traits": {"affection": 0.8, "sarcasm": 0.4},
  "memories": [],
  "time_of_day": "afternoon"
}
```

Salida permitida:

```json
{
  "speech": "Otra manzana y te adopto yo a ti.",
  "emotion": "happy",
  "intent": "comment",
  "animation": "happy",
  "memory_candidate": null
}
```

Validación:

- `speech` de 3 a 20 palabras;
- sin markdown ni explicaciones;
- enums cerrados para emoción, intención y animación;
- timeout corto;
- un intento de reparación como máximo;
- cualquier fallo usa fallback local;
- la salida nunca se convierte en un comando del juego.

Intenciones iniciales: `idle`, `comment`, `request_food`, `request_play`, `request_sleep`, `request_attention` y `request_cleaning`.

## 9. Memoria y preferencias

El proveedor puede proponer una memoria. `MemoryPolicy` decide si se acepta según categoría, saliencia, duplicados y límites de almacenamiento.

Las preferencias se actualizan mediante reglas del juego. Por ejemplo, repetir una actividad o comida puede fortalecer una afinidad, pero el LLM no puede inventar posesiones ni preferencias sin un evento real que las respalde.

## 10. Persistencia

SQLite tendrá inicialmente estas tablas:

- `creatures`
- `creature_states`
- `events`
- `memories`
- `preferences`
- `settings`

Las transacciones deben incluir el comando, el estado resultante y los eventos derivados. La API nunca devuelve ni registra credenciales.

## 11. UI

La pantalla principal prioriza el juego:

- criatura al centro;
- animación según estado;
- speech bubble breve;
- barras de necesidades;
- acciones principales;
- acceso secundario a status/debug.

No se construirá una pantalla de chat como superficie principal. `Talk` genera una interacción breve integrada en el juego.

## 12. Proveedores y offline

`PersonalityProvider` tendrá estas implementaciones:

- `MockPersonalityProvider` para tests y desarrollo;
- `FallbackPersonalityProvider` con frases locales;
- `OpenAICompatibleProvider` para APIs remotas o locales.

El motor no espera al LLM para completar una acción. Una llamada lenta, fallida o inexistente solo afecta la frase y animación narrativa.

## 13. Pruebas obligatorias

### Dominio

- rangos y validación;
- alimentación modifica hambre y ánimo;
- dormir restaura energía;
- jugar consume energía;
- vínculo responde a cuidados;
- evolución respeta umbrales;
- catch-up es determinista;
- estados extremos producen consecuencias esperadas.

### Integración

- guardar y cargar sobrevive reinicio;
- eventos quedan registrados;
- memoria aceptada queda registrada;
- acciones son idempotentes cuando corresponda;
- proveedor inválido usa fallback;
- JSON inválido no muta estado;
- una API key nunca aparece en save, logs ni payload de estado.

### Aceptación

La demo debe cubrir el flujo completo del roadmap: crear, cuidar, jugar, cerrar, reabrir, recordar, evolucionar y continuar offline.

## 14. Orden de implementación

1. Scaffolding y comandos de desarrollo.
2. Modelo de dominio y validación.
3. Simulación con reloj falso.
4. Persistencia SQLite.
5. Servicios de comandos.
6. API local.
7. UI mínima jugable.
8. Minijuego.
9. Mock y fallback narrativo.
10. Proveedor OpenAI-compatible.
11. Memoria, preferencias y evolución.
12. Animación, debug y pulido.
13. Pruebas de aceptación y release local.

## 15. Decisiones pendientes menores

- librería concreta de frontend;
- estilo final de sprites;
- nombres de la primera especie;
- valores exactos de las curvas de simulación;
- proveedor remoto usado para la primera demo.

Estas decisiones no deben romper los límites de dominio ni retrasar el vertical slice.

## 16. Decisión 2026-09-24: PWA en el teléfono (reemplaza partes de §2, §3, §10)

Decidido por Danny el 2026-09-24. Esta sección **se agrega**; lo de arriba queda como historia del diseño original.

| Antes (§2, §3, §10) | Ahora | Por qué |
|---|---|---|
| "No incluye … móvil" | El objetivo principal es el teléfono, como PWA instalable | Danny quiere un companion de bolsillo |
| Backend Python + FastAPI | Motor determinista en TypeScript, dentro del dispositivo | Un servidor Python no vive en un teléfono; con la PC apagada la criatura dejaría de existir |
| SQLite | Guardado versionado en `localStorage` con copia de respaldo y registro de eventos | Es la persistencia disponible en una PWA sin servidor |
| Keyring de Linux para las claves | La clave queda solo en el dispositivo, en un almacén aparte del save, y nunca se exporta | Una PWA no tiene keyring |

Lo que **no** cambia: el motor es la única fuente de verdad, el `PersonalityProvider` no puede mutar el estado, todo funciona sin conexión y sin clave, los indicadores van de `0..100` y la UI solo pide comandos.

Arte: la primera especie reutiliza los packs de Companion (MIT, ISyCo contributors), copiados de Companion `e7e8692` con sus hashes en `public/packs/SHA256SUMS`. Malbolgato usa sus GIFs animados; Shinji usa sus PNG estáticos con animación CSS, porque sus GIFs no están commiteados en Companion.

Siguiente paso fuera de este alcance: envolver la PWA en un APK (Capacitor o Tauri 2) cuando el Android SDK esté instalado.
