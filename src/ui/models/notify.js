
let tonotify = [];

module.exports = {
    addToNotify(ev) { return tonotify.push(ev); },
    popToNotify() {
        if (!tonotify.length) { return []; }
        const t = tonotify;
        tonotify = [];
        return t;
    }
};
