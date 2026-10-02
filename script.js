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

/**
 * The "preview" plugin (cosmocode/dokuwiki-plugin-preview) attaches its
 * hover listeners once on DOMContentLoaded, to whatever a.wikilink1
 * elements exist at that moment. Links injected into the right panel
 * later never get those listeners. This re-implements just the hover
 * binding, scoped only to the given container, reusing the plugin's
 * own preview box element and AJAX endpoint so behavior stays identical.
 */
function initPreviewForPanel(container) {
    if (typeof JSINFO === 'undefined' || !JSINFO.plugin || !JSINFO.plugin.preview) return;

    const previewBox = document.querySelector('.plugin-preview');
    if (!previewBox) return; // preview plugin not active on this install

    let abortController = null;

    function hidePreview() {
        previewBox.style.display = 'none';
        if (abortController) abortController.abort();
        abortController = null;
    }

    async function loadPreview(id) {
        try {
            if (abortController) abortController.abort();
            abortController = new AbortController();
            const data = await fetch(
                DOKU_BASE + 'lib/exe/ajax.php?call=plugin_preview&id=' + encodeURIComponent(id),
                { signal: abortController.signal, method: 'POST' }
            );
            if (data.ok) {
                previewBox.innerHTML = await data.text();
                previewBox.style.display = 'block';
            }
        } catch (ignored) {
            // matches the plugin's own error handling - ignore
        }
    }

    container.querySelectorAll('a.wikilink1').forEach((link) => {
        link.addEventListener('mouseenter', (e) => {
            previewBox.style.top = e.pageY + 10 + 'px';
            previewBox.style.left = e.pageX + 10 + 'px';
            loadPreview(link.dataset.wikiId);
        });
        link.addEventListener('mouseleave', hidePreview);
        link.addEventListener('click', hidePreview);
        link.removeAttribute('title');
    });
}

/**
 * PrettyPhoto initializes links once on document ready. Reapply its normal
 * media-link setup and click binding to content inserted into panelnav.
 */
function initPrettyPhotoForPanel(container) {
    const $ = window.jQuery;
    const prettyPhotoConfig = window.JSINFO && window.JSINFO.plugin_prettyphoto;
    if (!$ || !$.fn.prettyPhoto || !prettyPhotoConfig) return;

    const mediaPath = window.PRETTYPHOTO_PLUGIN_MEDIAPATH || prettyPhotoConfig.mediapath;
    if (!mediaPath) return;

    const $container = $(container);
    const $mediaLinks = $container.find('a[class=media][href]')
        .add($container.filter('a[class=media][href]'));

    $mediaLinks.each(function() {
        const $link = $(this);
        if (!$link.find('img').length) return;
        if ($link.attr('href').indexOf(mediaPath) !== -1) {
            $link.attr('rel', 'prettyPhoto[gallery]');
        }
    });

    const $prettyPhotoLinks = $container.find("a[rel^='prettyPhoto']")
        .add($container.filter("a[rel^='prettyPhoto']"));
    $prettyPhotoLinks.prettyPhoto(window.PRETTYPHOTO_PLUGIN_PARAMS || {});
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

    // The annotations plugin keeps its client state inside a private IIFE and
    // always targets the main page id. This adapter uses its existing AJAX
    // endpoint and CSS from panelnav, so the annotations plugin stays intact.
    let panelAnnotations = null;

    function annotationInfoFromDocument(doc) {
        for (const script of doc.scripts) {
            const source = script.textContent || '';
            const marker = 'JSINFO.annotations=';
            const start = source.indexOf(marker);
            if (start < 0) continue;
            const jsonStart = source.indexOf('{', start + marker.length);
            if (jsonStart < 0) continue;
            let depth = 0;
            let inString = false;
            let escaped = false;
            for (let i = jsonStart; i < source.length; i++) {
                const ch = source[i];
                if (inString) {
                    if (escaped) escaped = false;
                    else if (ch === '\\') escaped = true;
                    else if (ch === '"') inString = false;
                    continue;
                }
                if (ch === '"') inString = true;
                else if (ch === '{') depth++;
                else if (ch === '}' && --depth === 0) {
                    try { return JSON.parse(source.slice(jsonStart, i + 1)); }
                    catch (ignored) { return null; }
                }
            }
        }
        return null;
    }

    function initPanelAnnotations(pageId, container, sourceDocument) {
        const info = annotationInfoFromDocument(sourceDocument);
        if (!info || !info.enabled) return;
        const root = container.querySelector('.page') || container;
        const state = {pageId, container, root, info, list: [], openId: null, form: null};
        panelAnnotations = state;

        if (!document.getElementById('panelnav-annotations-style')) {
            const style = document.createElement('style');
            style.id = 'panelnav-annotations-style';
            style.textContent = [
                '.panelnav-ann-error{color:#b91c1c;padding:.4em 0}'
            ].join('\n');
            document.head.appendChild(style);
        }

        const loaded = Array.isArray(info.annotations)
            ? Promise.resolve({annotations: info.annotations})
            : fetch(DOKU_BASE + 'lib/exe/ajax.php?call=annotations&action=load&id=' + encodeURIComponent(pageId))
                .then((res) => res.json());
        loaded.then((data) => {
            if (panelAnnotations !== state || !data || !Array.isArray(data.annotations)) return;
            state.list = data.annotations;
            renderPanelAnnotations(state);
        }).catch(() => {});

        // Run in capture phase and stop the original plugin's document
        // listener only for right-panel selections. Its regular left behavior
        // remains untouched.
        state.selectionHandler = (event) => {
            const target = event.target instanceof Element ? event.target : event.target.parentElement;
            if (target && target.closest('#panelnav-ann-tooltip, .panelnav-ann-ui')) {
                event.stopPropagation();
                return;
            }
            const selection = window.getSelection();
            if (!selection || selection.isCollapsed || !selection.rangeCount) return;
            const range = selection.getRangeAt(0);
            if (!root.contains(range.commonAncestorContainer)) return;
            event.stopPropagation();
            const existingTooltip = document.getElementById('ann-tooltip');
            if (existingTooltip) existingTooltip.remove();
            if (!info.user) return;
            const pendingAnchor = capturePanelAnchor(state, selection, range);
            const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
                ? range.startContainer
                : range.startContainer.parentElement;
            const insertionBlock = startElement && startElement.closest(
                'p,li,dd,dt,h1,h2,h3,h4,h5,h6,blockquote,pre,table,div'
            );
            state.pendingAnnotation = {anchor: pendingAnchor, insertionBlock};
            const rect = range.getBoundingClientRect();
            let tooltip = document.getElementById('panelnav-ann-tooltip');
            if (tooltip) tooltip.remove();
            tooltip = document.createElement('div');
            tooltip.id = 'panelnav-ann-tooltip';
            tooltip.className = 'ann-tooltip';
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'ann-btn ann-btn-primary';
            button.textContent = 'Annotate';
            button.addEventListener('mousedown', (e) => e.preventDefault());
            button.addEventListener('click', (event) => {
                event.preventDefault();
                event.stopPropagation();
                const pending = state.pendingAnnotation;
                tooltip.remove();
                if (pending && pending.anchor) {
                    showPanelAnnotationForm(state, pending.anchor, pending.insertionBlock);
                } else {
                    console.error('panelnav annotations: missing captured selection');
                }
            });
            tooltip.appendChild(button);
            document.body.appendChild(tooltip);
            tooltip.style.top = (rect.bottom + window.scrollY + 6) + 'px';
            tooltip.style.left = (rect.left + window.scrollX) + 'px';
        };
        document.addEventListener('mouseup', state.selectionHandler, true);
        state.repositionMarkers = () => repositionPanelGutterMarkers(state);
        window.addEventListener('scroll', state.repositionMarkers, {passive: true});
        window.addEventListener('resize', state.repositionMarkers, {passive: true});
        container.addEventListener('scroll', state.repositionMarkers, {passive: true});
        state.dismissHandler = (event) => {
            const target = event.target instanceof Element ? event.target : event.target.parentElement;
            if (target && target.closest('#panelnav-ann-tooltip')) return;
            const tooltip = document.getElementById('panelnav-ann-tooltip');
            if (tooltip) tooltip.remove();
        };
        document.addEventListener('mousedown', state.dismissHandler);
    }

    function destroyPanelAnnotations() {
        const state = panelAnnotations;
        if (!state) return;
        document.removeEventListener('mouseup', state.selectionHandler, true);
        document.removeEventListener('mousedown', state.dismissHandler);
        window.removeEventListener('scroll', state.repositionMarkers);
        window.removeEventListener('resize', state.repositionMarkers);
        state.container.removeEventListener('scroll', state.repositionMarkers);
        const tooltip = document.getElementById('panelnav-ann-tooltip');
        if (tooltip) tooltip.remove();
        document.querySelectorAll('.panelnav-ann-gutter-marker').forEach((marker) => marker.remove());
        const spans = state.root.querySelectorAll('.panelnav-ann-highlight');
        spans.forEach((span) => {
            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            span.remove();
            parent.normalize();
        });
        state.root.querySelectorAll('.panelnav-ann-ui').forEach((el) => el.remove());
        panelAnnotations = null;
    }

    function panelText(state) {
        const walker = document.createTreeWalker(state.root, NodeFilter.SHOW_TEXT, {
            acceptNode(node) {
                const parent = node.parentElement;
                if (!node.nodeValue || !parent || parent.closest(
                    'script,style,noscript,.panelnav-ann-ui,.panelnav-ann-highlight'
                )) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
            }
        });
        const chunks = [];
        let raw = '';
        while (walker.nextNode()) {
            const node = walker.currentNode;
            chunks.push({node, start: raw.length, text: node.nodeValue});
            raw += node.nodeValue;
        }
        let norm = '';
        const map = [];
        let whitespace = false;
        let whitespaceStart = 0;
        for (let i = 0; i < raw.length; i++) {
            if (/\s/.test(raw[i])) {
                if (!whitespace) whitespaceStart = i;
                whitespace = true;
            } else {
                if (whitespace && norm.length) {
                    norm += ' ';
                    map.push(whitespaceStart);
                }
                whitespace = false;
                norm += raw[i];
                map.push(i);
            }
        }
        return {chunks, norm, map};
    }

    function panelRange(snapshot, start, length) {
        const rawStart = snapshot.map[start];
        const rawEnd = snapshot.map[start + length - 1];
        if (rawStart === undefined || rawEnd === undefined) return null;
        function endpoint(offset, isEnd) {
            for (let i = 0; i < snapshot.chunks.length; i++) {
                const chunk = snapshot.chunks[i];
                const end = chunk.start + chunk.text.length;
                if (offset < end) {
                    return {node: chunk.node, offset: Math.max(0, Math.min(chunk.text.length, offset - chunk.start + (isEnd ? 1 : 0)))};
                }
            }
            const last = snapshot.chunks[snapshot.chunks.length - 1];
            return last ? {node: last.node, offset: last.text.length} : null;
        }
        const from = endpoint(rawStart, false);
        const to = endpoint(rawEnd, true);
        if (!from || !to) return null;
        const range = document.createRange();
        range.setStart(from.node, from.offset);
        range.setEnd(to.node, to.offset);
        return range;
    }

    function capturePanelAnchor(state, selection, range) {
        const exact = selection.toString().replace(/\s+/g, ' ').trim();
        if (!exact) return null;
        const snapshot = panelText(state);
        let rawStart = 0;
        const chunk = snapshot.chunks.find((item) => item.node === range.startContainer);
        if (chunk) rawStart = chunk.start + range.startOffset;
        let start = snapshot.map.findIndex((offset) => offset >= rawStart);
        if (start < 0) start = snapshot.norm.length;
        const context = Number.isFinite(state.info.contextLen) ? state.info.contextLen : 30;
        return {
            exact,
            prefix: snapshot.norm.slice(Math.max(0, start - context), start),
            suffix: snapshot.norm.slice(start + exact.length, start + exact.length + context),
            start
        };
    }

    function renderPanelAnnotations(state) {
        if (panelAnnotations !== state) return;
        document.querySelectorAll('.panelnav-ann-gutter-marker').forEach((marker) => marker.remove());
        state.root.querySelectorAll('.panelnav-ann-highlight').forEach((span) => {
            const parent = span.parentNode;
            if (!parent) return;
            while (span.firstChild) parent.insertBefore(span.firstChild, span);
            span.remove();
            parent.normalize();
        });
        const snapshot = panelText(state);
        const hits = [];
        state.list.forEach((ann) => {
            const exact = (ann.anchor && ann.anchor.exact || '').replace(/\s+/g, ' ').trim();
            let found = -1;
            let best = Infinity;
            for (let from = 0; exact && (found = snapshot.norm.indexOf(exact, from)) !== -1; from = found + 1) {
                const prefix = (ann.anchor.prefix || '').replace(/\s+/g, ' ').trim();
                const suffix = (ann.anchor.suffix || '').replace(/\s+/g, ' ').trim();
                const before = snapshot.norm.slice(Math.max(0, found - prefix.length), found);
                const after = snapshot.norm.slice(found + exact.length, found + exact.length + suffix.length);
                const score = (prefix && before.indexOf(prefix) >= 0 ? 0 : prefix ? 100000 : 0) +
                    (suffix && after.indexOf(suffix) >= 0 ? 0 : suffix ? 100000 : 0) +
                    Math.abs(found - Number(ann.anchor.start || 0));
                if (score < best) { best = score; ann._panelHit = found; }
            }
            if (ann._panelHit !== undefined) hits.push({ann, start: ann._panelHit, length: exact.length});
            delete ann._panelHit;
        });
        hits.sort((a, b) => b.start - a.start);
        hits.forEach(({ann, start, length}) => {
            const range = panelRange(snapshot, start, length);
            if (!range) return;
            const span = document.createElement('span');
            span.className = 'panelnav-ann-highlight ' + (ann.status === 'resolved' ? 'ann-highlight-resolved' : 'ann-highlight-open');
            span.dataset.panelnavAnnId = ann.id;
            span.title = ann.body || 'Annotation';
            span.addEventListener('click', (event) => {
                event.stopPropagation();
                showPanelAnnotationThread(state, ann.id);
            });
            try { range.surroundContents(span); }
            catch (e) {
                try { span.appendChild(range.extractContents()); range.insertNode(span); }
                catch (ignored) { return; }
            }
        });
        renderPanelGutterMarkers(state);
        if (state.openId) showPanelAnnotationThread(state, state.openId, true);
    }

    function renderPanelGutterMarkers(state) {
        const pageRect = state.root.getBoundingClientRect();
        const padLeft = parseInt(window.getComputedStyle(state.root).paddingLeft, 10) || 32;
        const left = pageRect.left + window.scrollX + Math.max(2, Math.floor(padLeft * 0.25));
        const svg = '<svg viewBox="0 0 16 16" fill="currentColor" width="10" height="10" aria-hidden="true"><rect x="1" y="1" width="14" height="10" rx="2"/><path d="M4 14 L4 11 L8 11 Z"/></svg>';
        state.root.querySelectorAll('.panelnav-ann-highlight').forEach((highlight) => {
            const rect = highlight.getBoundingClientRect();
            const marker = document.createElement('button');
            marker.type = 'button';
            marker.className = 'ann-gutter-marker panelnav-ann-gutter-marker';
            marker.dataset.annId = highlight.dataset.panelnavAnnId;
            marker.dataset.status = highlight.classList.contains('ann-highlight-resolved') ? 'resolved' : 'open';
            marker.setAttribute('aria-label', 'Annotation');
            marker.innerHTML = svg;
            marker.style.top = (rect.top + window.scrollY + 3) + 'px';
            marker.style.left = left + 'px';
            marker.addEventListener('click', (event) => {
                event.stopPropagation();
                showPanelAnnotationThread(state, marker.dataset.annId);
            });
            document.body.appendChild(marker);
        });
    }

    function repositionPanelGutterMarkers(state) {
        if (panelAnnotations !== state) return;
        const pageRect = state.root.getBoundingClientRect();
        const padLeft = parseInt(window.getComputedStyle(state.root).paddingLeft, 10) || 32;
        const left = pageRect.left + window.scrollX + Math.max(2, Math.floor(padLeft * 0.25));
        state.root.querySelectorAll('.panelnav-ann-highlight').forEach((highlight) => {
            const id = highlight.dataset.panelnavAnnId;
            const marker = Array.from(document.querySelectorAll('.panelnav-ann-gutter-marker')).find((item) => item.dataset.annId === id);
            if (!marker) return;
            marker.style.top = (highlight.getBoundingClientRect().top + window.scrollY + 3) + 'px';
            marker.style.left = left + 'px';
        });
    }

    function apiPanelAnnotation(state, payload) {
        payload.id = state.pageId;
        payload.sectok = state.info.token || '';
        return fetch(DOKU_BASE + 'lib/exe/ajax.php?call=annotations', {
            method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
        }).then((res) => res.json());
    }

    function refreshPanelAnnotations(state, keepOpenId) {
        const openId = keepOpenId || state.openId;
        return fetch(DOKU_BASE + 'lib/exe/ajax.php?call=annotations&action=load&id=' + encodeURIComponent(state.pageId))
            .then((res) => res.json()).then((data) => {
                if (panelAnnotations !== state || !Array.isArray(data.annotations)) return;
                state.list = data.annotations;
                state.openId = openId;
                renderPanelAnnotations(state);
            });
    }

    function showPanelAnnotationForm(state, anchor, insertionBlock) {
        state.root.querySelectorAll('.panelnav-ann-ui').forEach((el) => el.remove());
        const form = document.createElement('div');
        form.className = 'ann-new-form panelnav-ann-ui';
        const quote = document.createElement('blockquote');
        quote.className = 'ann-quote';
        quote.textContent = anchor.exact;
        const input = document.createElement('textarea');
        input.className = 'ann-body-input';
        input.rows = 3;
        input.placeholder = 'Write your annotation…';
        const row = document.createElement('div');
        row.className = 'ann-form-row';
        const save = document.createElement('button');
        save.className = 'ann-btn ann-btn-primary';
        save.type = 'button';
        save.textContent = 'Save';
        const cancel = document.createElement('button');
        cancel.className = 'ann-btn';
        cancel.type = 'button';
        cancel.textContent = 'Cancel';
        cancel.addEventListener('click', () => form.remove());
        save.addEventListener('click', () => {
            save.disabled = true;
            apiPanelAnnotation(state, {action: 'create', anchor, body: input.value}).then((data) => {
                if (!data.success) throw new Error(data.error || 'Could not save annotation.');
                form.remove();
                return refreshPanelAnnotations(state, data.annotation.id);
            }).catch((error) => {
                save.disabled = false;
                showPanelError(form, error.message);
            });
        });
        row.append(save, cancel);
        form.append(quote, input, row);
        if (insertionBlock && insertionBlock.parentNode) insertionBlock.parentNode.insertBefore(form, insertionBlock.nextSibling);
        else state.root.appendChild(form);
        input.focus();
    }

    function showPanelAnnotationThread(state, annId, forceOpen = false) {
        const ann = state.list.find((item) => item.id === annId);
        if (!ann) return;
        const existingPanel = state.root.querySelector('.panelnav-ann-ui.ann-panel');
        if (!forceOpen && state.openId === annId && existingPanel) {
            existingPanel.remove();
            state.openId = null;
            return;
        }
        state.root.querySelectorAll('.panelnav-ann-ui').forEach((el) => el.remove());
        state.openId = annId;
        const panel = document.createElement('div');
        panel.className = 'ann-panel panelnav-ann-ui';
        panel.dataset.annId = ann.id;
        panel.dataset.status = ann.status || 'open';
        const entry = document.createElement('div');
        entry.className = 'ann-thread-entry ann-annotation';
        const meta = document.createElement('div');
        meta.className = 'ann-meta';
        const avatar = document.createElement('span');
        avatar.className = 'ann-avatar';
        avatar.textContent = (ann.author || '?').slice(0, 2).toUpperCase();
        const author = document.createElement('span');
        author.className = 'ann-author';
        author.textContent = ann.author || 'Unknown';
        const time = document.createElement('time');
        time.className = 'ann-time';
        const created = new Date(Number(ann.created || 0) * 1000);
        if (!Number.isNaN(created.getTime())) {
            time.dateTime = created.toISOString();
            const seconds = (Date.now() - created.getTime()) / 1000;
            const lang = window.LANG && LANG.plugins && LANG.plugins.annotations || {};
            const localized = (key, fallback) => lang[key] || fallback;
            if (seconds < 60) time.textContent = localized('time_now', 'just now');
            else if (seconds < 3600) time.textContent = (localized('time_minutes', '%dm ago')).replace('%d', Math.floor(seconds / 60));
            else if (seconds < 86400) time.textContent = (localized('time_hours', '%dh ago')).replace('%d', Math.floor(seconds / 3600));
            else if (seconds < 604800) time.textContent = (localized('time_days', '%dd ago')).replace('%d', Math.floor(seconds / 86400));
            else time.textContent = created.toLocaleDateString();
        }
        const status = document.createElement('span');
        status.className = 'ann-status ' + (ann.status === 'resolved' ? 'ann-status-resolved' : 'ann-status-open');
        status.textContent = ann.status === 'resolved' ? 'Resolved' : 'Open';
        const close = document.createElement('button');
        close.className = 'ann-btn ann-close'; close.type = 'button'; close.textContent = '×';
        close.setAttribute('aria-label', 'Close');
        close.style.marginLeft = 'auto';
        close.addEventListener('click', () => { state.openId = null; panel.remove(); });
        meta.append(avatar, author, time, status, close);
        const body = document.createElement('div');
        body.className = 'ann-body';
        body.textContent = ann.body || '';
        entry.append(meta, body);
        if (ann.anchor && ann.anchor.exact) {
            const quote = document.createElement('blockquote');
            quote.className = 'ann-quote';
            quote.textContent = ann.anchor.exact;
            entry.appendChild(quote);
        }
        if (state.info.user) {
            const actions = document.createElement('div');
            actions.className = 'ann-actions';
            const resolve = document.createElement('button');
            resolve.type = 'button'; resolve.className = 'ann-btn ann-btn-primary';
            resolve.textContent = ann.status === 'resolved' ? 'Reopen' : 'Resolve';
            resolve.addEventListener('click', () => {
                apiPanelAnnotation(state, {action: 'resolve', annId, status: ann.status === 'resolved' ? 'open' : 'resolved'})
                    .then((data) => { if (!data.success) throw new Error(data.error || 'Could not update status.'); return refreshPanelAnnotations(state, annId); })
                    .catch((error) => showPanelError(panel, error.message));
            });
            actions.appendChild(resolve);
            if (state.info.user === ann.author || state.info.isAdmin) {
                const edit = document.createElement('button');
                edit.type = 'button'; edit.className = 'ann-btn'; edit.textContent = 'Edit';
                edit.addEventListener('click', () => {
                    body.hidden = true;
                    const editor = document.createElement('textarea');
                    editor.className = 'ann-body-input'; editor.rows = 3; editor.value = ann.body || '';
                    const save = document.createElement('button');
                    save.type = 'button'; save.className = 'ann-btn ann-btn-primary'; save.textContent = 'Save';
                    const cancel = document.createElement('button');
                    cancel.type = 'button'; cancel.className = 'ann-btn'; cancel.textContent = 'Cancel';
                    cancel.addEventListener('click', () => { editor.remove(); save.remove(); cancel.remove(); body.hidden = false; });
                    save.addEventListener('click', () => {
                        save.disabled = true;
                        apiPanelAnnotation(state, {action: 'edit_annotation', annId, body: editor.value})
                            .then((data) => { if (!data.success) throw new Error(data.error || 'Could not save changes.'); return refreshPanelAnnotations(state, annId); })
                            .catch((error) => { save.disabled = false; showPanelError(panel, error.message); });
                    });
                    body.after(editor, save, cancel);
                    editor.focus();
                });
                const remove = document.createElement('button');
                remove.type = 'button'; remove.className = 'ann-btn ann-btn-danger'; remove.textContent = 'Delete';
                remove.addEventListener('click', () => {
                    if (!window.confirm('Delete this annotation and its replies?')) return;
                    apiPanelAnnotation(state, {action: 'delete_annotation', annId})
                        .then((data) => {
                            if (!data.success) throw new Error(data.error || 'Could not delete annotation.');
                            state.openId = null;
                            panel.remove();
                            return refreshPanelAnnotations(state, null);
                        })
                        .catch((error) => showPanelError(panel, error.message));
                });
                actions.append(edit, remove);
            }
            if (actions.childNodes.length) entry.appendChild(actions);
        }
        panel.appendChild(entry);
        (ann.replies || []).forEach((reply) => {
            const item = document.createElement('div');
            item.className = 'ann-thread-entry ann-reply';
            const who = document.createElement('strong'); who.className = 'ann-author'; who.textContent = reply.author || 'Unknown';
            const text = document.createElement('div'); text.className = 'ann-body'; text.textContent = reply.body || '';
            item.append(who, text);
            if (state.info.user && (state.info.user === reply.author || state.info.isAdmin)) {
                const replyActions = document.createElement('div'); replyActions.className = 'ann-actions';
                const editReply = document.createElement('button');
                editReply.type = 'button'; editReply.className = 'ann-btn'; editReply.textContent = 'Edit';
                editReply.addEventListener('click', () => {
                    text.hidden = true;
                    const editor = document.createElement('textarea'); editor.className = 'ann-body-input'; editor.rows = 2; editor.value = reply.body || '';
                    const save = document.createElement('button'); save.type = 'button'; save.className = 'ann-btn ann-btn-primary'; save.textContent = 'Save';
                    const cancel = document.createElement('button'); cancel.type = 'button'; cancel.className = 'ann-btn'; cancel.textContent = 'Cancel';
                    cancel.addEventListener('click', () => { editor.remove(); save.remove(); cancel.remove(); text.hidden = false; });
                    save.addEventListener('click', () => {
                        save.disabled = true;
                        apiPanelAnnotation(state, {action: 'edit_reply', annId, replyId: reply.id, body: editor.value})
                            .then((data) => { if (!data.success) throw new Error(data.error || 'Could not save reply.'); return refreshPanelAnnotations(state, annId); })
                            .catch((error) => { save.disabled = false; showPanelError(panel, error.message); });
                    });
                    text.after(editor, save, cancel); editor.focus();
                });
                const deleteReply = document.createElement('button');
                deleteReply.type = 'button'; deleteReply.className = 'ann-btn ann-btn-danger'; deleteReply.textContent = 'Delete';
                deleteReply.addEventListener('click', () => {
                    if (!window.confirm('Delete this reply?')) return;
                    apiPanelAnnotation(state, {action: 'delete_reply', annId, replyId: reply.id})
                        .then((data) => { if (!data.success) throw new Error(data.error || 'Could not delete reply.'); return refreshPanelAnnotations(state, annId); })
                        .catch((error) => showPanelError(panel, error.message));
                });
                replyActions.append(editReply, deleteReply); item.appendChild(replyActions);
            }
            panel.appendChild(item);
        });
        if (state.info.user) {
            const form = document.createElement('div'); form.className = 'ann-reply-form';
            const input = document.createElement('textarea'); input.className = 'ann-body-input'; input.rows = 2; input.placeholder = 'Write a reply…';
            const send = document.createElement('button'); send.type = 'button'; send.className = 'ann-btn ann-btn-primary'; send.textContent = 'Reply';
            send.addEventListener('click', () => {
                send.disabled = true;
                apiPanelAnnotation(state, {action: 'reply', annId, body: input.value}).then((data) => {
                    if (!data.success) throw new Error(data.error || 'Could not save reply.');
                    return refreshPanelAnnotations(state, annId);
                }).catch((error) => { send.disabled = false; showPanelError(form, error.message); });
            });
            form.append(input, send); panel.appendChild(form);
        }
        const highlight = Array.from(state.root.querySelectorAll('[data-panelnav-ann-id]'))
            .find((item) => item.dataset.panelnavAnnId === annId);
        const block = highlight && highlight.closest('p,li,dd,dt,h1,h2,h3,h4,h5,h6,blockquote,pre,table,div');
        if (block && block.parentNode) block.parentNode.insertBefore(panel, block.nextSibling);
        else state.root.appendChild(panel);
    }

    function showPanelError(container, message) {
        let error = container.querySelector('.panelnav-ann-error');
        if (!error) { error = document.createElement('div'); error.className = 'panelnav-ann-error'; container.appendChild(error); }
        error.textContent = message;
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
            if (previousPageId) destroyPanelAnnotations();

            rightContent.innerHTML = contentEl
                ? contentEl.innerHTML
                : '<p>Could not load page.</p>';

            const loadedPageId = pageId || wikiIdFromUrl(url);
            if (loadedPageId) rightContent.dataset.pageId = loadedPageId;
            else delete rightContent.dataset.pageId;

            addPanelControls();
            if (loadedPageId) initPanelAnnotations(loadedPageId, rightContent, doc);
            executeScripts(rightContent);
            initPreviewForPanel(rightContent);

            initPrettyPhotoForPanel(rightContent);

            // If a global auto-render function exists (common with KaTeX's
            // auto-render extension), re-run it scoped to the new content.
            if (typeof window.renderMathInElement === 'function') {
                try {
                    window.renderMathInElement(rightContent, {delimiters: [
                        { left: '$$', right: '$$', display: true },
                        { left: '$', right: '$', display: false }
                    ],
                        throwOnError: false
                    }
                    );
                } catch (err) {
                    console.error('panelnav: renderMathInElement failed', err);
                }
            }

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
            destroyPanelAnnotations();
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
