'use strict';

/* global Set:true */

var Set = require('fast-ordered-set');

module.exports = FSTree;

function FSTree(options) {
  options = options || {};

  this.files = new Set((options.files || []).slice());
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
  // TODO: algorithimic complexity here isn't ideal. Future work can reduce
  // that cost. Today, the FS IO operations outweigh the cost, even with a
  // naive implementation
  var tree = new Tree(this.files.values);

  var files = _files instanceof this.constructor ? _files.files : new Set(_files);

  var filesToRemove = this.files.subtract(files).values;
  var filesToAdd = files.subtract(this.files).values;

  // TODO: removeFiles should be combined with the postOrderDepthReducer and return removeOps
  tree.removeFiles(filesToRemove);
  var removeOps = tree.postOrderDepthReducer(reduceRemovals, []);

  // TODO: addFiles should be combined with th  preOrderDepthReducer and return removeOps
  tree.addFiles(filesToAdd);
  var createOps = tree.preOrderDepthReducer(reduceAdditions, []);

  var changes = findChanges(this.files, files).map(function(change) {
    return ['change', change];
  });

  return removeOps.concat(createOps).concat(changes);
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

function Tree(files, path, isNew) {
  this.children = { };
  this.operation = null;
  this.isFile = false;
  this.isNew = isNew === true;
  this.path = path;

  if (!Array.isArray(files)) {
    throw new Error('new Tree must be given a files argument');
  }

  if (files.length > 0) {
    this.addFiles(files, this.isNew);
  }
}

Tree.RMToken = function RMToken() { };
Tree.CreateToken = function CreateToken() { };

Tree.prototype.pathForChild = function (childName) {
  if (this.path) {
    return this.path + '/' + childName;
  } else {
    return childName;
  }
};

Tree.prototype.preOrderDepthReducer = function(fn, acc) {
  var names = Object.keys(this.children);
  if (names.length === 0) { return acc; }

  var result = fn(this, acc);
  var tree = this;

  return names.reduce(function(acc, name) {
    var child = tree.children[name];
    if (child instanceof Tree) {
      return child.preOrderDepthReducer(fn, acc);
    } else {
      return acc;
    }
  }, result);
};

Tree.prototype.postOrderDepthReducer = function(fn, acc) {
  var names = Object.keys(this.children);
  if (names.length === 0) { return acc; }

  names.forEach(function(name) {
    var child = this.children[name];
    if (child instanceof Tree) {
      acc = child.postOrderDepthReducer(fn, acc);
    }
  }, this);

  return fn(this, acc);
};

Tree.prototype.addFiles = function (files, _isNew) {
  var isNew = arguments.length > 1 ? arguments[1] : true;

  files.map(function (file) {
    return file.split('/');
  }).forEach(function(file) {
    this.addFile(file, isNew);
  }, this);
};

function File(current, isNew) {
  this.isFile = true;
  this.isNew = isNew;
  this.name = current;
  this.operation = undefined;
}

Tree.prototype.addFile = function (fileParts, _isNew) {
  var current = fileParts.shift();
  var child = this.children[current];
  var isNew = arguments.length > 1 ? arguments[1] : true;

  if (fileParts.length === 0) {
    if (child && child.isFile) {
      throw new Error('Cannot add duplicate file');
    } else if (child instanceof Tree) {
      throw new Error('Cannot overwrite directory with file');
    }

    // add a file
    this.children[current] = new File(current, isNew);
  } else {
    if (child && child.isFile) {
      throw new Error('Cannot add files to files');
    }

    var tree = this.children[current];
    if (!tree) {
      this.children[current] = new Tree([
        fileParts.join('/')
      ], this.pathForChild(current), isNew);
    } else {
      tree.addFile(fileParts, isNew);
    }
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
    if (!child) {
      throw new Error('Cannot remove nonexistant file');
    }

    this.children[current].operation = Tree.RMToken;
  } else {
    if (!child) {
      throw new Error('Cannot remove from nonexistant directory');
    } else if (child.isFile) {
      throw new Error('Cannot remove directory from file');
    }

    child.removeFile(fileParts);
  }
};
