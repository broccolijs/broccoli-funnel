'use strict';

/* global Set:true */

var Set = require('fast-ordered-set');

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

Object.defineProperty(FSTree.prototype, 'size', {
  get: function() {
    return this.files.size;
  }
});

FSTree.prototype.forEach = function (fn, context) {
  this.files.forEach(fn, context);
};

FSTree.prototype.calculatePatch = function (_files) {
  var files = _files instanceof this.constructor ? _files.files : new Set(_files);

  var filesToRemove = this.files.subtract(files).values;
  var filesToAdd = files.subtract(this.files.values.slice()).values;

  var removeOps = reduceRemovals(this.files.values, filesToRemove);
  var createOps = filesToAdd.sort().map(function (file) {
    return ['create', file];
  });

  return removeOps.concat(createOps);
};

function reduceRemovals(files, filesToRemove) {
  var tree = new Tree(files);
  tree.removeFiles(filesToRemove);

  return tree.postOrderDepthTraversal(function(tree, acc) {
    var childNames = Object.keys(tree.children);
    var removingChildDir = false;

    var removeChildrenOps = childNames.reduce(function (ops, childName) {
      var child = tree.children[childName];

      if (child.operation === Tree.RMToken) {
        ops.push(['rm', tree.pathForChild(childName)]);

        if (child.isFile === false ){
          removingChildDir = true;
        }
      }

      return ops;
    }, []);

    var isRoot = tree.path === undefined;

    if (isRoot) {
      return acc.concat(removeChildrenOps);
    }  else if (removeChildrenOps.length === childNames.length) {
      tree.operation = Tree.RMToken;
      if (removingChildDir) {
        return acc.concat(removeChildrenOps);
      } else {
        return acc;
      }
    } else {
      return acc.concat(removeChildrenOps);
    }
  }, []);
}

function Tree(files, path) {
  this.children = { };
  this.operation = null;
  this.isFile = false;
  this.path = path;

  if (!Array.isArray(files)) {
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

Tree.prototype.postOrderDepthTraversal = function(fn, acc) {
  var names= Object.keys(this.children);
  if (names.length === 0) { return acc; }

  names.forEach(function(name) {
    var child = this.children[name];
    if (child instanceof Tree) {
      acc = child.postOrderDepthTraversal(fn, acc);
    }
  }, this);

  return fn(this, acc);
};

Tree.prototype.addFiles = function (files) {
  files.map(function (file) {
    return file.split('/');
  }).forEach(this.addFile, this);
};

function File(current) {
  this.isFile = true;
  this.name = current;
  this.operation = undefined;
}
Tree.prototype.addFile = function (fileParts) {
  var current = fileParts.shift();
  var child = this.children[current];

  if (fileParts.length === 0) {
    if (child && child.isFile) {
      throw new Error('Cannot add duplicate file');
    } else if (child instanceof Tree) {
      throw new Error('Cannot overwrite directory with file');
    }

    // add a file
    this.children[current] = new File(current);
  } else {
    if (child && child.isFile) {
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

Tree.prototype.findChild = function(childName) {
  if (!this.children[childName]) {
    this.children[childName] = new Tree([], this.pathForChild(childName));
  }

  return this.children[childName];
};
