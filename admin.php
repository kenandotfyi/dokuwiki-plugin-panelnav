<?php

use dokuwiki\Extension\AdminPlugin;
use dokuwiki\plugin\config\core\Configuration;

/** Panelnav integration switches and compatibility status. */
class admin_plugin_panelnav extends AdminPlugin
{
    /** @var array<string,string> setting name => dependency plugin name */
    private $adapters = [
        'adapter_preview' => 'preview',
        'adapter_prettyphoto' => 'prettyphoto',
        'adapter_annotations' => 'annotations',
        'adapter_katex' => 'katex',
    ];

    public function forAdminOnly()
    {
        return true;
    }

    public function getMenuSort()
    {
        return 160;
    }

    public function getMenuIcon()
    {
        return __DIR__ . '/admin.svg';
    }

    public function getMenuText($language)
    {
        return $this->getLang('menu');
    }

    public function handle()
    {
        global $INPUT, $ID;
        if (!$INPUT->post->bool('panelnav_save')) return;
        if (!checkSecurityToken()) return;

        if (!class_exists(Configuration::class)) {
            msg($this->getLang('config_unavailable'), -1);
            return;
        }

        try {
            $configuration = new Configuration();
            if ($configuration->isLocked()) {
                msg($this->getLang('config_locked'), -1);
                return;
            }

            $settings = $configuration->getSettings();
            $changed = false;
            $widthKey = 'plugin____panelnav____panel_width';
            if (isset($settings[$widthKey]) && !$settings[$widthKey]->isProtected()) {
                $widthInput = trim($INPUT->post->str('panel_width'));
                if (!is_numeric($widthInput) || (float)$widthInput < 25 || (float)$widthInput > 100) {
                    msg($this->getLang('invalid_width'), -1);
                    return;
                }
                $changed = $settings[$widthKey]->update((float)$widthInput) || $changed;
            }

            foreach ($this->adapters as $name => $_plugin) {
                $key = 'plugin____panelnav____' . $name;
                if (!isset($settings[$key]) || $settings[$key]->isProtected()) continue;
                $value = $INPUT->post->bool($name) ? 1 : 0;
                $changed = $settings[$key]->update($value) || $changed;
            }

            if ($changed) {
                $configuration->save();
                msg($this->getLang('saved'), 1);
            } else {
                msg($this->getLang('unchanged'), 1);
            }
            send_redirect(wl($ID, ['do' => 'admin', 'page' => 'panelnav'], true, '&'));
        } catch (Exception $exception) {
            msg($this->getLang('save_failed') . ' ' . hsc($exception->getMessage()), -1);
        }
    }

    public function html()
    {
        global $ID;
        $this->setupLocale();
        echo $this->locale_xhtml('intro');
        echo '<form action="' . hsc(script()) . '" method="post">';
        echo '<input type="hidden" name="id" value="' . hsc($ID) . '">';
        echo '<input type="hidden" name="do" value="admin">';
        echo '<input type="hidden" name="page" value="panelnav">';
        echo '<input type="hidden" name="panelnav_save" value="1">';
        formSecurityToken();
        echo '<table class="inline">';
        echo '<thead><tr><th>' . hsc($this->getLang('integration')) . '</th>';
        echo '<th>' . hsc($this->getLang('availability')) . '</th>';
        echo '<th>' . hsc($this->getLang('enabled')) . '</th></tr></thead><tbody>';

        foreach ($this->adapters as $setting => $plugin) {
            $installed = is_dir(DOKU_PLUGIN . $plugin);
            $enabled = $installed && !plugin_isdisabled($plugin);
            $configured = (bool)$this->getConf($setting);
            if (!$installed) {
                $status = $this->getLang('missing');
            } elseif (!$enabled) {
                $status = $this->getLang('disabled');
            } else {
                $status = $this->getLang('available');
            }

            echo '<tr><td>' . hsc($this->getLang($setting . '_label')) . '</td>';
            echo '<td>' . hsc($status) . '</td><td>';
            echo '<label><input type="checkbox" name="' . hsc($setting) . '" value="1"';
            if ($configured) echo ' checked="checked"';
            echo '> ' . hsc($this->getLang('enable')) . '</label>';
            echo '</td></tr>';
        }

        echo '</tbody></table>';
        echo '<h2>' . hsc($this->getLang('layout')) . '</h2>';
        echo '<table class="inline"><tbody><tr><th><label for="panelnav-panel-width">';
        echo hsc($this->getLang('panel_width_label')) . '</label></th><td>';
        echo '<input id="panelnav-panel-width" type="number" name="panel_width" min="25" max="100" step="0.5" value="';
        echo hsc($this->getConf('panel_width')) . '"> rem ';
        echo '<span>' . hsc($this->getLang('panel_width_help')) . '</span>';
        echo '</td></tr></tbody></table>';
        echo '<p><button class="button" type="submit">' . hsc($this->getLang('save')) . '</button></p>';
        echo '</form>';
        echo '<p>' . hsc($this->getLang('config_note')) . ' ';
        echo '<a href="' . hsc(wl($ID, ['do' => 'admin', 'page' => 'config'], true, '&')) . '">';
        echo hsc($this->getLang('config_link')) . '</a></p>';
    }
}
