var sys = require('sys');
var couchdb = require('node-couchdb/lib/couchdb');
var couchClient;
var trackedDatabases = {};

if (require.main == module) {
  // NB: we're executing, not being require()'ed
  start();
  // process.addListener('uncaughtException', function (err) {
  //   log('ERROR', err);
  // });
}

function ChangesListener(db, opts) {
  var that = this;
  that.changesEmitter = db.changesStream(opts);
  this.start = function(fun) {
    that.handlerFun = fun;
    that.changesEmitter.addListener('data', that.handlerFun);
  };
  this.stop = function() {
    that.changesEmitter.removeListener('data', that.handlerFun);
  };
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
        log('DEBUG', 'Found new database', dbName);
        var db = couchClient.db(dbName);
        trackedDatabases[dbName] = db;
        setupDDocListener(db);
        db.allDocs({
          startkey: "_design/",
          endkey: "_design0",
          include_docs: true
        }, function(err, resp) {
          if (err) throw err;
          db.clientListeners = {};
          resp.rows.forEach(function(row) {
            startClientListeners(db, row.doc);
          });
        });
      }
    });
    setTimeout(function() {
      log('DEBUG', 'Checking for new datbases');
      couchClient.allDbs(checkForNewDBs);
    }, 60 * 1000);
  }
}

function setupDDocListener(db) {
  db.info(function(err, info) {
    var updateSeq = info.update_seq;
    opts = { since: updateSeq };
    db.ddocListener = new ChangesListener(db, opts);
    db.ddocListener.start(function(change) {
      var docID = change.id;
      if (/^_design\//.test(docID)) {
        log('INFO', 'Design doc changed', docID);
        db.getDoc(docID, function(err, ddoc) {
          if (err) throw err;
          // stop existing client changes listeners for given ddoc
          db.clientListeners[docID].forEach(function(listener) {
            listener.stop();
          });
          startClientListeners(db, ddoc);
        });
      }
    });
  });
}

function startClientListeners(db, ddoc) {
  var listeners = [];
  if (ddoc.changes) {
    for (var handlerName in ddoc.changes) {
      var fullName = [db.name, ddoc._id, handlerName].join('/');
      log('DEBUG', 'Setting up changes handlers for ' + fullName);
      db.info(function(err, info) {
        // copy query options from the ddoc
        var ddocOpts = ddoc.changes[handlerName].query;
        var opts = {};
        for (var key in ddocOpts) { opts[key] = ddocOpts[key]; }
        opts.since = info.update_seq;
        log('INFO', "Changes handler started for " + fullName);
        var listener = new ChangesListener(db, opts);
        listener.start(compileHandler(handlerName, ddoc, db.name));
        listeners.push(listener);
      });
    }
  }
  db.clientListeners[ddoc._id] = listeners;
}

function compileHandler(name, ddoc, dbName) {
  var fullName = [dbName, ddoc._id, name].join('/');
  var clientLogFun = function(msg) { log('CLIENT', fullName, msg); };
  var handler = ddoc.changes[name];
  var code = handler.handler;
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
