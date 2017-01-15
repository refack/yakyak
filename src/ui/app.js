const ipc       = require('electron').ipcRenderer;
const { clipboard } = require('electron');
const path = require('path');

const [drive, ...path_parts] = path.normalize(__dirname).split(path.sep);
global.YAKYAK_ROOT_DIR = [drive, ...path_parts.map(encodeURIComponent)].join('/');

// expose trifl in global scope
const trifl = require('trifl');
trifl.expose(window);

// in app notification system
window.notr = require('notr');
notr.defineStack('def', 'body', {top:'3px', right:'15px'});

// init trifl dispatcher
const dispatcher = require('./dispatcher');

const { remote } = require('electron');

window.onerror = function(msg, url, lineNo, columnNo, error) {
    const hash = {msg, url, lineNo, columnNo, error};
    return ipc.send('errorInWindow', hash);
};

// expose some selected tagg functions
trifl.tagg.expose(window, ...(`ul li div span a i b u s button p label \
input table thead tbody tr td th textarea br pass img h1 h2 h3 h4 \
hr em`.split(' '))
);

//
// Translation support
window.i18n = require('i18n');
// This had to be antecipated, as i18n requires viewstate
//  and applayout requires i18n
const {viewstate} = require('./models');

//
// Configuring supporting languages here
const i18nOpts = {
    directory: path.join(__dirname, '..', 'locales'),
    defaultLocale: 'en', // fallback
    objectNotation: true
};
//
i18n.configure(i18nOpts);
//
// force initialize
if (i18n.getLocales().includes(viewstate.language)) {
    i18n.setLocale(viewstate.language);
}
//
ipc.send('seti18n', i18nOpts, viewstate.language);

// Set locale if exists, otherwise, keep 'en'
action('changelanguage', viewstate.language);
// does not update viewstate -- why? because locale can be recovered later
//   not the best reasoning :)

const {applayout}       = require('./views');

const {conv} = require('./models');

// show tray icon as soon as browser window appers
const { trayicon } = require('./views/index');

const contextmenu = require('./views/contextmenu');
require('./views/menu')(viewstate);

// tie layout to DOM

// restore last position of window
const currentWindow = remote.getCurrentWindow();

currentWindow.setPosition(...viewstate.pos);

document.body.appendChild(applayout.el);

// intercept every event we listen to
// to make an 'alive' action to know
// the server is alive
(function() {
    const ipcon = ipc.on.bind(ipc);
    return ipc.on = (n, fn) =>
        ipcon(n, function(...as) {
            action('alive', Date.now());
            return fn(...as);
        })
    ;
})();

// called when window is ready to show
//  note: could not use event here, as it must be defined
//  before
ipc.on('ready-to-show', function() {
    // get window object
    const mainWindow = remote.getCurrentWindow();
    //
    // when yakyak becomes active, focus is automatically given
    //  to textarea
    mainWindow.on('focus', function() {
        if (viewstate.state === viewstate.STATE_NORMAL) {
            // focus on webContents
            mainWindow.webContents.focus();
            const el = window.document.getElementById('message-input');
            // focus on specific element
            return __guard__(el, x => x.focus());
        }
    });

    // hide menu bar in all platforms but darwin
    if (process.platform !== 'darwin') {
        mainWindow.setAutoHideMenuBar(true);
        mainWindow.setMenuBarVisibility(false);
    }
    // handle the visibility of the window
    if (viewstate.startminimizedtotray) {
        mainWindow.hide();
    } else if ((remote.getGlobal('windowHideWhileCred') == null) ||
             (remote.getGlobal('windowHideWhileCred') !== true)) {
        mainWindow.show();
    }

    //
    return window.addEventListener('unload', function(ev) {
        if ((process.platform === 'darwin') && (window != null)) {
            if (window.isFullScreen()) {
                window.setFullScreen(false);
            }
            if (!remote.getGlobal('forceClose')) {
                ev.preventDefault();
                __guard__(window, x => x.hide());
                return;
            }
        }

        var window = null;
        return action('quit');
    });
});

//
//
// Get information on exceptions in main process
//  - Exceptions that were caught
//  - Window crashes
ipc.on('expcetioninmain', function(error) {
    let msg;
    console.log((msg = "Possible fatal error on main process" +
        ", YakYak could stop working as expected."), error);
    return notr(msg, {stay: 0});});

// wire up stuff from server
ipc.on('init', (ev, data) => dispatcher.init(data));
// events from hangupsjs
require('./events').forEach(n => ipc.on(n, (ev, data) => action(n, data)));
// response from getentity
ipc.on('getentity:result', (ev, r, data) => action('addentities', r.entities, __guard__(data, x => x.add_to_conv)));

ipc.on('resize', (ev, dim) => action('resize', dim));

ipc.on('move', (ev, pos)  => action('move', pos));
ipc.on('searchentities:result', (ev, r) => action('setsearchedentities', r.entity));
ipc.on('createconversation:result', function(ev, c, name) {
    c.conversation_id = c.id; // fix conversation payload
    if (name) { c.name = name; }
    action('createconversationdone', c);
    return action('setstate', viewstate.STATE_NORMAL);
});
ipc.on('syncallnewevents:response', (ev, r) => action('handlesyncedevents', r));
ipc.on('syncrecentconversations:response', (ev, r) => action('handlerecentconversations', r));
ipc.on('getconversation:response', (ev, r) => action('handlehistory', r));
//
// gets metadata from conversation after setting focus
ipc.on('getconversationmetadata:response', (ev, r) => action('handleconversationmetadata', r));
ipc.on('uploadingimage', (ev, spec) => action('uploadingimage', spec));
ipc.on('querypresence:result', (ev, r) => action('setpresence', r));

// init dispatcher/controller
require('./dispatcher');
require('./views/controller');

// request init this is not happening when
// the server is just connecting, but for
// dev mode when we reload the page
action('reqinit');

//
//
// Listen to paste event and paste to message textarea
//
//  The only time when this event is not triggered, is when
//   the event is triggered from the message-area itself
//
document.addEventListener('paste', function(e) {
    if (!clipboard.readImage().isEmpty() && !clipboard.readText()) {
        action('onpasteimage');
        e.preventDefault();
    }
    // focus on web contents
    const mainWindow = remote.getCurrentWindow();
    mainWindow.webContents.focus();
    // focus on textarea
    const el = window.document.getElementById('message-input');
    return __guard__(el, x => x.focus());
});

// register event listeners for on/offline
window.addEventListener('online',  () => action('wonline', true));
window.addEventListener('offline', () => action('wonline', false));

//
//
// Catch unresponsive events
remote.getCurrentWindow().on('unresponsive', function(error) {
    let msg;
    notr(msg = "Warning: YakYak is becoming unresponsive.",
        { id: 'unresponsive'});
    console.log('Unresponsive event', msg);
    return ipc.send('errorInWindow', 'Unresponsive window');
});

//
//
// Show a message
remote.getCurrentWindow().on('responsive', () => notr("Back to normal again!", { id: 'unresponsive'}));

// Listen to close and quit events
window.addEventListener('beforeunload', function(e) {
    if (remote.getGlobal('forceClose')) {
        return;
    }

    const hide = (
        // Mac os and the dock have a special relationship
        ((process.platform === 'darwin') && !viewstate.hidedockicon) ||
        // Handle the close to tray action
        viewstate.closetotray
    );

    if (hide) {
        e.returnValue = false;
        remote.getCurrentWindow().hide();
    }
});

currentWindow.webContents.on('context-menu', function(e, params) {
    e.preventDefault();
    const canShow = [viewstate.STATE_NORMAL,
               viewstate.STATE_ADD_CONVERSATION].includes(viewstate.state);
    if (canShow) {
        return contextmenu(params, viewstate).popup(remote.getCurrentWindow());
    }
});

// tell the startup state
action('wonline', window.navigator.onLine);

if (process.platform === 'win32') {
    const script = document.createElement('script');
    script.src = 'http://twemoji.maxcdn.com/2/twemoji.min.js';
    document.head.appendChild(script);
}

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}