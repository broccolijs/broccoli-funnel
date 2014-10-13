'use strict';

var fs = require('fs');
var RSVP = require('rsvp');
var path = require('path');
var rimraf = RSVP.denodeify(require('rimraf'));
var mkdirp = require('mkdirp');
var walkSync = require('walk-sync');
var CoreObject = require('core-object');
var symlinkOrCopy = require('symlink-or-copy');
var generateRandomString = require('./lib/generate-random-string');

function makeDictionary() {
  var cache = Object.create(null);

  cache['_dict'] = null;
  delete cache['_dict'];

  return cache;
}

function Funnel(inputTree, options) {
  this.inputTree = inputTree;

  this._includeFileCache = makeDictionary();
  this._destinationPathCache = makeDictionary();

  this._tmpDir = path.resolve(path.join(this.tmpRoot, 'funnel-dest_' + generateRandomString(6) + '.tmp'));

  var keys = Object.keys(options || {});
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    this[key] = options[key];
  }

  this.setupDestPaths();

  if (this.include && !Array.isArray(this.include)) {
    throw new Error('Invalid include option, it must be an array.');
  }

  if (this.exclude && !Array.isArray(this.exclude)) {
    throw new Error('Invalid exclude option, it must be an array.');
  }
}

Funnel.__proto__ = CoreObject;
Funnel.prototype.constructor = Funnel;

Funnel.prototype.tmpRoot = 'tmp';

Funnel.prototype.setupDestPaths = function() {
  this.destDir = this.destDir || '/';
  this.destPath = path.join(this._tmpDir, this.destDir);

  if (this.destPath[this.destPath.length -1] === '/') {
    this.destPath = this.destPath.slice(0, -1);
  }
};

Funnel.prototype.shouldLinkRoots = function() {
  return !this.include && !this.exclude && !this.getDestinationPath;
};

Funnel.prototype.read = function(readTree) {
  var inputTree = this.inputTree;

  return RSVP.Promise.resolve()
    .then(this.cleanup.bind(this))
    .then(function() {
      return readTree(inputTree);
    })
    .then(this.handleReadTree.bind(this));
};

Funnel.prototype.handleReadTree = function(inputTreeRoot) {
  var inputPath = inputTreeRoot;
  if (this.srcDir) {
    inputPath = path.join(inputTreeRoot, this.srcDir);
  }

  if (this.shouldLinkRoots()) {
    this._copy(inputPath, this.destPath);
  } else {
    mkdirp.sync(this._tmpDir);

    this.processFilters(inputPath);
  }

  return this._tmpDir;
};

Funnel.prototype.cleanup = function() {
  // must be sync until https://github.com/broccolijs/broccoli/pull/197 lands
  if (fs.existsSync(this._tmpDir)) {
    return rimraf.sync(this._tmpDir);
  }
};

Funnel.prototype.processFilters = function(inputPath) {
  var files = walkSync(inputPath);
  var relativePath, destRelativePath, fullInputPath, fullOutputPath;

  for (var i = 0, l = files.length; i < l; i++) {
    relativePath = files[i];

    if (this.includeFile(relativePath)) {
      fullInputPath    = path.join(inputPath, relativePath);
      destRelativePath = this.lookupDestinationPath(relativePath);
      fullOutputPath   = path.join(this.destPath, destRelativePath);

      this._copy(fullInputPath, fullOutputPath);
    }
  }
};

Funnel.prototype.lookupDestinationPath = function(relativePath) {
  if (this._destinationPathCache[relativePath] !== undefined) {
    return this._destinationPathCache[relativePath];
  }

  if (this.getDestinationPath) {
    return this._destinationPathCache[relativePath] = this.getDestinationPath(relativePath);
  }

  return this._destinationPathCache[relativePath] = relativePath;
};

Funnel.prototype.includeFile = function(relativePath) {
  var includeFileCache = this._includeFileCache;

  if (includeFileCache[relativePath] !== undefined) {
    return includeFileCache[relativePath];
  }

  // do not include directories, only files
  if (relativePath[relativePath.length - 1] === '/') {
    return includeFileCache[relativePath] = false;
  }

  var i, l;

  // Check exclude patterns
  if (this.exclude) {
    for (i = 0, l = this.exclude.length; i < l; i++) {
      // An exclude pattern that returns true should be ignored
      if (this.exclude[i].test(relativePath) === true) {
        return includeFileCache[relativePath] = false;
      }
    }
  }

  // Check include patterns
  if (this.include && this.include.length > 0) {
    for (i = 0, l = this.include.length; i < l; i++) {
      // An include pattern that returns true (and wasn't excluded at all)
      // should _not_ be ignored
      if (this.include[i].test(relativePath) === true) {
        return includeFileCache[relativePath] = true;
      }
    }

    // If no include patterns were matched, ignore this file.
    return includeFileCache[relativePath] = false;
  }

  // Otherwise, don't ignore this file
  return includeFileCache[relativePath] = true;
};

Funnel.prototype._copy = function(sourcePath, destPath) {
  var destDir  = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    mkdirp.sync(destDir);
  }

  symlinkOrCopy.sync(sourcePath, destPath);
};

module.exports = Funnel;
