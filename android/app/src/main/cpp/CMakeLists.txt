# TamagotchIA's native local brain for Android: the vendored GUS runtime
# (vendor/gus-runtime, pinned from iSyCode Móvil) + llama.cpp at the commit recorded in
# vendor/gus-runtime/VENDOR.json + TamagotchIA's own thin JNI glue.
cmake_minimum_required(VERSION 3.22.1)
project(tama_gus C CXX)

set(REPO_ROOT "${CMAKE_CURRENT_SOURCE_DIR}/../../../../..")
set(VENDOR "${REPO_ROOT}/vendor/gus-runtime")
file(READ "${VENDOR}/VENDOR.json" _manifest)
string(REGEX MATCH "\"llama_cpp_commit\": \"([0-9a-f]+)\"" _m "${_manifest}")
set(LLAMA_COMMIT "${CMAKE_MATCH_1}")
if(NOT LLAMA_COMMIT)
  message(FATAL_ERROR "Could not read llama_cpp_commit from vendor/gus-runtime/VENDOR.json")
endif()
message(STATUS "llama.cpp commit (from VENDOR.json): ${LLAMA_COMMIT}")

include(FetchContent)
set(LLAMA_BUILD_COMMON OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TESTS OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_EXAMPLES OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_SERVER OFF CACHE BOOL "" FORCE)
set(LLAMA_BUILD_TOOLS OFF CACHE BOOL "" FORCE)
set(LLAMA_CURL OFF CACHE BOOL "" FORCE)
set(BUILD_SHARED_LIBS OFF CACHE BOOL "" FORCE)
# No libomp on Android; ggml falls back to its own thread pool.
set(GGML_OPENMP OFF CACHE BOOL "" FORCE)
set(GGML_NATIVE OFF CACHE BOOL "" FORCE)
# (No DOWNLOAD_EXTRACT_TIMESTAMP: the SDK's CMake 3.22 predates it.)
FetchContent_Declare(llama
  URL "https://github.com/ggml-org/llama.cpp/archive/${LLAMA_COMMIT}.tar.gz")
FetchContent_MakeAvailable(llama)

# The bridge includes <llama/llama.h> (xcframework layout); mirror it.
configure_file("${llama_SOURCE_DIR}/include/llama.h" "${CMAKE_BINARY_DIR}/shim/llama/llama.h" COPYONLY)

add_library(tama_gus SHARED
  tama_gus_jni.c
  "${VENDOR}/Sources/Model/GUSLlamaBridge.c")
target_include_directories(tama_gus PRIVATE
  "${CMAKE_BINARY_DIR}/shim"
  "${VENDOR}/Sources/Model")
target_compile_options(tama_gus PRIVATE -O2 -Wall)
target_link_libraries(tama_gus PRIVATE llama)
# 16 KB page alignment (required by newer Android releases for native libs).
target_link_options(tama_gus PRIVATE "-Wl,-z,max-page-size=16384")
