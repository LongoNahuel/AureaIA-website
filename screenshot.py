from playwright.sync_api import sync_playwright

base = 'C:/Users/nahue/OneDrive/Desktop/DESARROLLO/DEMO/AureaIA-website'

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    page.goto('http://localhost:8000')
    page.wait_for_timeout(2200)

    page.screenshot(path=base + '/ss_hero.png')

    page.evaluate('window.scrollTo(0, 900)')
    page.wait_for_timeout(700)
    page.screenshot(path=base + '/ss_services.png')

    page.evaluate('window.scrollTo(0, 1900)')
    page.wait_for_timeout(700)
    page.screenshot(path=base + '/ss_portfolio.png')

    page.evaluate('window.scrollTo(0, 3400)')
    page.wait_for_timeout(700)
    page.screenshot(path=base + '/ss_contact.png')

    browser.close()
    print('done')
