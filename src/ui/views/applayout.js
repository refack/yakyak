
let exp;
const {throttle, topof} = require('../util');

const path = require('path');

const attached = false;
const attachListeners = function() {
    if (attached) { return; }
    window.addEventListener('mousemove', onActivity);
    window.addEventListener('click', onActivity);
    window.addEventListener('keydown', onActivity);
    return window.addEventListener('keydown', noInputKeydown);
};

var onActivity = throttle(100, ev =>
    // This occasionally happens to generate error when
    // user clicking has generated an application event
    // that is being handled while we also receive the event
    // Current fix: defer the action generated during the update
    setTimeout(() => action('activity', ev.timeStamp != null ? ev.timeStamp : Date.now())
    , 1)
);

var noInputKeydown = function(ev) {
    if (ev.target.tagName !== 'TEXTAREA') { return action('noinputkeydown', ev); }
};

const onScroll = throttle(20, function(ev) {
    const el = ev.target;
    const child = el.children[0];

    // calculation to see whether we are at the bottom with a tolerance value
    const atbottom = (el.scrollTop + el.offsetHeight) >= (child.offsetHeight - 10);
    action('atbottom', atbottom);

    // check whether we are at the top with a tolerance value
    const attop = el.scrollTop <= (el.offsetHeight / 2);
    return action('attop', attop);
});

const addClass = function(el, cl) {
    if (!el) { return; }
    if (RegExp(`\\s*${cl}`).exec(el.className)) { return; }
    el.className += el.className ? ` ${cl}` : cl;
    return el;
};

const removeClass = function(el, cl) {
    if (!el) { return; }
    el.className = el.className.replace(RegExp(`\\s*${cl}`), '');
    return el;
};

var closest = function(el, cl) {
    if (!el) { return; }
    if (!(cl instanceof RegExp)) { cl = RegExp(`\\s*${cl}`); }
    if (el.className.match(cl)) { return el; } else { return closest(el.parentNode, cl); }
};

const drag = (function() {

    let ondragenter;
    const ondragover = ondragenter = function(ev) {
        // this enables dragging at all
        ev.preventDefault();
        addClass(closest(ev.target, 'dragtarget'), 'dragover');
        removeClass(closest(ev.target, 'dragtarget'), 'drag-timeout');
        ev.dataTransfer.dropEffect = 'copy';
        return false;
    };

    const ondrop = function(ev) {
        ev.preventDefault();
        removeClass(closest(ev.target, 'dragtarget'), 'dragover');
        removeClass(closest(ev.target, 'dragtarget'), 'drag-timeout');
        return action('uploadimage', ev.dataTransfer.files);
    };

    const ondragleave = function(ev) {
        // it was firing the leave event while dragging, had to
        //  use a timeout to check if it was a "real" event
        //  by remaining out
        addClass(closest(ev.target, 'dragtarget'), 'drag-timeout');
        return setTimeout(function() {
            if (closest(ev.target, 'dragtarget').classList.contains('drag-timeout')) {
                removeClass(closest(ev.target, 'dragtarget'), 'dragover');
                return removeClass(closest(ev.target, 'dragtarget'), 'drag-timeout');
            }
        }
        , 200);
    };

    return {ondragover, ondragenter, ondrop, ondragleave};
})();


const resize = (function() {
    let rz = null;
    return {
        onmousemove(ev) {
            if (rz && (ev.buttons & 1)) {
                return rz(ev);
            } else {
                return rz = null;
            }
        },
        onmousedown(ev) {
            return rz = resizers[__guard__(ev.target.dataset, x => x.resize)];
        },
        onmouseup(ev) {
            return rz = null;
        }
    };
})();

var resizers =
    {leftResize(ev) { return action('leftresize', (Math.max(90, ev.clientX))); }};

module.exports = exp = layout(function() {
    const platform = process.platform === 'darwin' ? 'osx' : '';
    div({class:`applayout ${platform}`}, resize, region('last'), function() {
        div({class:'left'}, function() {
            div({class:'listhead'}, region('listhead'));
            div({class:'list'}, region('left'));
            return div({class:'lfoot'}, region('lfoot'));
        });
        div({class:'leftresize', 'data-resize':'leftResize'});
        return div({class:'right dragtarget '}, drag, function() {
            div({id: 'drop-overlay'}, () =>
                div({class: 'inner-overlay'}, () => div('Drop file here.'))
            );
            div({class:'convhead'}, region('convhead'));
            div({class:'main'}, region('main'), {onscroll: onScroll});
            div({class:'maininfo'}, region('maininfo'));
            return div({class:'foot'}, region('foot'));
        });
    });
    return attachListeners();
});


(function() {
    let ofs;
    let id = ofs = null;

    const lastVisibleMessage = function() {
        // the viewport
        const screl = document.querySelector('.main');
        // the pixel offset for the bottom of the viewport
        const bottom = screl.scrollTop + screl.offsetHeight;
        // all messages
        let last = null;
        for (let m of Array.from(document.querySelectorAll('.message'))) { if (topof(m) < bottom) { last = m; } }
        return last;
    };

    exp.recordMainPos = function() {
        const el = lastVisibleMessage();
        id = __guard__(el, x => x.id);
        if (!el || !id) { return; }
        return ofs = topof(el);
    };

    return exp.adjustMainPos = function() {
        if (!id || !ofs) { return; }
        const el = document.getElementById(id);
        const nofs = topof(el);
        // the size of the inserted elements
        const inserted = nofs - ofs;
        const screl = document.querySelector('.main');
        screl.scrollTop = screl.scrollTop + inserted;
        // reset
        return id = ofs = null;
    };
})();

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}