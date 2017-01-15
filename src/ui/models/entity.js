
const shallowif = function(o, f) { const r = {}; return (() => {
    const result = [];
    for (let k in o) {
        const v = o[k];
        if (f(k,v)) {
            r[k] = v; result.push(r);
        }
    }
    return result;
})(); };

const lookup = {};

const domerge = (id, props) => lookup[id] = Object.assign((lookup[id] != null ? lookup[id] : {}), props);

const add = function(entity, opts) {
    if (opts == null) { opts = {silent:false}; }
    const {gaia_id, chat_id} = __guard__(entity, x => x.id) != null ? __guard__(entity, x => x.id) : {};
    if (!gaia_id && !chat_id) { return null; }

    // ensure there is at least something
    if (!lookup[chat_id]) { lookup[chat_id] = {}; }

    // dereference .properties to be on main obj
    if (entity.properties) {
        domerge(chat_id, entity.properties);
    }

    // merge rest of props
    const clone = shallowif(entity, k => !['id', 'properties'].includes(k));
    domerge(chat_id, clone);

    lookup[chat_id].id = chat_id;

    // handle different chat_id to gaia_id
    if (chat_id !== gaia_id) { lookup[gaia_id] = lookup[chat_id]; }

    if (!opts.silent) { updated('entity'); }

    // return the result
    return lookup[chat_id];
};


const needEntity = (function() {
    let tim = null;
    let gather = [];
    const fetch = function() {
        tim = null;
        action('getentity', gather);
        return gather = [];
    };
    return function(id, wait) {
        if (wait == null) { wait = 1000; }
        if (__guard__(lookup[id], x => x.fetching)) { return; }
        if (lookup[id]) {
            lookup[id].fetching = true;
        } else {
            lookup[id] = {
                id,
                fetching: true
            };
        }
        if (tim) { clearTimeout(tim); }
        tim = setTimeout(fetch, wait);
        return gather.push(id);
    };
})();

const list = () =>
    (() => {
        const result = [];
        for (let k in lookup) {
            const v = lookup[k];
            if (typeof v === 'object') {
                result.push(v);
            }
        }
        return result;
    })()
;



const funcs = {
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

    list,

    setPresence(id, p) {
        if (!lookup[id]) { return needEntity(id); }
        lookup[id].presence = p;
        return updated('entity');
    },

    isSelf(chat_id) { return !!lookup.self && (lookup[chat_id] === lookup.self); },

    _reset() {
        for (let k in lookup) { const v = lookup[k]; if (typeof v === 'object') { delete lookup[k]; } }
        updated('entity');
        return null;
    },

    _initFromSelfEntity(self) {
        updated('entity');
        return lookup.self = add(self);
    },

    _initFromEntities(entities) {
        let c = 0;
        const countIf = function(a) { if (a) { return c++; } };
        for (let entity of Array.from(entities)) { countIf(add(entity)); }
        updated('entity');
        return c;
    },

    add,
    needEntity
};

module.exports = Object.assign(lookup, funcs);

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}