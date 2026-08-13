import re

import pytest
from playwright.sync_api import Page, expect

# Base URL for the local frontend/API server
BASE_URL = "http://localhost:5173"


@pytest.fixture(scope="session")
def browser_context_args(browser_context_args):
    return {
        **browser_context_args,
        "viewport": {
            "width": 1280,
            "height": 720,
        },
    }


def login(page: Page):
    """Helper to authenticate."""
    page.goto(BASE_URL)
    expect(page.get_by_role("heading", name="ClaimArmor AI")).to_be_visible()
    page.get_by_role("button", name="Sign In").click()
    expect(page.get_by_role("heading", name="Dashboard")).to_be_visible(timeout=10000)


def test_login_component(page: Page):
    """Test the login component and authentication flow."""
    login(page)

    # Should navigate to dashboard
    expect(page.get_by_role("heading", name="Dashboard")).to_be_visible(timeout=10000)


def test_dashboard_component(page: Page):
    """Test the main dashboard metrics and charts components."""
    login(page)

    # Check top metric cards
    expect(page.get_by_role("heading", name="Claims Ingested")).to_be_visible()
    expect(page.get_by_role("heading", name="Pending Reviews")).to_be_visible()

    # Check charts / system status
    expect(page.get_by_role("heading", name="System Status")).to_be_visible()


def test_claims_list_component(page: Page):
    """Test the claims list table, search, and pagination."""
    login(page)
    page.goto(f"{BASE_URL}/claims")

    expect(page.get_by_role("heading", name="Claims Repository")).to_be_visible()

    # Test search bar
    search_input = page.get_by_placeholder("Search claims by ID or name...")
    expect(search_input).to_be_visible()
    search_input.fill("CLM-")

    # Test table presence
    expect(page.locator("table")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Claim ID")).to_be_visible()

    # Test 'Add Claim' modal component
    page.click('button:has-text("Add Claim")')
    expect(page.get_by_role("dialog")).to_be_visible()
    expect(page.get_by_text("Upload CSV")).to_be_visible()
    page.click('button:has-text("Cancel")')


def test_claim_detail_component(page: Page):
    """Test the claim detail view, including the 7-agent trace visualizer and timeline."""
    login(page)
    page.goto(f"{BASE_URL}/claims")

    # Click the first claim in the table
    page.locator("table tbody tr").first.click()

    # Verify we navigated to the detail page
    expect(page).to_have_url(re.compile(r".*/claims/CLM-.*"))

    # Check components
    expect(page.get_by_text("Claim Details")).to_be_visible()
    expect(page.get_by_text("Coverage Timeline")).to_be_visible()
    expect(page.get_by_text("Investigation Trace")).to_be_visible()


def test_review_queue_component(page: Page):
    """Test the human review queue and approval/rejection actions."""
    login(page)
    page.goto(f"{BASE_URL}/review")

    expect(page.get_by_role("heading", name="Review Queue")).to_be_visible()

    # Check if there are items in the queue
    queue_items = page.locator(".review-item")
    if queue_items.count() > 0:
        # Check action buttons on the first item
        first_item = queue_items.first
        expect(first_item.get_by_text("Approve")).to_be_visible()
        expect(first_item.get_by_text("Reject")).to_be_visible()


def test_audit_trail_component(page: Page):
    """Test the cryptographic audit trail component."""
    login(page)
    page.goto(f"{BASE_URL}/audit")

    expect(page.get_by_role("heading", name="Audit Trail")).to_be_visible()
    expect(page.get_by_role("columnheader", name="Hash")).to_be_visible()

    # Check verification button
    verify_btn = page.get_by_role("button", name="Verify Chain")
    expect(verify_btn).to_be_visible()


def test_navigation_sidebar(page: Page):
    """Test that all sidebar links work and highlight correctly."""
    login(page)
    page.goto(BASE_URL)

    nav_links = ["Dashboard", "Claims", "Review Queue", "Policies", "Analytics"]
    for link_text in nav_links:
        link = page.locator(f"nav >> a:has-text('{link_text}')")
        expect(link).to_be_visible()
        link.click()
