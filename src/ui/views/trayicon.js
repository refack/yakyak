const { remote } = require('electron');
const { Tray } = remote;
const { Menu } = remote;
const path = require('path');
const os = require('os');
const i18n = require('i18n');

let trayIcons = null;

if (os.platform() === 'darwin') {
    trayIcons = {
        "read": path.join(__dirname, '..', '..', 'icons', 'osx-icon-read-Template.png'),
        "unread": path.join(__dirname, '..', '..', 'icons', 'osx-icon-unread-Template.png')
    };
} else {
    trayIcons = {
        "read": path.join(__dirname, '..', '..', 'icons', 'icon-read.png'),
        "unread": path.join(__dirname, '..', '..', 'icons', 'icon-unread.png')
    };
}
let tray = null;

// TODO: this is all WIP
const quit = function() {};

const compact = array => Array.from(array).filter((item) => item).map((item) => item);

const create = function() {
    tray = new Tray(trayIcons["read"]);
    tray.setToolTip(i18n.__('title:YakYak - Hangouts Client'));
    // Emitted when the tray icon is clicked
    return tray.on('click', () => action('togglewindow'));
};

const destroy = function() {
    if (tray) { tray.destroy(); }
    return tray = null;
};

const update = function(unreadCount, viewstate) {
    // update menu
    const templateContextMenu = compact([
        {
          label: i18n.__('menu.view.tray.toggle_minimize:Toggle minimize to tray'),
          click() { return action('togglewindow'); }
        },

        {
          label: i18n.__("menu.view.tray.start_minimize:Start minimized to tray"),
          type: "checkbox",
          checked: viewstate.startminimizedtotray,
          click() { return action('togglestartminimizedtotray'); }
        },

        {
          label: i18n.__('menu.view.notification.show:Show notifications'),
          type: "checkbox",
          checked: viewstate.showPopUpNotifications,
          // usage of already existing method and implements same logic
          //  as other toggle... methods
          click() { return action('showpopupnotifications',
              !viewstate.showPopUpNotifications); }
        },

        {
            label: i18n.__("menu.view.tray.close:Close to tray"),
            type: "checkbox",
            checked: viewstate.closetotray,
            click() { return action('toggleclosetotray'); }
        },

        os.platform() === 'darwin' ? {
          label: i18n.__('menu.view.hide_dock:Hide Dock icon'),
          type: 'checkbox',
          checked: viewstate.hidedockicon,
          click() { return action('togglehidedockicon'); }
        } : undefined,

        {
          label: i18n.__('menu.file.quit:Quit'),
          click() { return action('quit'); }
        }
    ]);

    const contextMenu = Menu.buildFromTemplate(templateContextMenu);
    tray.setContextMenu(contextMenu);

    // update icon
    try {
      if (unreadCount > 0) {
          return tray.setImage(trayIcons["unread"]);
      } else {
          return tray.setImage(trayIcons["read"]);
      }
    } catch (e) {
      return console.log('missing icons', e);
  }
};


module.exports = function({viewstate, conv}) {
    if (viewstate.showtray) {
      if (!tray) { create(); }
      return update(conv.unreadTotal(), viewstate);
    } else {
      if (tray) { return destroy(); }
  }
};
