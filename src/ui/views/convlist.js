const moment = require('moment');
const {nameof, initialsof, nameofconv, fixlink, drawAvatar} = require('../util');

module.exports = view(function(models) {

    const {conv, entity, viewstate} = models;
    let clz = ['convlist'];
    if (viewstate.showConvThumbs) { clz.push('showconvthumbs'); }
    if (viewstate.showAnimatedThumbs) { clz.push('showanimatedthumbs'); }
    return div({class:clz.join(' ')}, function() {
        let c;
        moment.locale(i18n.getLocale());
        const convs = conv.list();
        const renderConv = function(c) {
            const pureHang = conv.isPureHangout(c);
            const lastChanged = conv.lastChanged(c);
            // don't list pure hangouts that are older than 24h
            if (pureHang && ((Date.now() - lastChanged) > (24 * 60 * 60 * 1000))) { return; }
            const cid = __guard__(__guard__(c, x1 => x1.conversation_id), x => x.id);
            const ur = conv.unread(c);
            clz = ['conv'];
            clz.push(`type_${c.type}`);
            if (models.viewstate.selectedConv === cid) { clz.push("selected"); }
            if (ur) { clz.push("unread"); }
            if (pureHang) { clz.push("purehang"); }
            return div({key:cid, class:clz.join(' ')}, function() {
                let p;
                const part = __guard__(c, x2 => x2.current_participant) != null ? __guard__(c, x2 => x2.current_participant) : [];
                const ents = (() => {
                    const result = [];
                    for (p of Array.from(part)) {
                        if (!entity.isSelf(p.chat_id)) {
                            result.push(entity[p.chat_id]);
                        }
                    }
                    return result;
                })();
                const name = nameofconv(c);
                if (viewstate.showConvThumbs || viewstate.showConvMin) {
                    div({class: `thumbs thumbs-${ents.length>4 ? '4' : ents.length}`}, function() {
                        const additional = [];
                        for (let index = 0; index < ents.length; index++) {
                            // if there are up to 4 people in the conversation
                            //   then draw them all, otherwise, draw 3 avatars
                            //   and then add a +X , where X is the remaining
                            //   number of people
                            p = ents[index];
                            if ((index < 3) ||  (ents.length === 4)) {
                                entity.needEntity(p.id);
                                drawAvatar(p.id, viewstate, entity);
                            } else {
                                additional.push(nameof(entity[p.id]));
                            }
                        }
                        if (ents.length > 4) {
                            div({class:'moreuser'}, `+${ents.length - 3}`
                            , {title: additional.join('\n')});
                        }
                        if ((ur > 0) && !conv.isQuiet(c)) {
                            const lbl = ur >= conv.MAX_UNREAD ? `${conv.MAX_UNREAD}+` : ur + '';
                            span({class:'unreadcount'}, lbl);
                        }
                        if (ents.length === 1) {
                            return div({class:`presence ${ents[0].presence}`});
                        }
                    });
                } else {
                    if ((ur > 0) && !conv.isQuiet(c)) {
                        const lbl = ur >= conv.MAX_UNREAD ? `${conv.MAX_UNREAD}+` : ur + '';
                        span({class:'unreadcount'}, lbl);
                    }
                    if (ents.length === 1) {
                        div({class:`presence ${ents[0].presence}`});
                    }
                }
                if (!viewstate.showConvMin) {
                    div({class:'convinfos'}, function() {
                        if (viewstate.showConvTime) {
                            span({class:'lasttime'}, moment(conv.lastChanged(c)).calendar());
                        }
                        span({class:'convname'}, name);
                        if (viewstate.showConvLast) {
                            return div({class:'lastmessage'}, () => drawMessage(__guard__(__guard__(c, x4 => x4.event), x3 => x3.slice(-1)[0]), entity)
                            , { onDOMSubtreeModified(e) {
                                if (process.platform === 'win32') { return __guard__(window.twemoji, x3 => x3.parse(e.target)); }
                            }
                        }
                            );
                        }
                    });
                }
                return div({class:'divider'});
            }
            , { onclick(ev) {
                ev.preventDefault();
                return action('selectConv', c);
            }
        }
            );
        };

        const starred = ((() => {
            const result = [];
            for (c of Array.from(convs)) {                 if (conv.isStarred(c)) {
                    result.push(c);
                }
            }
            return result;
        })());
        const others = ((() => {
            const result1 = [];
            for (c of Array.from(convs)) {                 if (!conv.isStarred(c)) {
                    result1.push(c);
                }
            }
            return result1;
        })());
        div({class: 'starred'}, function() {
            if (starred.length > 0) {
                div({class: 'label'}, i18n.__n('favorite.title:Favorites', 2));
                return starred.forEach(renderConv);
            }
        });
        return div({class: 'others'}, function() {
            if (starred.length > 0) {
                div({class: 'label'}, i18n.__('recent:Recent'));
            }
            return others.forEach(renderConv);
        });
    });
});

// possible classes of messages
const MESSAGE_CLASSES = ['placeholder', 'chat_message',
'conversation_rename', 'membership_change'];

var drawMessage = function(e, entity) {
    const mclz = ['message'];
    for (let c of Array.from(MESSAGE_CLASSES)) { if (e[c] != null) { mclz.push(c); } }
    const title = e.timestamp ? moment(e.timestamp / 1000).calendar() : null;
    return div({id:`list_${e.event_id}`, key:`list_${e.event_id}`, class:mclz.join(' '), title}, function() {
        if (e.chat_message) {
            const content = __guard__(e.chat_message, x => x.message_content);
            return format(content);
        } else if (e.conversation_rename) {
            return pass(`renamed conversation to ${e.conversation_rename.new_name}`);
            // {new_name: "labbot" old_name: ""}
        } else if (e.membership_change) {
            const t = e.membership_change.type;
            const ents = e.membership_change.participant_ids.map(p => entity[p.chat_id]);
            const names = ents.map(nameof).join(', ');
            if (t === 'JOIN') {
                return pass(`invited ${names}`);
            } else if (t === 'LEAVE') {
                return pass(`${names} left the conversation`);
            }
        }
    });
};

const ifpass = function(t, f) { if (t) { return f; } else { return pass; } };

var format = function(cont) {
    const iterable = (cont && cont.segment) || [];
    for (var i = 0; i < iterable.length; i++) {
        var seg = iterable[i];
        if (cont.proxied && (i < 1)) { continue; }
        var f = seg.formatting != null ? seg.formatting : {};
        // these are links to images that we try loading
         // as images and show inline. (not attachments)
        ifpass(f.bold, b)(() =>
            ifpass(f.italics, i)(() =>
                ifpass(f.underline, u)(() =>
                    ifpass(f.strikethrough, s)(() =>
                        // preload returns whether the image
                        // has been loaded. redraw when it
                        // loads.
                        pass(cont.proxied ?
                            stripProxiedColon(seg.text)
                        :
                            seg.text
                        )
                    )
                )
            )
        );
    }
    return null;
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}