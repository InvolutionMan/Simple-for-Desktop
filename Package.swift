// swift-tools-version: 5.9
import PackageDescription

let package = Package(
    name: "SimpleLogin",
    platforms: [.macOS(.v13)],
    targets: [
        .executableTarget(
            name: "SimpleLogin",
            path: "Sources/SimpleLogin",
            resources: [.copy("Resources/Easemob-chat.js")]
        )
    ]
)
