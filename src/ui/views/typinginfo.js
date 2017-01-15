const {scrollToBottom} = require('./messages');
const {nameof}  = require('../util');

module.exports = view(function(models) {
    const {viewstate, conv, entity} = models;

    const conv_id = __guard__(viewstate, x => x.selectedConv);
    const c = conv[conv_id];

    return div({class:`typing ${__guard__(__guard__(c, x2 => x2.typing), x1 => x1.length) ? 'typingnow' : undefined}`}, function() {
        if (!c) { return; }
        if (__guard__(__guard__(c, x4 => x4.typing), x3 => x3.length)) { span({class:'material-icons'}, 'more_horiz'); }
        const iterable = c.typing != null ? c.typing : [];
        for (let i = 0; i < iterable.length; i++) {
            const t = iterable[i];
            const name = nameof(entity[t.user_id.chat_id]);
            span({class:`typing_${t.status}`}, name);
            if (i < (c.typing.length - 1)) { pass(', '); }
        }
        if (__guard__(__guard__(c, x6 => x6.typing), x5 => x5.length)) { return pass(` ${i18n.__('input.typing:is typing')}`); }
    });
});

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}