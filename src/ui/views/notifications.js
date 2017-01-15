const notifier = require('node-notifier');
const { shell }    = require('electron');
const path     = require('path');
const { remote }   = require('electron');
const i18n     = require('i18n');

const {nameof, getProxiedName, fixlink, notificationCenterSupportsSound} = require('../util');

// conv_id markers for call notifications
const callNeedAnswer = {};

const notifierSupportsSound = notificationCenterSupportsSound();

// Custom sound for new message notifications
const audioFile = path.join(YAKYAK_ROOT_DIR, '..', 'media',
'new_message.ogg');
const audioEl = new Audio(audioFile);
audioEl.volume = .4;


module.exports = function(models) {
    const {conv, notify, entity, viewstate} = models;
    const tonot = notify.popToNotify();

    const quietIf = (c, chat_id) => __guard__(document, x => x.hasFocus()) || conv.isQuiet(c) || entity.isSelf(chat_id);

    return tonot.forEach(function(msg) {
        const conv_id = __guard__(__guard__(msg, x1 => x1.conversation_id), x => x.id);
        const c = conv[conv_id];
        const chat_id = __guard__(__guard__(msg, x3 => x3.sender_id), x2 => x2.chat_id);

        const proxied = getProxiedName(msg);
        const cid = proxied ? proxied : __guard__(__guard__(msg, x5 => x5.sender_id), x4 => x4.chat_id);
        const sender = nameof(entity[cid]);
        let text = null;

        if (msg.chat_message != null) {
            if (__guard__(msg.chat_message, x6 => x6.message_content) == null) { return; }
            text = textMessage(msg.chat_message.message_content, proxied);
        } else if (__guard__(msg.hangout_event, x7 => x7.event_type) === 'START_HANGOUT') {
            text = i18n.__("call.incoming:Incoming call");
            callNeedAnswer[conv_id] = true;
            notr({
                html: `${i18n.__('call.incoming_from:Incoming call from %s', sender)}. ` +
                `<a href=\"#\" class=\"accept\">${i18n.__('call.accept:Accept')}</a> / ` +
                `<a href=\"#\" class=\"reject\">${i18n.__('call.reject:Reject')}</a>`,
                stay: 0,
                id: `hang${conv_id}`,
                onclick(e) {
                    delete callNeedAnswer[conv_id];
                    if (__guard__(__guard__(e, x9 => x9.target), x8 => x8.className) === 'accept') {
                        notr({html:i18n.__('calls.accepted:Accepted'), stay:1000, id:`hang${conv_id}`});
                        return openHangout(conv_id);
                    } else {
                        return notr({html: i18n.__('calls.rejected:Rejected'), stay:1000, id:`hang${conv_id}`});
                    }
                }
            });
        } else if (__guard__(msg.hangout_event, x8 => x8.event_type) === 'END_HANGOUT') {
            if (callNeedAnswer[conv_id]) {
                delete callNeedAnswer[conv_id];
                notr({
                    html: `${i18n.__('calls.missed:Missed call from %s', sender)}. ` +
                        `<a href=\"#\">${actions.ok}</a>`,
                    id: `hang${conv_id}`,
                    stay: 0
                });
            }
        } else {
            return;
        }

        // maybe trigger OS notification
        if (!text || quietIf(c, chat_id)) { return; }

        if (viewstate.showPopUpNotifications) {
            let contentImage;
            const isNotificationCenter = notifier.constructor.name === 'NotificationCenter';
            //
            const icon = path.join(__dirname, '..', '..', 'icons', 'icon@8.png');
            // Only for NotificationCenter (darwin)
            if (isNotificationCenter && viewstate.showIconNotification) {
                contentImage = fixlink(__guard__(entity[cid], x9 => x9.photo_url));
            } else {
                contentImage = undefined;
            }
            //
            notifier.notify({
                title: viewstate.showUsernameInNotification ?
                           !isNotificationCenter && !viewstate.showIconNotification ?
                               `${sender} (YakYak)`
                           :
                               sender
                       :
                           'YakYak',
                message: viewstate.showMessageInNotification ?
                          text
                      :
                          i18n.__('conversation.new_message:New Message'),
                wait: true,
                sender: 'com.github.yakyak',
                sound: !viewstate.muteSoundNotification && (notifierSupportsSound && !viewstate.forceCustomSound),
                icon: !isNotificationCenter && viewstate.showIconNotification ? icon : undefined,
                contentImage
            }
            , function(err, res) {
              if (__guard__(res, x10 => x10.trim().match(/Activate/i))) {
                action('appfocus');
                return action('selectConv', c);
            }
            });

            // only play if it is not playing already
            //  and notifier does not support sound or force custom sound is set
            //  and mute option is not set
            if ((!notifierSupportsSound || viewstate.forceCustomSound) && !viewstate.muteSoundNotification && audioEl.paused) {
                audioEl.play();
            }
        }
        // And we hope we don't get another 'currentWindow' ;)
        const mainWindow = remote.getCurrentWindow();
        return mainWindow.flashFrame(true);
    });
};

var textMessage = function(cont, proxied) {
    const segs = (() => {
        const result = [];
        const iterable = (cont && cont.segment) || [];
        for (let i = 0; i < iterable.length; i++) {
            const seg = iterable[i];
            if (proxied && (i < 2)) { continue; }
            if (!seg.text) { continue; }
            result.push(seg.text);
        }
        return result;
    })();
    return segs.join('');
};


var openHangout = conv_id => shell.openExternal(`https://plus.google.com/hangouts/_/CONVERSATION/${conv_id}`);

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}