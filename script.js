console.log("panelnav script loaded");

function executeScripts(container) {
    // Scripts inserted via innerHTML don't execute automatically -
    // this re-creates and re-inserts them so they actually run.
    // Needed for anything that renders client-side after page load
    // (e.g. KaTeX/MathJax-style math rendering).
    const scripts = container.querySelectorAll('script');
    scripts.forEach((oldScript) => {
        const newScript = document.createElement('script');
        Array.from(oldScript.attributes).forEach((attr) => {
            newScript.setAttribute(attr.name, attr.value);
        });
        newScript.textContent = oldScript.textContent;
        oldScript.parentNode.replaceChild(newScript, oldScript);
    });
}

function wikiIdFromUrl(url) {
    const targetUrl = new URL(url, window.location.href);
    const queryId = targetUrl.searchParams.get('id');
    if (queryId) return queryId;

    const baseUrl = new URL(DOKU_BASE, window.location.origin);
    const dokuPhpPath = new URL('doku.php', baseUrl).pathname;
    if (targetUrl.pathname.startsWith(dokuPhpPath + '/')) {
        return decodeURIComponent(targetUrl.pathname.slice(dokuPhpPath.length + 1));
    }

    let pagePath = targetUrl.pathname;
    if (pagePath.startsWith(baseUrl.pathname)) {
        pagePath = pagePath.slice(baseUrl.pathname.length);
    }
    return decodeURIComponent(pagePath.replace(/^\/+|\/+$/g, ''));
}

function wikiUrlFromId(id) {
    const baseUrl = new URL(DOKU_BASE, window.location.origin);
    const targetUrl = new URL('doku.php', baseUrl);
    targetUrl.searchParams.set('id', id);
    return targetUrl.href;
}

function setPanelUrlState(pageId) {
    if (!pageId) return;

    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('panelnav');
    currentUrl.searchParams.set('right', pageId);

    // A colon is valid in a query value and keeps namespace IDs readable.
    const readableUrl = currentUrl.href.replace(/([?&]right=)[^&]*/, (_, prefix) => {
        return prefix + encodeURIComponent(pageId).replace(/%3A/gi, ':');
    });
    window.history.replaceState(window.history.state, '', readableUrl);
}

function clearPanelUrlState() {
    const currentUrl = new URL(window.location.href);
    currentUrl.searchParams.delete('panelnav');
    currentUrl.searchParams.delete('right');
    window.history.replaceState(window.history.state, '', currentUrl);
}

document.addEventListener('DOMContentLoaded', () => {
    const left = document.getElementById('panelnav-left');
    const right = document.getElementById('panelnav-right');
    const rightContent = document.getElementById('panelnav-right-content');
    let currentRightUrl = null;
    let desktopIndependentScroll = false;



    // Not on a wrapped content page (e.g. admin/edit view) - do nothing
    if (!left || !right || !rightContent) return;

    function addPanelControls() {
        const topBanner = rightContent.querySelector('.topBanner');
        if (!topBanner) return;

        // Keep the page name at the left edge, and group the dates with
        // the controls at the right edge of the banner.
        const bannerDetails = topBanner.children[1];
        const rightSide = document.createElement('div');
        rightSide.className = 'panelnav-header-right';
        if (bannerDetails) rightSide.appendChild(bannerDetails);

        const actions = document.createElement('div');
        actions.className = 'panelnav-actions';

        const openButton = document.createElement('button');
        openButton.id = 'panelnav-open';
        openButton.type = 'button';
        openButton.title = 'Open page by itself';
        openButton.setAttribute('aria-label', 'Open page by itself');
        openButton.textContent = '↑';

        const closeButton = document.createElement('button');
        closeButton.id = 'panelnav-close';
        closeButton.type = 'button';
        closeButton.title = 'Close right panel';
        closeButton.setAttribute('aria-label', 'Close right panel');
        closeButton.textContent = '×';

        actions.append(openButton, closeButton);
        rightSide.appendChild(actions);
        topBanner.appendChild(rightSide);
    }

    function isEligibleLink(a) {
        if (!a) return false;

        // Never intercept links inside the command palette - those are
        // meant to always do a real navigation, regardless of where
        // its modal happens to sit in the DOM.
        if (a.closest('#cmdp-search-modal')) return false;

        // Must be a real wiki page link (existing or non-existing page)
        const isWikilink = a.classList.contains('wikilink1') || a.classList.contains('wikilink2');
        if (!isWikilink) return false;

        // Exclude media files and interwiki links
        if (a.classList.contains('media') || a.classList.contains('interwiki')) return false;

        // Exclude anything explicitly meant to open elsewhere
        if (a.target === '_blank') return false;

        // Must be same-origin (internal)
        try {
            const url = new URL(a.href, window.location.origin);
            if (url.origin !== window.location.origin) return false;
        } catch (e) {
            return false;
        }

        return true;
    }

    function activatePanelMode() {
        const firstActivation = !document.body.classList.contains('panelnav-active');
        const desktop = window.matchMedia('(min-width: 1200px)').matches;
        const leftScrollOffset = firstActivation && desktop
            ? Math.max(0, -left.getBoundingClientRect().top)
            : 0;

        document.body.classList.add('panelnav-active');

        if (firstActivation && desktop) {
            left.scrollTop = leftScrollOffset;
            window.scrollTo(0, 0);
            desktopIndependentScroll = true;
        }
    }

    function deactivatePanelMode() {
        const documentScroll = desktopIndependentScroll
            ? window.scrollY + left.getBoundingClientRect().top + left.scrollTop
            : null;

        document.body.classList.remove('panelnav-active');

        if (documentScroll !== null) {
            window.scrollTo(0, Math.max(0, documentScroll));
            desktopIndependentScroll = false;
        }
    }

    async function openInRightPanel(url, persistUrl = true, pageId = null) {
        currentRightUrl = url;
        try {
            const response = await fetch(url, { credentials: 'same-origin' });
            const html = await response.text();

            const parser = new DOMParser();
            const doc = parser.parseFromString(html, 'text/html');

            // #panelnav-left on the fetched page contains the full mini-page
            // (header, breadcrumbs, page box, footer, backlinks) — grabbing
            // its innerHTML wholesale means the right panel automatically
            // gets identical styling, borders, and structure to the left.
            const contentEl =
                doc.querySelector('#panelnav-left') ||
                doc.querySelector('#dokuwiki__content');

            const previousPageId = rightContent.dataset.pageId || '';
            if (previousPageId && window.PanelnavAdapters?.annotations) window.PanelnavAdapters.annotations.destroy();

            rightContent.innerHTML = contentEl
                ? contentEl.innerHTML
                : '<p>Could not load page.</p>';

            const loadedPageId = pageId || wikiIdFromUrl(url);
            if (loadedPageId) rightContent.dataset.pageId = loadedPageId;
            else delete rightContent.dataset.pageId;

            addPanelControls();
            if (loadedPageId && window.PanelnavAdapters?.annotations) window.PanelnavAdapters.annotations.init(loadedPageId, rightContent, doc);
            executeScripts(rightContent);
            window.PanelnavAdapters?.preview?.init(rightContent);

            window.PanelnavAdapters?.prettyphoto?.init(rightContent);

            window.PanelnavAdapters?.katex?.init(rightContent);

            right.scrollTop = 0;
            if (persistUrl) setPanelUrlState(pageId || wikiIdFromUrl(url));
            right.classList.remove('panelnav-hidden');
            activatePanelMode();
        } catch (err) {
            console.error('panelnav: failed to load page', err);
        }
    }

    document.addEventListener('click', (e) => {
        const a = e.target.closest('a');
        if (!a) return;

        // Only intercept links that live inside the left panel's content
        // or the right panel's (already loaded) content
        const withinLeft = left.contains(a);
        const withinRight = rightContent.contains(a);
        if (!withinLeft && !withinRight) return;

        if (!isEligibleLink(a)) return;

        if (e.shiftKey) {
            e.preventDefault();
            window.location.href = a.href;
            return;
        }

        e.preventDefault();
        openInRightPanel(a.href, true, a.dataset.wikiId || null);
    });

    rightContent.addEventListener('click', (event) => {
        const closeButton = event.target.closest('#panelnav-close');
        if (closeButton) {
            window.PanelnavAdapters?.annotations?.destroy();
            right.classList.add('panelnav-hidden');
            rightContent.innerHTML = '';
            delete rightContent.dataset.pageId;
            currentRightUrl = null;
            deactivatePanelMode();
            clearPanelUrlState();
            return;
        }

        const openButton = event.target.closest('#panelnav-open');
        if (openButton && currentRightUrl) {
            window.location.href = currentRightUrl;
        }
    });

    // Expose so other plugins (e.g. the command palette) can open a page
    // in the right panel directly, instead of relying on click-delegation
    // picking it up from wherever their markup happens to live in the DOM.
    window.panelnavOpenInRightPanel = openInRightPanel;

    // Restore the right panel from the current page URL after a refresh.
    const currentUrl = new URL(window.location.href);
    const savedRightId = currentUrl.searchParams.get('right');
    const legacyPanelUrl = currentUrl.searchParams.get('panelnav');
    if (savedRightId) {
        openInRightPanel(wikiUrlFromId(savedRightId), false, savedRightId);
    } else if (legacyPanelUrl) {
        try {
            const restoredUrl = new URL(legacyPanelUrl, window.location.origin);
            if (restoredUrl.origin === window.location.origin) {
                const restoredId = wikiIdFromUrl(restoredUrl.href);
                openInRightPanel(restoredUrl.href, true, restoredId);
            }
        } catch (err) {
            console.warn('panelnav: ignoring invalid saved panel URL', err);
        }
    }


});
