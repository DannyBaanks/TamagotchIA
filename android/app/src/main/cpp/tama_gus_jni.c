// TamagotchIA's JNI glue for the vendored GUS runtime (vendor/gus-runtime, pinned from
// iSyCode Móvil). Only inference crosses here: chat messages in, text out. No game state,
// no files besides the model the plugin already resolved, no network.
//
// Text crosses as UTF-8 byte arrays: JNI's "modified UTF-8" mangles emoji, and model
// output can end in the middle of a code point (Java decodes it leniently).
#ifndef _GNU_SOURCE
#define _GNU_SOURCE
#endif
#include <jni.h>
#include <stdint.h>
#include <stdlib.h>
#include <string.h>
#include "GUSLlamaBridge.h"

static void throw_state(JNIEnv * env, const char * message) {
    jclass cls = (*env)->FindClass(env, "java/lang/IllegalStateException");
    if (cls != NULL) (*env)->ThrowNew(env, cls, message);
}

static char * copy_bytes(JNIEnv * env, jbyteArray array) {
    if (array == NULL) return NULL;
    jsize length = (*env)->GetArrayLength(env, array);
    char * out = malloc((size_t)length + 1);
    if (out == NULL) return NULL;
    (*env)->GetByteArrayRegion(env, array, 0, length, (jbyte *)out);
    out[length] = '\0';
    return out;
}

JNIEXPORT jlong JNICALL
Java_io_github_dannybaanks_tamagotchia_GusLocalPlugin_nativeCreate(JNIEnv * env, jclass cls, jbyteArray path, jint context_tokens) {
    (void)cls;
    char * c_path = copy_bytes(env, path);
    if (c_path == NULL) { throw_state(env, "Not enough memory."); return 0; }
    char error[512] = {0};
    GUSLlamaContext * ctx = gus_llama_create(c_path, (uint32_t)context_tokens, error, sizeof(error));
    free(c_path);
    if (ctx == NULL) { throw_state(env, error[0] ? error : "llama.cpp could not load the model."); return 0; }
    return (jlong)(intptr_t)ctx;
}

JNIEXPORT void JNICALL
Java_io_github_dannybaanks_tamagotchia_GusLocalPlugin_nativeDestroy(JNIEnv * env, jclass cls, jlong handle) {
    (void)env; (void)cls;
    gus_llama_destroy((GUSLlamaContext *)(intptr_t)handle);
}

JNIEXPORT void JNICALL
Java_io_github_dannybaanks_tamagotchia_GusLocalPlugin_nativeCancel(JNIEnv * env, jclass cls, jlong handle) {
    (void)env; (void)cls;
    gus_llama_cancel((GUSLlamaContext *)(intptr_t)handle);
}

/** roles/contents: parallel arrays of UTF-8 bytes. Chat sampling (anti-loop), random seed. */
JNIEXPORT jbyteArray JNICALL
Java_io_github_dannybaanks_tamagotchia_GusLocalPlugin_nativeGenerate(JNIEnv * env, jclass cls, jlong handle,
                                                                     jobjectArray roles, jobjectArray contents, jint max_tokens) {
    (void)cls;
    GUSLlamaContext * ctx = (GUSLlamaContext *)(intptr_t)handle;
    jsize count = roles ? (*env)->GetArrayLength(env, roles) : 0;
    if (ctx == NULL || count <= 0 || contents == NULL || count != (*env)->GetArrayLength(env, contents)) {
        throw_state(env, "Invalid chat request.");
        return NULL;
    }
    GUSChatMessage * messages = calloc((size_t)count, sizeof(GUSChatMessage));
    char ** owned = calloc((size_t)count * 2, sizeof(char *));
    jbyteArray result = NULL;
    if (messages == NULL || owned == NULL) { throw_state(env, "Not enough memory."); goto done; }
    for (jsize i = 0; i < count; i++) {
        jbyteArray role = (jbyteArray)(*env)->GetObjectArrayElement(env, roles, i);
        jbyteArray content = (jbyteArray)(*env)->GetObjectArrayElement(env, contents, i);
        owned[2 * i] = copy_bytes(env, role);
        owned[2 * i + 1] = copy_bytes(env, content);
        (*env)->DeleteLocalRef(env, role);
        (*env)->DeleteLocalRef(env, content);
        if (owned[2 * i] == NULL || owned[2 * i + 1] == NULL) { throw_state(env, "Invalid chat message."); goto done; }
        messages[i].role = owned[2 * i];
        messages[i].content = owned[2 * i + 1];
    }
    GUSSamplingParams sampling = gus_llama_default_chat_sampling();
    char error[512] = {0};
    char * text = gus_llama_generate_chat_sampled(ctx, messages, (size_t)count, NULL, (uint32_t)max_tokens,
                                                  &sampling, NULL, error, sizeof(error));
    if (text == NULL) { throw_state(env, error[0] ? error : "Local inference failed."); goto done; }
    jsize length = (jsize)strlen(text);
    result = (*env)->NewByteArray(env, length);
    if (result != NULL) (*env)->SetByteArrayRegion(env, result, 0, length, (const jbyte *)text);
    gus_llama_free_text(text);
done:
    if (owned != NULL) {
        for (jsize i = 0; i < count * 2; i++) free(owned[i]);
        free(owned);
    }
    free(messages);
    return result;
}
