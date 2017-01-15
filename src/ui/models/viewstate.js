let exp, left, left1, left10, left11, left12, left2, left3, left4, left5, left6, left7, left8, left9;
const Client = require('hangupsjs');

const merge   = (t, ...os) => Array.from(os).map((o) => (() => {
    const result = [];
    for (let k in o) {
        const v = o[k];
        if (![null, undefined].includes(v)) {
            t[k] = v; result.push(t);
        }
    }
    return result;
})()) ;

const {throttle, later, tryparse} = require('../util');

const STATES = {
    STATE_STARTUP: 'startup',
    STATE_NORMAL: 'normal',
    STATE_ADD_CONVERSATION: 'add_conversation',
    STATE_ABOUT: 'about'
};

module.exports = exp = {
    state: null,
    attop: false,   // tells whether message list is scrolled to top
    atbottom: true, // tells whether message list is scrolled to bottom
    selectedConv: localStorage.selectedConv,
    lastActivity: null,
    leftSize: (left = tryparse(localStorage.leftSize)) != null ? left : 240,
    size: tryparse(localStorage.size != null ? localStorage.size : "[940, 600]"),
    pos: tryparse(localStorage.pos != null ? localStorage.pos : "[100, 100]"),
    showConvMin: (left1 = tryparse(localStorage.showConvMin)) != null ? left1 : false,
    showConvThumbs: (left2 = tryparse(localStorage.showConvThumbs)) != null ? left2 : true,
    showAnimatedThumbs: (left3 = tryparse(localStorage.showAnimatedThumbs)) != null ? left3 : true,
    showConvTime: (left4 = tryparse(localStorage.showConvTime)) != null ? left4 : true,
    showConvLast: (left5 = tryparse(localStorage.showConvLast)) != null ? left5 : true,
    showPopUpNotifications: (left6 = tryparse(localStorage.showPopUpNotifications)) != null ? left6 : true,
    showMessageInNotification: (left7 = tryparse(localStorage.showMessageInNotification)) != null ? left7 : true,
    showUsernameInNotification: (left8 = tryparse(localStorage.showUsernameInNotification)) != null ? left8 : true,
    convertEmoji: (left9 = tryparse(localStorage.convertEmoji)) != null ? left9 : true,
    colorScheme: localStorage.colorScheme || 'default',
    fontSize: localStorage.fontSize || 'medium',
    zoom: tryparse(localStorage.zoom != null ? localStorage.zoom : "1.0"),
    loggedin: false,
    escapeClearsInput: tryparse(localStorage.escapeClearsInput) || false,
    showtray: tryparse(localStorage.showtray) || false,
    hidedockicon: tryparse(localStorage.hidedockicon) || false,
    startminimizedtotray: tryparse(localStorage.startminimizedtotray) || false,
    closetotray: tryparse(localStorage.closetotray) || false,
    showDockOnce: true,
    showIconNotification: (left10 = tryparse(localStorage.showIconNotification)) != null ? left10 : true,
    muteSoundNotification: (left11 = tryparse(localStorage.muteSoundNotification)) != null ? left11 : false,
    forceCustomSound: (left12 = tryparse(localStorage.forceCustomSound)) != null ? left12 : false,
    language: localStorage.language != null ? localStorage.language : 'en',
    // non persistent!
    messageMemory: {},      // stores input when swithching conversations
    cachedInitialsCode: {}, // code used for colored initials, if no avatar
    // contacts are loaded
    loadedContacts: false,
    startupScreenVisible: true,

    setContacts(state) {
        if (state === this.loadedContacts) { return; }
        this.loadedContacts = state;
        return updated('viewstate');
    },

    setState(state) {
        if (this.state === state) { return; }
        this.state = state;
        if (state === STATES.STATE_STARTUP) {
            // set a first active timestamp to avoid requesting
            // syncallnewevents on startup
            require('./connection').setLastActive(Date.now(), true);
        }
        return updated('viewstate');
    },

    setLanguage(language) {
        if (this.language === language) { return; }
        i18n.locale = language;
        i18n.setLocale(language);
        this.language = localStorage.language = language;
        return updated('language');
    },

    switchInput(next_conversation_id) {
        // if conversation is changing, save input
        const el = document.getElementById('message-input');
        if (el == null) {
            console.log('Warning: could not retrieve message input to store.');
            return;
        }
        // save current input
        this.messageMemory[this.selectedConv] = el.value;
        // either reset or fetch previous input of the new conv
        if (this.messageMemory[next_conversation_id] != null) {
            el.value = this.messageMemory[next_conversation_id];
            // once old conversation is retrieved memory is wiped
            return this.messageMemory[next_conversation_id] = "";
        } else {
            return el.value = '';
        }
    },
        //

    setSelectedConv(c) {
        let left13;
        const conv = require('./conv'); // circular
        let conv_id = (left13 = __guard__(__guard__(c, x1 => x1.conversation_id), x => x.id) != null ? __guard__(__guard__(c, x1 => x1.conversation_id), x => x.id) : __guard__(c, x2 => x2.id)) != null ? left13 : c;
        if (!conv_id) {
            conv_id = __guard__(__guard__(__guard__(conv.list(), x5 => x5[0]), x4 => x4.conversation_id), x3 => x3.id);
        }
        if (this.selectedConv === conv_id) { return; }
        this.switchInput(conv_id);
        this.selectedConv = localStorage.selectedConv = conv_id;
        this.setLastKeyDown(0);
        updated('viewstate');
        return updated('switchConv');
    },

    selectNextConv(offset) {
        if (offset == null) { offset = 1; }
        const conv = require('./conv');
        const id = this.selectedConv;
        let c = conv[id];
        const list = (Array.from(conv.list()).filter((i) => !conv.isPureHangout(i)).map((i) => i));
        return (() => {
            const result = [];
            for (let index = 0; index < list.length; index++) {
                c = list[index];
                let item;
                if (id === c.conversation_id.id) {
                    const candidate = index + offset;
                    if (list[candidate]) { item = this.setSelectedConv(list[candidate]); }
                }
                result.push(item);
            }
            return result;
        })();
    },

    selectConvIndex(index) {
        if (index == null) { index = 0; }
        const conv = require('./conv');
        const list = (Array.from(conv.list()).filter((i) => !conv.isPureHangout(i)).map((i) => i));
        return this.setSelectedConv(list[index]);
    },

    updateAtTop(attop) {
        if (this.attop === attop) { return; }
        this.attop = attop;
        return updated('viewstate');
    },

    updateAtBottom(atbottom) {
        if (this.atbottom === atbottom) { return; }
        this.atbottom = atbottom;
        return this.updateActivity(Date.now());
    },

    updateActivity(time) {
        const conv = require('./conv'); // circular
        this.lastActivity = time;
        later(() => action('lastActivity'));
        if (!document.hasFocus() || !this.atbottom || (this.state !== STATES.STATE_NORMAL)) { return; }
        const c = conv[this.selectedConv];
        if (!c) { return; }
        const ur = conv.unread(c);
        if (ur > 0) {
            return later(() => action('updatewatermark'));
        }
    },

    setSize(size) {
        localStorage.size = JSON.stringify(size);
        return this.size = size;
    },
        // updated 'viewstate'

    setPosition(pos) {
        localStorage.pos = JSON.stringify(pos);
        return this.pos = pos;
    },
        // updated 'viewstate'

    setLeftSize(size) {
        if ((this.leftSize === size) || (size < 180)) { return; }
        this.leftSize = localStorage.leftSize = size;
        return updated('viewstate');
    },

    setZoom(zoom) {
        this.zoom = localStorage.zoom = document.body.style.zoom = zoom;
        return document.body.style.setProperty('--zoom', zoom);
    },

    setLoggedin(val) {
        this.loggedin = val;
        return updated('viewstate');
    },

    setShowSeenStatus(val) {
        this.showseenstatus = localStorage.showseenstatus = !!val;
        return updated('viewstate');
    },

    setLastKeyDown: (function() {
        let update;
        const {TYPING, PAUSED, STOPPED} = Client.TypingStatus;
        let lastEmitted = 0;
        let timeout = 0;
        return update = throttle(500, function(time) {
            if (timeout) { clearTimeout(timeout); }
            timeout = null;
            if (!time) {
                return lastEmitted = 0;
            } else {
                if ((time - lastEmitted) > 5000) {
                    later(() => action('settyping', TYPING));
                    lastEmitted = time;
                }
                return timeout = setTimeout(function() {
                    // after 6 secods of no keyboard, we consider the
                    // user took a break.
                    lastEmitted = 0;
                    action('settyping', PAUSED);
                    return timeout = setTimeout(() =>
                        // and after another 6 seconds (12 total), we
                        // consider the typing stopped altogether.
                        action('settyping', STOPPED)
                    
                    , 6000);
                }
                , 6000);
            }
        });
    })(),

    setShowConvMin(doshow) {
        if (this.showConvMin === doshow) { return; }
        this.showConvMin = localStorage.showConvMin = doshow;
        if (doshow) {
            this.setShowConvThumbs(true);
        }
        return updated('viewstate');
    },

    setShowConvThumbs(doshow) {
        if (this.showConvThumbs === doshow) { return; }
        this.showConvThumbs = localStorage.showConvThumbs = doshow;
        if (!doshow) {
            this.setShowConvMin(false);
        }
        return updated('viewstate');
    },

    setShowAnimatedThumbs(doshow) {
        if (this.showAnimatedThumbs === doshow) { return; }
        this.showAnimatedThumbs = localStorage.showAnimatedThumbs = doshow;
        return updated('viewstate');
    },

    setShowConvTime(doshow) {
        if (this.showConvTime === doshow) { return; }
        this.showConvTime = localStorage.showConvTime = doshow;
        return updated('viewstate');
    },

    setShowConvLast(doshow) {
        if (this.showConvLast === doshow) { return; }
        this.showConvLast = localStorage.showConvLast = doshow;
        return updated('viewstate');
    },

    setShowPopUpNotifications(doshow) {
        if (this.showPopUpNotifications === doshow) { return; }
        this.showPopUpNotifications = localStorage.showPopUpNotifications = doshow;
        return updated('viewstate');
    },

    setShowMessageInNotification(doshow) {
        if (this.showMessageInNotification === doshow) { return; }
        this.showMessageInNotification = localStorage.showMessageInNotification = doshow;
        return updated('viewstate');
    },

    setShowUsernameInNotification(doshow) {
        if (this.showUsernameInNotification === doshow) { return; }
        this.showUsernameInNotification = localStorage.showUsernameInNotification = doshow;
        return updated('viewstate');
    },

    setForceCustomSound(doshow) {
        if (localStorage.forceCustomSound === doshow) { return; }
        this.forceCustomSound = localStorage.forceCustomSound = doshow;
        return updated('viewstate');
    },

    setShowIconNotification(doshow) {
        if (localStorage.showIconNotification === doshow) { return; }
        this.showIconNotification = localStorage.showIconNotification = doshow;
        return updated('viewstate');
    },

    setMuteSoundNotification(doshow) {
        if (localStorage.muteSoundNotification === doshow) { return; }
        this.muteSoundNotification = localStorage.muteSoundNotification = doshow;
        return updated('viewstate');
    },

    setConvertEmoji(doshow) {
        if (this.convertEmoji === doshow) { return; }
        this.convertEmoji = localStorage.convertEmoji = doshow;
        return updated('viewstate');
    },

    setColorScheme(colorscheme) {
        this.colorScheme = localStorage.colorScheme = colorscheme;
        while (document.querySelector('html').classList.length > 0) {
            document.querySelector('html').classList.remove(document.querySelector('html').classList.item(0));
        }
        return document.querySelector('html').classList.add(colorscheme);
    },

    setFontSize(fontsize) {
        this.fontSize = localStorage.fontSize = fontsize;
        while (document.querySelector('html').classList.length > 0) {
            document.querySelector('html').classList.remove(document.querySelector('html').classList.item(0));
        }
        document.querySelector('html').classList.add(localStorage.colorScheme);
        return document.querySelector('html').classList.add(fontsize);
    },

    setEscapeClearsInput(value) {
        this.escapeClearsInput = localStorage.escapeClearsInput = value;
        return updated('viewstate');
    },

    setShowTray(value) {
        this.showtray = localStorage.showtray = value;

        if (!this.showtray) {
            this.setCloseToTray(false);
            return this.setStartMinimizedToTray(false);
        } else {
            return updated('viewstate');
        }
    },

    setHideDockIcon(value) {
        this.hidedockicon = localStorage.hidedockicon = value;
        return updated('viewstate');
    },

    setStartMinimizedToTray(value) {
        this.startminimizedtotray = localStorage.startminimizedtotray = value;
        return updated('viewstate');
    },

    setShowDockIconOnce(value) {
        return this.showDockIconOnce = value;
    },


    setCloseToTray(value) {
        this.closetotray = localStorage.closetotray = !!value;
        return updated('viewstate');
    }
};

Object.assign(exp, STATES);

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}