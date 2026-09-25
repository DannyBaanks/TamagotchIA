/**
 * The app shell. It owns time and the screen, asks the engine for every change, and
 * lets the persona talk afterwards. It never edits a stat itself (debug tools aside,
 * which are labelled as such and live behind a switch).
 */
import { applyCommand, type Command, type CommandInput } from "./engine/commands";
import { conditions, pose as basePose, type Pose } from "./engine/derived";
import { acceptProposedMemory, relevantMemories } from "./engine/memory";
import * as R from "./engine/rules";
import { evolve, simulateElapsed } from "./engine/simulation";
import { FOODS, type EventKind, type Food, type GameEvent, type World } from "./engine/types";
import { copyWorld, createWorld, trimMemories } from "./engine/world";
import { personaInput } from "./persona/contract";
import { OpenAICompatibleProvider, narrate, type Narration, type PersonalityProvider } from "./persona/providers";
import { SPECIES, poseForAnimation, speciesById } from "./species";
import { browserStore, exportSave, importSave, load, save, wipe } from "./store/save";
import { PRESETS, loadSecret, loadSettings, saveSecret, saveSettings, type PersonaSettings } from "./store/settings";
import { forecast } from "./engine/forecast";
import { alertText, decide, inQuietHours, type NotifyPrefs, type NotifyState } from "./notify/alerts";
import { askPermission, loadPrefs, loadState, savePrefs, saveState, show, support, type Support } from "./notify/deliver";
import { $, buzz, formatAge, h } from "./ui/dom";
import { ATTENTION, FOOD_LABEL, MEMORY_ICON, STAGE_LABEL, clockLabel, dayLabel, describeEvent } from "./ui/labels";
import { playMiniGame } from "./ui/minigame";

const DEBUG_KEY = "tamagotchia.debug.v1";
const SAVE_EVERY_TICKS = 15;
/** Events worth a spontaneous line, most important first. */
const AUTO_NARRATE: EventKind[] = ["EVOLVED", "HATCHED", "BECAME_SICK", "RECOVERED", "LONG_ABSENCE", "FAVORITE_FOUND", "WOKE_UP", "WENT_TO_SLEEP"];
/** For a command's own events: which one the persona should react to. */
const REACT_PRIORITY: EventKind[] = ["EVOLVED", "FAVORITE_FOUND", "RECOVERED", "BECAME_SICK", "MINI_GAME_WON", "MINI_GAME_LOST", "REFUSED"];

interface Debug {
  offsetMs: number;
  failModel: boolean;
}

export class App {
  private readonly store;
  private readonly persistent: boolean;
  private world: World | null = null;
  private settings: PersonaSettings;
  private debug: Debug;
  private ticks = 0;
  private transient: { pose: Pose; until: number } | null = null;
  private speech: { text: string; until: number } | null = null;
  private thinking = false;
  private narrationToken = 0;
  private lastNarration: Narration | null = null;
  private stopMiniGame: (() => void) | null = null;
  private seqSeen = 0;
  private notifyPrefs: NotifyPrefs;
  private notifyState: NotifyState;

  constructor(private readonly root: HTMLElement) {
    const { store, persistent } = browserStore();
    this.store = store;
    this.persistent = persistent;
    this.settings = loadSettings(store);
    this.debug = this.loadDebug();
    this.notifyPrefs = loadPrefs(store);
    this.notifyState = loadState(store);
  }

  // ---------------------------------------------------------------- time
  private now(): number {
    return Date.now() + this.debug.offsetMs;
  }

  start(): void {
    const loaded = load(this.store);
    if (loaded.world) {
      this.seqSeen = loaded.world.seq;
      this.world = simulateElapsed(loaded.world, this.now());
      this.renderGame();
      if (loaded.source === "backup") this.toast(`Recuperé la partida anterior (${loaded.problem}).`);
      this.narrateNewEvents();
    } else {
      this.renderOnboarding();
      if (loaded.problem) this.toast(`La partida guardada estaba dañada (${loaded.problem}). Empecemos de nuevo.`);
    }
    if (!this.persistent) this.toast("Este navegador no deja guardar: la partida se perderá al cerrar.");
    setInterval(() => this.tick(), 1000);
    const flush = () => this.persist();
    document.addEventListener("visibilitychange", () => document.visibilityState === "hidden" && flush());
    window.addEventListener("pagehide", flush);
  }

  private tick(): void {
    if (!this.world) return;
    this.world = simulateElapsed(this.world, this.now());
    this.narrateNewEvents();
    this.checkAlerts();
    this.ticks += 1;
    if (this.ticks % SAVE_EVERY_TICKS === 0) this.persist();
    this.update();
  }

  // ---------------------------------------------------------------- alerts
  private checkAlerts(): void {
    if (!this.world) return;
    const onScreen = document.visibilityState === "visible";
    const { send, next } = decide(this.notifyState, this.world.creature, this.now(), this.notifyPrefs, onScreen);
    if (JSON.stringify(next) !== JSON.stringify(this.notifyState)) {
      this.notifyState = next;
      saveState(this.store, next);
    }
    for (const alert of send) void show(alert, "./icons/icon-192.png");
  }

  private persist(): void {
    if (this.world) save(this.store, this.world, this.now());
  }

  // ---------------------------------------------------------------- commands
  private dispatch(command: CommandInput, playerSaid: string | null = null): void {
    if (!this.world) return;
    const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const result = applyCommand(this.world, { ...command, id } as Command, this.now());
    if (result.duplicate) return;
    this.world = result.world;
    this.seqSeen = this.world.seq;
    this.persist();
    buzz();

    const pose: Record<string, Pose> = { feed: "success", play: "working", pet: "success", clean: "success", explore: "success", sleep: "waiting", minigame: "success" };
    if (result.rejected) this.flash("thinking");
    else if (pose[command.kind]) this.flash(result.events.some((e) => e.kind === "MINI_GAME_LOST") ? "error" : pose[command.kind]!);

    for (const e of result.events) {
      if (e.kind === "EXPLORED") this.toast(`Encontró ${e.payload.found} ✨`);
      if (e.kind === "FAVORITE_FOUND") this.toast(`¡Nueva comida favorita: ${FOOD_LABEL[e.payload.food as Food].name}!`);
      if (e.kind === "EVOLVED") this.celebrate();
    }
    const react = REACT_PRIORITY.map((k) => result.events.find((e) => e.kind === k)).find(Boolean) ?? result.events.at(-1);
    if (react) void this.narrateEvent(react, playerSaid);
    this.update();
  }

  private debugEdit(edit: (w: World) => void, label: string): void {
    if (!this.world) return;
    const w = copyWorld(this.world);
    edit(w);
    this.world = w;
    this.persist();
    this.toast(`Debug: ${label}`);
    this.update();
  }

  // ---------------------------------------------------------------- persona
  private provider(): PersonalityProvider | null {
    if (this.debug.failModel) return { name: "fallo-simulado", react: async () => { throw new Error("fallo simulado (debug)"); } };
    if (!this.settings.enabled || !this.settings.model.trim() || !this.settings.baseUrl.trim()) return null;
    return new OpenAICompatibleProvider({ baseUrl: this.settings.baseUrl.trim(), model: this.settings.model.trim(), apiKey: loadSecret(this.store) });
  }

  private narrateNewEvents(): void {
    if (!this.world || this.world.seq <= this.seqSeen) return;
    const fresh = this.world.events.filter((e) => e.seq > this.seqSeen);
    this.seqSeen = this.world.seq;
    if (fresh.some((e) => e.kind === "HATCHED")) this.hatchAnimation();
    const pick = AUTO_NARRATE.map((k) => fresh.find((e) => e.kind === k)).find(Boolean);
    if (pick) void this.narrateEvent(pick, null);
  }

  private async narrateEvent(event: GameEvent, playerSaid: string | null): Promise<void> {
    if (!this.world) return;
    const token = ++this.narrationToken;
    const provider = this.provider();
    this.thinking = provider !== null;
    this.update();
    const n = await narrate(provider, personaInput(this.world, event, this.now(), playerSaid), event.seq, this.settings.timeoutMs);
    if (token !== this.narrationToken || !this.world) return; // a newer moment took over
    this.thinking = false;
    this.lastNarration = n;
    this.speech = { text: n.reply.speech, until: Date.now() + 6500 };
    this.flash(poseForAnimation(n.reply.animation), 3000);
    if (n.reply.memory_candidate) {
      const memory = acceptProposedMemory(this.world, n.reply.memory_candidate, event, this.now());
      if (memory) {
        const w = copyWorld(this.world);
        w.memories.push(memory);
        trimMemories(w);
        this.world = w;
        this.persist();
      }
    }
    this.update();
  }

  // ---------------------------------------------------------------- transient visuals
  private flash(pose: Pose, ms = 2200): void {
    this.transient = { pose, until: Date.now() + ms };
  }

  private celebrate(): void {
    this.root.querySelector(".stage")?.classList.add("celebrate");
    setTimeout(() => this.root.querySelector(".stage")?.classList.remove("celebrate"), 2400);
  }

  private hatchAnimation(): void {
    const stage = this.root.querySelector(".stage");
    stage?.classList.add("hatching");
    setTimeout(() => stage?.classList.remove("hatching"), 1600);
  }

  toast(text: string): void {
    const box = this.root.querySelector(".toasts") ?? document.body.appendChild(h("div", { class: "toasts", "aria-live": "polite" }));
    const t = h("div", { class: "toast" }, text);
    box.append(t);
    setTimeout(() => t.classList.add("out"), 3200);
    setTimeout(() => t.remove(), 3700);
  }

  // ---------------------------------------------------------------- onboarding
  private renderOnboarding(): void {
    let chosen = SPECIES[0]!.id;
    const name = h("input", { class: "field", id: "name", maxlength: 16, placeholder: "Ponle nombre", autocomplete: "off", "aria-label": "Nombre" });
    const cards = SPECIES.map((s) =>
      h("button", { class: "egg-card", type: "button", "data-habitat": s.habitat, "aria-pressed": String(s.id === chosen), style: `--accent:${s.accent}`,
        onclick: (ev: Event) => {
          chosen = s.id;
          for (const c of cards) c.setAttribute("aria-pressed", String(c === ev.currentTarget));
        } },
        h("div", { class: "egg small", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
        h("strong", {}, s.label),
        h("span", {}, s.blurb)),
    );
    const adopt = h("button", { class: "btn primary big", type: "button", onclick: () => {
      const seed = globalThis.crypto?.getRandomValues?.(new Uint32Array(1))[0] ?? Date.now();
      this.world = createWorld(name.value || "Huevito", chosen, this.now(), seed);
      this.seqSeen = this.world.seq;
      this.persist();
      this.renderGame();
      this.speech = { text: "…tac, tac…", until: Date.now() + 4000 };
    } }, "Adoptar este huevo");
    this.root.replaceChildren(
      h("div", { class: "onboarding" },
        h("header", {}, h("p", { class: "kicker" }, "TamagotchIA"), h("h1", {}, "Un huevo te encontró"),
          h("p", {}, "Cuídalo, dale de comer y platica con él. Vive en tu teléfono aunque no tengas internet.")),
        h("div", { class: "egg-cards" }, ...cards),
        h("label", { class: "label", for: "name" }, "¿Cómo se va a llamar?"),
        name,
        adopt,
        h("div", { class: "toasts", "aria-live": "polite" })),
    );
  }

  // ---------------------------------------------------------------- game screen
  private renderGame(): void {
    const meter = (key: string, icon: string, label: string) =>
      h("div", { class: "meter", "data-meter": key, role: "meter", "aria-label": label, "aria-valuemin": 0, "aria-valuemax": 100 },
        h("span", { class: "ico", "aria-hidden": "true" }, icon), h("span", { class: "bar" }, h("i")), h("span", { class: "name", "aria-hidden": "true" }, label));
    const dockBtn = (action: string, icon: string, label: string) =>
      h("button", { class: "dock-btn", type: "button", "data-action": action, onclick: () => this.onAction(action) },
        h("span", { class: "ico", "aria-hidden": "true" }, icon), h("span", { class: "lbl" }, label));

    this.root.replaceChildren(
      h("div", { class: "game" },
        h("header", { class: "top" },
          h("div", { class: "id" }, h("h1", { class: "name" }), h("span", { class: "chip stage-chip" }), h("span", { class: "age" })),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Diario", onclick: () => this.openDiary() }, "📔"),
          h("button", { class: "icon-btn", type: "button", "aria-label": "Ajustes", onclick: () => this.openSettings() }, "⚙️")),
        h("section", { class: "meters" },
          meter("fullness", "🍙", "Pancita"), meter("energy", "⚡", "Energía"), meter("mood", "😊", "Ánimo"),
          meter("cleanliness", "🫧", "Limpieza"), meter("health", "💗", "Salud")),
        h("main", { class: "stage" },
          h("div", { class: "sky", "aria-hidden": "true" }, h("div", { class: "celestial" }), h("div", { class: "stars" })),
          h("div", { class: "bubble", "aria-live": "polite" }),
          h("div", { class: "attention", "aria-hidden": "true" }),
          h("button", { class: "pet", type: "button", "aria-label": "Hacerle mimos", onclick: () => this.dispatch({ kind: "pet" }) },
            h("div", { class: "egg", "aria-hidden": "true" }, h("i"), h("i"), h("i")),
            h("img", { class: "sprite", alt: "", draggable: "false" }),
            h("div", { class: "zzz", "aria-hidden": "true" }, h("span", {}, "z"), h("span", {}, "z"), h("span", {}, "Z")),
            h("div", { class: "shadow", "aria-hidden": "true" })),
          h("div", { class: "floor", "aria-hidden": "true" }, h("div", { class: "mess" })),
          h("div", { class: "caption" }),
          h("div", { class: "bond", "aria-label": "Vínculo" }, h("span", { class: "hearts" }))),
        h("nav", { class: "dock", "aria-label": "Acciones" },
          dockBtn("feed", "🍽️", "Comer"), dockBtn("play", "🎾", "Jugar"), dockBtn("pet", "🤲", "Mimos"),
          dockBtn("talk", "💬", "Hablar"), dockBtn("more", "✨", "Más")),
        h("div", { class: "sheet-host" }),
        h("div", { class: "toasts", "aria-live": "polite" })),
    );
    this.update();
  }

  private update(): void {
    const w = this.world;
    const game = this.root.querySelector<HTMLElement>(".game");
    if (!w || !game) return;
    const c = w.creature;
    const species = speciesById(c.species);
    const now = Date.now();
    if (this.transient && this.transient.until < now) this.transient = null;
    if (this.speech && this.speech.until < now) this.speech = null;

    const hour = new Date(this.now()).getHours();
    const tod = hour < 6 || hour >= 21 ? "night" : hour < 9 ? "dawn" : hour < 18 ? "day" : "dusk";
    Object.assign(game.dataset, { habitat: species.habitat, tod, stage: c.stage, asleep: String(c.asleep), sick: String(c.sick), animated: String(species.animated) });
    game.style.setProperty("--accent", species.accent);

    $(game, ".name").textContent = c.name;
    $(game, ".stage-chip").textContent = STAGE_LABEL[c.stage];
    $(game, ".age").textContent = c.stage === "egg" ? "" : formatAge(c.ageMs);

    const values: Record<string, number> = {
      fullness: 100 - c.stats.hunger, energy: c.stats.energy, mood: c.stats.mood, cleanliness: c.stats.cleanliness, health: c.stats.health,
    };
    for (const [key, value] of Object.entries(values)) {
      const m = game.querySelector<HTMLElement>(`[data-meter="${key}"]`)!;
      m.style.setProperty("--v", String(value / 100));
      m.dataset.level = value < 25 ? "low" : value < 50 ? "mid" : "ok";
      m.setAttribute("aria-valuenow", String(Math.round(value)));
    }
    const hearts = Math.round(c.stats.bond / 20);
    $(game, ".hearts").textContent = "♥".repeat(hearts) + "♡".repeat(5 - hearts);

    const sprite = $(game, ".sprite") as HTMLImageElement;
    const current = this.thinking ? "thinking" : basePose(c, this.transient?.pose ?? null);
    const src = species.sprite(current);
    if (!sprite.src.endsWith(src.replace(/^\.\//, ""))) sprite.src = src;
    sprite.alt = `${c.name}, ${STAGE_LABEL[c.stage]}`;

    const bubble = $(game, ".bubble");
    bubble.classList.toggle("show", Boolean(this.speech) || this.thinking);
    bubble.classList.toggle("typing", this.thinking && !this.speech);
    bubble.textContent = this.thinking && !this.speech ? "" : this.speech?.text ?? "";

    const needs = conditions(c).map((k) => ATTENTION[k]).filter(Boolean) as string[];
    const attention = $(game, ".attention");
    // asleep it only asks for help if it is sick; an egg never asks
    attention.textContent = c.stage === "egg" ? "" : c.asleep ? (c.sick ? ATTENTION.sick! : "") : needs.slice(0, 2).join(" ");
    attention.classList.toggle("show", !this.speech && !this.thinking && attention.textContent !== "");

    const mess = c.stats.cleanliness < 10 ? 3 : c.stats.cleanliness < 20 ? 2 : c.stats.cleanliness < 35 ? 1 : 0;
    const messEl = $(game, ".mess");
    if (messEl.childElementCount !== mess) messEl.replaceChildren(...Array.from({ length: mess }, () => h("span", {}, "💩")));

    const caption = $(game, ".caption");
    if (c.stage === "egg") {
      const left = Math.max(0, c.createdAt + R.HATCH_MS - this.now());
      caption.textContent = `Eclosiona en ${Math.floor(left / 60000)}:${String(Math.floor((left % 60000) / 1000)).padStart(2, "0")} · tócalo para darle calor`;
      game.style.setProperty("--wobble", String(1 - left / R.HATCH_MS));
    } else {
      caption.textContent = c.asleep ? "Durmiendo… tócalo con cuidado" : "";
    }

    for (const btn of game.querySelectorAll<HTMLButtonElement>(".dock-btn")) {
      const a = btn.dataset.action!;
      btn.disabled = c.stage === "egg" ? a !== "pet" && a !== "more" : false;
    }
    const petLbl = game.querySelector<HTMLElement>('[data-action="pet"] .lbl');
    if (petLbl) petLbl.textContent = c.stage === "egg" ? "Calor" : "Mimos";
  }

  // ---------------------------------------------------------------- sheets
  private sheet(title: string, ...content: Array<Node | string>): HTMLElement {
    const host = $(this.root, ".sheet-host");
    const close = () => {
      this.stopMiniGame?.();
      this.stopMiniGame = null;
      host.replaceChildren();
    };
    const panel = h("section", { class: "sheet", role: "dialog", "aria-modal": "true", "aria-label": title },
      h("div", { class: "grip", "aria-hidden": "true" }),
      h("header", {}, h("h2", {}, title), h("button", { class: "icon-btn", type: "button", "aria-label": "Cerrar", onclick: close }, "✕")),
      h("div", { class: "sheet-body" }, ...content));
    host.replaceChildren(h("div", { class: "backdrop", onclick: (e: Event) => e.target === e.currentTarget && close() }, panel));
    return panel;
  }

  private closeSheet(): void {
    this.stopMiniGame?.();
    this.stopMiniGame = null;
    this.root.querySelector(".sheet-host")?.replaceChildren();
  }

  private option(icon: string, title: string, note: string, onclick: () => void, extra: Partial<Record<string, string>> = {}): HTMLElement {
    return h("button", { class: "option", type: "button", onclick, ...extra },
      h("span", { class: "ico", "aria-hidden": "true" }, icon), h("span", { class: "txt" }, h("strong", {}, title), h("small", {}, note)));
  }

  private onAction(action: string): void {
    const c = this.world?.creature;
    if (!c) return;
    const run = (cmd: CommandInput) => () => {
      this.closeSheet();
      this.dispatch(cmd);
    };
    switch (action) {
      case "feed":
        this.sheet("¿Qué le das de comer?", h("div", { class: "grid" }, ...FOODS.map((f) => {
          const food = FOOD_LABEL[f];
          const fav = c.favoriteFood === f;
          return this.option(food.icon, food.name + (fav ? " ♥" : ""), fav ? "su favorita" : food.note, run({ kind: "feed", food: f }));
        })));
        break;
      case "play":
        this.sheet("¿A qué juegan?",
          this.option("🎾", "Jugar un rato", "gasta energía, sube el ánimo", run({ kind: "play" })),
          this.option("⭐", "Atrapa la estrella", "minijuego de reflejos, 5 rondas", () => this.openMiniGame()));
        break;
      case "pet":
        this.dispatch({ kind: "pet" });
        break;
      case "talk":
        this.openTalk();
        break;
      case "more":
        this.sheet("Más cosas",
          this.option("🧽", "Bañar", "limpieza al 100", run({ kind: "clean" })),
          c.asleep ? this.option("☀️", "Despertar", "si tiene poca energía despierta de malas", run({ kind: "wake" }))
                   : this.option("🌙", "Dormir", "recupera energía", run({ kind: "sleep" })),
          this.option("🧭", "Explorar", "sale a buscar tesoritos", run({ kind: "explore" })),
          this.option("📔", "Diario", "recuerdos y lo que ha pasado", () => this.openDiary()),
          this.option("⚙️", "Ajustes", "voz, respaldo y más", () => this.openSettings()));
        break;
    }
  }

  private openMiniGame(): void {
    const c = this.world?.creature;
    if (!c) return;
    if (c.asleep || c.stats.energy < R.MINI_GAME.minEnergy) {
      this.closeSheet();
      this.dispatch({ kind: "minigame", score: 0 }); // the engine refuses, and the creature says why
      return;
    }
    const host = h("div");
    this.sheet("Minijuego", host);
    this.stopMiniGame = playMiniGame(host, (score) => {
      this.closeSheet();
      this.dispatch({ kind: "minigame", score });
    });
  }

  private openTalk(): void {
    const input = h("input", { class: "field", maxlength: 80, placeholder: "Dile algo (opcional)", "aria-label": "Qué le dices", autocomplete: "off" });
    const send = (text: string) => {
      this.closeSheet();
      this.dispatch({ kind: "talk" }, text.trim() || null);
    };
    const chips = ["¿Cómo estás?", "Te quiero mucho", "¿Qué hiciste hoy?", "¿Tienes hambre?"].map((t) =>
      h("button", { class: "chip-btn", type: "button", onclick: () => send(t) }, t));
    const voice = this.provider() ? `Responde con ${this.settings.model}.` : "Responde con su voz local. Conecta un modelo en Ajustes para que improvise.";
    this.sheet("Platicar",
      h("div", { class: "chips" }, ...chips),
      h("form", { class: "row", onsubmit: (e: Event) => { e.preventDefault(); send(input.value); } }, input, h("button", { class: "btn primary", type: "submit" }, "Decir")),
      h("p", { class: "hint" }, voice));
    setTimeout(() => input.focus(), 50);
  }

  private openDiary(): void {
    const w = this.world;
    if (!w) return;
    const now = this.now();
    const memories = [...relevantMemories(w, now, 50)].sort((a, b) => b.at - a.at);
    const events = w.events.slice(-20).reverse().map((e) => [e, describeEvent(e)] as const).filter(([, d]) => d);
    this.sheet(`Diario de ${w.creature.name}`,
      h("h3", {}, "Recuerdos"),
      memories.length
        ? h("ul", { class: "list" }, ...memories.map((m) => h("li", {}, h("span", { class: "ico" }, MEMORY_ICON[m.category]), h("span", {}, m.summary), h("time", {}, dayLabel(m.at)))))
        : h("p", { class: "hint" }, "Todavía no hay recuerdos. Ya vendrán."),
      h("h3", {}, "Lo último que pasó"),
      h("ul", { class: "list compact" }, ...events.map(([e, d]) => h("li", {}, h("span", {}, d!), h("time", {}, clockLabel(e.at))))));
  }

  private openSettings(): void {
    const s = { ...this.settings };
    const enabled = h("input", { type: "checkbox", id: "p-on", ...(s.enabled ? { checked: true } : {}) }) as HTMLInputElement;
    const preset = h("select", { class: "field", },
      h("option", { value: "" }, "Elegir proveedor…"), ...PRESETS.map((p, i) => h("option", { value: String(i) }, p.label))) as HTMLSelectElement;
    const url = h("input", { class: "field", value: s.baseUrl, inputmode: "url", autocomplete: "off" }) as HTMLInputElement;
    const model = h("input", { class: "field", value: s.model, placeholder: "p. ej. google/gemma-4-31b-it:free", autocomplete: "off" }) as HTMLInputElement;
    const key = h("input", { class: "field", type: "password", value: loadSecret(this.store), placeholder: "API key (opcional para modelos locales)", autocomplete: "off" }) as HTMLInputElement;
    const result = h("p", { class: "hint", "aria-live": "polite" });
    const presetNote = h("p", { class: "hint small", "aria-live": "polite" });
    preset.addEventListener("change", () => {
      const chosen = PRESETS[Number(preset.value)];
      if (!chosen) return;
      url.value = chosen.baseUrl;
      if (chosen.model && !model.value.trim()) model.value = chosen.model;
      presetNote.textContent = chosen.note;
    });
    // the most common mix-up: a free NVIDIA key pasted for OpenRouter, or the other way round
    const keyNote = h("p", { class: "hint small", "aria-live": "polite" });
    const checkKey = () => {
      const k = key.value.trim();
      const u = url.value;
      keyNote.textContent =
        k.startsWith("nvapi-") && !u.includes("nvidia.com") ? "Esa es una clave de NVIDIA (nvapi-). OpenRouter usa claves que empiezan con sk-or-." :
        k.startsWith("sk-or-") && !u.includes("openrouter.ai") ? "Esa es una clave de OpenRouter (sk-or-); cambia el proveedor a OpenRouter." : "";
    };
    key.addEventListener("input", checkKey);
    url.addEventListener("input", checkKey);
    preset.addEventListener("change", checkKey);

    const commit = () => {
      this.settings = { enabled: enabled.checked, baseUrl: url.value.trim(), model: model.value.trim(), timeoutMs: s.timeoutMs };
      saveSettings(this.store, this.settings);
      saveSecret(this.store, key.value.trim());
    };
    const test = async () => {
      commit();
      const w = this.world;
      if (!w) return;
      if (!this.settings.enabled) return void (result.textContent = "Activa «Usar un modelo como su voz» para probarla.");
      if (!this.settings.baseUrl) return void (result.textContent = "Elige un proveedor o escribe su URL.");
      if (!this.settings.model) return void (result.textContent = "Escribe el nombre del modelo (por ejemplo, uno que termine en «:free»).");
      result.textContent = "Probando…";
      const event: GameEvent = w.events.at(-1) ?? { seq: 0, at: this.now(), kind: "TALKED", payload: {} };
      const n = await narrate(this.provider(), personaInput(w, { ...event, kind: "TALKED", payload: {} }, this.now(), "¡Hola! ¿Me escuchas?"), event.seq, this.settings.timeoutMs);
      result.textContent = n.source === "model"
        ? `✓ Responde el modelo (${n.latencyMs} ms): «${n.reply.speech}»`
        : `Usó la voz local${n.problem ? ` porque: ${n.problem}` : " (no hay modelo configurado)"}. «${n.reply.speech}»`;
    };

    const fileInput = h("input", { type: "file", accept: "application/json,.json", class: "hidden" }) as HTMLInputElement;
    fileInput.addEventListener("change", async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const { world, problem } = importSave(await file.text());
      if (!world) return this.toast(`No pude importar: ${problem}`);
      this.confirm(`¿Reemplazar a ${this.world?.creature.name ?? "tu criatura"} por ${world.creature.name}?`, "Reemplazar", () => {
        this.world = simulateElapsed(world, this.now());
        this.seqSeen = this.world.seq;
        this.persist();
        this.renderGame();
        this.toast(`${world.creature.name} volvió a casa.`);
      });
    });

    this.sheet("Ajustes",
      h("h3", {}, "La voz"),
      h("p", { class: "hint" }, "Un modelo puede ser la persona de tu criatura. El juego lo decide el motor; el modelo solo le pone palabras. Sin modelo, habla con su voz local."),
      h("label", { class: "switch" }, enabled, h("span", {}, "Usar un modelo como su voz")),
      h("label", { class: "field-label" }, "Proveedor", preset),
      presetNote,
      h("label", { class: "field-label" }, "URL base (compatible con OpenAI)", url),
      h("label", { class: "field-label" }, "Modelo", model),
      h("label", { class: "field-label" }, "API key", key),
      keyNote,
      h("p", { class: "hint small" }, "La clave se queda solo en este teléfono, separada de la partida: no se exporta ni se respalda."),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => { commit(); this.toast("Guardado"); } }, "Guardar"),
        h("button", { class: "btn primary", type: "button", onclick: () => void test() }, "Probar la voz")),
      result,
      ...this.alertSettings(),
      h("h3", {}, "Partida"),
      h("div", { class: "row wrap" },
        h("button", { class: "btn", type: "button", onclick: () => this.download() }, "Exportar respaldo"),
        h("button", { class: "btn", type: "button", onclick: () => fileInput.click() }, "Importar"),
        fileInput),
      h("button", { class: "btn danger", type: "button", onclick: () => this.confirmReset() }, "Empezar de nuevo"),
      h("h3", {}, "Desarrollo"),
      h("button", { class: "btn", type: "button", onclick: () => this.openDebug() }, "Abrir panel debug"),
      h("p", { class: "hint small" }, "TamagotchIA 0.1 · arte de Companion (MIT)"));
  }

  private alertSettings(): Node[] {
    const status = h("p", { class: "hint", "aria-live": "polite" });
    const upcoming = h("ul", { class: "list compact" });
    const toggle = h("input", { type: "checkbox", ...(this.notifyPrefs.enabled ? { checked: true } : {}) }) as HTMLInputElement;
    const hours = Array.from({ length: 24 }, (_, i) => i);
    const hourSelect = (value: number, label: string, onChange: (v: number) => void) => {
      const sel = h("select", { class: "field" }, ...hours.map((x) => h("option", { value: x, ...(x === value ? { selected: true } : {}) }, `${String(x).padStart(2, "0")}:00`))) as HTMLSelectElement;
      sel.addEventListener("change", () => onChange(Number(sel.value)));
      return h("label", { class: "field-label" }, label, sel);
    };
    const describe = (s: Support): string => ({
      ok: this.notifyPrefs.enabled ? "Activados. Te aviso cuando la app está abierta en segundo plano." : "Permiso concedido; activa el interruptor.",
      default: "Toca el interruptor y acepta el permiso del navegador.",
      denied: "El navegador tiene los avisos bloqueados para esta página. Actívalos desde la configuración del sitio.",
      insecure: "Los avisos necesitan HTTPS o localhost. Por la IP de la red no se pueden (lee la GUIA).",
      unsupported: "Este navegador no tiene notificaciones.",
    })[s];
    const refresh = () => {
      status.textContent = describe(support());
      const w = this.world;
      if (!w) return;
      const next = forecast(w, this.now()).slice(0, 3);
      upcoming.replaceChildren(...(next.length
        ? next.map((f) => h("li", {}, h("span", {}, alertText(f.kind, w.creature.name).title),
            h("time", {}, inQuietHours(f.at, this.notifyPrefs) ? `${clockLabel(f.at)} · llega a las ${String(this.notifyPrefs.quietEnd).padStart(2, "0")}:00` : clockLabel(f.at))))
        : [h("li", {}, h("span", {}, "Nada en las próximas 24 h"))]));
    };
    const saveNotify = () => savePrefs(this.store, this.notifyPrefs);
    toggle.addEventListener("change", async () => {
      if (toggle.checked && support() !== "ok") {
        const result = await askPermission();
        if (result !== "ok") toggle.checked = false;
      }
      this.notifyPrefs = { ...this.notifyPrefs, enabled: toggle.checked };
      saveNotify();
      refresh();
    });
    const test = h("button", { class: "btn", type: "button", onclick: async () => {
      const ok = await show(alertText("hungry", this.world?.creature.name ?? "Tu criatura"), "./icons/icon-192.png");
      status.textContent = ok ? "Aviso de prueba enviado." : describe(support());
    } }, "Probar un aviso");
    refresh();
    return [
      h("h3", {}, "Avisos"),
      h("p", { class: "hint" }, "Te avisa cuando tiene hambre, se ensucia, se enferma, se queda sin energía, te extraña, despierta o sale del huevo. Un aviso por vez, y nunca en horas de silencio."),
      h("label", { class: "switch" }, toggle, h("span", {}, "Avisarme")),
      status,
      h("div", { class: "row" },
        hourSelect(this.notifyPrefs.quietStart, "Silencio desde", (v) => { this.notifyPrefs = { ...this.notifyPrefs, quietStart: v }; saveNotify(); }),
        hourSelect(this.notifyPrefs.quietEnd, "hasta", (v) => { this.notifyPrefs = { ...this.notifyPrefs, quietEnd: v }; saveNotify(); })),
      test,
      h("p", { class: "label" }, "Próximos avisos (si no haces nada)"),
      upcoming,
      h("p", { class: "hint small" }, "Con la app cerrada del todo un navegador no puede avisar sin un servidor. En la versión APK estos mismos horarios se programan en el teléfono."),
    ];
  }

  private download(): void {
    if (!this.world) return;
    const blob = new Blob([exportSave(this.world, this.now())], { type: "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: `tamagotchia-${this.world.creature.name}-${new Date().toISOString().slice(0, 10)}.json` });
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  }

  private confirm(message: string, action: string, onYes: () => void): void {
    this.sheet("¿Seguro?", h("p", {}, message),
      h("div", { class: "row" },
        h("button", { class: "btn", type: "button", onclick: () => this.closeSheet() }, "Cancelar"),
        h("button", { class: "btn danger", type: "button", onclick: () => { this.closeSheet(); onYes(); } }, action)));
  }

  private confirmReset(): void {
    const name = this.world?.creature.name ?? "";
    const input = h("input", { class: "field", placeholder: name, "aria-label": "Escribe el nombre para confirmar", autocomplete: "off" }) as HTMLInputElement;
    const go = h("button", { class: "btn danger", type: "button", disabled: true, onclick: () => {
      wipe(this.store);
      this.world = null;
      this.closeSheet();
      this.renderOnboarding();
    } }, "Sí, empezar de nuevo") as HTMLButtonElement;
    input.addEventListener("input", () => (go.disabled = input.value.trim() !== name));
    this.sheet("Empezar de nuevo",
      h("p", {}, `Esto borra a ${name} y todos sus recuerdos de este teléfono. Si quieres conservarlo, exporta un respaldo antes.`),
      h("label", { class: "label" }, `Escribe «${name}» para confirmar`), input, go);
  }

  private openDebug(): void {
    const w = this.world;
    if (!w) return;
    const c = w.creature;
    const n = this.lastNarration;
    const advance = (hours: number) => () => {
      this.debug.offsetMs += hours * R.HOUR;
      this.saveDebug();
      this.tick();
      this.openDebug();
    };
    const raw = JSON.stringify({ stage: c.stage, stats: Object.fromEntries(Object.entries(c.stats).map(([k, v]) => [k, Math.round(v * 10) / 10])),
      asleep: c.asleep, sick: c.sick, experience: c.experience, ageH: Math.round(c.ageMs / R.HOUR * 10) / 10, favorite: c.favoriteFood, disliked: c.dislikedFood,
      neglectMin: Math.round(c.neglectMs / 60000), lastTick: new Date(c.lastTickAt).toISOString(), offsetH: this.debug.offsetMs / R.HOUR }, null, 1);
    this.sheet("Debug",
      h("p", { class: "hint small" }, "Estas herramientas editan el estado a mano. Solo para probar; el juego normal nunca lo hace."),
      h("pre", { class: "code" }, raw),
      h("p", { class: "hint small" }, n ? `Última voz: ${n.source}${n.latencyMs !== null ? ` · ${n.latencyMs} ms` : ""}${n.problem ? ` · ${n.problem}` : ""}` : "Sin voz todavía"),
      h("div", { class: "row wrap" },
        h("button", { class: "btn", type: "button", onclick: advance(1) }, "+1 h"),
        h("button", { class: "btn", type: "button", onclick: advance(6) }, "+6 h"),
        h("button", { class: "btn", type: "button", onclick: advance(24) }, "+24 h"),
        h("button", { class: "btn", type: "button", onclick: () => { this.debug.offsetMs = 0; this.saveDebug(); this.openDebug(); } }, "Reloj real")),
      h("div", { class: "row wrap" },
        h("button", { class: "btn", type: "button", onclick: () => this.debugEdit((x) => Object.assign(x.creature.stats, { hunger: 0, energy: 100, mood: 100, cleanliness: 100, health: 100 }), "necesidades llenas") }, "Rellenar"),
        h("button", { class: "btn", type: "button", onclick: () => this.debugEdit((x) => { x.creature.sick = true; }, "enfermo") }, "Enfermar"),
        h("button", { class: "btn", type: "button", onclick: () => this.debugEdit((x) => {
          const next = x.creature.stage === "baby" ? R.EVOLUTION.child : R.EVOLUTION.adult;
          x.creature.ageMs = Math.max(x.creature.ageMs, next.ageMs);
          x.creature.experience = Math.max(x.creature.experience, next.experience);
          x.creature.sick = false;
          evolve(x, this.now());
        }, "evolución forzada") }, "Evolucionar"),
        h("button", { class: "btn", type: "button", onclick: () => { this.debug.failModel = !this.debug.failModel; this.saveDebug(); this.openDebug(); } },
          this.debug.failModel ? "Modelo: fallando" : "Simular fallo del modelo")),
      h("h3", {}, "Eventos"),
      h("ul", { class: "list compact" }, ...w.events.slice(-12).reverse().map((e) => h("li", {}, h("code", {}, `#${e.seq} ${e.kind}`), h("time", {}, clockLabel(e.at))))));
  }

  private loadDebug(): Debug {
    try {
      const d = JSON.parse(this.store.getItem(DEBUG_KEY) ?? "null") as Partial<Debug> | null;
      return { offsetMs: typeof d?.offsetMs === "number" ? d.offsetMs : 0, failModel: d?.failModel === true };
    } catch {
      return { offsetMs: 0, failModel: false };
    }
  }

  private saveDebug(): void {
    this.store.setItem(DEBUG_KEY, JSON.stringify(this.debug));
  }
}
