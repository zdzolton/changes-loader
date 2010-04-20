var sys = require('sys');
var couchdb = require('node-couchdb/lib/couchdb');
var couchClient;

function log() {
  var args = Array.prototype.slice.apply(arguments);
  var level = args.shift();
  sys.puts(level + ": " + sys.inspect(args));
}

function getClientFromArgs(args) {
  var databaseURL = args[args.length - 1];
  var urlParts = require('url').parse(databaseURL);
  return couchdb.createClient(urlParts.port, urlParts.hostname);
}

function compileHandler(name, ddoc, dbName) {
  var handler = ddoc.changes[name];
  var code = handler.handler;
  log('DEBUG', code);
  var requireFun = function(module) {
    if (/^\.\//.test(module)) {
      var val = ddoc;
      var pathParts = module.split('/');
      pathParts.shift();
      pathParts.forEach(function(part) {
        val = val[part];
      });
      return val;
    } else {
      return require(module);
    }
  };
  var fullName = [dbName, ddoc._id, name];
  var fun = process.evalcx(
    '(' + code  + ');', 
    { require: requireFun }, 
    fullName.concat('js').join('.')
  );
  if (typeof fun !== 'function') {
    log('ERROR', fullName.join('/') + ' does not evaluate to a function');
    // TODO: somehow catch error...
  }
  return function(change) {
    // EventEmitter.addListener() doesn't work with evaled functions
    log('DEBUG', "Handler called - " + fullName.join('/'));
    fun(change); 
  };
}

function setupChangesHandler(name, ddoc, dbName) {
  log('DEBUG', name, ddoc, dbName);
  var handlerFun = compileHandler(name, ddoc, dbName);
  // copy query options from the ddoc
  var ddocOpts = ddoc.changes[name].query;
  var opts = {};
  for (var key in ddocOpts) { opts[key] = ddocOpts[key]; }
  log('DEBUG', handlerFun, opts)
  couchClient.db(dbName).changesStream(opts).addListener('data', handlerFun);
}

function startHandlers(dbNames) {
  log('DEBUG', dbNames);
  dbNames.forEach(function(dbName) {
    var db = couchClient.db(dbName);
    db.allDocs({ 
      startkey: "_design/", 
      endkey: "_design0", 
      include_docs: true 
    }, function(err, resp) {
      log('DEBUG', resp);
      resp.rows.forEach(function(row) {
        var ddoc = row.doc;
        for (var key in (ddoc.changes || [])) {
          setupChangesHandler(key, ddoc, dbName);
        }
      });
    });
  });
}

function start() {
  log('INFO', 'starting');
  couchClient = getClientFromArgs(process.argv);
  log('DEBUG', couchClient);
  couchClient.allDbs(function(err, dbNames) {
    if (err) {
      log('ERROR', err);
    } else {
      startHandlers(dbNames);
    }
  });
}

if (require.main == module) {
  // NB: we're executing, not being require()'ed
  start();
}
