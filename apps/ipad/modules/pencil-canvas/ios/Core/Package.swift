// swift-tools-version: 6.0
// Pure PencilKit logic for the pencil-canvas Expo module. The podspec compiles these same
// sources into the app; this package exists so the logic can be unit-tested on the iOS
// simulator without building the React Native app.
import PackageDescription

let package = Package(
    name: "PencilCanvasCore",
    platforms: [.iOS("26.0")],
    products: [
        .library(name: "PencilCanvasCore", targets: ["PencilCanvasCore"])
    ],
    targets: [
        .target(name: "PencilCanvasCore"),
        .testTarget(name: "PencilCanvasCoreTests", dependencies: ["PencilCanvasCore"])
    ],
    swiftLanguageModes: [.v6]
)
