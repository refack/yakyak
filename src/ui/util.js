const URL       = require('url');
const notifier  = require('node-notifier');
const { clipboard } = require('electron');

//
//
// Checks if the clipboard has pasteable content.
//
// Currently only text and images are supported
//
var isContentPasteable = function() {
    const formats = clipboard.availableFormats();
    // as more content is supported in clipboard it should be placed here
    const pasteableContent = ['text/plain', 'image/png'];
    isContentPasteable = 0;
    for (let content of Array.from(formats)) {
        isContentPasteable += pasteableContent.includes(content);
    }
    return isContentPasteable > 0;
};

const notificationCenterSupportsSound = function() {
    // check if sound should be played via notification
    //  documentation says that only WindowsToaster and
    //  NotificationCenter supports sound
    let notifierSupportsSound;
    const playSoundIn = ['WindowsToaster', 'NotificationCenter'];
    // check if currect notifier supports sound
    return notifierSupportsSound = (playSoundIn.find( str => str === notifier.constructor.name) != null);
};

const nameof = function(e) { let left, left1;
return (left = (left1 = __guard__(e, x => x.display_name) != null ? __guard__(e, x => x.display_name) : __guard__(e, x1 => x1.fallback_name)) != null ? left1 : __guard__(e, x2 => x2.first_name)) != null ? left : 'Unknown'; };

const initialsof = function(e) {
    let firstname;
    if (__guard__(e, x => x.first_name)) {
        const name = nameof(e);
        firstname = __guard__(e, x1 => x1.first_name);
        return  firstname.charAt(0) + name.replace(firstname, "").charAt(1);
    } else if (__guard__(e, x2 => x2.display_name)) {
        const name_splitted = e.display_name.split(' ');
        firstname = name_splitted[0].charAt(0);
        if (name_splitted.length === 1) {
            return firstname.charAt(0);
        // just in case something strange
        } else if (__guard__(name_splitted, x3 => x3.length) === 0) {
            return '?';
        } else {
            const lastname = name_splitted[name_splitted.length - 1];
            return firstname.charAt(0) + lastname.charAt(0);
        }
    } else {
        return '?';
    }
};

const drawAvatar = function(user_id, viewstate, entity, image, email, initials) {
    //
    if (image == null) { image = null; }
    if (email == null) { email = null; }
    if (initials == null) { initials = null; }
    if (entity[user_id] == null) { entity.needEntity(user_id); }
    //
    // overwrites if entity is cached
    if (entity[user_id] != null) { initials = initialsof(entity[user_id]).toUpperCase(); }
    if (__guard__(__guard__(entity[user_id], x1 => x1.email), x => x[0]) == null) { email    = __guard__(__guard__(entity[user_id], x3 => x3.email), x2 => x2[0]); }
    if (__guard__(entity[user_id], x4 => x4.photo_url) != null) { image    = __guard__(entity[user_id], x5 => x5.photo_url); }
    //
    // Reproducible color code for initials
    //  see global.less for the color mapping [-1-25]
    //     -1: ? initials
    //   0-25: should be a uniform distribution of colors per users
    var initialsCode = __guard__(viewstate.cachedInitialsCode, x6 => x6[user_id]) != null ? __guard__(viewstate.cachedInitialsCode, x6 => x6[user_id]) : (isNaN(user_id) ?
        initialsCode = -1
    :
        initialsCode = user_id % 26
    );
    //
    return div({class: 'avatar', 'data-id': user_id}, function() {
        if (image != null) {
            if (!__guard__(viewstate, x7 => x7.showAnimatedThumbs)) {
                image += "?sz=50";
            }
            //
            img({src:fixlink(image)
            , "data-initials": initials
            , title: email
            , class: 'fallback-on'
            ,  onerror(ev) {
                // in case the image is not available, it
                //  fallbacks to initials
                return ev.target.parentElement.classList.add("fallback-on");
            }
            , onload(ev) {
                // when loading successfuly, update again all other imgs
                return ev.target.parentElement.classList.remove("fallback-on");
            }
            });
        }
        return div({class: `initials ${image ? 'fallback' : ''}`
        , 'data-first-letter': initialsCode
    }
        , initials);
    });
};

const nameofconv = function(c) {
    const {entity} = require('./models');
    const part = __guard__(c, x => x.current_participant) != null ? __guard__(c, x => x.current_participant) : [];
    const ents = Array.from(part).filter((p) => !entity.isSelf(p.chat_id)).map((p) =>
        entity[p.chat_id]);
    let name = "";
    const one_to_one = __guard__(__guard__(c, x2 => x2.type), x1 => x1.indexOf('ONE_TO_ONE')) >= 0;
    if ((__guard__(c, x3 => x3.name) != null) && !one_to_one) {
        ({ name } = c);
    } else {
        // all entities in conversation that is not self
        // the names of those entities
        const names = ents.map(nameof);
        // joined together in a compelling manner
        name = names.join(', ');
    }
    return name;
};


const linkto = c => `https://plus.google.com/u/0/${c}/about`;

const later = f => setTimeout(f, 1);

const throttle = function(ms, f) {
    let g;
    let last = 0;
    let tim = null;
    return g = function(...as) {
        let d;
        if (tim) { clearTimeout(tim); }
        if ((d = (Date.now() - last)) > ms) {
            const ret = f(...as);
            last = Date.now();
            return ret;
        } else {
            // ensure that last event is always fired
            tim = setTimeout((() => g(...as)), d);
            return undefined;
        }
    };
};

const isAboutLink = function(s) { let left;
return ((left = /https:\/\/plus.google.com\/u\/0\/([0-9]+)\/about/.exec(s)) != null ? left : [])[1]; };

const getProxiedName = function(e) {
    const s = __guard__(__guard__(__guard__(__guard__(e, x3 => x3.chat_message), x2 => x2.message_content), x1 => x1.segment), x => x[0]);
    if (!s) { return; }
    return __guard__(__guard__(s, x5 => x5.formatting), x4 => x4.bold) && isAboutLink(__guard__(__guard__(s, x7 => x7.link_data), x6 => x6.link_target));
};

const tryparse = function(s) { try { return JSON.parse(s); } catch (err) { return undefined; } };

var fixlink = function(l) { if (__guard__(l, x => x[0]) === '/') { return `https:${l}`; } else { return l; } };

var topof = el => __guard__(el, x => x.offsetTop) + (__guard__(el, x1 => x1.offsetParent) ? topof(el.offsetParent) : 0);

const uniqfn = function(as, fn) {
    const fned = as.map(fn);
    return as.filter((v, i) => fned.indexOf(fned[i]) === i);
};

const isImg = url => __guard__(url, x => x.match(/\.(png|jpe?g|gif|svg)$/i));

const getImageUrl = function(url) {
    if (url == null) { url = ""; }
    if (isImg(url)) { return url; }
    const parsed = URL.parse(url, true);
    url = parsed.query.q;
    if (isImg(url)) { return url; }
    return false;
};

const toggleVisibility = function(element) {
    if (element.style.display === 'block') {
        return element.style.display = 'none';
    } else {
        return element.style.display = 'block';
    }
};

const convertEmoji = function(text) {
    const unicodeMap = require('./emojishortcode');

    const patterns = [
        "(^|[ ])(:[a-zA-Z0-9_\+-]+:)([ ]|$)",
        "(^|[ ])(:\\(:\\)|:\\(\\|\\)|:X\\)|:3|\\(=\\^\\.\\.\\^=\\)|\\(=\\^\\.\\^=\\)|=\\^_\\^=|x_x|X-O|X-o|X\\(|X-\\(|O\\.O|:O|:-O|=O|o\\.o|:o|:-o|=o|D:|>_<|T_T|:'\\(|;_;|='\\(|>\\.<|>:\\(|>:-\\(|>=\\(|:\\(|:-\\(|=\\(|;P|;-P|;p|;-p|:P|:-P|=P|:p|:-p|=p|;\\*|;-\\*|:\\*|:-\\*|:S|:-S|:s|:-s|=\\/|=\\\\|:-\\/|:-\\\\|:\\/|:\\\\|u_u|o_o;|-_-|=\\||:\\||:-\\||B-\\)|B\\)|;-\\)|;\\)|}=\\)|}:-\\)|}:\\)|O=\\)|O:-\\)|O:\\)|\\^_\\^;;|=D|\\^_\\^|:-D|:D|~@~|<3|<\\/3|<\\\\3|\\(]:{|-<@%|:\\)|:-\\)|=\\))([ ]|$)"
    ];

    const emojiCodeRegex = new RegExp(patterns.join('|'),'g');

    text = text.replace(emojiCodeRegex, function(emoji) {
        const suffix = emoji.slice(emoji.trimRight().length);
        const prefix = emoji.slice(0, emoji.length - emoji.trimLeft().length);
        const unicode = unicodeMap[emoji.trim()];
        if (unicode != null) {
            return prefix + unicode + suffix;
        } else {
            return emoji;
        }
    });
    return text;
};

const insertTextAtCursor = function(el, text) {
    const { value } = el;
    const doc = el.ownerDocument;
    if ((typeof el.selectionStart === "number") && (typeof el.selectionEnd === "number")) {
        const endIndex = el.selectionEnd;
        el.value = value.slice(0, endIndex) + text + value.slice(endIndex);
        el.selectionStart = el.selectionEnd = endIndex + text.length;
        return el.focus();
    } else if ((doc.selection !== "undefined") && doc.selection.createRange) {
        el.focus();
        const range = doc.selection.createRange();
        range.collapse(false);
        range.text = text;
        return range.select();
    }
};

module.exports = {nameof, initialsof, nameofconv, linkto, later,
                  throttle, uniqfn, isAboutLink, getProxiedName, tryparse,
                  fixlink, topof, isImg, getImageUrl, toggleVisibility,
                  convertEmoji, drawAvatar, notificationCenterSupportsSound,
                  insertTextAtCursor, isContentPasteable};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}