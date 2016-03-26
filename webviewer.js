'use strict';
const Gio = imports.gi.Gio;
const Gtk = imports.gi.Gtk;
const Lang = imports.lang;
const WebKit = imports.gi.WebKit2;

function getCurrentDir() {
    let stack = (new Error()).stack;
    let stackLine = stack.split('\n')[1];
    if (!stackLine)
        throw new Error("Could not find current file.");
    let match = new RegExp('@(.+):\\d+').exec(stackLine);
    if (!match)
        throw new Error("Could not find current file.");
    let path = match[1];
    let file = Gio.File.new_for_path(path);
    return file.get_parent();
}
imports.searchPath.unshift(getCurrentDir().get_path());
const Filewatcher = imports.filewatcher;

function getSettings() {
    let dir = getCurrentDir();
    let schema = 'org.gnome.shell.extensions.syncthing';
    const GioSSS = Gio.SettingsSchemaSource;
    let schemaDir = dir.get_child('schemas');
    let schemaSource = GioSSS.new_from_directory(schemaDir.get_path(),
                                                 GioSSS.get_default(),
                                                 false);
    let schemaObj = schemaSource.lookup(schema, true);
    if (!schemaObj)
        throw new Error("Schema " + schema + " could not be found.");
    return new Gio.Settings({ settings_schema: schemaObj });
}
const Settings = getSettings();

const SyncthingWindow = new Lang.Class({
    Name: 'SyncthingWindow',
    Extends: Gtk.ApplicationWindow,

    _init: function(application) {
        this.parent({ application: application });
        this.set_icon_from_file('icons/syncthing-logo.svg');
        this.set_default_size(1300,800);
        this.set_wmclass ("Syncthing", "Syncthing");
        this.title = "Syncthing";

        this._webView = new WebKit.WebView();
        this._webView.connect('context-menu', Lang.bind(this, this._onContextMenu));
        this._webView.connect('decide-policy', Lang.bind(this, this._onDecidePolicy));
        this.add(this._webView);
        this._webView.show();
    },

    loadURI: function(uri) {
        this._webView.load_uri(uri);
    },

    vfunc_delete_event: function(event) {
        this.hide();
        return true;
    },

    _onContextMenu: function(web_view, context_menu, event, hit_test_result) {
        return true;
    },

    _onDecidePolicy: function(web_view, decision, decision_type) {
        if (decision_type == WebKit.PolicyDecisionType.NEW_WINDOW_ACTION) {
            let uri = decision.request.uri;
            let launchContext = this.get_screen().get_display().get_app_launch_context();
            try {
                Gio.AppInfo.launch_default_for_uri(uri, launchContext);
            } catch(e) {
                log("Failed to launch URI \"%s\": ".format(uri) + e.message);
            }
            decision.ignore();
            return true;
        } else {
            // decision_type == WebKit.PolicyDecisionType.NAVIGATION_ACTION
            // || decision_type == WebKit.PolicyDecisionType.RESPONSE
            decision.use();
            // Continue with default handler.
            return false;
        }
    },
});

const SyncthingViewer = new Lang.Class({
    Name: 'SyncthingViewer',
    Extends: Gtk.Application,

    _init: function() {
        this.parent({ application_id: 'net.syncthing.gtk.webview' });
    },


    _onCommandLine: function(application, command_line) {
        return 0;
    },

    vfunc_activate: function() {
        this._window.present();
    },

    vfunc_startup: function() {
        this.parent();
        this._window = new SyncthingWindow(this);
        Settings.connect('changed', Lang.bind(this, this._onSettingsChanged));
        this._onSettingsChanged();
    },

    _onSettingsChanged: function(settings, key) {
        if (Settings.get_boolean('autoconfig')) {
            if (! this._configFileWatcher) {
                this._configFileWatcher = new Filewatcher.ConfigFileWatcher(Lang.bind(this, this._onAutoURIChanged));
            }
        } else {
            if (this._configFileWatcher) {
                this._configFileWatcher.destroy();
                this._configFileWatcher = null;
            }
            let uri = Settings.get_string('configuration-uri');
            this._changeURI(uri);
        }
    },

    _onAutoURIChanged: function(uri) {
        uri = uri || Settings.get_default_value('configuration-uri').unpack();
        this._changeURI(uri);
    },

    _changeURI: function(uri) {
        if (uri == this.baseURI)
            return;
        this.baseURI = uri;
        this._window.loadURI(uri);
    },
});


let app = new SyncthingViewer();
app.run(ARGV);