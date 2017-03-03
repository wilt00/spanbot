const restify = require('restify');
const builder = require('botbuilder');
const request = require('request');
const querystring = require('querystring');
const xml = require('xml2js');
const util = require('util');

//=========================================================
// Translation Functions
//=========================================================

var token = new Object();
token.val = "";
token.time = 0;

const tenMinutes = 600000;

function timeForNewToken() {
    if(Date.now() - tenMinutes < token.time) {
        return false;
    }
    return true;
}

function getTokenPromise() {
    return new Promise( (resolve, reject) => {
        request.post({
            url: "https://api.cognitive.microsoft.com/sts/v1.0/issueToken",
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/jwt',
                'Ocp-Apim-Subscription-Key': '835912f739fc4f2a85fada8682f7c800'     // FIXME: DON'T PUBLISH THIS KEY
            }
        }, (error, response, body) => {
            if(error) {
                reject(new Error('Token update failed: ', error));
            }
            resolve({val: "Bearer " + body, time: Date.now()});
        });
    });
}


function setToken(newToken) {
    token = newToken;
    return Promise.resolve();
}


function getLanguage (input) {
    var inputShort;
    if (input.length > 100) {
        inputShort = querystring.escape(input.substring(0, 100));
    } else {
        inputShort = querystring.escape(input);
    }
    return new Promise( (resolve, reject) => {
        request.get({
            url: "https://api.microsofttranslator.com/v2/http.svc/Detect?text=" + inputShort,
            headers: {
                'Accept': 'application/xml',
                'Authorization': token.val
            }
        }, (error, response, body) => {
            if(error) {
                reject(new Error('Unable to identify language: ', error));
            }
            xml.parseString(body, {ignoreAttrs: true}, (err, result) => {
                if(err) {
                    console.log(body)
                    reject(new Error('Unable to parse xml response: ', err));
                }
                console.log("Language identification result:");
                console.log(util.inspect(result, {depth: null}));
                console.log("Using language: " + result.string);
                resolve(result.string);
            })
        });
    });
}


function translate (input, language) {
    return new Promise( (resolve, reject) => {
        var to;
        if(language === 'es') {
            to = 'en';
        } else if (language === 'en') {
            to = 'es';
        } else {
            reject(new Error (language + " is not recognized as a valid language"));
        }
        console.log("Translating from " + language + " to " + to);

        request.get({
            url: "https://api.microsofttranslator.com/v2/http.svc/Translate?text=" + querystring.escape(input) + "&from=" + language + "&to=" + to + "&contentType=text%2Fplain",
            headers: {
                'Accept': 'application/xml',
                'Authorization': token.val
            }
        }, (err, res, body) => {
            if(err) {
                reject(new Error('Unable to translate: ', err));
            }
            xml.parseString(body, {ignoreAttrs: true}, (err, result) => {
                if(err) {
                    console.log(body);
                    reject(new Error('Unable to parse xml response: ', err));
                }
                console.log("Translation result: ");
                console.log(util.inspect(result, {depth: null}));
                resolve(result.string);
            })
        });
    });
}


//=========================================================
// Bot Setup
//=========================================================

getTokenPromise().then(
    (response) => {
        token = response;
        console.log(token.val);
    },
    (error) => {
        console.log(error);
    }
);

// Setup Restify Server
var server = restify.createServer();
server.listen(process.env.port || process.env.PORT || 3978, function () {
   console.log('%s listening to %s', server.name, server.url);
});

// Create chat bot
var connector = new builder.ChatConnector({
    appId: process.env.MICROSOFT_APP_ID,
    appPassword: process.env.MICROSOFT_APP_PASSWORD
});
var bot = new builder.UniversalBot(connector);
server.post('/api/messages', connector.listen());

//=========================================================
// Bots Dialogs
//=========================================================

bot.dialog('/', (session) => {
    //var tokenPromise;
    if(timeForNewToken()) {
        /*tokenPromise = getTokenPromise()
                        .then( (newToken) => setToken(newToken),
                               (error) => {console.log(error);} );*/
        getTokenPromise()
        .then(getLanguage(session.message.text))
        .then(  (lang)   => translate(session.message.text, lang) )
        .then(  (output) => session.send(output) )
        .catch( (err)    => {
            console.log(err);
            /*
            if(lang === undefined) {
                session.send("I didn't understand what language you were speaking.");
            }
            */
        } );
    } else {
        //tokenPromise = Promise.resolve();   // Dummy promise that always resolves

        getLanguage(session.message.text)
        .then(  (lang)   => translate(session.message.text, lang) )
        .then(  (output) => session.send(output) )
        .catch( (err)    => console.log(err) );
    }

});