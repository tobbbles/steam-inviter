// Define all our included variables
var steam       = require('steam'),
    winston     = require('winston'),
    readline    = require('readline'),
    request     = require('request'),
    fs          = require('fs'),
    express     = require('express'),
    cheerio     = require('cheerio'),
    express     = require('express'),
    path        = require('path'),
    morgan      = require('morgan'),
    bodyParser  = require('body-parser'),
    session     = require('express-session')

                  require('steam-groups')(steam)

var app = express();

var username, password, code
var loggedOn = 0
// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'jade');

// uncomment after placing your favicon in /public
//app.use(favicon(__dirname + '/public/favicon.ico'));
app.use(express.static(path.join(__dirname, 'public')))
app.use(bodyParser.json())       // to support JSON-encoded bodies
app.use(bodyParser.urlencoded({     // to support URL-encoded bodies
  extended: true
}))
app.use(session({
  secret: 'keyboard cat',
  resave: true,
  saveUninitialized: false
  })); // session middleware
app.use(require('flash')());


// Setup readline to read from console.  This is used for Steam Guard codes.
var rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
})

// Setup logging to file and console
var logger = new (winston.Logger)({
        transports: [
            new (winston.transports.Console)({
                colorize: true,
                level: 'debug'
            }),
            new (winston.transports.File)({
                level: 'info',
                timestamp: true,
                filename: 'cratedump.log',
                json: false
            })
        ]
})

// Initialize the Steam client and our trading library
var client = new steam.SteamClient()

// Our library has a list of Steam servers in case one isn't provided.
// You can define them if you want to make sure they're accurate
// Just make sure to keep them up to date or you could run into issues.

// We can provide a sentry file for Steam Guard when we login to avoid
// having to enter a code each time.  If we have one saved to file, use it.
var sentryfile
if(fs.existsSync('sentryfile.' + username + '.hash')) {
    sentryfile = fs.readFileSync('sentryfile.' + username + '.hash')
}

// Now we can finally start doing stuff!  Let's try logging in.
function logOn(username, password, code) {
  client.logOn({
      accountName: username,
      password: password,
      authCode: code,
      shaSentryfile: sentryfile // If null, a new Steam Guard code will be requested
  })
  loggedOn = 1
}

// If Steam returns an error the "error" event is emitted.
// We can deal with some of them.
// See docs on Event Emitter to understand how this works:
// http://nodejs.org/api/events.html

client.on('error', function(e) {
    // Error code for invalid Steam Guard code
    if (e.eresult == steam.EResult.AccountLogonDenied) {
        // Prompt the user for Steam Gaurd code
        rl.question('Steam Guard Code: ', function(code) {
            // Try logging on again
            client.logOn({
                accountName: username,
                password: password,
                authCode: code
            })
        })
    } else { // For simplicity, we'll just log anything else.
        // A list of ENUMs can be found here:
        // https://github.com/SteamRE/SteamKit/blob/d0114b0cc8779dff915c4d62e0952cbe32202289/Resources/SteamLanguage/eresult.steamd
        logger.error('Steam Error: ' + e.eresult)
        // Note: Sometimes Steam returns InvalidPassword (5) for valid passwords.
        // Simply trying again solves the problem a lot of the time.
    }
})
// If we just entered a Steam Guard code, the "sentry" event goes off
// with our new hash.
client.on('sentry', function(sentry) {
    logger.info('Got new sentry file hash from Steam.  Saving.')
    fs.writeFile('sentryfile.' + username + '.hash', sentry)
})

// After successful login...
client.on('loggedOn', function() {
    logger.info('Logged on to Steam')
    loggedOn = 1
    // Optional: Rename the bot on login.
    //client.setPersonaName("Madman.")
    // Make sure we're not displaying as online until we're ready
    client.setPersonaState(steam.EPersonaState.Online)
})

/* At this point, you should be logged into Steam but appear offline.
 * We haven't logged into the web API yet to do any trading.
 * Steam hands us a session ID before we can use the API.
 * Additionally, our Trade library requires the session ID and cookie,
 * so we have to wait for the following event to be emitted.
*/
client.on('webSessionID', function(sessionid) {
    //trade.sessionID = sessionid // Share the session between libraries
    client.webLogOn(function(cookie) {
        cookie.forEach(function(part) { // Share the cookie between libraries
            //trade.setCookie(part.trim()) // Now we can trade!
        })
        logger.info('Logged into web')
        // No longer appear offline

        client.setPersonaState(steam.EPersonaState.Online)
        //client.setPersonaName('NerdPing | Zeus')
        //inviteToNerdping('76561197976771998')
    })
})

function inviteToNerdping(steamid) {
  client.groupInvite('103582791436565054', steamid)
  console.log('Invited ' + steamid);
}

var steamids = []
var groupsteamids = []

app.post('/invitefriends', function(req, res) {
    request('https://steamcommunity.com/id/' + req.body.id + "/friends/?xml=1", function (error, response, body){
      if(!error && response.statusCode == 200) {
        $ = cheerio.load(body, { xmlMode: true });
        $('friend').each(function (i, element) {
          inviteToNerdping($(this).text())
        })
      }
      req.flash('info', 'Successfully invited from friends list.')
      res.redirect('/dashboard')
    })
})
app.post('/invitegroup', function(req, res) {
    request('https://steamcommunity.com/groups/' + req.body.id + '/memberslistxml?xml=1', function (error, response, body) {
      if(!error && response.statusCode == 200) {
        $ = cheerio.load(body, { xmlMode: true });
        $('steamID64').each(function (i, element) {
          inviteToNerdping($(this).text())
        })
      }
      req.flash('info', 'Successfully invited from group members list.')
      res.redirect('/dashboard')
    })
})


app.get('/', function (req, res) {
  if (loggedOn != 0) {
    res.redirect('/dashboard')
  } else {
    res.render('index')
  }
})
app.post('/', function (req, res) {
  username = req.body.username
  password = req.body.password
  console.log("Username: " + username + ", password: ");
  logOn(username, password)

  client.on('error', function (e) {
    if (e.eresult == steam.EResult.AccountLogonDenied) {
        res.render('steamguard')
    }
  })
})
app.post('/steamguard', function (req, res) {
  code = req.body.steamguard
  logOn(username, password, code)
  res.redirect('/dashboard')
})
app.post('/logoff', function (req, res) {
  loggedOn = 0
  client.logOff()
  logger.info('Logged off')
  res.redirect('/')
})

app.get('/dashboard', function(req, res) {
  if (loggedOn != 1) {
    res.redirect('/')
  } else {
    res.render('dashboard')
  }
})

module.exports = app;
