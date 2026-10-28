import SwiftUI

enum Theme {
    static let paper = Color(hex: 0xFBFAF8)
    static let surface = Color.white
    static let ink = Color(hex: 0x1E1D1B)
    static let inkSoft = Color(hex: 0x3E3B36)
    static let muted = Color(hex: 0x6F6A62)
    static let faint = Color(hex: 0x787268)
    static let placeholder = Color(hex: 0x7B756C)
    static let line = Color(hex: 0xE6E2DA)
    static let lineStrong = Color(hex: 0xD8D2C8)
    static let hover = Color(hex: 0xF6F4EF)
    static let teal = Color(hex: 0x00BCB7)
    static let tealDeep = Color(hex: 0x006B68)
    static let tealInk = Color(hex: 0x04211F)
    static let tealSoft = Color(hex: 0xE6F7F6)
    static let danger = Color(hex: 0xB3261E)
    static let dangerSoft = Color(hex: 0xFBEDEC)
    static let splashInk = Color(hex: 0x0A0A0A)
}

extension Color {
    init(hex: UInt32) {
        let red = Double((hex >> 16) & 0xFF) / 255.0
        let green = Double((hex >> 8) & 0xFF) / 255.0
        let blue = Double(hex & 0xFF) / 255.0
        self.init(.sRGB, red: red, green: green, blue: blue, opacity: 1)
    }
}

enum AppFont {
    static func songtiLight(_ size: CGFloat) -> Font {
        .custom("STSongti-SC-Light", size: size)
    }

    static func songti(_ size: CGFloat) -> Font {
        .custom("STSongti-SC-Regular", size: size)
    }

    static func songtiBold(_ size: CGFloat) -> Font {
        .custom("STSongti-SC-Bold", size: size)
    }

    static func brand(_ size: CGFloat) -> Font {
        .custom("AvenirNext-Medium", size: size)
    }
}
