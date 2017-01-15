const autosize = require('autosize');
const { clipboard } = require('electron');
const {scrollToBottom, messages} = require('./messages');
const {later, toggleVisibility, convertEmoji, insertTextAtCursor} = require('../util');

const isModifierKey = ev => ev.altKey || ev.ctrlKey || ev.metaKey || ev.shiftKey;
const isAltCtrlMeta = ev => ev.altKey || ev.ctrlKey || ev.metaKey;

const cursorToEnd = el => el.selectionStart = el.selectionEnd = el.value.length;

const history = [];
let historyIndex = 0;
const historyLength = 100;
let historyBackup = "";

const historyPush = function(data) {
    history.push(data);
    if (history.length === historyLength) { history.shift(); }
    return historyIndex = history.length;
};

const historyWalk = function(el, offset) {
    // if we are starting to dive into history be backup current message
    if ((offset === -1) && (historyIndex === history.length)) { historyBackup = el.value; }
    historyIndex = historyIndex + offset;
    // constrain index
    if (historyIndex < 0) { historyIndex = 0; }
    if (historyIndex > history.length) { historyIndex = history.length; }
    // if don't have history value restore 'current message'
    const val = history[historyIndex] || historyBackup;
    el.value = val;
    return setTimeout((() => cursorToEnd(el)), 1);
};

let lastConv = null;

const emojiCategories = require('./emojicategories');
const openByDefault = 'people';

module.exports = view(function(models) {
    div({class:'input'}, function() {
        div({id: 'preview-container'}, function() {
            div({class: 'close-me material-icons'
                , onclick(e) {
                    return clearsImagePreview();
                }
        }
                , () => span(''));
            return div({class: 'relative'
                , onclick(e) {
                    console.log('going to upload preview image');
                    const element = document.getElementById("message-input");
                    // send text
                    return preparemessage(element);
                }
        }
                , function() {
                    img({id: 'preview-img', src: ''});
                    return div({class: 'after material-icons'}
                        , () => span('send'));
            });
        });

        div({class: 'relative'}, () =>
            div({id:'emoji-container'}, function() {
                div({id:'emoji-group-selector'}, () =>
                    (() => {
                        const result = [];
                        for (let range of Array.from(emojiCategories)) {
                            const name = range['title'];
                            let glow = '';
                            if (name === openByDefault) {
                                glow = 'glow';
                            }
                            result.push(span({id:name+'-button'
                            , title:name
                            , class:`emoticon ${glow}`
                        }
                            , range['representation']
                            , { onclick: (name => function() {
                                console.log(`Opening ${name}`);
                                return openEmoticonDrawer(name);
                            } )(name)
                        }
                            ));
                        }
                        return result;
                    })()
                );

                return div({class:'emoji-selector'}, () =>
                    (() => {
                        const result = [];
                        for (var range of Array.from(emojiCategories)) {
                            const name = range['title'];
                            let visible = '';
                            if (name === openByDefault) {
                                visible = 'visible';
                            }

                            result.push(span({id:name, class:`group-content ${visible}`}, () =>
                                (() => {
                                    const result1 = [];
                                    for (let emoji of Array.from(range['range'])) {
                                        if (emoji.indexOf("\u200d") >= 0) {
                                            // FIXME For now, ignore characters that have the "glue" character in them;
                                            // they don't render properly
                                            continue;
                                        }
                                        result1.push(span({class:'emoticon'}, emoji
                                        , { onclick: (emoji => function() {
                                                const element = document.getElementById("message-input");
                                                return insertTextAtCursor(element, emoji);
                                            } )(emoji)
                                    }
                                        ));
                                    }
                                    return result1;
                                })()
                            ));
                        }
                        return result;
                    })()
                );
            })
        );

        return div({class:'input-container'}, function() {
            textarea({id:'message-input', autofocus:true, placeholder: i18n.__('input.message:Message'), rows: 1}, ''
            , { onDOMNodeInserted(e) {
                // at this point the node is still not inserted
                const ta = e.target;
                later(() => autosize(ta));
                return ta.addEventListener('autosize:resized', function() {
                    // we do this because the autosizing sets the height to nothing
                    // while measuring and that causes the messages scroll above to
                    // move. by pinning the div of the outer holding div, we
                    // are not moving the scroller.
                    ta.parentNode.style.height = (ta.offsetHeight + 24) + 'px';
                    if (messages != null) { return messages.scrollToBottom(); }
                });
            }
            , onkeydown(e) {
                if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowUp')) { action('selectNextConv', -1); }
                if ((e.metaKey || e.ctrlKey) && (e.key === 'ArrowDown')) { action('selectNextConv', +1); }
                if (!isModifierKey(e)) {
                    if (e.keyCode === 27) {
                        e.preventDefault();
                        if (models.viewstate.showtray && !models.viewstate.escapeClearsInput) {
                            action('hideWindow');
                        } else {
                            // must focus on field and then execute:
                            //  - select all text in input
                            //  - replace them with an empty string
                            document.getElementById("message-input").focus();
                            document.execCommand("selectAll", false);
                            document.execCommand("insertText", false, "");
                            // also remove image preview
                            clearsImagePreview();
                        }
                    }

                    if (e.keyCode === 13) {
                        e.preventDefault();
                        preparemessage(e.target);
                    }
                    if (e.target.value === '') {
                        if (e.key === 'ArrowUp') { historyWalk(e.target, -1); }
                        if (e.key === 'ArrowDown') { historyWalk(e.target, +1); }
                    }
                }
                if (!isAltCtrlMeta(e)) { return action('lastkeydown', Date.now()); }
            }
            , onkeyup(e) {
                //check for emojis after pressing space
                if (e.keyCode === 32) {
                    const element = document.getElementById("message-input");
                    // Converts emojicodes (e.g. :smile:, :-) ) to unicode
                    if (models.viewstate.convertEmoji) {
                        // get cursor position
                        const startSel = element.selectionStart;
                        const len = element.value.length;
                        element.value = convertEmoji(element.value);
                        // Set cursor position (otherwise it would go to end of inpu)
                        const lenAfter = element.value.length;
                        element.selectionStart = startSel - (len - lenAfter);
                        return element.selectionEnd = element.selectionStart;
                    }
                }
            }
            , onpaste(e) {
                return setTimeout(function() {
                    if (!clipboard.readImage().isEmpty() && !clipboard.readText()) {
                        return action('onpasteimage');
                    }
                }
                , 2);
            }
        }
            );

            return span({class:'button-container'}, () =>
                button({title: i18n.__('input.emoticons:Show emoticons'), onclick(ef) {
                    document.querySelector('#emoji-container').classList.toggle('open');
                    return scrollToBottom();
                }
            }
                , () => span({class:'material-icons'}, "mood"))
            
            , function() {
                button({title: i18n.__('input.image:Attach image'), onclick(ev) {
                    return document.getElementById('attachFile').click();
                }
            }
                , () => span({class:'material-icons'}, 'photo'));
                return input({type:'file', id:'attachFile', accept:'.jpg,.jpeg,.png,.gif', onchange(ev) {
                    return action('uploadimage', ev.target.files);
                }
                });
            });
        });
    }
    , { onDOMNodeInserted(e) {
            return __guard__(window.twemoji, x => x.parse(e.target));
        }
}
    );

    // focus when switching convs
    if (lastConv !== models.viewstate.selectedConv) {
        lastConv = models.viewstate.selectedConv;
        return laterMaybeFocus();
    }
});

var clearsImagePreview = function() {
    const element = document.getElementById('preview-img');
    element.src = '';
    document.getElementById('attachFile').value = '';
    return document.querySelector('#preview-container')
        .classList.remove('open');
};

var laterMaybeFocus = () => later(maybeFocus);

var maybeFocus = function() {
    // no active element? or not focusing something relevant...
    let el = document.activeElement;
    if (!el || !(['INPUT', 'TEXTAREA'].includes(el.nodeName))) {
        // steal it!!!
        el = document.querySelector('.input textarea');
        if (el) { return el.focus(); }
    }
};

var preparemessage = function(ev) {
    if (models.viewstate.convertEmoji) {
        // before sending message, check for emoji
        const element = document.getElementById("message-input");
        // Converts emojicodes (e.g. :smile:, :-) ) to unicode
        element.value = convertEmoji(element.value);
    }
    //
    action('sendmessage', ev.value);
    //
    // check if there is an image in preview
    const img = document.getElementById("preview-img");
    if (img.getAttribute('src') !== '') { action('uploadpreviewimage'); }
    //
    document.querySelector('#emoji-container').classList.remove('open');
    historyPush(ev.value);
    ev.value = '';
    return autosize.update(ev);
};

handle('noinputkeydown', function(ev) {
    const el = document.querySelector('.input textarea');
    if (el && !isAltCtrlMeta(ev)) { return el.focus(); }
});

var openEmoticonDrawer = function(drawerName) {
    let set;
    return Array.from(emojiCategories).map((range) =>
        (set = (range['title'] === drawerName),
        setClass(set, (document.querySelector(`#${range['title']}`)), 'visible'),
        setClass(set, (document.querySelector(`#${range['title']}-button`)), 'glow')));
};


var setClass = function(boolean, element, className) {
    if ((element === undefined) || (element === null)) {
        return console.error("Cannot set visibility for undefined variable");
    } else {
        if (boolean) {
            return element.classList.add(className);
        } else {
            return element.classList.remove(className);
        }
    }
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}