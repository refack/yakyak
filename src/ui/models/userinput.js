const urlRegexp        = require('url-regexp');
const {MessageBuilder, OffTheRecordStatus,MessageActionType} = require('hangupsjs');

const viewstate = require('./viewstate');

const randomid = () => Math.round(Math.random() * Math.pow(2,32));

const split_first = function(str, token) {
  const start = str.indexOf(token);
  const first = str.substr(0, start);
  const last = str.substr(start + token.length);
  return [first, last];
};

const parse = function(mb, txt) {
    const lines = txt.split(/\r?\n/);
    const last = lines.length - 1;
    for (let index = 0; index < lines.length; index++) {
        let line = lines[index];
        const urls = urlRegexp.match(line);
        for (let url of Array.from(urls)) {
            const [before, after] = split_first(line, url);
            if (before) { mb.text(before); }
            line = after;
            mb.link(url, url);
        }
        if (line) { mb.text(line); }
        if (index !== last) { mb.linebreak(); }
    }
    return null;
};

const buildChatMessage = function(sender, txt) {
    const conv_id = viewstate.selectedConv;
    let action = null;
    if (/^\/me\s/.test(txt)) {
        txt = txt.replace(/^\/me/, sender.first_name);
        action = MessageActionType.ME_ACTION;
    }
    const mb = new MessageBuilder(action);
    parse(mb, txt);
    const segs  = mb.toSegments();
    const segsj = mb.toSegsjson();
    const message_action_type = mb.toMessageActionType();
    const client_generated_id = String(randomid());
    const ts = Date.now();
    return {
        segs,
        segsj,
        conv_id,
        client_generated_id,
        ts,
        image_id: undefined,
        otr: OffTheRecordStatus.ON_THE_RECORD,
        message_action_type
    };
};

module.exports = {
    buildChatMessage,
    parse
};
