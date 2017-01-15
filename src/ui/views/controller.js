const { remote } = require('electron');

const {applayout, convlist, listhead, messages, convhead, input, conninfo, convadd, controls,
notifications, typinginfo, menu, trayicon, dockicon, startup, about} = require('./index');

const models      = require('../models');
const {viewstate, connection} = models;

const {later} = require('../util');


handle('update:connection', (function() {
    let el = null;
    return function() {
        // draw view
        conninfo(connection);

        // place in layout
        if (connection.state === connection.CONNECTED) {
            __guardMethod__(el, 'hide', o => o.hide());
            return el = null;
        } else if (viewstate.state !== viewstate.STATE_STARTUP) {
            return el = notr({html:conninfo.el.innerHTML, stay:0, id:'conn'});
        } else {
            // update startup with connection information
            return redraw();
        }
    };
})()
);

const setLeftSize = function(left) {
    document.querySelector('.left').style.width = left + 'px';
    return document.querySelector('.leftresize').style.left = (left - 2) + 'px';
};

const setConvMin = function(convmin) {
    if (convmin) {
        document.querySelector('.left').classList.add("minimal");
        return document.querySelector('.leftresize').classList.add("minimal");
    } else {
        document.querySelector('.left').classList.remove("minimal");
        return document.querySelector('.leftresize').classList.remove("minimal");
    }
};


// remove startup from applayout after animations finishes
handle('remove_startup', function() {
    models.viewstate.startupScreenVisible = false;
    return redraw();
});

handle('update:viewstate', function() {
    setLeftSize(viewstate.leftSize);
    setConvMin(viewstate.showConvMin);
    if (viewstate.state === viewstate.STATE_STARTUP) {
        if (Array.isArray(viewstate.size)) {
            later(() => remote.getCurrentWindow().setSize(...viewstate.size));
        }
        if (Array.isArray(viewstate.pos)) {
            later(() => remote.getCurrentWindow().setPosition(...viewstate.pos));
        }

        // only render startup
        startup(models);

        applayout.left(null);
        applayout.convhead(null);
        applayout.main(null);
        applayout.maininfo(null);
        applayout.foot(null);
        applayout.last(startup);

        document.body.style.zoom = viewstate.zoom;
        return document.body.style.setProperty('--zoom', viewstate.zoom);
    } else if (viewstate.state === viewstate.STATE_NORMAL) {
        redraw();
        applayout.lfoot(controls);
        applayout.listhead(listhead);
        applayout.left(convlist);
        applayout.convhead(convhead);
        applayout.main(messages);
        applayout.maininfo(typinginfo);
        applayout.foot(input);

        if (viewstate.startupScreenVisible) {
            applayout.last(startup);
        } else {
            applayout.last(null);
        }

        menu(viewstate);
        dockicon(viewstate);
        return trayicon(models);

    } else if (viewstate.state === viewstate.STATE_ABOUT) {
        redraw();
        about(models);
        applayout.left(convlist);
        applayout.main(about);
        applayout.convhead(null);
        applayout.maininfo(null);
        return applayout.foot(null);
    } else if (viewstate.state === viewstate.STATE_ADD_CONVERSATION) {
        redraw();
        applayout.left(convlist);
        applayout.main(convadd);
        applayout.maininfo(null);
        return applayout.foot(null);
    } else {
        return console.log('unknown viewstate.state', viewstate.state);
    }
});

handle('update:entity', () => redraw());

handle('update:conv', () => redraw());

handle('update:searchedentities', () => redraw());

handle('update:selectedEntities', () => redraw());

handle('update:convsettings', () => redraw());

var redraw = function() {
    notifications(models);
    convhead(models);
    controls(models);
    convlist(models);
    listhead(models);
    messages(models);
    typinginfo(models);
    input(models);
    convadd(models);
    return startup(models);
};


handle('update:language', function() {
    menu(viewstate);
    return redraw();
});

const throttle = function(fn, time) {
    let throttled;
    if (time == null) { time = 10; }
    let timeout = false;
    // return a throttled version of fn
    // which executes on the trailing end of `time`
    return throttled = function() {
        if (timeout) { return; }
        return timeout = setTimeout(function() {
            fn();
            return timeout = false;
        }
        ,
            time);
    };
};

redraw = throttle(redraw, 20);

handle('update:language', function() {
    menu(viewstate);
    return redraw();
});

handle('update:switchConv', () => messages.scrollToBottom());

handle('update:beforeHistory', () => applayout.recordMainPos());
handle('update:afterHistory', () => applayout.adjustMainPos());

handle('update:beforeImg', () => applayout.recordMainPos());
handle('update:afterImg', function() {
    if (viewstate.atbottom) {
        return messages.scrollToBottom();
    } else {
        return applayout.adjustMainPos();
    }
});

handle('update:startTyping', function() {
    if (viewstate.atbottom) {
        return messages.scrollToBottom();
    }
});

function __guardMethod__(obj, methodName, transform) {
  if (typeof obj !== 'undefined' && obj !== null && typeof obj[methodName] === 'function') {
    return transform(obj, methodName);
  } else {
    return undefined;
  }
}