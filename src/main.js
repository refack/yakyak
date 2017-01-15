const Client    = require('hangupsjs');
const Q         = require('q');
const login     = require('./login');
const ipc       = require('electron').ipcMain;
const fs        = require('fs');
let path      = require('path');
const tmp       = require('tmp');
const { session }   = require('electron');


const [drive, ...path_parts] = path.normalize(__dirname).split(path.sep);
global.YAKYAK_ROOT_DIR = [drive, ...path_parts.map(encodeURIComponent)].join('/');

// test if flag debug is preset (other flags can be used via package args
//  but requres node v6)
const debug = process.argv.includes('--debug');

tmp.setGracefulCleanup();

const { app } = require('electron');
app.disableHardwareAcceleration();

const { BrowserWindow } = require('electron');

const userData = path.normalize(app.getPath('userData'));
if (!fs.existsSync(userData)) { fs.mkdirSync(userData); }

const paths = {
    rtokenpath: path.join(userData, 'refreshtoken.txt'),
    cookiespath: path.join(userData, 'cookies.json'),
    chromecookie: path.join(userData, 'Cookies'),
    configpath: path.join(userData, 'config.json')
};

const client = new Client({
    rtokenpath: paths.rtokenpath,
    cookiespath: paths.cookiespath
});


const plug = (rs, rj) => function(err, val) { if (err) { return rj(err); } else { return rs(val); } };

const logout = function() {
    const promise = client.logout();
    promise.then(function(res) {
      const { argv } = process;
      if (fs.existsSync(paths.chromecookie)) { fs.unlinkSync(paths.chromecookie); }
      const { spawn } = require('child_process');
      spawn(argv.shift(), argv, {
        cwd: process.cwd,
        env: process.env,
        stdio: 'inherit'
    }
      );
      return quit();
    });
    return promise; // like it matters
};

const seqreq = require('./seqreq');

let mainWindow = null;

// Only allow a single active instance
const shouldQuit = app.makeSingleInstance(function() {
    if (mainWindow) { mainWindow.show(); }
    return true;
});

if (shouldQuit) {
    app.quit();
    return;
}

global.i18nOpts = { opts: null, locale: null };

// No more minimizing to tray, just close it
global.forceClose = false;
var quit = function() {
    global.forceClose = true;
    // force all windows to close
    if (mainWindow != null) { mainWindow.destroy(); }
    app.quit();
};

app.on('before-quit', function() {
    global.forceClose = true;
    global.i18nOpts = null;
});

// For OSX show window main window if we've hidden it.
// https://github.com/electron/electron/blob/master/docs/api/app.md#event-activate-os-x
app.on('activate', () => mainWindow.show());

const loadAppWindow = function() {
    mainWindow.loadURL(`file://${YAKYAK_ROOT_DIR}/ui/index.html`);
    // Only show window when it has some content
    return mainWindow.once('ready-to-show', () => mainWindow.webContents.send('ready-to-show'));
};

const toggleWindowVisible = function() {
    if (mainWindow.isVisible()) { return mainWindow.hide(); } else { return mainWindow.show(); }
};

// helper wait promise
const wait = t => Q.Promise(rs => setTimeout(rs, t));

app.on('ready', function() {

    let syncrecent;
    const proxycheck = function() {
        const todo = [
           {url:'http://plus.google.com',  env:'HTTP_PROXY'},
           {url:'https://plus.google.com', env:'HTTPS_PROXY'}
        ];
        return Q.all(todo.map(t => Q.Promise(function(rs) {
            console.log(`resolving proxy ${t.url}`);
            return session.defaultSession.resolveProxy(t.url, function(proxyURL) {
                console.log(`resolved proxy ${proxyURL}`);
                // Format of proxyURL is either "DIRECT" or "PROXY 127.0.0.1:8888"
                const [_, purl] = proxyURL.split(' ');
                if (process.env[t.env] == null) { process.env[t.env] = purl ? `http://${purl}` : ""; }
                return rs();
            });
        })
         )
        );
    };

    // Create the browser window.
    mainWindow = new BrowserWindow({
        width: 730,
        height: 590,
        "min-width": 620,
        "min-height": 420,
        icon: path.join(__dirname, 'icons', 'icon@32.png'),
        show: false,
        titleBarStyle: process.platform === 'darwin' ? 'hidden-inset' : undefined
        // autoHideMenuBar : true unless process.platform is 'darwin'
    });

    // Launch fullscreen with DevTools open, usage: npm run debug
    if (debug) {
      mainWindow.webContents.openDevTools();
      mainWindow.maximize();
      mainWindow.show();
      try {
        require('devtron').install();
      } catch (error) {}
  }
          //do nothing

    // and load the index.html of the app. this may however be yanked
    // away if we must do auth.
    loadAppWindow();

    //
    //
    // Handle uncaught exceptions from the main process
    process.on('uncaughtException', function(msg) {
        ipcsend('expcetioninmain', msg);
        //
        return console.log(`Error on main process:\n${msg}\n` +
            "--- End of error message. More details:\n", msg);
    });

    //
    //
    // Handle crashes on the main window and show in console
    mainWindow.webContents.on('crashed', function(msg) {
        console.log('Crash event on main window!', msg);
        return ipc.send('expcetioninmain', {
            msg: 'Detected a crash event on the main window.',
            event: msg
        });});

    // short hand
    var ipcsend = (...as) => mainWindow.webContents.send(...as);

    // callback for credentials
    const creds = function() {
        console.log("asking for login credentials");
        const loginWindow = new BrowserWindow({
            width: 730,
            height: 590,
            "min-width": 620,
            "min-height": 420,
            icon: path.join(__dirname, 'icons', 'icon.png'),
            show: true,
            webPreferences: {
                nodeIntegration: false
            }
        });

        loginWindow.on('closed', quit);

        global.windowHideWhileCred = true;
        mainWindow.hide();
        loginWindow.focus();
        // reinstate app window when login finishes
        const prom = login(loginWindow)
        .then(function(rs) {
          global.forceClose = true;
          loginWindow.removeAllListeners('closed');
          loginWindow.close();
          mainWindow.show();
          return rs;
        });
        return {auth() { return prom; }};
    };

    // sends the init structures to the client
    const sendInit = function() {
        // we have no init data before the client has connected first
        // time.
        if (!__guard__(__guard__(client, x1 => x1.init), x => x.self_entity)) { return false; }
        ipcsend('init', {init: client.init});
        return true;
    };

    // keeps trying to connec the hangupsjs and communicates those
    // attempts to the client.
    const reconnect = function() {
      console.log('reconnecting', reconnectCount);
      return proxycheck().then(() =>
          client.connect(creds)
          .then(function() {
              console.log('connected', reconnectCount);
              // on first connect, send init, after that only resync
              if (reconnectCount === 0) {
                  sendInit();
              } else {
                  syncrecent();
              }
              return reconnectCount++;
          })
          .catch(e => console.log('error connecting', e))
      );
  };

    // counter for reconnects
    var reconnectCount = 0;

    // whether to connect is dictated by the client.
    ipc.on('hangupsConnect', function() {
        console.log('hconnect');
        return reconnect();
    });

    ipc.on('hangupsDisconnect', function() {
        console.log('hdisconnect');
        reconnectCount = 0;
        return client.disconnect();
    });

    // client deals with window sizing
    mainWindow.on('resize', ev => ipcsend('resize', mainWindow.getSize()));
    mainWindow.on('move',  ev => ipcsend('move', mainWindow.getPosition()));

    // whenever it fails, we try again
    client.on('connect_failed', function(e) {
        console.log('connect_failed', e);
        return wait(3000).then(() => reconnect());
    });

    // when client requests (re-)init since the first init
    // object is sent as soon as possible on startup
    ipc.on('reqinit', function() { if (sendInit()) { return syncrecent(); } });

    // sendchatmessage, executed sequentially and
    // retried if not sent successfully
    let messageQueue = Q();
    ipc.on('sendchatmessage', function(ev, msg) {
        const {conv_id, segs, client_generated_id, image_id, otr, message_action_type} = msg;
        const sendForSure = () => Q.promise(function(resolve, reject, notify) {
            const attempt = function() {
                // console.log 'sendchatmessage', client_generated_id
                const delivery_medium = null;
                return client.sendchatmessage(conv_id, segs, image_id, otr, client_generated_id, delivery_medium, message_action_type).then(function(r) {
                      // console.log 'sendchatmessage:result', r?.created_event?.self_event_state?.client_generated_id
                      ipcsend('sendchatmessage:result', r);
                      return resolve();
                });
            };
            return attempt();
        }) ;
        return messageQueue = messageQueue.then(() => sendForSure());
    });

    // get locale for translations
    ipc.on('seti18n', function(ev, opts, language){
        if (opts != null) {
            global.i18nOpts.opts = opts;
        }
        if (language != null) {
            return global.i18nOpts.locale = language;
        }
    });

    // sendchatmessage, executed sequentially and
    // retried if not sent successfully
    ipc.on('querypresence', seqreq((ev, id) =>
        client.querypresence(id).then(r => ipcsend('querypresence:result', r.presence_result[0])
        , false, () => 1)
    )
    );

    ipc.on('initpresence', (ev, l) =>
        (() => {
            const result = [];
            for (let i = 0; i < l.length; i++) {
                const p = l[i];
                if (p !== null) {
                    result.push(client.querypresence(p.id).then(r => ipcsend('querypresence:result', r.presence_result[0])
                    , false, () => 1));
                }
            }
            return result;
        })()
    );

    // no retry, only one outstanding call
    ipc.on('setpresence', seqreq(() => client.setpresence(true)
    , false, () => 1)
    );

    // no retry, only one outstanding call
    ipc.on('setactiveclient', seqreq((ev, active, secs) => client.setactiveclient(active, secs)
    , false, () => 1)
    );

    // watermarking is only interesting for the last of each conv_id
    // retry send and dedupe for each conv_id
    ipc.on('updatewatermark', seqreq((ev, conv_id, time) => client.updatewatermark(conv_id, time)
    , true, (ev, conv_id, time) => conv_id)
    );

    // getentity is not super important, the client will try again when encountering
    // entities without photo_url. so no retry, but do execute all such reqs
    // ipc.on 'getentity', seqreq (ev, ids) ->
    //     client.getentitybyid(ids).then (r) -> ipcsend 'getentity:result', r
    // , false

    // we want to upload. in the order specified, with retry
    ipc.on('uploadimage', seqreq(function(ev, spec) {
        let client_generated_id, conv_id;
        ({path, conv_id, client_generated_id} = spec);
        ipcsend('uploadingimage', {conv_id, client_generated_id, path});
        return client.uploadimage(path).then(image_id => client.sendchatmessage(conv_id, null, image_id, null, client_generated_id));
    }
    , true)
    );

    // we want to upload. in the order specified, with retry
    ipc.on('uploadclipboardimage', seqreq(function(ev, spec) {
        const {pngData, conv_id, client_generated_id} = spec;
        const file = tmp.fileSync({postfix: ".png"});
        ipcsend('uploadingimage', {conv_id, client_generated_id, path:file.name});
        return Q.Promise((rs, rj) => fs.writeFile(file.name, pngData, plug(rs, rj)))
        .then(() => client.uploadimage(file.name))
        .then(image_id => client.sendchatmessage(conv_id, null, image_id, null, client_generated_id))
        .then(() => file.removeCallback());
    }
    , true)
    );

    // retry only last per conv_id
    ipc.on('setconversationnotificationlevel', seqreq((ev, conv_id, level) => client.setconversationnotificationlevel(conv_id, level)
    , true, (ev, conv_id, level) => conv_id)
    );

    // retry
    ipc.on('deleteconversation', seqreq((ev, conv_id) => client.deleteconversation(conv_id)
    , true)
    );

    ipc.on('removeuser', seqreq((ev, conv_id) => client.removeuser(conv_id)
    , true)
    );

    // no retries, dedupe on conv_id
    ipc.on('setfocus', seqreq(function(ev, conv_id) {
        client.setfocus(conv_id);
        return client.getconversation(conv_id, new Date(), 1, true)
        .then(r => ipcsend('getconversationmetadata:response', r));
    }

    , false, (ev, conv_id) => conv_id)
    );

    ipc.on('appfocus', function() {
      app.focus();
      if (mainWindow.isVisible()) {
        return mainWindow.focus();
      } else {
        return mainWindow.show();
    }
    });

    // no retries, dedupe on conv_id
    ipc.on('settyping', seqreq((ev, conv_id, v) => client.settyping(conv_id, v)
    , false, (ev, conv_id) => conv_id)
    );

    ipc.on('updatebadge', function(ev, value) {
        if (app.dock) { return app.dock.setBadge(value); }
    });

    ipc.on('searchentities', function(ev, query, max_results) {
        const promise = client.searchentities(query, max_results);
        return promise.then(res => ipcsend('searchentities:result', res));
    });
    ipc.on('createconversation', function(ev, ids, name, forcegroup) {
        if (forcegroup == null) { forcegroup = false; }
        let promise = client.createconversation(ids, forcegroup);
        let conv = null;
        promise.then(function(res) {
            conv = res.conversation;
            const conv_id = conv.id.id;
            if (name) { return client.renameconversation(conv_id, name); }
        });
        return promise = promise.then(res => ipcsend('createconversation:result', conv, name));
    });
    ipc.on('adduser', (ev, conv_id, toadd) => client.adduser(conv_id, toadd)); // will automatically trigger membership_change
    ipc.on('renameconversation', (ev, conv_id, newname) => client.renameconversation(conv_id, newname)); // will trigger conversation_rename

    // no retries, just dedupe on the ids
    ipc.on('getentity', seqreq((ev, ids, data) =>
        client.getentitybyid(ids).then(r => ipcsend('getentity:result', r, data))
    
    , false, (ev, ids) => ids.sort().join(','))
    );

    // no retry, just one single request
    ipc.on('syncallnewevents', seqreq(function(ev, time) {
        console.log('syncallnew');
        return client.syncallnewevents(time).then(r => ipcsend('syncallnewevents:response', r));
    }
    , false, (ev, time) => 1)
    );

    // no retry, just one single request
    ipc.on('syncrecentconversations', syncrecent = seqreq(function(ev) {
        console.log('syncrecent');
        return client.syncrecentconversations().then(function(r) {
            ipcsend('syncrecentconversations:response', r);
            // this is because we use syncrecent on reqinit (dev-mode
            // refresh). if we succeeded getting a response, we call it
            // connected.
            return ipcsend('connected');
        });
    }
    , false, (ev, time) => 1)
    );

    // retry, one single per conv_id
    ipc.on('getconversation', seqreq((ev, conv_id, timestamp, max) =>
        client.getconversation(conv_id, timestamp, max, true).then(r => ipcsend('getconversation:response', r))
    
    , false, (ev, conv_id, timestamp, max) => conv_id)
    );

    ipc.on('togglefullscreen', () => mainWindow.setFullScreen(!mainWindow.isFullScreen()));

    // bye bye
    ipc.on('logout', logout);

    ipc.on('quit', quit);

    ipc.on('errorInWindow', function(ev, error, winName) {
        if (winName == null) { winName = 'YakYak'; }
        if (!global.isReadyToShow) { mainWindow.show(); }
        ipcsend('expcetioninmain', error);
        return console.log(`Error on ${winName} window:\n`, error, `\n--- End of error message in ${winName} window.`);
    });

    // propagate these events to the renderer
    return require('./ui/events').forEach(n =>
        client.on(n, e => ipcsend(n, e))
    );
});

    // Emitted when the window is about to close.
    // Hides the window if we're not force closing.
    //  IMPORTANT: moved to app.coffee

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}