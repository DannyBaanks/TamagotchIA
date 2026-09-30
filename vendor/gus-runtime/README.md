# Vendored GUS runtime (GENERATED — do not edit)

Pinned copy of the local-inference bridge from [iSyCode Móvil](https://github.com/DannyBaanks/iSyCodeMovil).

- Upstream commit: `9c8a659840045cb31da7b501022645a194f4422d`
- llama.cpp commit (from the build script): `842b1880415d6f508f03b789e5ce70194def7bfd`
- Files and sha256: `VENDOR.json`

Only the engine is shared, not the app: no UI, catalog, crash diagnostics or iSyCode JNI glue.
TamagotchIA's own glue lives outside this directory.

## Changing it

1. Fix or change the bridge **upstream** in iSyCode Móvil and get it merged and tested there.
2. Pick the new SHA on purpose (never "latest").
3. `node tools/sync-gus-runtime.mjs --from <SHA>`
4. Review the diff, run `npm test` and the native smoke, and commit the pin update.

CI regenerates this directory from the pinned SHA and fails on any difference.
