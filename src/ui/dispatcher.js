const Client = require('hangupsjs');
const { remote } = require('electron');
const ipc    = require('electron').ipcRenderer;


const fs = require('fs');
const mime = require('mime-types');

const { clipboard } = require('electron');

const {entity, conv, viewstate, userinput, connection, convsettings, notify} = require('./models');
const {insertTextAtCursor, throttle, later, isImg} = require('./util');

'connecting connected connect_failed'.split(' ').forEach(n => handle(n, () => connection.setState(n)));

handle('alive', time => connection.setLastActive(time));

handle('reqinit', function() {
    ipc.send('reqinit');
    connection.setState(connection.CONNECTING);
    return viewstate.setState(viewstate.STATE_STARTUP);
});

module.exports =
    {init({init}) { return action('init', init); }};

handle('init', function(init) {
    // set the initial view state
    viewstate.setLoggedin(true);

    viewstate.setColorScheme(viewstate.colorScheme);
    viewstate.setFontSize(viewstate.fontSize);

    // update model from init object
    entity._initFromSelfEntity(init.self_entity);
    if (init.entities) { entity._initFromEntities(init.entities); }
    conv._initFromConvStates(init.conv_states);
    // ensure there's a selected conv
    if (!conv[viewstate.selectedConv]) {
        viewstate.setSelectedConv(__guard__(__guard__(conv.list(), x1 => x1[0]), x => x.conversation_id));
    }

    ipc.send('initpresence', entity.list());

    require('./version').check();

    return viewstate.setState(viewstate.STATE_NORMAL);
});

handle('chat_message', function(ev) {
    // TODO entity is not fetched in usable time for first notification
    // if does not have user on cache
    if (entity[ev.sender_id.chat_id] == null) { entity.needEntity(ev.sender_id.chat_id); }
    // add chat to conversation
    conv.addChatMessage(ev);
    // these messages are to go through notifications
    return notify.addToNotify(ev);
});

handle('watermark', ev => conv.addWatermark(ev));

handle('presence', ev => entity.setPresence(ev[0][0][0][0], ev[0][0][1][1] === 1 ? true : false));

// handle 'self_presence', (ev) ->
//     console.log 'self_presence', ev

handle('querypresence', id => ipc.send('querypresence', id));

handle('setpresence', function(r) {
    if (!__guard__(__guard__(r, x1 => x1.presence), x => x.available)) {
        console.log("setpresence event with unexpected value", r);
    }
    return entity.setPresence(r.user_id.chat_id, __guard__(__guard__(r, x3 => x3.presence), x2 => x2.available));
});

handle('update:unreadcount', () => console.log('update'));

handle('addconversation', function() {
    viewstate.setState(viewstate.STATE_ADD_CONVERSATION);
    return convsettings.reset();
});

handle('convsettings', function() {
    const id = viewstate.selectedConv;
    if (!conv[id]) { return; }
    convsettings.reset();
    convsettings.loadConversation(conv[id]);
    return viewstate.setState(viewstate.STATE_ADD_CONVERSATION);
});

handle('activity', time => viewstate.updateActivity(time));

handle('atbottom', atbottom => viewstate.updateAtBottom(atbottom));

handle('attop', function(attop) {
    viewstate.updateAtTop(attop);
    return conv.updateAtTop(attop);
});

handle('history', (conv_id, timestamp) => ipc.send('getconversation', conv_id, timestamp, 20));

handle('handleconversationmetadata', function(r) {
    if (!r.conversation_state) { return; }
    // removing events so they don't get merged
    r.conversation_state.event = null;
    return conv.updateMetadata(r.conversation_state);
});

handle('handlehistory', function(r) {
    if (!r.conversation_state) { return; }
    return conv.updateHistory(r.conversation_state);
});

handle('selectConv', function(conv) {
    viewstate.setState(viewstate.STATE_NORMAL);
    viewstate.setSelectedConv(conv);
    return ipc.send('setfocus', viewstate.selectedConv);
});

handle('selectNextConv', function(offset) {
    if (offset == null) { offset = 1; }
    if (viewstate.state !== viewstate.STATE_NORMAL) { return; }
    viewstate.selectNextConv(offset);
    return ipc.send('setfocus', viewstate.selectedConv);
});

handle('selectConvIndex', function(index) {
    if (index == null) { index = 0; }
    if (viewstate.state !== viewstate.STATE_NORMAL) { return; }
    viewstate.selectConvIndex(index);
    return ipc.send('setfocus', viewstate.selectedConv);
});

handle('sendmessage', function(txt) {
    if (txt == null) { txt = ''; }
    if (!txt.trim()) { return; }
    const msg = userinput.buildChatMessage(entity.self, txt);
    ipc.send('sendchatmessage', msg);
    return conv.addChatMessagePlaceholder(entity.self.id, msg);
});

handle('toggleshowtray', () => viewstate.setShowTray(!viewstate.showtray));

handle('forcecustomsound', value => viewstate.setForceCustomSound(value));

handle('showiconnotification', value => viewstate.setShowIconNotification(value));

handle('mutesoundnotification', () => viewstate.setMuteSoundNotification(!viewstate.muteSoundNotification));

handle('togglemenu', function() {
    const mainWindow = remote.getCurrentWindow();
    if (mainWindow.isMenuBarVisible()) { return mainWindow.setMenuBarVisibility(false); } else { return mainWindow.setMenuBarVisibility(true); }
});

handle('setescapeclearsinput', value => viewstate.setEscapeClearsInput(value));

handle('togglehidedockicon', () => viewstate.setHideDockIcon(!viewstate.hidedockicon));

handle('show-about', function() {
    viewstate.setState(viewstate.STATE_ABOUT);
    return updated('viewstate');
});

handle('hideWindow', function() {
    const mainWindow = remote.getCurrentWindow(); // And we hope we don't get another ;)
    return mainWindow.hide();
});

handle('togglewindow', function() {
    const mainWindow = remote.getCurrentWindow(); // And we hope we don't get another ;)
    if (mainWindow.isVisible()) { return mainWindow.hide(); } else { return mainWindow.show(); }
});

handle('togglestartminimizedtotray', () => viewstate.setStartMinimizedToTray(!viewstate.startminimizedtotray));

handle('toggleclosetotray', () => viewstate.setCloseToTray(!viewstate.closetotray));

handle('showwindow', function() {
    const mainWindow = remote.getCurrentWindow(); // And we hope we don't get another ;)
    return mainWindow.show();
});

const sendsetpresence = throttle(10000, function() {
    ipc.send('setpresence');
    return ipc.send('setactiveclient', true, 15);
});
const resendfocus = throttle(15000, () => ipc.send('setfocus', viewstate.selectedConv));

handle('lastActivity', function() {
    sendsetpresence();
    if (document.hasFocus()) { return resendfocus(); }
});

handle('appfocus', () => ipc.send('appfocus'));

handle('updatewatermark', (function() {
    const throttleWaterByConv = {};
    return function() {
        const conv_id = viewstate.selectedConv;
        const c = conv[conv_id];
        if (!c) { return; }
        let sendWater = throttleWaterByConv[conv_id];
        if (!sendWater) {
            (function(conv_id) {
                sendWater = throttle(1000, () => ipc.send('updatewatermark', conv_id, Date.now()));
                return throttleWaterByConv[conv_id] = sendWater;
            })(conv_id);
        }
        return sendWater();
    };
})()
);

handle('getentity', ids => ipc.send('getentity', ids));
handle('addentities', function(es, conv_id) {
    for (let e of Array.from(es != null ? es : [])) { entity.add(e); }
    if (conv_id) { // auto-add these ppl to a conv
        (es != null ? es : []).forEach(p => conv.addParticipant(conv_id, p));
        viewstate.setState(viewstate.STATE_NORMAL);
    }

    // flag to show that contacts are loaded
    return viewstate.setContacts(true);
});

handle('uploadimage', function(files) {
    // this may change during upload
    let _, ext, file;
    const conv_id = viewstate.selectedConv;
    // sense check that client is in good state
    if ((viewstate.state !== viewstate.STATE_NORMAL) || !conv[conv_id]) {
        // clear value for upload image input
        document.getElementById('attachFile').value = '';
        return;
    }
    // if only one file is selected, then it shows as preview before sending
    //  otherwise, it will upload all of them immediatly
    if (files.length === 1) {
        file = files[0]; // get first and only file
        const element = document.getElementById('preview-img');
        // show error message and return if is not an image
        if (isImg(file.path)) {
            // store image in preview-container and open it
            //  I think it is better to embed than reference path as user should
            //   see exactly what he is sending. (using the path would require
            //   polling)
            fs.readFile(file.path, function(err, original_data) {
                const binaryImage = new Buffer(original_data, 'binary');
                const base64Image = binaryImage.toString('base64');
                const mimeType = mime.lookup(file.path);
                element.src = `data:${mimeType};base64,${base64Image}`;
                return document.querySelector('#preview-container').classList.add('open');
            });
        } else {
            let left;
            [_, ext] = (left = file.path.match(/.*(\.\w+)$/)) != null ? left : [];
            notr(`Ignoring file of type ${ext}`);
        }
    } else {
        for (file of Array.from(files)) {
            // only images please
            if (!isImg(file.path)) {
                var left1;
                [_, ext] = (left1 = file.path.match(/.*(\.\w+)$/)) != null ? left1 : [];
                notr(`Ignoring file of type ${ext}`);
                continue;
            }
            // message for a placeholder
            const msg = userinput.buildChatMessage(entity.self, 'uploading image…');
            msg.uploadimage = true;
            const {client_generated_id} = msg;
            // add a placeholder for the image
            conv.addChatMessagePlaceholder(entity.self.id, msg);
            // and begin upload
            ipc.send('uploadimage', {path:file.path, conv_id, client_generated_id});
        }
    }
    // clear value for upload image input
    return document.getElementById('attachFile').value = '';
});

handle('onpasteimage', function() {
    const element = document.getElementById('preview-img');
    element.src = clipboard.readImage().toDataURL();
    element.src = element.src.replace(/image\/png/, 'image/gif');
    return document.querySelector('#preview-container').classList.add('open');
});

handle('uploadpreviewimage', function() {
    const conv_id = viewstate.selectedConv;
    if (!conv_id) { return; }
    const msg = userinput.buildChatMessage(entity.self, 'uploading image…');
    msg.uploadimage = true;
    const {client_generated_id} = msg;
    conv.addChatMessagePlaceholder(entity.self.id, msg);
    // find preview element
    const element = document.getElementById('preview-img');
    // build image from what is on preview
    let pngData = element.src.replace(/data:image\/(png|jpe?g|gif|svg);base64,/, '');
    pngData = new Buffer(pngData, 'base64');
    document.querySelector('#preview-container').classList.remove('open');
    document.querySelector('#emoji-container').classList.remove('open');
    element.src = '';
    //
    return ipc.send('uploadclipboardimage', {pngData, conv_id, client_generated_id});});

handle('uploadingimage', function(spec) {});
    // XXX this doesn't look very good because the image
    // shows, then flickers away before the real is loaded
    // from the upload.
    //conv.updatePlaceholderImage spec

handle('leftresize', size => viewstate.setLeftSize(size));
handle('resize', dim => viewstate.setSize(dim));
handle('move', pos => viewstate.setPosition(pos));

handle('conversationname', name => convsettings.setName(name));
handle('conversationquery', query => convsettings.setSearchQuery(query));
handle('searchentities', (query, max_results) => ipc.send('searchentities', query, max_results));
handle('setsearchedentities', r => convsettings.setSearchedEntities(r));
handle('selectentity', e => convsettings.addSelectedEntity(e));
handle('deselectentity', e => convsettings.removeSelectedEntity(e));
handle('togglegroup', e => convsettings.setGroup(!convsettings.group));

handle('saveconversation', function() {
    let name;
    viewstate.setState(viewstate.STATE_NORMAL);
    const conv_id = convsettings.id;
    let c = conv[conv_id];
    const one_to_one = __guard__(__guard__(c, x1 => x1.type), x => x.indexOf('ONE_TO_ONE')) >= 0;
    const selected = (Array.from(convsettings.selectedEntities).map((e) => e.id.chat_id));
    const recreate = conv_id && one_to_one && convsettings.group;
    const needsRename = convsettings.group && convsettings.name && (convsettings.name !== __guard__(c, x2 => x2.name));
    // remember: we don't rename one_to_ones, google web client does not do it
    if (!conv_id || recreate) {
        name = (convsettings.group ? convsettings.name : undefined) || "";
        ipc.send('createconversation', selected, name, convsettings.group);
        return;
    }
    const p = c.participant_data;
    const current = ((() => {
        const result = [];
        for (c of Array.from(p)) {             if (!entity.isSelf(c.id.chat_id)) {
                result.push(c.id.chat_id);
            }
        }
        return result;
    })());
    const toadd = ((() => {
        const result1 = [];
        for (let id of Array.from(selected)) {             if (!Array.from(current).includes(id)) {
                result1.push(id);
            }
        }
        return result1;
    })());
    if (toadd.length) { ipc.send('adduser', conv_id, toadd); }
    if (needsRename) { return ipc.send('renameconversation', conv_id, convsettings.name); }
});

handle('conversation_rename', function(c) {
    conv.rename(c, c.conversation_rename.new_name);
    return conv.addChatMessage(c);
});

handle('membership_change', function(e) {
    let id;
    const conv_id = e.conversation_id.id;
    const ids = ((() => {
        const result = [];
        for (id of Array.from(e.membership_change.participant_ids)) {             result.push(id.chat_id || id.gaia_id);
        }
        return result;
    })());
    if (e.membership_change.type === 'LEAVE') {
        if (Array.from(ids).includes(entity.self.id)) {
            return conv.deleteConv(conv_id);
        }
        return conv.removeParticipants(conv_id, ids);
    }
    conv.addChatMessage(e);
    return ipc.send('getentity', ids, {add_to_conv: conv_id});});

handle('createconversationdone', function(c) {
    convsettings.reset();
    conv.add(c);
    return viewstate.setSelectedConv(c.id.id);
});

handle('notification_level', function(n) {
    const conv_id = __guard__(__guard__(n, x1 => x1[0]), x => x[0]);
    const level = __guard__(n, x2 => x2[1]) === 10 ? 'QUIET' : 'RING';
    if (conv_id && level) { return conv.setNotificationLevel(conv_id, level); }
});

handle('togglenotif', function() {
    let c;
    const {QUIET, RING} = Client.NotificationLevel;
    const conv_id = viewstate.selectedConv;
    if (!(c = conv[conv_id])) { return; }
    const q = conv.isQuiet(c);
    ipc.send('setconversationnotificationlevel', conv_id, (q ? RING : QUIET));
    return conv.setNotificationLevel(conv_id, (q ? 'RING' : 'QUIET'));
});

handle('togglestar', function() {
    let c;
    const conv_id = viewstate.selectedConv;
    if (!(c = conv[conv_id])) { return; }
    return conv.toggleStar(c);
});

handle('delete', function(a) {
    let c;
    const conv_id = __guard__(__guard__(a, x1 => x1[0]), x => x[0]);
    if (!(c = conv[conv_id])) { return; }
    return conv.deleteConv(conv_id);
});

//
//
// Change language in YakYak
//
handle('changelanguage', function(language) {
    if (i18n.getLocales().includes(viewstate.language)) {
        ipc.send('seti18n', null, language);
        return viewstate.setLanguage(language);
    }
});

handle('deleteconv', function(confirmed) {
    const conv_id = viewstate.selectedConv;
    if (!confirmed) {
        return later(function() { if (confirm(i18n.__('conversation.delete_confirm:Really delete conversation?'))) {
            return action('deleteconv', true);
        }
         });
    } else {
        ipc.send('deleteconversation', conv_id);
        viewstate.selectConvIndex(0);
        return viewstate.setState(viewstate.STATE_NORMAL);
    }
});

handle('leaveconv', function(confirmed) {
    const conv_id = viewstate.selectedConv;
    if (!confirmed) {
        return later(function() { if (confirm(i18n.__('conversation.leave_confirm:Really leave conversation?'))) {
            return action('leaveconv', true);
        }
         });
    } else {
        ipc.send('removeuser', conv_id);
        viewstate.selectConvIndex(0);
        return viewstate.setState(viewstate.STATE_NORMAL);
    }
});

handle('lastkeydown', time => viewstate.setLastKeyDown(time));
handle('settyping', function(v) {
    const conv_id = viewstate.selectedConv;
    if (!conv_id || (viewstate.state !== viewstate.STATE_NORMAL)) { return; }
    ipc.send('settyping', conv_id, v);
    return viewstate.setState(viewstate.STATE_NORMAL);
});

handle('typing', t => conv.addTyping(t));
handle('pruneTyping', conv_id => conv.pruneTyping(conv_id));

handle('syncallnewevents', throttle(10000, function(time) {
    if (!time) { return; }
    return ipc.send('syncallnewevents', time);
})
);
handle('handlesyncedevents', function(r) {
    const states = __guard__(r, x => x.conversation_state);
    if (!__guard__(states, x1 => x1.length)) { return; }
    for (let st of Array.from(states)) {
        for (let e of Array.from((__guard__(st, x2 => x2.event) != null ? __guard__(st, x2 => x2.event) : []))) {
            conv.addChatMessage(e);
        }
    }
    return connection.setEventState(connection.IN_SYNC);
});

handle('syncrecentconversations', throttle(10000, () => ipc.send('syncrecentconversations'))
);
handle('handlerecentconversations', function(r) {
    let st;
    if (!(st = r.conversation_state)) { return; }
    conv.replaceFromStates(st);
    return connection.setEventState(connection.IN_SYNC);
});

handle('client_conversation', function(c) {
    // Conversation must be added, even if already exists
    //  why? because when a new chat message for a new conversation appears
    //  a skeleton is made of a conversation
    if (__guard__(conv[__guard__(__guard__(c, x2 => x2.conversation_id), x1 => x1.id)], x => x.participant_data) == null) { return conv.add(c); }
});

handle('hangout_event', function(e) {
    if (!['START_HANGOUT', 'END_HANGOUT'].includes(__guard__(__guard__(e, x1 => x1.hangout_event), x => x.event_type))) { return; }
    // trigger notifications for this
    return notify.addToNotify(e);
});

'reply_to_invite settings conversation_notification invitation_watermark'.split(' ').forEach(n => handle(n, (...as) => console.log(n, ...as)));

handle('unreadtotal', function(total, orMore) {
    let value = "";
    if (total > 0) { value = total + (orMore ? "+" : ""); }
    return ipc.send('updatebadge', value);
});

handle('showconvmin', doshow => viewstate.setShowConvMin(doshow));

handle('showconvthumbs', doshow => viewstate.setShowConvThumbs(doshow));

handle('showanimatedthumbs', doshow => viewstate.setShowAnimatedThumbs(doshow));

handle('showconvtime', doshow => viewstate.setShowConvTime(doshow));

handle('showconvlast', doshow => viewstate.setShowConvLast(doshow));

handle('showpopupnotifications', doshow => viewstate.setShowPopUpNotifications(doshow));

handle('showmessageinnotification', doshow => viewstate.setShowMessageInNotification(doshow));

handle('showusernameinnotification', doshow => viewstate.setShowUsernameInNotification(doshow));

handle('convertemoji', doshow => viewstate.setConvertEmoji(doshow));

handle('changetheme', colorscheme => viewstate.setColorScheme(colorscheme));

handle('changefontsize', fontsize => viewstate.setFontSize(fontsize));

handle('devtools', () => remote.getCurrentWindow().openDevTools({detach:true}));

handle('quit', () => ipc.send('quit'));

handle('togglefullscreen', () => ipc.send('togglefullscreen'));

handle('zoom', function(step) {
    if (step != null) {
        return viewstate.setZoom((parseFloat(document.body.style.zoom.replace(',', '.')) || 1.0) + step);
    }
    return viewstate.setZoom(1);
});

handle('logout', () => ipc.send('logout'));

handle('wonline', function(wonline) {
    connection.setWindowOnline(wonline);
    if (wonline) {
        return ipc.send('hangupsConnect');
    } else {
        return ipc.send('hangupsDisconnect');
    }
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}