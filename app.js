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
// const tenMinutes = 1000;      // For testing

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
                'Ocp-Apim-Subscription-Key': process.env.OCP_APIM_SUBSCRIPTION_KEY
            }
        }, (error, response, body) => {
            if(error) {
                reject(new Error('Token update failed: ', error));
            }
            resolve({val: "Bearer " + body, time: Date.now()});
        });
    });
}

function updateTokenIfTime() {
    if (timeForNewToken()) {
        return getTokenPromise().then( (newToken) => {
            token = newToken;
            console.log("Token updated: " + newToken.val);
        });
    }
    else {
        return Promise.resolve();
    }
}

function getLanguage (session) {
    const input = session.message.text;
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


function translate (session, language) {
    const input = session.message.text;
    return new Promise( (resolve, reject) => {
        var to;
        if(language === 'es') {
            to = 'en';
        } else if (language === 'en') {
            to = 'es';
        } else {
            to = 'en';
            session.send("(I wasn't sure what language you were speaking just now, so I'm going to try translating your message into English)");
            //reject(new Error (language + " is not recognized as a valid language"));
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
                session.send("Sorry, I can't do any translation right now!");
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


function cleanAtMention(input) {
    const index = input.search("<at>Spanbot</at>");
    // TODO: Remove awkward "Spanbot" from translation text
    // https://msdn.microsoft.com/en-us/microsoft-teams/botsconversation
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
    updateTokenIfTime()
    .then(  ()       => getLanguage(session))
    .then(  (lang)   => translate(session, lang) )
    .then(  (output) => session.send(output) )
    .catch( (err)    => {
        console.log(err);
        /*
        if(lang === undefined) {
            session.send("I didn't understand what language you were speaking.");
        }
        */
    });

});