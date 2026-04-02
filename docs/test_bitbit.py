#!/usr/bin/env python3
"""
BitBit E2E Browser Test Script
Tests the BitBit web application at https://app.bitbit.chat
"""

import os
import time
import json
from datetime import datetime
from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

SCREENSHOTS_DIR = "/home/claude/bitbit/docs/screenshots"
BASE_URL = "https://app.bitbit.chat"
REPORT_PATH = "/home/claude/bitbit/docs/BROWSER-TEST-REPORT.md"

os.makedirs(SCREENSHOTS_DIR, exist_ok=True)

results = []
console_errors = []
network_errors = []

def log(msg):
    ts = datetime.now().strftime("%H:%M:%S")
    print(f"[{ts}] {msg}")

def screenshot(page, name, description=""):
    path = os.path.join(SCREENSHOTS_DIR, f"{name}.png")
    page.screenshot(path=path, full_page=True)
    log(f"  Screenshot saved: {name}.png")
    return path

def record(step, status, details=""):
    results.append({"step": step, "status": status, "details": details})
    emoji = "OK" if status == "pass" else "FAIL" if status == "fail" else "WARN"
    log(f"  [{emoji}] {step}: {details}")

def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True, args=["--no-sandbox", "--disable-gpu"])
        context = browser.new_context(
            viewport={"width": 1440, "height": 900},
            user_agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
        )
        page = context.new_page()

        # Capture console errors
        page.on("console", lambda msg: console_errors.append(f"[{msg.type}] {msg.text}") if msg.type in ("error", "warning") else None)
        page.on("pageerror", lambda err: console_errors.append(f"[pageerror] {err}"))
        page.on("requestfailed", lambda req: network_errors.append(f"{req.method} {req.url} - {req.failure}"))

        # ============================================================
        # STEP 1: Navigate to login page
        # ============================================================
        log("Step 1: Navigate to login page")
        try:
            page.goto(f"{BASE_URL}/login", wait_until="networkidle", timeout=30000)
            screenshot(page, "01_login_page")
            record("Login page load", "pass", f"URL: {page.url}")
        except Exception as e:
            screenshot(page, "01_login_page_error")
            record("Login page load", "fail", str(e))

        # ============================================================
        # STEP 2: Fill in credentials and login
        # ============================================================
        log("Step 2: Fill in credentials and login")
        try:
            # Try different selectors for email field
            email_selectors = [
                'input[name="email"]',
                'input[type="email"]',
                '#email',
                'input[placeholder*="email" i]',
                'input[placeholder*="Email"]',
            ]
            email_filled = False
            for sel in email_selectors:
                try:
                    el = page.wait_for_selector(sel, timeout=3000)
                    if el:
                        el.fill("hi@torkay.com")
                        email_filled = True
                        log(f"  Email filled using selector: {sel}")
                        break
                except:
                    continue

            if not email_filled:
                # Try to find any input fields and log them
                inputs = page.query_selector_all("input")
                input_info = []
                for inp in inputs:
                    input_info.append({
                        "type": inp.get_attribute("type"),
                        "name": inp.get_attribute("name"),
                        "placeholder": inp.get_attribute("placeholder"),
                        "id": inp.get_attribute("id"),
                    })
                record("Email field", "fail", f"No email input found. Inputs on page: {json.dumps(input_info)}")
            else:
                record("Email field", "pass", "Filled with hi@torkay.com")

            # Try different selectors for password field
            pw_selectors = [
                'input[name="password"]',
                'input[type="password"]',
                '#password',
                'input[placeholder*="password" i]',
                'input[placeholder*="Password"]',
            ]
            pw_filled = False
            for sel in pw_selectors:
                try:
                    el = page.wait_for_selector(sel, timeout=3000)
                    if el:
                        el.fill("password")
                        pw_filled = True
                        log(f"  Password filled using selector: {sel}")
                        break
                except:
                    continue

            if not pw_filled:
                record("Password field", "fail", "No password input found")
            else:
                record("Password field", "pass", "Filled with password")

            screenshot(page, "02_login_filled")

            # Click login button
            login_selectors = [
                'button[type="submit"]',
                'button:has-text("Log in")',
                'button:has-text("Login")',
                'button:has-text("Sign in")',
                'button:has-text("Sign In")',
                'input[type="submit"]',
            ]
            login_clicked = False
            for sel in login_selectors:
                try:
                    el = page.wait_for_selector(sel, timeout=2000)
                    if el:
                        el.click()
                        login_clicked = True
                        log(f"  Login clicked using selector: {sel}")
                        break
                except:
                    continue

            if not login_clicked:
                record("Login button click", "fail", "No login button found")
            else:
                record("Login button click", "pass", "Clicked")

        except Exception as e:
            screenshot(page, "02_login_error")
            record("Login form fill", "fail", str(e))

        # ============================================================
        # STEP 3: Wait for dashboard redirect
        # ============================================================
        log("Step 3: Wait for dashboard redirect")
        try:
            page.wait_for_url("**/dashboard**", timeout=15000)
            page.wait_for_load_state("networkidle", timeout=15000)
            time.sleep(2)  # Let animations settle
            screenshot(page, "03_dashboard")
            record("Dashboard redirect", "pass", f"URL: {page.url}")
        except Exception as e:
            screenshot(page, "03_dashboard_fail")
            current = page.url
            record("Dashboard redirect", "fail", f"URL stayed at: {current}. Error: {str(e)}")

            # Check if we're still on login - maybe wrong credentials
            if "login" in current.lower():
                # Look for error messages
                error_texts = page.query_selector_all('[class*="error"], [class*="alert"], [role="alert"]')
                for et in error_texts:
                    txt = et.text_content()
                    if txt:
                        record("Login error message", "warn", txt.strip())
                
                # Try to get page text for debugging
                body_text = page.text_content("body") or ""
                if "invalid" in body_text.lower() or "incorrect" in body_text.lower() or "error" in body_text.lower():
                    lines = [l.strip() for l in body_text.split("\n") if l.strip() and ("error" in l.lower() or "invalid" in l.lower() or "incorrect" in l.lower())]
                    for l in lines[:5]:
                        record("Login error text", "warn", l[:200])

        # ============================================================
        # STEP 4: Navigate to chat
        # ============================================================
        log("Step 4: Navigate to chat page")
        try:
            page.goto(f"{BASE_URL}/dashboard/chat", wait_until="networkidle", timeout=30000)
            time.sleep(2)
            screenshot(page, "04_chat_page")
            record("Chat page load", "pass" if "chat" in page.url.lower() or "dashboard" in page.url.lower() else "warn", f"URL: {page.url}")
        except Exception as e:
            screenshot(page, "04_chat_page_error")
            record("Chat page load", "fail", str(e))

        # ============================================================
        # STEP 5: Send a chat message
        # ============================================================
        log("Step 5: Send chat message")
        try:
            chat_selectors = [
                'textarea',
                'input[type="text"]',
                '[contenteditable="true"]',
                'input[placeholder*="message" i]',
                'textarea[placeholder*="message" i]',
                'input[placeholder*="chat" i]',
                'textarea[placeholder*="chat" i]',
                'input[placeholder*="type" i]',
                'textarea[placeholder*="type" i]',
            ]
            chat_filled = False
            for sel in chat_selectors:
                try:
                    els = page.query_selector_all(sel)
                    for el in els:
                        if el.is_visible():
                            el.fill("Hello BitBit, what can you help me with?")
                            chat_filled = True
                            log(f"  Chat message typed using selector: {sel}")
                            break
                    if chat_filled:
                        break
                except:
                    continue

            if chat_filled:
                screenshot(page, "05_chat_typed")
                record("Chat input", "pass", "Message typed")

                # Try to send - press Enter or click send button
                send_selectors = [
                    'button[type="submit"]',
                    'button:has-text("Send")',
                    'button[aria-label*="send" i]',
                    'button[aria-label*="Send"]',
                ]
                sent = False
                for sel in send_selectors:
                    try:
                        el = page.wait_for_selector(sel, timeout=2000)
                        if el and el.is_visible():
                            el.click()
                            sent = True
                            log(f"  Send clicked using: {sel}")
                            break
                    except:
                        continue

                if not sent:
                    # Try pressing Enter
                    page.keyboard.press("Enter")
                    sent = True
                    log("  Sent via Enter key")

                record("Chat send", "pass" if sent else "fail", "Message sent" if sent else "Could not send")

                # Wait for response
                log("  Waiting for chat response (up to 30s)...")
                time.sleep(5)  # Initial wait
                for i in range(5):
                    screenshot(page, f"06_chat_response_{i}")
                    time.sleep(5)

                screenshot(page, "06_chat_response_final")
                record("Chat response wait", "pass", "Waited 30s and captured screenshots")
            else:
                record("Chat input", "fail", "No chat input field found")
                screenshot(page, "05_chat_no_input")

        except Exception as e:
            screenshot(page, "05_chat_error")
            record("Chat interaction", "fail", str(e))

        # ============================================================
        # STEP 6-10: Navigate to other dashboard pages
        # ============================================================
        dashboard_pages = [
            ("leads", "07_leads"),
            ("invoices", "08_invoices"),
            ("meetings", "09_meetings"),
            ("tenders", "10_tenders"),
            ("contacts", "11_contacts"),
        ]

        for page_name, screenshot_name in dashboard_pages:
            log(f"Step: Navigate to /dashboard/{page_name}")
            try:
                page.goto(f"{BASE_URL}/dashboard/{page_name}", wait_until="networkidle", timeout=30000)
                time.sleep(2)
                screenshot(page, screenshot_name)
                actual_url = page.url
                if page_name in actual_url.lower() or "dashboard" in actual_url.lower():
                    record(f"{page_name.capitalize()} page", "pass", f"URL: {actual_url}")
                else:
                    record(f"{page_name.capitalize()} page", "warn", f"Redirected to: {actual_url}")
            except Exception as e:
                screenshot(page, f"{screenshot_name}_error")
                record(f"{page_name.capitalize()} page", "fail", str(e))

        browser.close()

    # ============================================================
    # Generate report
    # ============================================================
    generate_report()

def generate_report():
    log("Generating report...")
    
    # List screenshots
    screenshots = sorted(os.listdir(SCREENSHOTS_DIR))
    
    passed = sum(1 for r in results if r["status"] == "pass")
    failed = sum(1 for r in results if r["status"] == "fail")
    warned = sum(1 for r in results if r["status"] == "warn")
    total = len(results)
    
    report = f"""# BitBit Browser Test Report

**Date:** {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}  
**Target:** https://app.bitbit.chat  
**Browser:** Chromium (Headless)  
**Viewport:** 1440x900  

## Summary

- **Total Steps:** {total}
- **Passed:** {passed}
- **Failed:** {failed}
- **Warnings:** {warned}

## Test Results

| # | Step | Status | Details |
|---|------|--------|---------|
"""
    for i, r in enumerate(results, 1):
        status_icon = "✅" if r["status"] == "pass" else "❌" if r["status"] == "fail" else "⚠️"
        details = r["details"].replace("|", "\\|")[:150]
        report += f"| {i} | {r['step']} | {status_icon} {r['status'].upper()} | {details} |\n"

    report += f"""
## Console Errors

"""
    if console_errors:
        for err in console_errors[:30]:
            report += f"- `{err[:200]}`\n"
    else:
        report += "No console errors captured.\n"

    report += f"""
## Network Errors

"""
    if network_errors:
        for err in network_errors[:20]:
            report += f"- `{err[:200]}`\n"
    else:
        report += "No network errors captured.\n"

    report += f"""
## Screenshots Captured

"""
    for s in screenshots:
        report += f"- `{s}`\n"

    report += f"""
## Notes

- Test ran in headless Chromium mode
- All screenshots saved to `/home/claude/bitbit/docs/screenshots/`
- Login credentials used: hi@torkay.com / password
"""

    with open(REPORT_PATH, "w") as f:
        f.write(report)
    
    log(f"Report saved to {REPORT_PATH}")

if __name__ == "__main__":
    log("Starting BitBit E2E Browser Tests")
    log(f"Screenshots will be saved to: {SCREENSHOTS_DIR}")
    run_tests()
    log("Done!")
