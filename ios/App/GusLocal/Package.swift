// swift-tools-version: 5.9
import PackageDescription

// TamagotchIA's local brain on iOS. The C sources are symlinks into vendor/gus-runtime
// (pinned from iSyCode Móvil, never edited here); llama.xcframework is built from the
// commit pinned in vendor/gus-runtime/VENDOR.json by prepare.sh (not committed).
let package = Package(
    name: "GusLocal",
    platforms: [.iOS(.v15)],
    products: [
        .library(name: "GusLocalPlugin", targets: ["GusLocalPlugin"])
    ],
    dependencies: [
        .package(url: "https://github.com/ionic-team/capacitor-swift-pm.git", exact: "8.5.2")
    ],
    targets: [
        .binaryTarget(name: "llama", path: "llama.xcframework"),
        .target(name: "GUSBridge", dependencies: ["llama"], path: "Sources/GUSBridge"),
        .target(
            name: "GusLocalPlugin",
            dependencies: [
                "GUSBridge",
                .product(name: "Capacitor", package: "capacitor-swift-pm")
            ],
            path: "Sources/GusLocalPlugin"
        )
    ]
)
