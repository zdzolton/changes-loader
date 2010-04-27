changes-loader
===
Store CouchDB _changes handlers in your design docs and have Node.JS execute them.

Setup dependencies
---
You'll need felixge's node-couchdb library:

    mkdir -p ~/.node_libraries/
    git clone git://github.com/felixge/node-couchdb.git ~/.node_libraries/node-couchdb

Run the changes-loader.js script
---
Keep the changes-loader.js script running:

    node /path/to/changes-loader.js [COUCHDB_ROOT_URL]

This script looks through all databases for any design docs with _changes handlers code
to be loaded and run. New databases will be detected every 60 seconds.

The `COUCHDB_ROOT_URL` argument defaults to http://localhost:5984

(TODO: include example Upstart and launchd scripts)

Define _changes handlers
---
Each design document can define any number of _changes handlers by having a property
off the root of the object called "changes":

    {
      "views": { ... },
      "lists": { ... },
      "changes": {
        "foo": function(change) {
          // Respond to changes here...
        },
        "bar": function(change) {
          // Do other stuff here...
        }
      }
    }

Note that in this example "foo" and "bar" are the names of two different changes
handlers defined by this design document.

Changes handler context
---

From your _changes handler, you'll have access to the following objects:

  * db — the database that host the loaded changes function (from felixge's node-couchdb)
  * ddoc — the design document that hosts the loaded changes function
  * log(msg) — this will show up in the stdout of the changes-loader.js script
  * require(moduleID) — load CommonJS modules, as follows:
    * if the moduleID begins with ./ or ../ load a module from the design document
    * otherwise Node.JS will load the module from its require() paths

Node.JS compatibility
---
This code has been known to work with version 0.1.91 of Node. As always, YMMV (^_-)

