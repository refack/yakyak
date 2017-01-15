
let exp, left;
const {tryparse, later} = require('../util');

const STATE = {
    CONNECTING:     'connecting',     // exactly match corresponding event name
    CONNECTED:      'connected',      // exactly match corresponding event name
    CONNECT_FAILED: 'connect_failed' // exactly match corresponding event name
};

const EVENT_STATE = {
    IN_SYNC:         'in_sync',       // when we certain we have connection/events
    MISSING_SOME:    'missing_some',  // when more than 40 secs without any event
    MISSING_ALL:     'missing_all'   // when more than 10 minutes without any event
};

const TIME_SOME = 40 * 1000;      // 40 secs
const TIME_ALL  = 10 * 60 * 1000; // 10 mins

const info = {
    connecting:     'Connecting…',
    connected:      'Connected',
    connect_failed: 'Not connected',
    unknown:        'Unknown'
};

module.exports = exp = {
    state: null,       // current connection state
    eventState: null,  // current event state
    lastActive: (left = tryparse(localStorage.lastActive)) != null ? left : 0, // last activity timestamp
    wasConnected: false,

    setState(state) {
        if (this.state === state) { return; }
        this.state = state;
        if (this.wasConnected && (state === STATE.CONNECTED)) {
            later(() => action('syncrecentconversations'));
        }
        this.wasConnected = this.wasConnected || (state === STATE.CONNECTED);
        return updated('connection');
    },

    setWindowOnline(wonline) {
        if (this.wonline === wonline) { return; }
        this.wonline = wonline;
        if (!this.wonline) {
            return this.setState(STATE.CONNECT_FAILED);
        }
    },

    infoText() { return info[this.state] != null ? info[this.state] : info.unknown; },

    setLastActive(active) {
        if (this.lastActive === active) { return; }
        return this.lastActive = localStorage.lastActive = active;
    },

    setEventState(state) {
        if (this.eventState === state) { return; }
        this.eventState = state;
        if (state === EVENT_STATE.IN_SYNC) {
            if (!this.lastActive) { this.setLastActive(Date.now()); }
        } else if (state === EVENT_STATE.MISSING_SOME) {
            // if we have a gap of more than 40 seconds we try getting
            // any events we may have missed during that gap. notice
            // that we get 'noop' every 20-30 seconds, so there is no
            // reason for a gap of 40 seconds.
            later(function() { return action('syncallnewevents', this.lastActive); });
        } else if (state === EVENT_STATE.MISSING_ALL) {
            // if we have a gap of more than 10 minutes, we will
            // reinitialize all convs using syncrecentconversations
            // (sort of like client startup)
            later(() => action('syncrecentconversations'));
        }
        later(() => checkEventState());
        return updated('connection');
    }
};

Object.assign(exp, STATE);
Object.assign(exp, EVENT_STATE);

let checkTimer = null;
var checkEventState = function() {
    const elapsed = Date.now() - exp.lastActive;
    if (checkTimer) { clearTimeout(checkTimer); }
    if (elapsed >= TIME_ALL) {
        wrapAction(() => exp.setEventState(EVENT_STATE.MISSING_ALL));
    } else if (elapsed >= TIME_SOME) {
        wrapAction(() => exp.setEventState(EVENT_STATE.MISSING_SOME));
    } else {
        wrapAction(() => exp.setEventState(EVENT_STATE.IN_SYNC));
    }
    return checkTimer = setTimeout(checkEventState, 1000);
};

var wrapAction = function(f) {
    handle('connwrap', () => f());
    return action('connwrap');
};
