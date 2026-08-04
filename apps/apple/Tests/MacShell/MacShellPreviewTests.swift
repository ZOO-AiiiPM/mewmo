import XCTest

final class MacShellPreviewTests: XCTestCase {
    func testMacSectionsRemainStable() {
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

    func testTabsPreserveIndependentNavigationState() throws {
        var workspace = MacShellWorkspace(initialSelectedItemID: "daily")
        let firstTabID = try XCTUnwrap(workspace.activeTabID)
        workspace.updateActive {
            $0.section = .notes
            $0.selectedItemID = "research"
            $0.searchQuery = "design"
        }

        let secondTabID = workspace.addTab()
        workspace.updateActive {
            $0.section = .clips
            $0.selectedItemID = "inbox"
            $0.searchQuery = "reading"
        }

        workspace.activate(firstTabID)
        let firstTab = try XCTUnwrap(workspace.activeTab)
        XCTAssertEqual(firstTab.section, .notes)
        XCTAssertEqual(firstTab.selectedItemID, "research")
        XCTAssertEqual(firstTab.searchQuery, "design")

        workspace.activate(secondTabID)
        let secondTab = try XCTUnwrap(workspace.activeTab)
        XCTAssertEqual(secondTab.section, .clips)
        XCTAssertEqual(secondTab.selectedItemID, "inbox")
        XCTAssertEqual(secondTab.searchQuery, "reading")
    }

    func testClosingActiveTabSelectsRightNeighborThenLeftAndCanEmptyWorkspace() throws {
        var workspace = MacShellWorkspace()
        let firstTabID = try XCTUnwrap(workspace.activeTabID)
        let secondTabID = workspace.addTab()
        let thirdTabID = workspace.addTab()

        workspace.activate(secondTabID)
        workspace.closeActiveTab()
        XCTAssertEqual(workspace.activeTabID, thirdTabID)

        workspace.closeActiveTab()
        XCTAssertEqual(workspace.activeTabID, firstTabID)

        workspace.closeActiveTab()
        XCTAssertTrue(workspace.tabs.isEmpty)
        XCTAssertNil(workspace.activeTabID)
    }

    func testTabCycleAndOrdinalSelectionWrapOrIgnoreUnavailableTabs() throws {
        var workspace = MacShellWorkspace()
        let firstTabID = try XCTUnwrap(workspace.activeTabID)
        let secondTabID = workspace.addTab()
        let thirdTabID = workspace.addTab()

        workspace.activate(firstTabID)
        workspace.cycle(forward: true)
        XCTAssertEqual(workspace.activeTabID, secondTabID)

        workspace.cycle(forward: false)
        XCTAssertEqual(workspace.activeTabID, firstTabID)

        workspace.activate(position: 3)
        XCTAssertEqual(workspace.activeTabID, thirdTabID)

        workspace.activate(position: 9)
        XCTAssertEqual(workspace.activeTabID, thirdTabID)
    }
}
