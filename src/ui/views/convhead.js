const {nameofconv}  = require('../util');

const onclickaction = a => ev => action(a);

module.exports = view(function(models) {
  const {conv, viewstate} = models;
  const conv_id = __guard__(viewstate, x => x.selectedConv);
  const c = conv[conv_id];
  return div({class:'headwrap'}, function() {
    if (!c) { return; } // region cannot take undefined
    const name = nameofconv(c);
    span({class:'name'}, function() {
      if (conv.isQuiet(c)) {
            span({class:'material-icons'}, 'notifications_off');
        }
      if (conv.isStarred(c)) {
        span({class:'material-icons'}, "star");
    }
      return name;
    });
    div({class:'button'
    , title: i18n.__('conversation.options:Conversation Options')
    , onclick:convoptions
}, () => span({class:'material-icons'}, 'more_vert'));
    return div({class:'convoptions'
    , title:i18n.__('conversation.settings:Conversation settings')
}, function() {
        div({class:'button'
        , title: i18n.__('menu.view.notification.toggle:Toggle notifications')
        , onclick:onclickaction('togglenotif')
    }
        , function() {
            if (conv.isQuiet(c)) {
                span({class:'material-icons'}, 'notifications_off');
            } else {
                span({class:'material-icons'}, 'notifications');
            }
            return div({class:'option-label'}, i18n.__n('notification:Notification', 1));
        });
        div({class:'button'
        , title:i18n.__('favorite.star_it:Star / unstar')
        , onclick:onclickaction('togglestar')
    }
        , function() {
            if (!conv.isStarred(c)) {
                span({class:'material-icons'}, 'star_border');
            } else {
                span({class:'material-icons'}, 'star');
            }
            return div({class:'option-label'}, i18n.__n('favorite.title:Favorite',1));
        });
        return div({class:'button'
        , title:i18n.__('settings:Settings')
        , onclick:onclickaction('convsettings')
    }
        , function() {
            span({class:'material-icons'}, 'info_outline');
            return div({class:'option-label'}, i18n.__('details:Details'));
        });
    });
  });
});

var convoptions  = function() {
  const {viewstate} = models;
  document.querySelector('.convoptions').classList.toggle('open');
  if (viewstate.state === viewstate.STATE_ADD_CONVERSATION) {
    return action('saveconversation');
}
};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}