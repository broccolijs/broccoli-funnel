'use strict';

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

module.exports = Tree;
