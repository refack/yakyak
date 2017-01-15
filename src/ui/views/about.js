const ipc  = require('electron').ipcRenderer;
const path = require('path');
const i18n = require('i18n');
const { remote } = require('electron');
const { Menu }   = remote;

const {check, versionToInt} = require('../version');

module.exports = view(function(models) {

    // simple context menu that can only copy
    remote.getCurrentWindow().webContents.on('context-menu', function(e, params) {
        e.preventDefault();
        const menuTemplate = [{
            label: 'Copy',
            role: 'copy',
            enabled: params.editFlags.canCopy
        },
        {
            label: "Copy Link",
            visible: (params.linkURL !== '') && (params.mediaType === 'none'),
            click() {
                if (process.platform === 'darwin') {
                    return clipboard
                    .writeBookmark(params.linkText, params.linkText);
                } else {
                    return clipboard.writeText(params.linkText);
                }
            }
        }];
        return Menu.buildFromTemplate(menuTemplate).popup(remote.getCurrentWindow());
    });

    //
    // decide if should update
    const localVersion    = remote.require('electron').app.getVersion();
    const releasedVersion = window.localStorage.versionAdvertised;
    const shouldUpdate    = (releasedVersion != null) && (localVersion != null) &&
                      (versionToInt(releasedVersion) > versionToInt(localVersion));
    //
    return div({class: 'about'}, function() {
        div(() => img({src: path.join(YAKYAK_ROOT_DIR, '..', 'icons', 'icon@8.png')}));
        div({class: 'name'}, () =>
            h2(function() {
                span(`YakYak v${localVersion}`);
                if (!shouldUpdate) { return span({class: 'f-small f-no-bold'}, ' (latest)'); }
            })
        );
        // TODO: if objects are undefined then it should check again on next
        //        time about window is opened
        //        releasedVersion = window.localStorage.versionAdvertised
        if (shouldUpdate) {
            div({class: 'update'}, () =>
                span(i18n.__('menu.help.about.newer:A newer version is available, please upgrade from %s to %s'
                             , localVersion
                             , releasedVersion)
                )
            );
        }
        div({class: 'description'}, () => span(i18n.__('title:YakYak - Hangouts Client')));
        div({class: 'license'}, () =>
            span(function() {
                em(`${i18n.__('menu.help.about.license:License')}: `);
                return span('MIT');
            })
        );
        div({class: 'devs'}, function() {
            div(function() {
                h3(i18n.__('menu.help.about.authors:Main authors'));
                return ul(function() {
                    li('Davide Bertola');
                    return li('Martin Algesten');
                });
            });
            return div(function() {
                h3(i18n.__('menu.help.about.contributors:Contributors'));
                return ul(function() {
                    li('David Banham');
                    li('Max Kueng');
                    li('Arnaud Riu');
                    li('Austin Guevara');
                    return li('André Veríssimo');
                });
            });
        });
        return div({class: 'home'}, function() {
            const href = "https://github.com/yakyak/yakyak";
            return a({href
            , onclick(ev) {
                ev.preventDefault();
                const address = ev.currentTarget.getAttribute('href');
                require('electron').shell.openExternal(address);
                return false;
            }
        }
            , href);
        });
    });
});

//$('document').on 'click', '.link-out', (ev)->
//
