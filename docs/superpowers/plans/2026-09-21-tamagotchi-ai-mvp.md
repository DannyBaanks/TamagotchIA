# Tamagotchi AI MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Construir una aplicación local-first jugable donde una criatura persistente tenga necesidades, consecuencias, memoria y personalidad narrativa sin que el LLM controle la realidad del juego.

**Architecture:** Python será la fuente de verdad mediante un dominio determinista separado de persistencia, API, proveedor narrativo y UI. FastAPI expondrá comandos y estado; SQLite conservará criatura, estados, eventos y memorias; el frontend TypeScript presentará el juego, no un chat.

**Tech Stack:** Python 3, FastAPI, Pydantic, SQLite, pytest, TypeScript, Vite y HTML/CSS.

**Spec:** `SPEC.md`

## Global Constraints

- El MVP debe funcionar completamente sin conexión ni API key.
- El motor determinista es la fuente de verdad del juego.
- El `PersonalityProvider` no puede mutar `CreatureState`.
- El LLM solo genera una reacción narrativa corta y validada.
- Todos los indicadores usan `0..100`.
- La UI solicita comandos; no edita estadísticas directamente.
- La persistencia es local y usa SQLite.
- No se añadirán multiplayer, cuentas, cloud sync, móvil, voz, cámara ni integraciones externas en este plan.
- Las API keys no se guardan en SQLite, saves, logs, prompts ni screenshots.

## Review Focus

- Catch-up con horas o días transcurridos sin iterar segundo por segundo: tests en `test_simulation.py` y `test_persistence.py`.
- Respuesta LLM inválida, incompleta o fuera de enum: tests en `test_personality.py`.
- Fallo, timeout o ausencia total de proveedor: tests en `test_fallback.py`.
- Doble envío de una acción o reintento HTTP: tests en `test_commands.py`.
- Save incompleto o reloj atrasado: tests en `test_persistence.py`.

## Mapa de archivos

### Backend

- `backend/app/domain/models.py`: modelos inmutables/validables de criatura, estado, eventos y memorias.
- `backend/app/domain/rules.py`: constantes y reglas deterministas.
- `backend/app/domain/simulation.py`: catch-up y estados derivados.
- `backend/app/domain/commands.py`: comandos de juego y resultados.
- `backend/app/application/services.py`: orquestación de comandos, persistencia y narrativa.
- `backend/app/infrastructure/db.py`: conexión, esquema y transacciones SQLite.
- `backend/app/infrastructure/repositories.py`: repositorios de criaturas, eventos y memorias.
- `backend/app/personality/contracts.py`: contrato validado del proveedor narrativo.
- `backend/app/personality/providers.py`: mock, fallback y proveedor compatible.
- `backend/app/api/routes.py`: endpoints HTTP.
- `backend/app/main.py`: composición de dependencias y arranque FastAPI.

### Frontend

- `frontend/src/types.ts`: tipos de API y estado visual.
- `frontend/src/api.ts`: cliente HTTP.
- `frontend/src/game.ts`: estado de pantalla y acciones.
- `frontend/src/main.ts`: composición de la aplicación.
- `frontend/src/styles.css`: layout pixel-art y estados visuales.
- `frontend/index.html`: shell de la aplicación.

### Tests y configuración

- `backend/tests/test_models.py`
- `backend/tests/test_simulation.py`
- `backend/tests/test_commands.py`
- `backend/tests/test_persistence.py`
- `backend/tests/test_personality.py`
- `backend/tests/test_api.py`
- `pyproject.toml`
- `package.json`
- `README.md`
- `.env.example`
- `.gitignore`

---

### Task 1: Inicializar proyecto y herramientas

**Files:**
- Create: `pyproject.toml`
- Create: `package.json`
- Create: `backend/app/__init__.py`
- Create: `backend/app/main.py`
- Create: `frontend/index.html`
- Create: `frontend/src/main.ts`
- Create: `frontend/src/styles.css`
- Create: `README.md`
- Create: `.env.example`
- Create: `.gitignore`
- Test: `backend/tests/test_smoke.py`

**Interfaces:**
- Produces `python -m backend.app.main` as the backend entry point.
- Produces `npm run dev` for the frontend.

- [ ] **Step 1: Escribir el smoke test**

```python
def test_application_module_imports():
    from backend.app.main import app
    assert app.title == "Tamagotchi AI"
```

- [ ] **Step 2: Ejecutar el test y verificar que falla**

Run: `pytest backend/tests/test_smoke.py -v`

Expected: FAIL porque todavía no existe el módulo de aplicación.

- [ ] **Step 3: Crear el scaffolding mínimo**

Configurar pytest y el paquete Python, crear una instancia FastAPI con título `Tamagotchi AI`, crear Vite con TypeScript y añadir scripts `dev`, `build` y `test`.

- [ ] **Step 4: Ejecutar las verificaciones**

Run: `pytest backend/tests/test_smoke.py -v`

Expected: PASS.

Run: `npm install && npm run build`

Expected: build frontend exitoso.

- [ ] **Step 5: Documentar arranque y commit**

Documentar los comandos locales en `README.md`, crear `.env.example` sin secretos y hacer commit `chore: initialize tamagotchi project`.

### Task 2: Modelos de dominio y validación

**Files:**
- Create: `backend/app/domain/models.py`
- Create: `backend/tests/test_models.py`

**Interfaces:**
- `CreatureState` con campos enteros `0..100`.
- `Creature` con identidad, etapa, personalidad, preferencias y timestamps.
- `GameEvent(kind: str, timestamp: datetime, payload: dict, dedupe_key: str | None)`.
- `Memory(category: str, summary: str, salience: float, persistence_class: str)`.

- [ ] **Step 1: Escribir tests de rangos y creación**

```python
def test_state_accepts_canonical_ranges():
    state = CreatureState(hunger=0, energy=100, mood=50, health=100,
                          cleanliness=50, curiosity=0, bond=100,
                          asleep=False, sick=False)
    assert state.hunger == 0

def test_state_rejects_out_of_range_values():
    with pytest.raises(ValidationError):
        CreatureState(hunger=101, energy=50, mood=50, health=50,
                      cleanliness=50, curiosity=50, bond=50,
                      asleep=False, sick=False)
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

Run: `pytest backend/tests/test_models.py -v`

Expected: FAIL por tipos y modelos ausentes.

- [ ] **Step 3: Implementar modelos Pydantic**

Definir enums para `Stage`, `EventKind`, `Emotion`, `Intent` y `Animation`; usar validadores de Pydantic para rangos y limitar `speech` a 20 palabras en el contrato narrativo posterior.

- [ ] **Step 4: Ejecutar tests**

Run: `pytest backend/tests/test_models.py -v`

Expected: PASS.

- [ ] **Step 5: Commit**

Commit: `feat: add canonical domain models`.

### Task 3: Simulación determinista y reloj

**Files:**
- Create: `backend/app/domain/rules.py`
- Create: `backend/app/domain/simulation.py`
- Create: `backend/tests/test_simulation.py`

**Interfaces:**
- `simulate_elapsed(state: CreatureState, duration: timedelta) -> SimulationResult`.
- `derive_status(state: CreatureState) -> list[str]`.
- `SimulationResult(state: CreatureState, events: list[GameEvent])`.

- [ ] **Step 1: Escribir tests con duración controlada**

```python
def test_awake_elapsed_time_increases_hunger_and_decreases_energy():
    result = simulate_elapsed(initial_state(), timedelta(hours=2))
    assert result.state.hunger > initial_state().hunger
    assert result.state.energy < initial_state().energy

def test_sleep_restores_energy():
    result = simulate_elapsed(initial_state(asleep=True, energy=20), timedelta(hours=2))
    assert result.state.energy > 20

def test_large_duration_is_bounded_and_deterministic():
    first = simulate_elapsed(initial_state(), timedelta(days=30))
    second = simulate_elapsed(initial_state(), timedelta(days=30))
    assert first == second
    assert 0 <= first.state.health <= 100
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

Run: `pytest backend/tests/test_simulation.py -v`

Expected: FAIL porque no existe `simulate_elapsed`.

- [ ] **Step 3: Implementar reglas agregadas**

Usar tasas por hora y operaciones acotadas; no crear un loop por segundo. Emitir `BECAME_SICK`, `RECOVERED` y `WOKE_UP` solo cuando haya transición real.

- [ ] **Step 4: Añadir estados derivados**

Calcular estados como `hungry`, `exhausted`, `dirty`, `bored`, `annoyed`, `happy`, `sick` y `sleeping` sin almacenarlos como otra fuente de verdad.

- [ ] **Step 5: Ejecutar y commit**

Run: `pytest backend/tests/test_simulation.py -v`

Expected: PASS.

Commit: `feat: add deterministic creature simulation`.

### Task 4: SQLite y repositorios

**Files:**
- Create: `backend/app/infrastructure/db.py`
- Create: `backend/app/infrastructure/repositories.py`
- Create: `backend/tests/test_persistence.py`

**Interfaces:**
- `Database(path: str)` con `connect()`, `initialize()` y `transaction()`.
- `CreatureRepository.save(creature, state)`.
- `CreatureRepository.load(creature_id) -> tuple[Creature, CreatureState]`.
- `EventRepository.append(events)` y `EventRepository.list_recent(creature_id)`.
- `MemoryRepository.save(memory)` y `MemoryRepository.list_relevant(creature_id, limit)`.

- [ ] **Step 1: Escribir round-trip y catch-up tests**

```python
def test_creature_and_state_survive_restart(tmp_path):
    db = Database(str(tmp_path / "pet.sqlite"))
    db.initialize()
    repository = CreatureRepository(db)
    repository.save(creature, state)
    assert repository.load(creature.id) == (creature, state)

def test_database_transaction_does_not_leave_partial_event(tmp_path):
    db = Database(str(tmp_path / "pet.sqlite"))
    db.initialize()
    with pytest.raises(RuntimeError):
        with db.transaction() as connection:
            connection.execute(
                "INSERT INTO events (id, creature_id, timestamp, kind, payload) "
                "VALUES (?, ?, ?, ?, ?)",
                ("event-1", creature.id, now, "FED", "{}"),
            )
            raise RuntimeError("rollback")
    assert EventRepository(db).list_recent(creature.id) == []
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

Run: `pytest backend/tests/test_persistence.py -v`

Expected: FAIL por esquema y repositorios ausentes.

- [ ] **Step 3: Crear esquema SQLite y transacciones**

Crear tablas `creatures`, `creature_states`, `events`, `memories`, `preferences` y `settings`; serializar payloads como JSON controlado y usar transacciones atómicas.

- [ ] **Step 4: Implementar repositorios**

Guardar estado y criatura juntos, conservar `last_tick_at`, y rechazar payloads que contengan claves de proveedor o secretos.

- [ ] **Step 5: Ejecutar y commit**

Run: `pytest backend/tests/test_persistence.py -v`

Expected: PASS.

Commit: `feat: add sqlite persistence`.

### Task 5: Comandos de juego y servicios de aplicación

**Files:**
- Create: `backend/app/domain/commands.py`
- Create: `backend/app/application/services.py`
- Create: `backend/tests/test_commands.py`

**Interfaces:**
- `GameService.create_creature(name: str) -> GameSnapshot`.
- `GameService.execute(creature_id: str, command: GameCommand) -> CommandResult`.
- `GameCommand(kind: str, payload: dict, request_id: str)`.
- `CommandResult(snapshot: GameSnapshot, events: list[GameEvent], narrative_request: NarrativeRequest | None)`.

- [ ] **Step 1: Escribir tests de Feed, Pet, Sleep y deduplicación**

```python
def test_feed_reduces_hunger_and_emits_event(service):
    result = service.execute(pet_id, Feed(food="apple", request_id="r1"))
    assert result.snapshot.state.hunger < 50
    assert any(event.kind == EventKind.FED for event in result.events)

def test_duplicate_request_id_does_not_apply_action_twice(service):
    first = service.execute(pet_id, Pet(request_id="same"))
    second = service.execute(pet_id, Pet(request_id="same"))
    assert second.snapshot == first.snapshot
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

Run: `pytest backend/tests/test_commands.py -v`

Expected: FAIL porque no existen comandos ni servicio.

- [ ] **Step 3: Implementar comandos y aplicación del tiempo**

Cada ejecución debe cargar, aplicar catch-up, validar si la acción está permitida, modificar el estado, generar eventos y persistir todo en una transacción.

- [ ] **Step 4: Implementar reglas de acciones**

Feed reduce hambre; Play consume energía y mejora ánimo; Pet mejora vínculo; Sleep activa `asleep`; Wake desactiva sueño; Explore mejora curiosidad/XP; Talk produce evento sin mutar estadísticas.

- [ ] **Step 5: Ejecutar y commit**

Run: `pytest backend/tests/test_commands.py -v`

Expected: PASS.

Commit: `feat: add game commands and application service`.

### Task 6: Contrato narrativo y fallback

**Files:**
- Create: `backend/app/personality/contracts.py`
- Create: `backend/app/personality/providers.py`
- Create: `backend/tests/test_personality.py`
- Create: `backend/tests/test_fallback.py`

**Interfaces:**
- `PersonalityProvider.respond(request: NarrativeRequest) -> NarrativeResponse`.
- `MockPersonalityProvider(responses: list[NarrativeResponse])`.
- `FallbackPersonalityProvider.respond(request) -> NarrativeResponse`.
- `validate_response(raw: object) -> NarrativeResponse`.

- [ ] **Step 1: Escribir tests del contrato**

```python
def test_valid_response_is_accepted():
    result = validate_response({"speech": "Hola, humano.", "emotion": "happy",
                                "intent": "comment", "animation": "happy",
                                "memory_candidate": None})
    assert result.emotion == Emotion.HAPPY

def test_invalid_emotion_is_rejected():
    with pytest.raises(ValidationError):
        validate_response({"speech": "Hola.", "emotion": "unknown",
                           "intent": "comment", "animation": "idle"})
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

Run: `pytest backend/tests/test_personality.py backend/tests/test_fallback.py -v`

Expected: FAIL por contrato y providers ausentes.

- [ ] **Step 3: Implementar validación estricta**

Cerrar enums, limitar speech a 20 palabras, normalizar whitespace y eliminar markdown; cualquier valor imposible debe producir error controlado.

- [ ] **Step 4: Implementar fallback contextual**

Crear frases locales según evento y estado, por ejemplo hambre, sueño, felicidad y ausencia. Nunca usar una respuesta del proveedor para mutar estado.

- [ ] **Step 5: Ejecutar y commit**

Run: `pytest backend/tests/test_personality.py backend/tests/test_fallback.py -v`

Expected: PASS.

Commit: `feat: add bounded personality contract and fallback`.

### Task 7: API local

**Files:**
- Create: `backend/app/api/routes.py`
- Modify: `backend/app/main.py`
- Create: `backend/tests/test_api.py`

**Interfaces:**
- `GET /api/health`.
- `POST /api/creatures`.
- `GET /api/creatures/{creature_id}`.
- `POST /api/creatures/{creature_id}/actions`.
- `GET /api/creatures/{creature_id}/events`.

- [ ] **Step 1: Escribir tests HTTP**

```python
def test_create_and_read_creature(client):
    created = client.post("/api/creatures", json={"name": "Momo"})
    assert created.status_code == 201
    creature_id = created.json()["id"]
    read = client.get(f"/api/creatures/{creature_id}")
    assert read.status_code == 200
    assert read.json()["name"] == "Momo"
```

- [ ] **Step 2: Ejecutar para confirmar fallo**

Run: `pytest backend/tests/test_api.py -v`

Expected: FAIL por rutas inexistentes.

- [ ] **Step 3: Implementar schemas y rutas**

Usar Pydantic para request/response, devolver 404 para criatura desconocida, 422 para comandos inválidos y no incluir configuración sensible en ningún response.

- [ ] **Step 4: Conectar dependencias**

Construir `Database`, repositorios, `GameService` y provider una sola vez por aplicación; permitir una base temporal durante tests.

- [ ] **Step 5: Ejecutar y commit**

Run: `pytest backend/tests/test_api.py -v`

Expected: PASS.

Commit: `feat: expose local game api`.

### Task 8: UI jugable y minijuego

**Files:**
- Create: `frontend/src/types.ts`
- Create: `frontend/src/api.ts`
- Create: `frontend/src/game.ts`
- Modify: `frontend/src/main.ts`
- Modify: `frontend/src/styles.css`
- Modify: `frontend/index.html`

**Interfaces:**
- `fetchCreature(id: string): Promise<GameSnapshot>`.
- `sendAction(id: string, action: GameAction): Promise<CommandResult>`.
- `renderSnapshot(snapshot: GameSnapshot): void`.

- [ ] **Step 1: Crear tipos y cliente API**

Modelar `GameSnapshot`, `CreatureState`, `NarrativeResponse` y `GameAction`; tratar errores HTTP como mensajes jugables y no como stack traces en la pantalla.

- [ ] **Step 2: Crear layout de juego**

Mostrar criatura, estado, speech bubble y acciones Feed, Play, Pet, Sleep, Talk, Explore y Status.

- [ ] **Step 3: Conectar acciones**

Deshabilitar botones mientras una acción está en vuelo, actualizar snapshot recibido y seleccionar animación desde la respuesta validada.

- [ ] **Step 4: Implementar minijuego de reacción**

Usar un componente aislado con estados `ready`, `active`, `won` y `lost`; enviar solo el resultado al endpoint de comando.

- [ ] **Step 5: Verificar build y commit**

Run: `npm run build`

Expected: PASS.

Commit: `feat: add playable tamagotchi ui`.

### Task 9: Memorias, preferencias y evolución

**Files:**
- Create: `backend/app/domain/memory.py`
- Create: `backend/app/domain/evolution.py`
- Modify: `backend/app/application/services.py`
- Modify: `backend/app/infrastructure/repositories.py`
- Create: `backend/tests/test_memory.py`
- Create: `backend/tests/test_evolution.py`

**Interfaces:**
- `MemoryPolicy.accept(candidate, recent_memories) -> Memory | None`.
- `update_preferences(state, event) -> PreferenceDelta`.
- `evaluate_evolution(creature, state) -> Stage | None`.

- [ ] **Step 1: Escribir tests**

```python
def test_duplicate_low_salience_memory_is_discarded():
    assert MemoryPolicy.accept(candidate, [same_memory]) is None

def test_care_history_can_evolve_baby_to_child():
    assert evaluate_evolution(creature_at_threshold, state) == Stage.CHILD
```

- [ ] **Step 2: Implementar política de memoria**

Aplicar saliencia, duplicados, clases de persistencia y límites de memoria; aceptar solo candidatos relacionados con eventos reales.

- [ ] **Step 3: Implementar preferencias y etapas**

Actualizar afinidades solo desde Feed/Play/Explore reales y evaluar `egg → baby → child → adult` desde edad, cuidados, vínculo, experiencia y actividad.

- [ ] **Step 4: Emitir eventos y narrativa**

Generar `EVOLVED`, guardar memorias aceptadas y solicitar reacción narrativa después de persistir la transición.

- [ ] **Step 5: Ejecutar y commit**

Run: `pytest backend/tests/test_memory.py backend/tests/test_evolution.py -v`

Expected: PASS.

Commit: `feat: add memory preferences and evolution`.

### Task 10: Proveedor OpenAI-compatible y resiliencia

**Files:**
- Modify: `backend/app/personality/providers.py`
- Create: `backend/app/personality/config.py`
- Create: `backend/tests/test_provider_failures.py`
- Modify: `.env.example`
- Modify: `README.md`

**Interfaces:**
- `ProviderConfig(base_url: str, model: str, credential_ref: str | None)`.
- `OpenAICompatibleProvider(config, http_client).respond(request)`.
- `ProviderError` para timeout, HTTP no exitoso y respuesta inválida.

- [ ] **Step 1: Escribir tests de fallo**

```python
def test_timeout_returns_fallback_without_mutating_snapshot(service, timeout_client):
    before = service.snapshot(pet_id)
    result = service.talk(pet_id, http_client=timeout_client)
    assert result.snapshot == before
    assert result.narrative.emotion is not None
```

- [ ] **Step 2: Implementar cliente compatible**

Enviar solo contexto autorizado, aplicar timeout, validar respuesta con el contrato y mapear HTTP 429/5xx a `ProviderError`.

- [ ] **Step 3: Implementar configuración segura**

Resolver endpoint/modelo desde configuración y credencial desde keyring o variable explícita; nunca persistir el secreto ni incluirlo en excepciones.

- [ ] **Step 4: Verificar offline**

Run: `pytest backend/tests/test_provider_failures.py -v`

Expected: PASS incluso con cliente que siempre falla.

- [ ] **Step 5: Documentar configuración y commit**

Documentar setup de proveedor, modo mock y modo offline sin imprimir claves.

Commit: `feat: add openai compatible provider and safe fallback`.

### Task 11: Debug mode, polish y aceptación

**Files:**
- Create: `backend/app/api/debug_routes.py`
- Modify: `frontend/src/game.ts`
- Modify: `frontend/src/styles.css`
- Create: `backend/tests/test_acceptance.py`
- Modify: `README.md`

**Interfaces:**
- `GET /api/debug/creatures/{creature_id}`.
- `POST /api/debug/advance-time` solo habilitado en modo desarrollo.

- [ ] **Step 1: Escribir test de aceptación**

Cubrir crear, Feed, Play, guardar, cargar, avanzar tiempo, memoria, evolución y provider offline con una base temporal.

- [ ] **Step 2: Implementar debug seguro**

Mostrar estado, últimos eventos, memorias, último resultado del proveedor y latencia; excluir credenciales mediante un serializer explícito.

- [ ] **Step 3: Añadir animaciones y estados visuales**

Implementar idle, happy, sad, sleepy, eating, playing, sick y sleeping con CSS/sprite placeholder, manteniendo el estado del juego como origen.

- [ ] **Step 4: Ejecutar toda la suite**

Run: `pytest -q && npm run build`

Expected: todos los tests PASS y build frontend exitoso.

- [ ] **Step 5: Documentar release local y commit**

Actualizar README con instalación, desarrollo, tests, backup y troubleshooting.

Commit: `feat: complete local mvp acceptance flow`.

## Self-review del plan

- **Cobertura:** la spec queda cubierta por Tasks 1–11: dominio y simulación (2–3), SQLite (4), comandos (5), contrato/fallback/LLM (6 y 10), API (7), UI/minijuego (8), memoria/evolución (9), debug, robustez y aceptación (11).
- **Dependencias:** ninguna tarea de UI depende de que exista un proveedor remoto; el MockProvider y fallback permiten desarrollar offline.
- **Seguridad:** no hay ruta que acepte una API key como parte del estado de criatura; configuración y respuesta HTTP se prueban por separado.
- **Determinismo:** reloj, duración y proveedor se inyectan en las pruebas del dominio y aplicación.
- **YAGNI:** solo se incluye una criatura, un minijuego, cuatro etapas y un proveedor remoto genérico.
