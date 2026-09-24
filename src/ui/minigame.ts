/**
 * "Atrapa la estrella": a star slides across a track; tap when it is inside the glow.
 * Five rounds, the glow shrinks each round. The UI only counts hits and hands the score
 * to the engine, which validates it and decides what it is worth.
 */
import { buzz, h } from "./dom";

const ROUNDS = 5;

export function playMiniGame(host: HTMLElement, onDone: (score: number) => void): () => void {
  let round = 0;
  let score = 0;
  let raf = 0;
  let start = 0;
  let zoneStart = 0;
  let zoneWidth = 0;
  let speed = 0;
  let locked = false;

  const star = h("div", { class: "mg-star", "aria-hidden": "true" }, "★");
  const zone = h("div", { class: "mg-zone" });
  const track = h("div", { class: "mg-track" }, zone, star);
  const status = h("p", { class: "mg-status", "aria-live": "polite" }, "Toca cuando la estrella esté en la luz");
  const dots = h("div", { class: "mg-dots" }, ...Array.from({ length: ROUNDS }, () => h("span")));
  const tap = h("button", { class: "btn primary mg-tap", type: "button" }, "¡Ahora!");
  const view = h("div", { class: "minigame" }, h("h2", {}, "Atrapa la estrella"), dots, track, status, tap);
  host.replaceChildren(view);

  function position(t: number): number {
    const x = ((t - start) * speed) % 2;
    return x < 1 ? x : 2 - x; // ping-pong 0..1
  }

  function frame(t: number) {
    star.style.left = `${position(t) * 100}%`;
    raf = requestAnimationFrame(frame);
  }

  function nextRound() {
    locked = false;
    zoneWidth = 0.26 - round * 0.035;
    zoneStart = 0.1 + ((round * 0.37) % 0.6);
    speed = 0.0011 + round * 0.00022;
    zone.style.left = `${zoneStart * 100}%`;
    zone.style.width = `${zoneWidth * 100}%`;
    start = performance.now();
    raf = requestAnimationFrame(frame);
  }

  function hit() {
    if (locked) return;
    locked = true;
    cancelAnimationFrame(raf);
    const x = position(performance.now());
    const inside = x >= zoneStart && x <= zoneStart + zoneWidth;
    if (inside) score += 1;
    buzz(inside ? 25 : 8);
    dots.children[round]?.classList.add(inside ? "hit" : "miss");
    status.textContent = inside ? "¡Justo en la luz!" : "Uy, por poquito";
    round += 1;
    if (round >= ROUNDS) {
      tap.disabled = true;
      status.textContent = `Resultado: ${score} de ${ROUNDS}`;
      setTimeout(() => onDone(score), 900);
    } else {
      setTimeout(nextRound, 650);
    }
  }

  tap.addEventListener("click", hit);
  nextRound();
  return () => cancelAnimationFrame(raf);
}
