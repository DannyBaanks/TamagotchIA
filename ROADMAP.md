# Tamagotchi AI — Roadmap

> Objetivo: crear una criatura virtual que se sienta como un Tamagotchi real: con necesidades, estados de ánimo, hábitos, memoria, preferencias, crecimiento y consecuencias. El LLM le da voz y personalidad; el motor del juego mantiene la verdad.

## Principio central

```text
acción del jugador
    ↓
motor determinista
    ↓
estado canónico + evento
    ↓
LLM recibe contexto acotado
    ↓
reacción corta de la criatura
```

El LLM nunca puede modificar directamente hambre, energía, edad, inventario, evolución, timestamps ni ningún otro dato canónico.

## Arquitectura base

- Backend local: Python.
- API local: FastAPI.
- Frontend: TypeScript + HTML/CSS ligero.
- Persistencia: SQLite.
- LLM: interfaz `PersonalityProvider` compatible con proveedores OpenAI-compatible.
- Fallback: reacciones deterministas y `MockProvider`.
- Tests: pytest.
- Ejecución inicial: aplicación local en `localhost`, sin Electron.

## Milestones

### 0. Dirección del producto

Definir fantasía principal de crianza, tono y personalidad visual, convención de estadísticas, acciones oficiales, emociones e intenciones, eventos del juego, estética pixel-art y criterios de éxito del MVP.

**Resultado:** documento de diseño, glosario, máquina de estados inicial y wireframe de la pantalla principal.

### 1. Esqueleto ejecutable

Crear el repositorio independiente y una app arrancable con backend local, frontend visible, SQLite inicial, configuración por entorno, README y comandos de desarrollo y tests.

Primera pantalla: crear criatura, elegir nombre y comenzar.

**Done cuando:** la app inicia desde cero y no depende de otros repositorios.

### 2. Modelo canónico de criatura

Implementar `Creature`, `CreatureState`, `Event`, `Memory`, `Preference` y `Settings`.

Estado mínimo: hambre, energía, ánimo, salud, limpieza, curiosidad, vínculo, sueño y enfermedad, edad, experiencia y etapa, personalidad y preferencias, además de timestamps de interacción y simulación.

Todos los valores deben validarse y todos los cambios importantes deben producir eventos.

### 3. Motor determinista de simulación

Implementar `simulate_elapsed(duration)`, catch-up eficiente sin simular segundo por segundo, hambre con el tiempo, gasto y recuperación de energía, deterioro de limpieza, ánimo afectado por cuidados, enfermedad por abandono prolongado, rechazo de acciones cuando está exhausto y estados derivados: hambriento, cansado, sucio, aburrido, molesto, feliz, enfermo y dormido.

Usar reloj y semilla aleatoria inyectables.

**Done cuando:** el motor corre sin UI ni LLM y sus resultados son reproducibles.

### 4. Persistencia y continuidad temporal

Conectar el motor a SQLite con guardado automático, carga al iniciar, `last_tick_at`, historial de eventos, catch-up al reabrir, migraciones básicas y recuperación segura de saves incompletos.

**Done cuando:** cerrar y reabrir la app conserva la criatura y aplica correctamente el tiempo transcurrido.

### 5. Primera experiencia jugable

Construir la pantalla principal con sprite de criatura, animación idle, speech bubble, barras de necesidades, etapa evolutiva y botones Feed, Play, Pet, Sleep, Talk, Explore y Status.

Cada acción debe cambiar el estado real y mostrar feedback visual.

**Done cuando:** se siente como un Tamagotchi aunque el LLM esté apagado.

### 6. Minijuego mínimo

Implementar un solo minijuego pequeño, preferiblemente de reacción temporal. El resultado modifica determinísticamente ánimo, vínculo, experiencia y energía.

**Done cuando:** el minijuego puede iniciarse, terminarse y generar eventos sin convertirse en un segundo proyecto.

### 7. Personalidad y proveedor LLM

Crear `PersonalityProvider` con `MockPersonalityProvider`, `OpenAICompatibleProvider` y fallback determinista.

El LLM recibe evento, estado resumido, personalidad, vínculo, memorias relevantes y contexto temporal.

Respuesta validada:

```json
{
  "speech": "¿Otra manzana? Me estás consintiendo demasiado.",
  "emotion": "happy",
  "intent": "comment",
  "animation": "happy",
  "memory_candidate": null
}
```

Restricciones: entre 3 y 20 palabras, JSON válido, sin markdown, sin lenguaje de asistente, emociones/intenciones/animaciones pertenecientes a listas permitidas y nunca mutar el estado.

### 8. Memoria, preferencias y vínculo

Guardar eventos significativos, no conversaciones completas: primer día, comida favorita o rechazada, minijuego ganado, enfermedad y recuperación, evolución, ausencia prolongada y cuidados especiales.

El LLM puede proponer una memoria, pero el código decide si se guarda mediante reglas de saliencia, persistencia y decaimiento.

El vínculo debe calcularse desde la conducta real del jugador y mantenerse independiente de la opinión del LLM.

### 9. Evolución y consecuencias

Implementar:

```text
egg → baby → child → adult
```

La evolución depende de edad, cuidados, vínculo, experiencia, personalidad, historial de salud y actividades. El motor decide; el LLM solo reacciona.

Añadir enfermedad, recuperación, rechazo de acciones y recompensas por cuidado consistente.

### 10. Animación y vida autónoma

Animaciones mínimas: idle, happy, sad, sleepy, eating, playing, sick, side-eye y sleeping.

Conductas autónomas deterministas: caminar, mirar objetos, dormirse, jugar con un juguete, quejarse y celebrar.

El LLM solo aporta comentarios ocasionales y cortos.

### 11. Credenciales y proveedores

Soportar presets para OpenAI, OpenRouter, NVIDIA, proveedores locales y endpoints custom.

Requisitos: usar keyring de Linux cuando esté disponible, permitir variables de entorno como fallback avanzado, nunca guardar claves en SQLite, nunca imprimirlas en logs, nunca incluirlas en prompts, screenshots o saves, y funcionamiento completo sin clave.

### 12. Debug mode

Crear una vista de desarrollo con estado canónico, último tick y tiempo transcurrido, etapa, últimos eventos, memorias, proveedor, modelo y latencia, errores del LLM y modo offline.

Incluir controles para avanzar tiempo, enfermar, evolucionar, rellenar necesidades y simular errores. No mostrar API keys.

### 13. Pulido visual

Refinar paleta pixel-art, tipografía, botones, estados pressed/hover, speech bubbles, iconografía, transiciones, feedback visual, responsive básico y sonido opcional.

El juego debe dominar visualmente. Talk nunca debe convertirse en un chat gigante.

### 14. Robustez y seguridad

Probar proveedor offline, timeout, rate limit, JSON inválido, proveedor desconocido, SQLite bloqueado, save corrupto, reloj adelantado o atrasado, cierre durante una acción y reinicio inesperado.

Garantías: el LLM nunca modifica la realidad, las acciones se procesan una sola vez, los eventos importantes son auditables, siempre existe fallback local y los secretos no aparecen en archivos de estado.

### 15. Pruebas de aceptación

La demo completa debe permitir:

1. Abrir la aplicación.
2. Crear y nombrar una criatura.
3. Verla animada y sus necesidades.
4. Alimentarla y recibir una frase corta.
5. Jugar un minijuego.
6. Ver cambiar ánimo y vínculo.
7. Cerrar y reabrir la aplicación.
8. Aplicar correctamente el tiempo transcurrido.
9. Confirmar una memoria significativa.
10. Desconectar el proveedor y seguir jugando.
11. Ver una evolución.
12. Recuperarse de un error sin perder el save.

### 16. Release local 1.0

Entregar README de instalación y uso, comandos de desarrollo, tests y provider setup, base de datos local, guía de backup, troubleshooting, changelog, licencia, screenshots, datos de ejemplo y build ejecutable local.

## Orden de ejecución

```text
diseño
  ↓
motor determinista
  ↓
persistencia
  ↓
UI jugable
  ↓
minijuego
  ↓
LLM
  ↓
memoria y personalidad
  ↓
evolución
  ↓
animación
  ↓
seguridad y pulido
  ↓
release
```

## Definición final de éxito

El proyecto está terminado cuando el jugador puede alimentar, acariciar, cansar, dejar dormir y volver a visitar a la misma criatura; reconocer sus hábitos y personalidad; observar consecuencias; y seguir jugando aunque el LLM esté desconectado.

La primera prioridad no es “tener IA”. Es conseguir que la criatura se sienta viva. El LLM debe hacer que esa criatura tenga una voz memorable.
