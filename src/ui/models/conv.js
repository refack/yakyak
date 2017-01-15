const entity = require('./entity');     //
const viewstate = require('./viewstate');
let {nameof, nameofconv, getProxiedName, later, uniqfn, tryparse}  = require('../util');

const lookup = {};

const domerge = (id, props) => lookup[id] = Object.assign((lookup[id] != null ? lookup[id] : {}), props);

const add = function(conv) {
    // rejig the structure since it's insane
    let event;
    if (__guard__(__guard__(__guard__(conv, x2 => x2.conversation), x1 => x1.conversation_id), x => x.id)) {
        let conversation;
        ({conversation, event} = conv);
        conv = conversation;
        // remove observed events
        conv.event = (Array.from(event).filter((e) => !e.event_id.match(/observed_/)).map((e) => e));
    }

    const {id} = conv.conversation_id || conv.id;
    domerge(id, conv);
    // we mark conversations with few events to know that they definitely
    // got no more history.
    if (conv.event < 20) { conv.nomorehistory = true; }
    // participant_data contains entity information
    // we want in the entity lookup
    for (let p of Array.from(__guard__(conv, x3 => x3.participant_data) != null ? __guard__(conv, x3 => x3.participant_data) : [])) { entity.add(p); }
    return lookup[id];
};

const rename = function(conv, newname) {
    const {id} = conv.conversation_id;
    lookup[id].name = newname;
    return updated('conv');
};

const addChatMessage = function(msg) {
    const {id} = msg.conversation_id != null ? msg.conversation_id : {};
    if (!id) { return; }
    // ignore observed events
    if (__guard__(msg.event_id, x => x.match(/observed_/))) { return; }
    let conv = lookup[id];
    if (!conv) {
        // a chat message that belongs to no conversation. curious.
        // make something skeletal just to hold the new message
        conv = lookup[id] = {
            conversation_id: {id},
            event: [],
            self_conversation_state: {sort_timestamp:0
        }
        };
    }
    if (!conv.event) { conv.event = []; }
    // we can add message placeholder that needs replacing when
    // the real event drops in. if we find the same event id.
    let cpos = findClientGenerated(conv, __guard__(__guard__(msg, x2 => x2.self_event_state), x1 => x1.client_generated_id));
    if (!cpos) {
        cpos = findByEventId(conv, msg.event_id);
    }
    if (cpos) {
        // replace event by position
        conv.event[cpos] = msg;
    } else {
        // add last
        conv.event.push(msg);
    }
    // update the sort timestamp to list conv first
    __guard__(__guard__(conv, x4 => x4.self_conversation_state), x3 => x3.sort_timestamp = msg.timestamp != null ? msg.timestamp : (Date.now() * 1000));
    unreadTotal();
    updated('conv');
    return conv;
};

var findClientGenerated = function(conv, client_generated_id) {
    if (!client_generated_id) { return; }
    const iterable = conv.event != null ? conv.event : [];
    for (let i = 0; i < iterable.length; i++) {
        const e = iterable[i];
        if (__guard__(e.self_event_state, x => x.client_generated_id) === client_generated_id) { return i; }
    }
};

var findByEventId = function(conv, event_id) {
    if (!event_id) { return; }
    const iterable = conv.event != null ? conv.event : [];
    for (let i = 0; i < iterable.length; i++) {
        const e = iterable[i];
        if (e.event_id === event_id) { return i; }
    }
};

const findLastReadEventsByUser = function(conv) {
    const last_seen_events_by_user = {};
    for (let contact of Array.from(conv.read_state)) {
        const { chat_id } = contact.participant_id;
        const last_read = contact.last_read_timestamp != null ? contact.last_read_timestamp : contact.latest_read_timestamp;
        for (let e of Array.from(conv.event != null ? conv.event : [])) {
            if (e.timestamp <= last_read) {
                last_seen_events_by_user[chat_id] = e;
            }
        }
    }
    return last_seen_events_by_user;
};


// this is used when sending new messages, we add a placeholder with
// the correct client_generated_id. this entry will be replaced in
// addChatMessage when the real message arrives from the server.
const addChatMessagePlaceholder = function(chat_id, {conv_id, client_generated_id, segsj, ts, uploadimage, message_action_type}) {
    ts = ts * 1000; // goog form
    const ev = {
        chat_message: {
            annotation:message_action_type,
            message_content: {segment:segsj
        }
        },
        conversation_id: {id:conv_id
    },
        self_event_state: {client_generated_id
    },
        sender_id: {
            chat_id,
            gaia_id:chat_id
        },
        timestamp:ts,
        placeholder:true,
        uploadimage
    };
    // lets say this is also read to avoid any badges
    const sr = __guard__(__guard__(lookup[conv_id], x1 => x1.self_conversation_state), x => x.self_read_state);
    const islater = ts > __guard__(sr, x2 => x2.latest_read_timestamp);
    if (sr && islater) { sr.latest_read_timestamp = ts; }
    // this triggers the model update
    return addChatMessage(ev);
};

const addWatermark = function(ev) {
    let conv;
    const conv_id = __guard__(__guard__(ev, x1 => x1.conversation_id), x => x.id);
    if (!conv_id || !((conv = lookup[conv_id]))) { return; }
    if (!conv.read_state) { conv.read_state = []; }
    const {participant_id, latest_read_timestamp} = ev;
    conv.read_state.push({
        participant_id,
        latest_read_timestamp
    });
    // pack the read_state by keeping the last of each participant_id
    if (conv.read_state.length > 200) {
        const rev = conv.read_state.reverse();
        const uniq = uniqfn(rev, e => e.participant_id.chat_id);
        conv.read_state = uniq.reverse();
    }
    const sr = __guard__(__guard__(conv, x3 => x3.self_conversation_state), x2 => x2.self_read_state);
    const islater = latest_read_timestamp > __guard__(sr, x4 => x4.latest_read_timestamp);
    if (entity.isSelf(participant_id.chat_id) && sr && islater) {
        sr.latest_read_timestamp = latest_read_timestamp;
    }
    unreadTotal();
    return updated('conv');
};

uniqfn = function(as, fn) { const bs = as.map(fn); return as.filter((e, i) => bs.indexOf(bs[i]) === i); };

const sortby = conv => __guard__(__guard__(conv, x1 => x1.self_conversation_state), x => x.sort_timestamp) != null ? __guard__(__guard__(conv, x1 => x1.self_conversation_state), x => x.sort_timestamp) : 0;

// this number correlates to number of max events we get from
// hangouts on client startup.
const MAX_UNREAD = 20;

const unread = function(conv) {
    const t = __guard__(__guard__(__guard__(conv, x2 => x2.self_conversation_state), x1 => x1.self_read_state), x => x.latest_read_timestamp);
    if (typeof t !== 'number') { return 0; }
    let c = 0;
    for (let e of Array.from(__guard__(conv, x3 => x3.event) != null ? __guard__(conv, x3 => x3.event) : [])) {
        if (e.chat_message && (e.timestamp > t)) { c++; }
        if (c >= MAX_UNREAD) { return MAX_UNREAD; }
    }
    return c;
};

var unreadTotal = (function() {
    let current = 0;
    let orMore = false;
    return function() {
        const sum = (a, b) => a + b;
        orMore = false;
        const countunread = function(c) {
            if (isQuiet(c)) { return 0; }
            const count = funcs.unread(c);
            if (count === MAX_UNREAD) { orMore = true; }
            return count;
        };
        const newTotal = funcs.list(false).map(countunread).reduce(sum, 0);
        if (current !== newTotal) {
            current = newTotal;
            later(() => action('unreadtotal', newTotal, orMore));
        }
        return newTotal;
    };
})();

var isQuiet = c => __guard__(__guard__(c, x1 => x1.self_conversation_state), x => x.notification_level) === 'QUIET';

let starredconvs = tryparse(localStorage.starredconvs) || [];

const isStarred = c => Array.from(starredconvs).includes(__guard__(__guard__(c, x1 => x1.conversation_id), x => x.id));

const toggleStar = function(c) {
    const {id} = __guard__(c, x => x.conversation_id);
    if (!Array.from(starredconvs).includes(id)) {
        starredconvs.push(id);
    } else {
        starredconvs = (Array.from(starredconvs).filter((i) => i !== id).map((i) => i));
    }
    localStorage.starredconvs = JSON.stringify(starredconvs);
    return updated('conv');
};

const isEventType = type => ev => !!ev[type];

// a "hangout" is in google terms strictly an audio/video event
// many conversations in the conversation list are just such an
// event with no further chat messages or activity. this function
// tells whether a hangout only contains video/audio.
const isPureHangout = (function() {
    const nots = ['chat_message', 'conversation_rename'].map(isEventType);
    const isNotHangout = e => nots.some(f => f(e));
    return c => !(__guard__(c, x => x.event) != null ? __guard__(c, x => x.event) : []).some(isNotHangout);
})();

// the time of the last added event
const lastChanged = function(c) { let left;
return ((left = __guard__(__guard__(__guard__(c, x2 => x2.event), x1 => x1[(__guard__(__guard__(c, x4 => x4.event), x3 => x3.length) != null ? __guard__(__guard__(c, x4 => x4.event), x3 => x3.length) : 0) - 1]), x => x.timestamp)) != null ? left : 0) / 1000; };

// the number of history events to request
const HISTORY_AMOUNT = 20;

// add a typing entry
const addTyping = function(typing) {
    let c;
    const conv_id = __guard__(__guard__(typing, x1 => x1.conversation_id), x => x.id);
    // no typing entries for self
    if (entity.isSelf(typing.user_id.chat_id)) { return; }
    // and no entries in non-existing convs
    if (!(c = lookup[conv_id])) { return; }
    if (!c.typing) { c.typing = []; }
    // length at start
    const len = c.typing.length;
    // add new state to start of array
    c.typing.unshift(typing);
    // ensure there's only one entry in array per user
    c.typing = uniqfn(c.typing, t => t.user_id.chat_id);
    // and sort it in a stable way
    c.typing.sort((t1, t2) => t1.user_id.chat_id - t2.user_id.chat_id);
    // schedule a pruning
    later(() => action('pruneTyping', conv_id));
    // and mark as updated
    updated('conv');
    // indiciate we just started having typing entries
    if (len === 0) { return updated('startTyping'); }
};

// prune old typing entries
const pruneTyping = (function() {

    const findNext = function(arr) {
        let next;
        const expiry = arr.map(t => t.timestamp + keepFor(t));
        for (let i = 0; i < expiry.length; i++) { const t = expiry[i]; if (!next || (expiry[i] < expiry[next])) { next = i; } }
        return next;
    };

    const KEEP_STOPPED = 1500;  // time to keep STOPPED typing entries
    const KEEP_OTHERS  = 10000; // time to keep other typing entries before pruning

    var keepFor = function(t) { if (__guard__(t, x => x.status) === 'STOPPED') { return KEEP_STOPPED; } else { return KEEP_OTHERS; } };

    const prune = t => (Date.now() - (__guard__(t, x => x.timestamp) / 1000)) < keepFor(t);

    return function(conv_id) {
        let c, nextidx;
        if (!(c = lookup[conv_id])) { return; }
        // stop existing timer
        if (c.typingtimer) { c.typingtimer = clearTimeout(c.typingtimer); }
        // the length before prune
        const lengthBefore = c.typing.length;
        // filter out old stuff
        c.typing = c.typing.filter(prune);
        // maybe we changed something?
        if (c.typing.length !== lengthBefore) { updated('conv'); }
        // when is next expiring?
        if ((nextidx = findNext(c.typing)) < 0) { return; }
        // the next entry to expire
        const next = c.typing[nextidx];
        // how long we wait until doing another prune
        const waitUntil = (keepFor(next) + (next.timestamp / 1000)) - Date.now();
        if (waitUntil < 0) { return console.error('typing prune error', waitUntil); }
        // schedule next prune
        return c.typingtimer = setTimeout((() => action('pruneTyping', conv_id)), waitUntil);
    };
})();

var funcs = {
    count() {
        let c = 0; ((() => {
            const result = [];
            for (let k in lookup) {
                const v = lookup[k];
                if (typeof v === 'object') {
                    result.push(c++);
                }
            }
            return result;
        })()); return c;
    },

    _reset() {
        for (let k in lookup) { const v = lookup[k]; if (typeof v === 'object') { delete lookup[k]; } }
        updated('conv');
        return null;
    },

    _initFromConvStates(convs) {
        let c = 0;
        const countIf = function(a) { if (a) { return c++; } };
        for (let conv of Array.from(convs)) { countIf(add(conv)); }
        updated('conv');
        return c;
    },

    add,
    rename,
    addChatMessage,
    addChatMessagePlaceholder,
    addWatermark,
    MAX_UNREAD,
    unread,
    isQuiet,
    isStarred,
    toggleStar,
    isPureHangout,
    lastChanged,
    addTyping,
    pruneTyping,
    unreadTotal,
    findLastReadEventsByUser,

    setNotificationLevel(conv_id, level) {
        let c;
        if (!(c = lookup[conv_id])) { return; }
        __guard__(c.self_conversation_state, x => x.notification_level = level);
        return updated('conv');
    },

    deleteConv(conv_id) {
        let c;
        if (!(c = lookup[conv_id])) { return; }
        delete lookup[conv_id];
        viewstate.setSelectedConv(null);
        return updated('conv');
    },

    removeParticipants(conv_id, ids) {
        let c;
        if (!(c = lookup[conv_id])) { return; }
        const getId = p => p.id.chat_id || p.id.gaia_id;
        return c.participant_data = ((() => {
            const result = [];
            for (let p of Array.from(c.participant_data)) {                 if (!Array.from(ids).includes(getId(p))) {
                    result.push(p);
                }
            }
            return result;
        })());
    },

    addParticipant(conv_id, participant) {
        let c;
        if (!(c = lookup[conv_id])) { return; }
        return c.participant_data.push(participant);
    },

    replaceFromStates(states) {
        for (let st of Array.from(states)) { add(st); }
        return updated('conv');
    },

    updateAtTop(attop) {
        let c;
        if (viewstate.state !== viewstate.STATE_NORMAL) { return; }
        const conv_id = __guard__(viewstate, x => x.selectedConv);
        if (attop && (c = lookup[conv_id]) && !__guard__(c, x1 => x1.nomorehistory) && !__guard__(c, x2 => x2.requestinghistory)) {
            const timestamp = (__guard__(__guard__(c.event, x4 => x4[0]), x3 => x3.timestamp) != null ? __guard__(__guard__(c.event, x4 => x4[0]), x3 => x3.timestamp) : 0) / 1000;
            if (!timestamp) { return; }
            c.requestinghistory = true;
            later(() => action('history', conv_id, timestamp, HISTORY_AMOUNT));
            return updated('conv');
        }
    },

    updateMetadata(state, redraw) {
        let c;
        if (redraw == null) { redraw = true; }
        const conv_id = __guard__(__guard__(state, x1 => x1.conversation_id), x => x.id);
        if (!(c = lookup[conv_id])) { return; }

        c.read_state = __guard__(state.conversation, x2 => x2.read_state) != null ? __guard__(state.conversation, x2 => x2.read_state) : c.read_state;

        if (redraw) { return this.redraw_conversation(); }
    },

    redraw_conversation() {
        // first signal is to give views a change to record the
        // current view position before injecting new DOM
        updated('beforeHistory');
        // redraw
        updated('conv');
        // last signal is to move view to be at same place
        // as when we injected DOM.
        return updated('afterHistory');
    },

    updateHistory(state) {
        let c;
        const conv_id = __guard__(__guard__(state, x1 => x1.conversation_id), x => x.id);
        if (!(c = lookup[conv_id])) { return; }
        c.requestinghistory = false;
        const event = __guard__(state, x2 => x2.event);

        this.updateMetadata(state, false);

        c.event = (event != null ? event : []).concat((c.event != null ? c.event : []));
        if (__guard__(event, x3 => x3.length) === 0) { c.nomorehistory = true; }

        return this.redraw_conversation();
    },

    updatePlaceholderImage({conv_id, client_generated_id, path}) {
        let c;
        if (!(c = lookup[conv_id])) { return; }
        const cpos = findClientGenerated(c, client_generated_id);
        const ev = c.event[cpos];
        const seg = ev.chat_message.message_content.segment[0];
        seg.link_data = {link_target:path};
        return updated('conv');
    },

    list(sort) {
        if (sort == null) { sort = true; }
        let convs = ((() => {
            const result = [];
            for (let k in lookup) {
                const v = lookup[k];
                if (typeof v === 'object') {
                    result.push(v);
                }
            }
            return result;
        })());
        if (sort) {
            let c;
            const starred = ((() => {
                const result1 = [];
                for (c of Array.from(convs)) {                     if (isStarred(c)) {
                        result1.push(c);
                    }
                }
                return result1;
            })());
            convs = ((() => {
                const result2 = [];
                for (c of Array.from(convs)) {                     if (!isStarred(c)) {
                        result2.push(c);
                    }
                }
                return result2;
            })());
            starred.sort((e1, e2) => nameofconv(e1).localeCompare(nameofconv(e2)));
            convs.sort((e1, e2) => sortby(e2) - sortby(e1));
            return starred.concat(convs);
        }
        return convs;
    }
};



module.exports = Object.assign(lookup, funcs);

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}