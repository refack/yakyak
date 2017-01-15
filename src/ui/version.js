
const request = require('request');

const options = {
    headers: {
      'User-Agent': 'request'
  },
    url: 'https://api.github.com/repos/yakyak/yakyak/releases/latest'
};

const versionToInt = function(version) {
    const [major, minor, micro] = version.split('.');
    return version = ((micro * 10)^3) + ((minor * 10)^6) + ((major * 10)^9);
};

const check = ()=>
    request.get(options,  function(err, res, body) {
        if (err) { return console.log(err); }
        body = JSON.parse(body);
        const tag = body.tag_name;
        const releasedVersion = __guard__(tag, x => x.substr(1)); // remove first "v" char
        const localVersion = require('electron').remote.require('electron').app.getVersion();
        const versionAdvertised = window.localStorage.versionAdvertised || null;
        if ((releasedVersion != null) && (localVersion != null)) {
            const higherVersionAvailable = versionToInt(releasedVersion) > versionToInt(localVersion);
            if (higherVersionAvailable && (releasedVersion !== versionAdvertised)) {
                window.localStorage.versionAdvertised = releasedVersion;
                return alert(`A new yakyak version is available, please upgrade ${localVersion} to ${releasedVersion}`);
            } else {
                return console.log(`YakYak local version is ${localVersion}, released version is ${releasedVersion}`);
            }
        }
    })
;

module.exports = {check, versionToInt};

function __guard__(value, transform) {
  return (typeof value !== 'undefined' && value !== null) ? transform(value) : undefined;
}