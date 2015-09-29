'use strict';

/* global Set:true */

var Set = require('fast-ordered-set');
var Entries = require('./entries');
var util = require('./util');
var Tree = require('./tree');
var EntryTree = require('./entry-tree');
var byRelativePath = util.byRelativePath;

module.exports = FSTree;

function createEntriesMap(entries) {
  var _ret = {};

  entries.forEach(function(entry) {
    _ret[entry.relativePath] = entry;
  });

  return _ret;
}

function toChangeOp(change) {
  return ['change', change.relativePath];
}

function FSTree(options) {
  options = options || {};

  this.files = new Set((options.files || []).slice());
  this.entriesMap = createEntriesMap(options.entries || []);
  this.entries = options.entries;
}

Object.defineProperty(FSTree.prototype, 'size', {
  get: function() {
    return this.files.size;
  }
});

FSTree.prototype.forEach = function (fn, context) {
  this.files.forEach(fn, context);
};

FSTree.prototype.calculatePatch = function (_files) {
  var createOps, removeOps, changeOps, tree;
  if (this.entries) {
    var _entries = _files;
    tree = new EntryTree(this.entries);
    var entries = new Entries(this.entries);

    var removals = entries.remove(_entries);
    var additions = entries.add(_entries);
    var updates = entries.update(_entries);

    tree.addFiles(additions.map(byRelativePath));
    tree.removeFiles(removals.map(byRelativePath));

    removeOps = tree.postOrderDepthReducer(reduceRemovals, []);
    createOps = tree.preOrderDepthReducer(reduceAdditions, []);
    changeOps = updates.map(toChangeOp);

    this.entries = _entries;
    
    return removeOps.concat(createOps, changeOps);

  } else {

    // TODO: algorithimic complexity here isn't ideal. Future work can reduce
    // that cost. Today, the FS IO operations outweigh the cost, even with a
    // naive implementation
    tree = new Tree(this.files.values);

    var files = _files instanceof this.constructor ? _files.files : new Set(_files);

    var filesToRemove = this.files.subtract(files).values;
    var filesToAdd = files.subtract(this.files).values;

    // TODO: removeFiles should be combined with the postOrderDepthReducer and return removeOps
    tree.removeFiles(filesToRemove);
    removeOps = tree.postOrderDepthReducer(reduceRemovals, []);

    // TODO: addFiles should be combined with th  preOrderDepthReducer and return removeOps
    tree.addFiles(filesToAdd);
    createOps = tree.preOrderDepthReducer(reduceAdditions, []);

    var changes = findChanges(this.files, files).map(function(change) {
      return ['change', change];
    });

    return removeOps.concat(createOps).concat(changes);
  }
};

function findChanges(previousFiles, nextFiles) {
  var a = previousFiles.intersection(nextFiles).values;
  var b = nextFiles.intersection(previousFiles).values;

  if (a.length !== b.length) {
    throw new Error('EWUT');
  }

  var changes = [];
  for (var i = 0; i < a.length; i++) {
    // TODO: just to ensure expectations, but this will change when we
    // introduce complex types
    if (a[i] !== b[i]) {
      throw new Error('EWUT');
    }
    if (needsUpdate(a[i], b[i])) {
      changes.push(b);
    }
  }

  return changes;
}

function needsUpdate(before, after) {
  return false;
}

function reduceAdditions(tree, acc) {
  var childNames = Object.keys(tree.children);

  var createdChildren = childNames.reduce(function (ops, childName) {
    var child = tree.children[childName];
    if (child.isNew) {
      var operation = child.isFile ? 'create' : 'mkdir';
      child.isNew = false;
      ops.push([
        operation,
        tree.pathForChild(childName)
      ]);
    }

    return ops;
  }, []);

  return acc.concat(createdChildren);
}

function reduceRemovals(tree, acc) {
  var childNames = Object.keys(tree.children);

  var removeChildrenOps = childNames.reduce(function (ops, childName) {
    var child = tree.children[childName];

    if (child.operation === Tree.RMToken) {
      var operation = child.isFile ? 'unlink' : 'rmdir';
      ops.push([
        operation,
        tree.pathForChild(childName)
      ]);

      delete tree.children[childName];
    }

    return ops;
  }, []);

  var isRoot = tree.path === undefined;

  if (isRoot) {
    return acc.concat(removeChildrenOps);
  }  else if (removeChildrenOps.length === childNames.length) {
    tree.operation = Tree.RMToken;
    return acc.concat(removeChildrenOps);
  } else {
    return acc.concat(removeChildrenOps);
  }
}