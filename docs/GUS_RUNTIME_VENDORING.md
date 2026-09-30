# Decisión: runtime GUS local por copia fijada (vendoring)

Estado: aceptada, 2026-09-30. Aplica a M3.3–M3.4 del roadmap TamagotchIA × ISyMotron.

## Contexto

El cerebro local de la criatura usa el mismo runtime de inferencia que iSyCode Móvil (llama.cpp más un bridge en C, probado por CI con 22 modelos). No queremos una segunda implementación, ni tampoco dos copias que se desvíen sin que nadie se entere.

## Decisión

Se usa una **copia fijada** en `vendor/gus-runtime/`, generada por `tools/sync-gus-runtime.mjs` desde un commit explícito de iSyCode Móvil.

- **Qué se copia:** solo el motor, en una allowlist de 3 archivos:
  - `Sources/Model/GUSLlamaBridge.c` y `.h`;
  - `scripts/build-llama-xcframework.sh`, que fija llama.cpp.
- **Qué no se copia:** UI, catálogo, descargas, diagnóstico de crash ni el glue JNI/Swift de iSyCode. El glue de TamagotchIA vive fuera de `vendor/`.
- **Provenance:** `VENDOR.json` guarda el repo, el commit, `synced_at`, el pin de llama.cpp y el sha256 de cada archivo.
- **Verificación:** `npm test` revisa offline que el snapshot coincida con su manifiesto. El CI (`gus-runtime.yml`) regenera el commit fijado desde el repo público y compara byte a byte.
- **La copia es GENERATED:** no se edita a mano. Un cambio necesario se hace upstream y luego se mueve el pin.

## Cómo mover el pin

```text
cambio mergeado y probado en iSyCode Móvil
  → revisar el cambio
  → elegir el SHA nuevo a propósito (nunca "latest")
  → node tools/sync-gus-runtime.mjs --from <SHA>
  → revisar el diff de vendor/gus-runtime
  → npm test + smoke nativo
  → commit "vendor: GUS runtime → <SHA>"
```

Nunca se sigue `main` en automático.

## Por qué no un submódulo (por ahora)

No es que los submódulos sean malos. Para este milestone no convienen porque:

- agregan estado git extra;
- un clon puede quedar incompleto sin `--recursive`;
- CI y Capacitor necesitan pasos especiales;
- empeoran la entrada de quien contribuye desde el celular;
- con 3 archivos, el beneficio es bajo frente a una copia verificada.

## Cuándo extraer un paquete o repo compartido

Hay que reconsiderarlo cuando se cumpla algo como:

- 3 o más consumidores reales del runtime;
- una API del bridge estable;
- actualizaciones del pin frecuentes;
- glue duplicado entre apps que ya pese;
- versionado independiente que aporte valor.

La copia actual lo facilita: la allowlist y el manifiesto ya delimitan qué sería ese paquete.

## Rollback

Borrar `vendor/gus-runtime/` y el glue nativo deja funcionando el motor, el save, la voz de respaldo y la PWA. Ningún save depende de M3.
