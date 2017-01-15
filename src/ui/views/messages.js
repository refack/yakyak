const moment = require('moment');
const { shell } = require('electron');

const {nameof, initialsof, nameofconv, linkto, later, forceredraw, throttle,
getProxiedName, fixlink, isImg, getImageUrl, drawAvatar}  = require('../util');

const CUTOFF = 5 * 60 * 1000 * 1000; // 5 mins

// chat_message:
//   {
//     annotation: [
//       [4, ""]
//     ]
//     message_content: {
//       attachement: []
//       segment: [{ ... }]
//     }
//   }
const HANGOUT_ANNOTATION_TYPE = {
    me_message: 4
};

// this helps fixing houts proxied with things like hangupsbot
// the format of proxied messages are
// and here we put entities in the entity db for
// users found only in proxied messages.
const fixProxied = function(e, proxied, entity) {
    if (__guard__(__guard__(e, x1 => x1.chat_message), x => x.message_content) == null) { return; }
    e.chat_message.message_content.proxied = true;
    const name = __guard__(__guard__(__guard__(__guard__(e, x5 => x5.chat_message), x4 => x4.message_content), x3 => x3.segment[0]), x2 => x2.text);
    // update fallback_name for entity database
    if (name !== '>>') {
        // synthetic add of fallback_name
        return entity.add({
            id: {
                gaia_id: proxied,
                chat_id: proxied
            },
            fallback_name: name
        }, {silent:true});
    }
};

const onclick = function(e) {
  e.preventDefault();
  let address = e.currentTarget.getAttribute('href');

  const patt = new RegExp("^(https?[:][/][/]www[.]google[.](com|[a-z][a-z])[/]url[?]q[=])([^&]+)(&.+)*");
  if (patt.test(address)) {
    address = address.replace(patt, '$3');
    address = unescape(address);
}

  let finalUrl = fixlink(address);

  // Google apis give us an url that is only valid for the current logged user.
  // We can't open this url in the external browser because it may not be authenticated
  // or may be authenticated differently (another user or multiple users).
  // In this case we try to open the url ourselves until we get redirected to the final url
  // of the image/video.
  // The finalURL will be cdn-hosted, static and does not require authentication
  // so we can finally open it in the external browser :(

  const xhr = new XMLHttpRequest;

  xhr.onreadystatechange = function(e) {
    if (e.target.status === 0) { return; }
    if (xhr.readyState !== 4) { return; }
    finalUrl = xhr.responseURL;
    shell.openExternal(finalUrl);
    return xhr.abort();
};

  xhr.open("get", finalUrl);
  return xhr.send();
};

// helper method to group events in time/user bunches
const groupEvents = function(es, entity) {
    const groups = [];
    let group = null;
    let user = null;
    for (let e of Array.from(es)) {
        if ((e.timestamp - (__guard__(group, x => x.end) != null ? __guard__(group, x => x.end) : 0)) > CUTOFF) {
            group = {
                byuser: [],
                start: e.timestamp,
                end: e.timestamp
            };
            user = null;
            groups.push(group);
        }
        const proxied = getProxiedName(e);
        if (proxied) {
            fixProxied(e, proxied, entity);
        }
        const cid = proxied ? proxied : __guard__(__guard__(e, x2 => x2.sender_id), x1 => x1.chat_id);
        if (cid !== __guard__(user, x3 => x3.cid)) {
            group.byuser.push(user = {
                cid,
                event: []
            });
        }
        user.event.push(e);
        group.end = e.timestamp;
    }
    return groups;
};

// possible classes of messages
const MESSAGE_CLASSES = ['placeholder', 'chat_message',
'conversation_rename', 'membership_change'];

const OBSERVE_OPTS = {
    childList:true,
    attributes:true,
    attributeOldValue:true,
    subtree:true
};

let firstRender       = true;
let lastConv          = null; // to detect conv switching

module.exports = view(function(models) {
    let participant;
    const {viewstate, conv, entity} = models;

    // mutation events kicks in after first render
    if (firstRender) { later(onMutate(viewstate)); }
    firstRender = false;

    const conv_id = __guard__(viewstate, x => x.selectedConv);
    const c = conv[conv_id];
    if (__guard__(c, x1 => x1.current_participant) != null) {
        for (participant of Array.from(c.current_participant)) {
          entity.needEntity(participant.chat_id);
        }
    }
    div({class:'messages', observe:onMutate(viewstate)}, function() {
        let sender;
        if (!__guard__(c, x2 => x2.event)) { return; }

        const grouped = groupEvents(c.event, entity);
        div({class:'historyinfo'}, function() {
            if (c.requestinghistory) {
                return pass('Requesting history…', () => span({class:'material-icons spin'}, 'donut_large'));
            }
        });
        moment.locale(i18n.getLocale());

        const last_seen = conv.findLastReadEventsByUser(c);
        const last_seen_chat_ids_with_event = (last_seen, event) =>
          (() => {
              const result = [];
              for (let chat_id in last_seen) {
                  const e = last_seen[chat_id];
                  if (event === e) {
                      result.push(chat_id);
                  }
              }
              return result;
          })()
      ;

        return Array.from(grouped).map((g) =>
            (div({class:'timestamp'}, moment(g.start / 1000).calendar()),
            Array.from(g.byuser).map((u) =>
                (sender = nameof(entity[u.cid]),
                (() => {
                    const result = [];
                    for (var events of Array.from(groupEventsByMessageType(u.event))) {
                        if (isMeMessage(events[0])) {
                            // all items are /me messages if the first one is due to grouping above
                            result.push(div({class:'ugroup me'}, function() {
                                drawMessageAvatar(u, sender, viewstate, entity);
                                return Array.from(events).map((e) => drawMeMessage(e));
                            }));
                        } else {
                            const clz = ['ugroup'];
                            if (entity.isSelf(u.cid)) { clz.push('self'); }
                            result.push(div({class:clz.join(' ')}, function() {
                                drawMessageAvatar(u, sender, viewstate, entity);
                                div({class:'umessages'}, () => Array.from(events).map((e) => drawMessage(e, entity))
                                , { onDOMSubtreeModified(e) {
                                    if (process.platform === 'win32') { return __guard__(window.twemoji, x3 => x3.parse(e.target)); }
                                }
                            }
                                );

                                // at the end of the events group we draw who has read any of its events
                                return div({class: 'seen-list'}, () =>
                                    Array.from(events).map((e) =>
                                        (() => {
                                            const result1 = [];
                                            for (let chat_id of Array.from(last_seen_chat_ids_with_event(last_seen, e))) {
                                                let item;
                                                const skip = entity.isSelf(chat_id) || (chat_id === u.cid);
                                                if (!skip) { item = drawSeenAvatar(
                                                    entity[chat_id],
                                                    e.event_id,
                                                    viewstate,
                                                    entity
                                                ); }
                                                result1.push(item);
                                            }
                                            return result1;
                                        })())
                                );
                            }));
                        }
                    }
                    return result;
                })()))));
    });

    // Go through all the participants and only show his last seen status
    if (__guard__(c, x2 => x2.current_participant) != null) {
        for (participant of Array.from(c.current_participant)) {
            // get all avatars
            const all_seen = document
            .querySelectorAll(`.seen[data-id='${participant.chat_id}']`);
        }
    }
            // select last one
            //  NOT WORKING
            //if all_seen.length > 0
            //    all_seen.forEach (el) ->
            //        el.classList.remove 'show'
            //    all_seen[all_seen.length - 1].classList.add 'show'
    if (lastConv !== conv_id) {
        lastConv = conv_id;
        return later(atTopIfSmall);
    }
});

var drawMessageAvatar = (u, sender, viewstate, entity) =>
    a({href:linkto(u.cid), title: sender}, {onclick}, {class:'sender'}, () => drawAvatar(u.cid, viewstate, entity))
;

var groupEventsByMessageType = function(event) {
    const res = [];
    let index = 0;
    let prevWasMe = true;
    for (let e of Array.from(event)) {
        if (isMeMessage(e)) {
            index = res.push([e]);
            prevWasMe = true;
        } else {
            if (prevWasMe) {
                index = res.push([e]);
            } else {
                res[index - 1].push(e);
            }
            prevWasMe = false;
        }
    }
    return res;
};

var isMeMessage = e => __guard__(__guard__(__guard__(__guard__(e, x3 => x3.chat_message), x2 => x2.annotation), x1 => x1[0]), x => x[0]) === HANGOUT_ANNOTATION_TYPE.me_message;

var drawSeenAvatar = function(u, event_id, viewstate, entity) {
    const initials = initialsof(u);
    return div({class: "seen"
    , "data-id": u.id
    , "data-event-id": event_id
    , title: u.display_name
}
    , () => drawAvatar(u.id, viewstate, entity));
};

var drawMeMessage = e =>
    div({class:'message'}, () => __guard__(e.chat_message, x => x.message_content.segment[0].text))
;

var drawMessage = function(e, entity) {
    const mclz = ['message'];
    for (let c of Array.from(MESSAGE_CLASSES)) { if (e[c] != null) { mclz.push(c); } }
    const title = e.timestamp ? moment(e.timestamp / 1000).calendar() : null;
    return div({id:e.event_id, key:e.event_id, class:mclz.join(' '), title}, function() {
        if (e.chat_message) {
            const content = __guard__(e.chat_message, x => x.message_content);
            format(content);
            // loadInlineImages content
            if (e.placeholder && e.uploadimage) {
                return span({class:'material-icons spin'}, 'donut_large');
            }
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
        } else if (e.hangout_event) {
          const { hangout_event } = e;
          const style = {'vertical-align': 'middle'};
          if (hangout_event.event_type === 'START_HANGOUT') {
              span({ class: 'material-icons', style }, 'call_made_small');
              return pass(' Call started');
          } else if (hangout_event.event_type === 'END_HANGOUT') {
              span({ class:'material-icons small', style }, 'call_end');
              return pass(' Call ended');
          }
        } else {
          return console.log('unhandled event type', e, entity);
      }
    });
};


var atTopIfSmall = function() {
    const screl = document.querySelector('.main');
    const msgel = document.querySelector('.messages');
    return action('attop', __guard__(msgel, x => x.offsetHeight) < __guard__(screl, x1 => x1.offsetHeight));
};


// when there's mutation, we scroll to bottom in case we already are at bottom
var onMutate = viewstate => throttle(10, function() {
    // jump to bottom to follow conv
    if (viewstate.atbottom) { return scrollToBottom(); }
}) ;


var scrollToBottom = module.exports.scrollToBottom = function() {
    // ensure we're scrolled to bottom
    const el = document.querySelector('.main');
    // to bottom
    return el.scrollTop = Number.MAX_SAFE_INTEGER;
};


const ifpass = function(t, f) { if (t) { return f; } else { return pass; } };

var format = function(cont) {
    if (__guard__(cont, x => x.attachment) != null) {
        try {
          formatAttachment(cont.attachment);
        } catch (e) {
          console.error(e);
      }
    }
    const iterable = (cont && cont.segment) || [];
    for (let i = 0; i < iterable.length; i++) {
        var seg = iterable[i];
        if (cont.proxied && (i < 1)) { continue; }
        formatters.forEach(fn => fn(seg, cont));
    }
    return null;
};


var formatters = [
    // text formatter
    function(seg, cont) {
        const f = seg.formatting != null ? seg.formatting : {};
        const href = __guard__(__guard__(seg, x1 => x1.link_data), x => x.link_target);
        return ifpass(href, (f => a({href, onclick}, f)))(() =>
            ifpass(f.bold, b)(() =>
                ifpass(f.italic, i)(() =>
                    ifpass(f.underline, u)(() =>
                        ifpass(f.strikethrough, s)(() =>
                            pass(cont.proxied ?
                                stripProxiedColon(seg.text)
                            :
                                seg.text
                            )
                        )
                    )
                )
            )
        );
    },
    // image formatter
    function(seg) {
        const href = __guard__(__guard__(seg, x1 => x1.link_data), x => x.link_target);
        const imageUrl = getImageUrl(href); // false if can't find one
        if (imageUrl && preload(imageUrl)) {
            return div(() => img({src: imageUrl}));
        }
    },
    // twitter preview
    function(seg) {
        const href = __guard__(seg, x => x.text);
        if (!href) {
            return;
        }
        const matches = href.match(/^(https?:\/\/)(.+\.)?(twitter.com\/.+\/status\/.+)/);
        if (!matches) {
            return;
        }
        const data = preloadTweet(matches[1] + matches[3]);
        if (!data) {
            return;
        }
        return div({class:'tweet'}, function() {
            if (data.text) {
                p(() => data.text);
            }
            if (data.imageUrl && preload(data.imageUrl)) {
                return img({src: data.imageUrl});
            }
        });
    },
    // instagram preview
    function(seg) {
        const href = __guard__(seg, x => x.text);
        if (!href) {
            return;
        }
        const matches = href.match(/^(https?:\/\/)(.+\.)?(instagram.com\/p\/.+)/);
        if (!matches) {
            return;
        }
        const data = preloadInstagramPhoto(`https://api.instagram.com/oembed/?url=${href}`);
        if (!data) {
            return;
        }
        return div({class:'instagram'}, function() {
            if (data.text) {
                p(() => data.text);
            }
            if (data.imageUrl && preload(data.imageUrl)) {
                return img({src: data.imageUrl});
            }
        });
    }
];

var stripProxiedColon = function(txt) {
    if (__guard__(txt, x => x.indexOf(": ")) === 0) {
        return txt.substring(2);
    } else {
        return txt;
    }
};

const preload_cache = {};


var preload = function(href) {
    const cache = preload_cache[href];
    if (!cache) {
        const el = document.createElement('img');
        el.onload = function() {
            if (typeof el.naturalWidth !== 'number') { return; }
            el.loaded = true;
            return later(() => action('loadedimg'));
        };
        el.onerror = () => console.log('error loading image', href);
        el.src = href;
        preload_cache[href] = el;
    }
    return __guard__(cache, x => x.loaded);
};

var preloadTweet = function(href) {
    const cache = preload_cache[href];
    if (!cache) {
        preload_cache[href] = {};
        fetch(href)
        .then(response => response.text())
        .then(function(html) {
            const frag = document.createElement('div');
            frag.innerHTML = html;
            const container = frag.querySelector('[data-associated-tweet-id]');
            const textNode = container.querySelector(('.tweet-text'));
            const image = container.querySelector(('[data-image-url]'));
            preload_cache[href].text = textNode.textContent;
            preload_cache[href].imageUrl = __guard__(image, x => x.dataset.imageUrl);
            return later(() => action('loadedtweet'));
        });
    }
    return cache;
};

var preloadInstagramPhoto = function(href) {
    const cache = preload_cache[href];
    if (!cache) {
        preload_cache[href] = {};
        fetch(href)
        .then(response => response.json())
        .then(function(json) {
            preload_cache[href].text = json.title;
            preload_cache[href].imageUrl = json.thumbnail_url;
            return later(() => action('loadedinstagramphoto'));
        });
    }
    return cache;
};

var formatAttachment = function(att) {
    // console.log 'attachment', att if att.length > 0
    let data, href, thumb;
    if (__guard__(__guard__(__guard__(att, x2 => x2[0]), x1 => x1.embed_item), x => x.type_)) {
        data = extractProtobufStyle(att);
        if (!data) { return; }
        ({href, thumb} = data);
    } else if (__guard__(__guard__(__guard__(att, x5 => x5[0]), x4 => x4.embed_item), x3 => x3.type)) {
        console.log('THIS SHOULD NOT HAPPEN WTF !!');
        data = extractProtobufStyle(att);
        if (!data) { return; }
        ({href, thumb} = data);
    } else {
        if (__guard__(att, x6 => x6.length) !== 0) { console.warn('ignoring attachment', att); }
        return;
    }
    if (!href) { return; }

    // here we assume attachments are only images
    if (preload(thumb)) {
      return div({class:'attach'}, () => a({href, onclick}, () => img({src:thumb})));
  }
};


handle('loadedimg', function() {
    // allow controller to record current position
    updated('beforeImg');
    // will do the redraw inserting the image
    updated('conv');
    // fix the position after redraw
    return updated('afterImg');
});

handle('loadedtweet', () => updated('conv'));

handle('loadedinstagramphoto', () => updated('conv'));

var extractProtobufStyle = function(att) {
    let href = null;
    let thumb = null;

    const embed_item = __guard__(__guard__(att, x1 => x1[0]), x => x.embed_item);
    const {plus_photo, data, type_} = embed_item != null ? embed_item : {};
    if (plus_photo != null) {
        href  = __guard__(plus_photo.data, x2 => x2.url);
        thumb = __guard__(__guard__(plus_photo.data, x4 => x4.thumbnail), x3 => x3.image_url);
        href  = __guard__(__guard__(plus_photo.data, x6 => x6.thumbnail), x5 => x5.url);
        const isVideo = __guard__(plus_photo.data, x7 => x7.media_type) !== 'MEDIA_TYPE_PHOTO';
        return {href, thumb};
    }

    const t = __guard__(type_, x8 => x8[0]);
    if (t !== 249) { return console.warn('ignoring (old) attachment type', att); }
    const k = __guard__(Object.keys(data), x9 => x9[0]);
    if (!k) { return; }
    href = __guard__(__guard__(data, x11 => x11[k]), x10 => x10[5]);
    thumb = __guard__(__guard__(data, x13 => x13[k]), x12 => x12[9]);
    if (!thumb) {
      href = __guard__(__guard__(data, x15 => x15[k]), x14 => x14[4]);
      thumb = __guard__(__guard__(data, x17 => x17[k]), x16 => x16[5]);
  }

    return {href, thumb};
};

const extractObjectStyle = function(att) {
    const eitem = __guard__(__guard__(att, x1 => x1[0]), x => x.embed_item);
    const {type} = eitem != null ? eitem : {};
    if (__guard__(type, x2 => x2[0]) === "PLUS_PHOTO") {
        const it = eitem["embeds.PlusPhoto.plus_photo"];
        const href = __guard__(it, x3 => x3.url);
        const thumb = __guard__(__guard__(it, x5 => x5.thumbnail), x4 => x4.url);
        return {href, thumb};
    } else {
        return console.warn('ignoring (new) type', type);
    }
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}