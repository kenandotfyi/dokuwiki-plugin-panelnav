<?php

use dokuwiki\Extension\ActionPlugin;
use dokuwiki\Extension\EventHandler;
use dokuwiki\Extension\Event;

/**
 * DokuWiki Plugin panelnav (Action Component)
 *
 * Loads assets for the two-panel navigation feature. The actual
 * left/right panel markup lives directly in the template's main.php
 * (each panel needs to reuse the template's own page-header/breadcrumbs/
 * page/footer/backlinks structure exactly, which isn't reachable through
 * a single content-wrapping event hook).
 *
 * @license GPL 2 http://www.gnu.org/licenses/gpl-2.0.html
 * @author Kenan Akinci <hey@kenan.fyi>
 */
class action_plugin_panelnav extends ActionPlugin
{
    /** @inheritDoc */
    public function register(EventHandler $controller)
    {
        $controller->register_hook('TPL_METAHEADER_OUTPUT', 'BEFORE', $this, 'addAssets');
    }

    public function addAssets(Event $event) {
        $adapters = ['preview', 'prettyphoto', 'annotations', 'katex'];

        foreach ($adapters as $adapter) {
            if (!$this->getConf('adapter_' . $adapter)) continue;
            $event->data['script'][] = [
                'type' => 'text/javascript',
                'charset' => 'utf-8',
                '_data' => '',
                // DOKU_PLUGIN is a filesystem path (e.g. /var/www/html/lib/plugins/),
                // not a URL. Build browser asset URLs from DOKU_BASE instead.
                'src' => DOKU_BASE . 'lib/plugins/panelnav/adapters/' . $adapter . '.js'
            ];
        }

        $event->data['script'][] = [
            'type' => 'text/javascript',
            'charset' => 'utf-8',
            '_data'   => '',
            'src'  => DOKU_BASE . 'lib/plugins/panelnav/script.js'
        ];
        $event->data['link'][] = [
            'rel' => 'stylesheet',
            'type' => 'text/css',
            'href' => DOKU_BASE . 'lib/plugins/panelnav/style.css'
        ];
    }
}
