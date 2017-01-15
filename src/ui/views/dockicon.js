const { app } = require('electron').remote.require('electron');

// calling show multiple times makes the osx app flash
// therefore we remember here if the dock is already shown
// and we avoid re-calling app.dock.show() multiple times
let dockAlreadyVisible = true;

module.exports = function(viewstate) {
  if (require('os').platform() !== 'darwin') { return; }

  if (viewstate.hidedockicon && (dockAlreadyVisible === true)) {
    console.log('hiding dock');
    app.dock.hide();
    dockAlreadyVisible = false;
  }

  if (!viewstate.hidedockicon && (dockAlreadyVisible === false)) {
    console.log('showing dock');
    app.dock.show();
    return dockAlreadyVisible = true;
  }
};
