'use strict';

/* global Set:true */

// TODO: move set somewhere
var Set = require('broccoli-viz/set');

module.exports = FSTree;

//can report
//  rm
//  update
//  create

// can disable
//  update

function FSTree(options) {
  options = options || {};

  this.files = new Set((options.files || []).slice());
}

FSTree.prototype.calculatePatch = function (files) {
  var filesToRemove = this.files.setDiff(files).values;
  var filesToAdd = new Set(files.slice()).setDiff(this.files.values.slice()).values;

  var removeOps = reduceRemovals(this.files.values, filesToRemove);
  var createOps = filesToAdd.sort().map(function (file) {
    return ['create', file];
  });

  return removeOps.concat(createOps);
};

function reduceRemovals(files, filesToRemove) {
  var tree = new Tree(files);
  tree.removeFiles(filesToRemove);

  return tree.postOrderDepthWalk(function(tree, acc) {
    var childNames = Object.keys(tree.children);
    var removeChildrenOps = childNames.reduce(function (ops, childName) {
      var child = tree.children[childName];
      if (child === Tree.RMToken) {
        ops.push(['rm', tree.pathForChild(childName)]);
      }

      return ops;
    }, []);

    if (removeChildrenOps.length === childNames.length) {
      return acc.concat([['rm', tree.path]]);
    } else {
      return acc.concat(removeChildrenOps);
    }
  }, []);
}

function Tree(files, path) {
  this.children = { };

  this.path = path;

  if (! Array.isArray(files)) {
    throw new Error('new Tree must be given a files argument');
  }

  if (files.length > 0) {
    this.addFiles(files);
  }
}

Tree.RMToken = function RMToken() { };

Tree.prototype.pathForChild = function (childName) {
  if (this.path) {
    return this.path + '/' + childName;
  } else {
    return childName;
  }
};

Tree.prototype.postOrderDepthWalk = function(fn, acc) {
  var names= Object.keys(this.children);
  if (names.length === 0) { return acc; }

  names.forEach(function(name) {
    var child = this.children[name];
    if (child instanceof Tree) {
      acc = child.postOrderDepthWalk(fn, acc);
    }
  }, this);

  return fn(this, acc);
};

Tree.prototype.addFiles = function (files) {
  files.map(function (file) {
    return file.split('/');
  }).forEach(this.addFile, this);
};

Tree.prototype.addFile = function (fileParts) {
  var current = fileParts.shift();
  var child;

  if (fileParts.length === 0) {
    child = this.children[current];
    if (child === true) {
      throw new Error('Cannot add duplicate file');
    } else if (child instanceof Tree) {
      throw new Error('Cannot overwrite directory with file');
    }

    // add a file
    this.children[current] = true;
  } else {
    if (this.children[current] === true) {
      throw new Error('Cannot add files to files');
    }

    this.findChild(current).addFile(fileParts);
  }
};

Tree.prototype.removeFiles = function (files) {
  files.map(function (file) {
    return file.split('/');
  }).forEach(this.removeFile, this);
};

Tree.prototype.removeFile = function (fileParts) {
  var current = fileParts.shift();
  var child = this.children[current];

  if (fileParts.length === 0) {
    if (! child) {
      throw new Error('Cannot remove nonexistant file');
    }

    this.children[current] = Tree.RMToken;
  } else {
    if (! child) {
      throw new Error('Cannot remove from nonexistant directory');
    } else if (child === true) {
      throw new Error('Cannot remove directory from file');
    }

    child.removeFile(fileParts);
  }
};

Tree.prototype.findChild = function(childName) {
  if (! this.children[childName]) {
    this.children[childName] = new Tree([], this.pathForChild(childName));
  }

  return this.children[childName];
};
