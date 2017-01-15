const Client = require('hangupsjs');
const Q = require('q');
const {session} = require('electron');

// Current programmatic login workflow is described here
// https://github.com/tdryer/hangups/issues/260#issuecomment-246578670
const LOGIN_URL = "https://accounts.google.com/o/oauth2/programmatic_auth?hl=en&scope=https%3A%2F%2Fwww.google.com%2Faccounts%2FOAuthLogin+https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fuserinfo.email&client_id=936475272427.apps.googleusercontent.com&access_type=offline&delegated_client_id=183697946088-m3jnlsqshjhh5lbvg05k46q1k4qqtrgn.apps.googleusercontent.com&top_level_cookie=1";

// promise for one-time oauth token
module.exports = mainWindow => Q.Promise(function(rs) {

    let onDidFinishLoad;
    mainWindow.webContents.on('did-finish-load', onDidFinishLoad = function() {

        // the url that just finished loading
        const url = mainWindow.getURL();
        console.log('login: did-finish-load', url);

        if (url.indexOf('/o/oauth2/programmatic_auth') > 0) {
            console.log('login: programmatic auth');
            // get the cookie from browser session, it has to be there
            return session.defaultSession.cookies.get({}, function(err, values) {
                if (values == null) { values = []; }
                let oauth_code = false;
                for (let value of Array.from(values)) {
                    if (value.name === 'oauth_code') {
                        oauth_code = value.value;
                    }
                }
                if (oauth_code) { return rs(oauth_code); }
            });
        }
    }
    );

    // redirect to google oauth
    return mainWindow.loadURL(LOGIN_URL);
}) ;
