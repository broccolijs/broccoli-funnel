'use strict';

var fs = require('fs');
var path = require('path');
var mkdirp = require('mkdirp');
var walkSync = require('walk-sync');
var Minimatch = require('minimatch').Minimatch;
var symlinkOrCopy = require('symlink-or-copy');
var readAPICompat = require('broccoli-read-compat');


function makeDictionary() {
  var cache = Object.create(null);

  cache['_dict'] = null;
  delete cache['_dict'];
  return cache;
}

function Funnel(inputTree, options) {
  if (!(this instanceof Funnel)) { return new Funnel(inputTree, options); }

  this.inputTree = inputTree;

  this._includeFileCache = makeDictionary();
  this._destinationPathCache = makeDictionary();

  var keys = Object.keys(options || {});
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    this[key] = options[key];
  }

  this.destDir = this.destDir || '/';

  if (this.files && !Array.isArray(this.files)) {
    throw new Error('Invalid files option, it must be an array.');
  }

  this._setupFilter('include');
  this._setupFilter('exclude');

  this._instantiatedStack = (new Error()).stack;
}

Funnel.prototype._setupFilter = function(type) {
  if (!this[type]) {
    return;
  }

  if (!Array.isArray(this[type])) {
    throw new Error('Invalid ' + type + ' option, it must be an array. You specified `' + typeof this[type] + '`.');
  }

  // Clone the filter array so we are not mutating an external variable
  var filters = this[type] = this[type].slice(0);

  for (var i = 0, l = filters.length; i < l; i++) {
    filters[i] = this._processPattern(filters[i]);
  }
};

Funnel.prototype._processPattern = function(pattern) {
  if (pattern instanceof RegExp) {
    return pattern;
  }

  var type = typeof pattern;

  if (type === 'string') {
    return new Minimatch(pattern);
  }

  if (type === 'function') {
    return pattern;
  }

  throw new Error('include/exclude patterns can be a RegExp, glob string, or function. You supplied `' + typeof pattern +'`.');
};

Funnel.prototype.shouldLinkRoots = function() {
  return !this.files && !this.include && !this.exclude && !this.getDestinationPath;
};

Funnel.prototype.rebuild = function() {
  this.destPath = path.join(this.outputPath, this.destDir);
  if (this.destPath[this.destPath.length -1] === '/') {
    this.destPath = this.destPath.slice(0, -1);
  }

  var inputPath = this.inputPath;
  if (this.srcDir) {
    inputPath = path.join(inputPath, this.srcDir);
  }

  if (this.shouldLinkRoots()) {
    if (fs.existsSync(inputPath)) {
      fs.rmdirSync(this.outputPath);
      this._copy(inputPath, this.destPath);
    } else if (this.allowEmpty) {
      mkdirp.sync(this.destPath);
    }
  } else {
    this.processFilters(inputPath);
  }
};

Funnel.prototype.processFilters = function(inputPath) {
  var files;

  if (this.files && !this.exclude && !this.include) {
    files = this.files.slice(0); //clone to be compatible with walkSync
  } else {
    files = walkSync(inputPath);
  }

  var relativePath, destRelativePath, fullInputPath, fullOutputPath;

  for (var i = 0, l = files.length; i < l; i++) {
    relativePath = files[i];

    if (this.includeFile(relativePath)) {
      fullInputPath    = path.join(inputPath, relativePath);
      destRelativePath = this.lookupDestinationPath(relativePath);
      fullOutputPath   = path.join(this.destPath, destRelativePath);

      this.processFile(fullInputPath, fullOutputPath, relativePath);
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

  var i, l, pattern;

  // Check for specific files listing
  if (this.files) {
    return includeFileCache[relativePath] = this.files.indexOf(relativePath) > -1;
  }

  // Check exclude patterns
  if (this.exclude) {
    for (i = 0, l = this.exclude.length; i < l; i++) {
      // An exclude pattern that returns true should be ignored
      pattern = this.exclude[i];

      if (this._matchesPattern(pattern, relativePath)) {
        return includeFileCache[relativePath] = false;
      }
    }
  }

  // Check include patterns
  if (this.include && this.include.length > 0) {
    for (i = 0, l = this.include.length; i < l; i++) {
      // An include pattern that returns true (and wasn't excluded at all)
      // should _not_ be ignored
      pattern = this.include[i];

      if (this._matchesPattern(pattern, relativePath)) {
        return includeFileCache[relativePath] = true;
      }
    }

    // If no include patterns were matched, ignore this file.
    return includeFileCache[relativePath] = false;
  }

  // Otherwise, don't ignore this file
  return includeFileCache[relativePath] = true;
};

Funnel.prototype._matchesPattern = function(pattern, relativePath) {
  if (pattern instanceof RegExp) {
    return pattern.test(relativePath);
  } else if (pattern instanceof Minimatch) {
    return pattern.match(relativePath);
  } else if (typeof pattern === 'function') {
    return pattern(relativePath);
  }

  throw new Error('Pattern `' + pattern + '` was not a RegExp, Glob, or Function.');
};

Funnel.prototype.processFile = function(sourcePath, destPath /*, relativePath */) {
  this._copy(sourcePath, destPath);
};

Funnel.prototype._copy = function(sourcePath, destPath) {
  var destDir  = path.dirname(destPath);
  if (!fs.existsSync(destDir)) {
    mkdirp.sync(destDir);
  }

  symlinkOrCopy.sync(sourcePath, destPath);
};

readAPICompat.wrapFactory(Funnel);

module.exports = Funnel;
