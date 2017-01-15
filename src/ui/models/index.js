
const entity     = require('./entity');
const conv       = require('./conv');
const viewstate  = require('./viewstate');
const userinput  = require('./userinput');
const connection = require('./connection');
const convsettings = require('./convsettings');
const notify     = require('./notify');

module.exports = {entity, conv, viewstate, userinput, connection, convsettings, notify};

__guard__(window, x => x.models = module.exports);

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}