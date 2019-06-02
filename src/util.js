const https = require("https");
const index = require("./index");

module.exports = {
    /**
     * Sends a HTTPS GET request. 
     * @param {String|URL} url 
     * @returns {Promise} Returns promise with resolve(response, http.IncomingMessage)
     */
    getHTTPS: function(url) {
        return new Promise((resolve, reject) => {
            let urlObj = new URL(url);
            let options = {
                host: urlObj.host,
                path: urlObj.pathname,
                headers: {
                    "User-Agent": "mangadex-full-api"
                }
            };
            options.headers["Cookie"] = "";
            if (index.agent.sessionId) options.headers["Cookie"] += "mangadex_session=" + index.agent.sessionId + "; ";
            if (index.agent.persistentId) options.headers["Cookie"] += "mangadex_rememberme_token=" + index.agent.persistentId + "; ";
            options.headers["Cookie"] += "mangadex_h_toggle=" + index.agent.hentaiSetting;

            https.get(options, (res) => {
                // Update current session token if new one is given.
                for (let i of res.headers["set-cookie"]) {
                    let m = (/mangadex_session=([^;]+);.+expires=([^;]+)/gmi).exec(i);
                    if (m && m.length >= 3) {
                        index.agent.sessionId = m[1];
                        index.agent.sessionExpiration = new Date(m[2]);
                        break;
                    }
                }

                res.url = url;
                let payload = "";

                if (res.statusCode == 503 || res.statusCode == 502 || res.statusCode == 403) reject(`MangaDex is currently in DDOS mitigation mode. (Status code ${res.statusCode})`);
                else if (res.statusCode >= 400) reject(`MangaDex is currently unavailable. (Status code ${res.statusCode})`);

                res.on('data', (data) => {
                    payload += data;
                });

                res.on('end', () => {
                    resolve(payload);
                });
            }).on('error', reject);
        });
    },
    /**
     * Sends a HTTPS GET request and parses JSON response
     * @param {String|URL} url 
     * @returns {Promise} Returns promise with resolve(response, http.IncomingMessage)
     */
    getJSON: function(url) {
        return new Promise((resolve, reject) => {
            module.exports.getHTTPS(url).then(payload => {
                try {
                    let obj = JSON.parse(payload);
                    resolve(obj);
                } catch (err) {
                    reject(err);
                }
            }).catch(reject);
        });
    },
    /**
     * Sends a HTTPS GET request, iterates through regex, and returns any capture goups in an object 
     * with the same keys as regex. Multiple groups or matches return as an array
     * @param {String|URL} url 
     * @param {RegExp} regex 
     * @returns {Promise} Returns promise with resolve(response, http.IncomingMessage)
     */
    getMatches: function(url, regex) {
        return new Promise((resolve, reject) => {
            module.exports.getHTTPS(url).then(body => {
                let payload = {};
                let m;
                for (let i in regex) { // For each regular expression...
                    while ((m = regex[i].exec(body)) != null) { // Look for matches...
                        if (!payload[i]) payload[i] = []; // Create an empty array if needed
                        if (m.length > 1) for (let a of m.slice(1)) payload[i].push(a); // If the regex includes groups
                        else payload[i].push(m[0]); // If the regex does not
                    }
                    if (payload[i] && payload[i].length == 1) payload[i] = payload[i][0]; // Convert to string if the only element
                }
                resolve(payload);
            }).catch(reject);
        });
    },
    /**
     * Performs modified getMatch() call that returns an array of IDs
     * @param {String|URL} url Base quicksearch URL
     * @param {String} query Query like a name
     * @param {RegExp} regex 
     * @returns {Promise} Returns promise with resolve(response, http.IncomingMessage)
     */
    quickSearch: function(query, regex) {
        let url = "https://mangadex.org/quick_search/";
        return new Promise((resolve, reject) => {
            module.exports.getMatches(url + encodeURIComponent(query), {
                "results": regex,
                "error": /Certain features disabled for guests during DDoS mitigation/gmi
            }).then(matches => {
                if (matches.error != undefined) reject("MangaDex is in DDOS mitigation mode. No search available. Using agent?");

                if (!matches.results) matches.results = [];
                if (!(matches.results instanceof Array)) matches.results = [matches.results];
                matches.results.forEach((e, i, a)=> {a[i] = parseInt(e)});
                resolve(matches.results);
            }).catch(reject);
        });
    },
    /**
     * Returns a random string following the mfa[0-1000] pattern
     */
    generateMultipartBoundary: function() {
        return "mfa" + Math.floor(Math.random() * 1000).toString();
    },
    /**
     * Returns multipart payload for POST requests
     * @param {String} boundary Any String
     * @param {Object} obj Name-Content Key-Value Pairs
     */
    generateMultipartPayload: function(boundary, obj) {
        payload = "";
        for (let i in obj) {
            payload +=  `--${boundary}\n` +
                        `Content-Disposition: form-data; name="${i}"\n` +
                        `\n` +
                        `${obj[i]}\n`;
        }
        payload += `--${boundary}--`;
        return payload;
    }
}