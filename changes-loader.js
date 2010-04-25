var sys = require('sys');
var couchdb = require('node-couchdb/lib/couchdb');
var couchClient;
var trackedDatabases = {};

if (require.main == module) {
  // NB: we're executing, not being require()'ed
  start();
  process.addListener('uncaughtException', function (err) {
    log('ERROR', err);
  });
}

function start() {
  log('INFO', 'Starting changes loader');
  couchClient = getClientFromArgs(process.argv);
  log('DEBUG', couchClient.host, couchClient.port);
  couchClient.allDbs(checkForNewDBs);
}

function checkForNewDBs(err, dbNames) {
  log('DEBUG', 'Received DB names', dbNames);
  if (err) {
    throw err;
  } else {
    dbNames.forEach(function(dbName) {
      if (!trackedDatabases[dbName]) {
        trackNewDB(dbName);
      } else {
        log('DEBUG', 'Database already tracked', dbName);
      }
    });
    setTimeout(function() {
      log('DEBUG', 'Checking for new datbases');
      couchClient.allDbs(checkForNewDBs);
    }, 60 * 1000);
  }
}

function trackNewDB(dbName) {
  log('DEBUG', 'Found new database', dbName);
  var db = couchClient.db(dbName);
  trackedDatabases[dbName] = db;
  setupDBListener(db);
  db.allDocs({
    startkey: "_design/",
    endkey: "_design0",
    include_docs: true
  }, function(err, resp) {
    if (err) throw err;
    resp.rows.forEach(function(row) {
      createClientHandlers(db, row.doc);
    });
  });
}

function setupDBListener(db) {
  db.clientHandlers = {};
  db.info(function(err, info) {
    var opts = { since: info.update_seq };
    log('DEBUG', 'Listening to changes on', db.name);
    db.changesStream(opts).addListener('data', function(change) {
      var docID = change.id;
      if (/^_design\//.test(docID)) {
        log('INFO', 'Design doc changed', docID);
        db.getDoc(docID, function(err, ddoc) {
          if (err) throw err;
          createClientHandlers(db, ddoc);
        });
      } else {
        Object.keys(db.clientHandlers).forEach(function(ddocName) {
          db.clientHandlers[ddocName].forEach(function(handlerFun) {
            handlerFun(change);
          });
        });
      }
    });
  });
}

function createClientHandlers(db, ddoc) {
  var handlers = [];
  if (ddoc.changes) {
    Object.keys(ddoc.changes).forEach(function(handlerName) {
      var fullName = [db.name, ddoc._id, handlerName].join('/');
      log('DEBUG', 'Setting up changes handler for ' + fullName);
      handlers.push(compileHandler(handlerName, ddoc, db.name));
    });
  }
  db.clientHandlers[ddoc._id] = handlers;
}

function compileHandler(name, ddoc, dbName) {
  var fullName = [dbName, ddoc._id, name].join('/');
  var clientLogFun = function(msg) { log('CLIENT', fullName, msg); };
  var code = ddoc.changes[name];
  var context = { ddoc: ddoc, require: require, log: clientLogFun };
  var fun = process.evalcx(
    '(' + code  + ');', 
    context, 
    fullName
  );
  if (typeof fun !== 'function') {
    throw fullName + ' does not evaluate to a function';
  }
  return function(change) {
    log('DEBUG', "Handler called - " + fullName);
    try {
      fun(change);
    } catch (err) {
      log('ERROR', fullName, err);
    }
  };
}

function log() {
  var args = Array.prototype.slice.apply(arguments);
  var level = args.shift();
  sys.puts(level + ": " + sys.inspect(args, false, 10));
}

function getClientFromArgs(args) {
  var databaseURL = args[args.length - 1];
  var urlParts = require('url').parse(databaseURL);
  return couchdb.createClient(urlParts.port, urlParts.hostname);
}
