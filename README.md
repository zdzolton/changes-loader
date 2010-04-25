changes-loader
===
Store CouchDB _changes handlers in your design docs and have Node.JS take care of the rest!

Setup dependencies
---
You'll need felixge's node-couchdb library:

    mkdir -p ~/.node_libraries/
    git clone git://github.com/felixge/node-couchdb.git ~/.node_libraries/node-couchdb

Usage
---
Keep the changes-loader.js script running:

  node /path/to/changes-loader.js COUCHDB_ROOT_URL

This script looks thru all databases for any design docs with _changes handlers code to be
loaded and run. New databases will be detected every 60 seconds.

(TODO: include example Upstart and launchd scripts)

Now, in your CouchApp directory, make a subdirectory called "changes". Inside of the
changes directory you can place one or more .JS scripts to be run against the given
database's _changes stream.

Each file should consist of function, such as the following:

    function(change) {
      // Respond to the changes here...
    }

From your _changes handler, you'll have access to the following objects:

  * ddoc
  * log(msg)
  * require(module)
