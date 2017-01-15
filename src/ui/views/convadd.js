
const {initialsof, throttle, nameof, fixlink, drawAvatar} = require('../util');
const chilledaction = throttle(1500, action);

const unique = obj => obj.id.chat_id || obj.id.gaia_id;

const mayRestoreInitialValues = function(models) {
    // If there is an initial value we set it an then invalidate it
    const {convsettings} = models;
    const initialName = convsettings.getInitialName();
    if (initialName !== null) {
        setTimeout(function() {
            const name = document.querySelector('.name-input');
            if (name) { return name.value = initialName; }
        }
        , 1);
    }
    const initialSearchQuery = convsettings.getInitialSearchQuery();
    if (initialSearchQuery !== null) {
        setTimeout(function() {
            const search = document.querySelector('.search-input');
            if (search) { return search.value = initialSearchQuery; }
        }
        , 1);
    }
    setTimeout(function() {
        const group = document.querySelector('.group');
        if (group) { return group.checked = convsettings.group; }
    });
    return null;
};

const inputSetValue = function(sel, val) {
    setTimeout(function() {
        const el = document.querySelector(sel);
        if (el !== null) { return el.value = val; }
    }
    , 1);
    return null;
};

module.exports = view(function(models) {
    const {viewstate, convsettings, entity, conv} = models;

    const editing = convsettings.id !== null;
    const conversation = conv[viewstate.selectedConv];

    return div({class: 'convadd'}, function() {
        if (editing) {
            h1(i18n.__('conversation.edit:Conversation edit'));
        } else {
            h1(i18n.__('conversation.new:New conversation'));
        }

        let style = {};
        if (!convsettings.group) {
            style = {display: 'none'};
        }

        div({class: 'input'}, {style}, () =>
            div(() =>
                input({
                    class: 'name-input',
                    style,
                    placeholder: i18n.__('conversation.name:Conversation name'),
                    onkeyup(e) {
                        return action('conversationname', e.currentTarget.value);
                    }
                })
            )
        );

        div({class: 'input'}, () =>
            div(() =>
                input({
                    class: 'search-input',
                    placeholder: i18n.__('conversation.search:Search people'),
                    onkeyup(e) {
                        chilledaction('searchentities', e.currentTarget.value, 7);
                        return action('conversationquery', e.currentTarget.value, 7);
                    }
                })
            )
        );

        div({class: 'input'}, () =>
            div(() =>
                p(function() {
                    const opts = {
                        type: 'checkbox',
                        class: 'group',
                        style: { width: 'auto', 'margin-right': '5px' },
                        onchange(e) { return action('togglegroup'); }
                    };
                    if (convsettings.selectedEntities.length !== 1) {
                        opts.disabled = 'disabled';
                    }
                    input(opts);
                    return i18n.__('conversation.multiuser:Create multiuser chat');
                })
            )
        );


        ul(function() {
            convsettings.selectedEntities.forEach(function(r) {
                const cid = __guard__(__guard__(r, x1 => x1.id), x => x.chat_id);
                return li({class: 'selected'}, function() {
                    drawAvatar(cid, viewstate, entity);
                    return p(nameof(r.properties));
                }
                , {onclick(e) { if (!editing) { return action('deselectentity', r); } }});
            });

            const selected_ids = (Array.from(convsettings.selectedEntities).map((c) => unique(c)));

            return convsettings.searchedEntities.forEach(function(r) {
                const cid = __guard__(__guard__(r, x1 => x1.id), x => x.chat_id);
                if (Array.from(selected_ids).includes(unique(r))) { return; }
                return li(function() {
                    drawAvatar(cid, viewstate, entity
                    , (__guard__(r.properties, x2 => x2.photo_url) != null ? __guard__(r.properties, x2 => x2.photo_url) : __guard__(entity[cid], x3 => x3.photo_url))
                    , (__guard__(__guard__(r.properties, x5 => x5.email), x4 => x4[0]) != null ? __guard__(__guard__(r.properties, x5 => x5.email), x4 => x4[0]) : __guard__(__guard__(entity[cid], x7 => x7.email), x6 => x6[0]))
                    , ((r.properties != null) ? initialsof(r.properties != null) : undefined));
                    return p(r.properties.display_name);
                }
                , {onclick(e) { return action('selectentity', r); }});
            });
        });

        if (editing) {
            div({class:'leave'}, function() {
                if (__guard__(__guard__(conversation, x1 => x1.type), x => x.indexOf('ONE_TO_ONE')) > 0) {
                    return div({class:'button'
                    , title: i18n.__('conversation.delete:Delete conversation')
                    , onclick:onclickaction('deleteconv')
                }, function() {
                        span({class:'material-icons'}, 'close');
                        return span(i18n.__('conversation.delete:Delete conversation'));
                    });
                } else {
                    return div({class:'button'
                    , title: i18n.__('conversation.leave:Leave conversation')
                    , onclick:onclickaction('leaveconv')
                }, function() {
                        span({class:'material-icons'}, 'close');
                        return span(i18n.__('conversation.leave:Leave conversation'));
                    });
                }
            });
        }

        div({class:'validate'}, function() {
            let disabled = null;
            if (convsettings.selectedEntities.length <= 0) {
                disabled =  {disabled: 'disabled'};
            }
            return div(disabled, { class:'button'
            , onclick:onclickaction('saveconversation')
        }, function() {
                span({class:'material-icons'}, 'done');
                return span(i18n.__("actions.ok:OK"));
            });
        });

        return mayRestoreInitialValues(models);
    });
});

var onclickaction = a => ev => action(a);

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}