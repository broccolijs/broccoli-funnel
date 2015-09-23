'use strict';
var Tree = require('./tree');
var byRelativePath = require('./util').byRelativePath;

function EntryTree(entries, path, isNew) {
  var files = entries.map(byRelativePath);
  Tree.call(this, files, path, isNew);
}
EntryTree.prototype = Object.create(Tree.prototype);
EntryTree.prototype.constructor = EntryTree;

module.exports = EntryTree;