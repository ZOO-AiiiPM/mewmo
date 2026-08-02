import XCTest

final class MacShellPreviewTests: XCTestCase {
    func testLocalPreviewHasStableInitialSelection() {
        XCTAssertEqual(MacShellPreview.items.first?.id, "daily")
        XCTAssertEqual(MacShellSection.allCases.map(\.rawValue), ["home", "notes", "clips", "feeds"])
    }

    func testThemeTokensStayNeutral() {
        for token in MacShellPalette.neutralTokens {
            let red = (token >> 16) & 0xFF
            let green = (token >> 8) & 0xFF
            let blue = token & 0xFF
            XCTAssertLessThanOrEqual(max(red, green, blue) - min(red, green, blue), 9)
        }

        XCTAssertEqual(MacShellPalette.lightCanvas, 0xF7F7F7)
        XCTAssertEqual(MacShellPalette.darkCanvas, 0x232327)
    }
}
