
const totallyunique = (...as) => String(Date.now()) + (Math.random() * 1000000);

// fn is expected to return a promised that finishes
// when fn is finished.
//
// retry is whether we retry failures of fn
//
// dedupe is a function that mashes the arguments to fn
// into a dedupe value.
module.exports = function(fn, retry, dedupe) {

    if (dedupe == null) { dedupe = totallyunique; }
    const queue = [];      // the queue of args to exec
    const deduped = [];    // the dedupe(args) for deduping
    let execing = false; // flag indicating whether execNext is running

    // will perpetually exec next until queue is empty
    var execNext = function() {
        if (!queue.length) {
            execing = false;
            return;
        }
        execing = true;
        const args = queue[0]; // next args to try
        return fn(...args).then(function() {
            // it finished, drop args
            queue.shift(); return deduped.shift();
        })
        .fail(function(err) {
            // it failed.
            // no retry? then just drop args
            if (!retry) { return (queue.shift(), deduped.shift()); }
        })
        .then(() => execNext());
    };

    return function(...as) {
        let i;
        const d = dedupe(...as);
        if ((i = deduped.indexOf(d)) >= 0) {
            // replace entry, notice this can replace
            // a currently execing entry
            queue[i] = as;
        } else {
            // push a new entry
            queue.push(as);
            deduped.push(d);
        }
        if (!execing) { return execNext(); }
    };
};
