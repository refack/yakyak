const path = require('path');

const {later} = require('../util');

module.exports = view(function(models) {
    const {connection, viewstate} = models;
    const classList = ['connecting'];
    if (viewstate.loadedContacts) {
        classList.push('hide');
    }

    return div({class: classList.join(' ')
    , onDOMNodeInserted(e) {
        const ta = e.target;
        return ta.addEventListener('transitionend', () => action('remove_startup')
        , false);
    }
}
    , () =>
        div(function() {
            div(() => img({src: path.join(YAKYAK_ROOT_DIR, '..', 'icons', 'icon@32.png')}));
            div(() =>
                span({class: 'text state_connecting'}, function() {
                    if (connection.state === connection.CONNECTING) {
                        return i18n.__('connection.connecting:Connecting');
                    } else if (connection.state === connection.CONNECT_FAILED) {
                        return i18n.__('connection.connecting:Not Connected (check connection)');
                    } else {
                        // connection.CONNECTED
                        return i18n.__('connection.connecting:Loading contacts');
                    }
                })
            );
            return div({class: 'spinner'}, function() {
                div({class: 'bounce1'}, '');
                div({class: 'bounce2'}, '');
                return div({class: 'bounce3'}, '');
            });
        })
    );
});
