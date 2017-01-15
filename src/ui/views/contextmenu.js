const { remote }      = require('electron');
const { clipboard }   = require('electron');
// {download}  = require('electron-dl') # See IMPORTANT below
const ContextMenu = remote.Menu;

const {isContentPasteable} = require('../util');

const templateContext = function(params, viewstate) {
    //
    //          IMPORTANT: currently save images is disabled as there
    //            are exceptions being thrown from the electron-dl module
    //
    const canShowSaveImg = (params.mediaType === 'image') && false;
    const canShowCopyImgLink = (params.mediaType === 'image') && (params.srcURL !== '');
    const canShowCopyLink = (params.linkURL !== '') && (params.mediaType === 'none');
    //
    return [{
        label: 'Save Image',
        visible: canShowSaveImg,
        click(item, win) {
            try {
                return download(win, params.srcURL);
            } catch (error) {
                return console.log('Possible problem with saving image. ', err);
            }
        }
    },
    canShowSaveImg ? { type: 'separator' } : undefined,
    {
        label: i18n.__('menu.edit.undo:Undo'),
        role: 'undo',
        enabled: params.editFlags.canUndo,
        visible: true
    },
    {
        label: i18n.__('menu.edit.redo:Redo'),
        role: 'redo',
        enabled: params.editFlags.canRedo,
        visible: true
    },
    { type: 'separator' },
    {
        label: i18n.__('menu.edit.cut:Cut'),
        role: 'cut',
        enabled: params.editFlags.canCut,
        visible: true
    },
    {
        label: i18n.__('menu.edit.copy:Copy'),
        role: 'copy',
        enabled: params.editFlags.canCopy,
        visible: true
    },
    {
        label: i18n.__('menu.edit.copy_link:Copy Link'),
        visible: canShowCopyLink,
        click() {
            if (process.platform === 'darwin') {
                return clipboard.writeBookmark(params.linkText, params.linkText);
            } else {
                return clipboard.writeText(params.linkText);
            }
        }
    },
    {
        label: i18n.__('menu.edit.copy_image_link:Copy Image Link'),
        visible: canShowCopyImgLink,
        click(item, win) {
            if (process.platform === 'darwin') {
                return clipboard.writeBookmark(params.srcURL, params.srcURL);
            } else {
                return clipboard.writeText(params.srcURL);
            }
        }
    },
    {
        label: i18n.__('menu.edit.paste:Paste'),
        role: 'paste',
        visible: (isContentPasteable() &&
            (viewstate.state === viewstate.STATE_NORMAL)) || params.isEditable
    }].filter(n => n !== undefined);
};

module.exports = (e, viewstate) => ContextMenu.buildFromTemplate(templateContext(e, viewstate));
