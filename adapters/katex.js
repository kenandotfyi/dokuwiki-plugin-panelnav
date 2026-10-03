/* Right-panel adapter for KaTeX auto-render. */
(function () {
    window.PanelnavAdapters = window.PanelnavAdapters || {};
    window.PanelnavAdapters.katex = {
        init(container) {
            if (typeof window.renderMathInElement !== 'function') return;
            try {
                window.renderMathInElement(container, {
                    delimiters: [
                        {left: '$$', right: '$$', display: true},
                        {left: '$', right: '$', display: false}
                    ],
                    throwOnError: false
                });
            } catch (err) {
                console.error('panelnav: renderMathInElement failed', err);
            }
        }
    };
})();
