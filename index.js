var fs = require('fs');
var RSVP = require('rsvp');
var path = require('path');
var rimraf = RSVP.denodeify(require('rimraf'));
var mkdirp = require('mkdirp');
var CoreObject = require("core-object");
var symlinkOrCopy = require('symlink-or-copy');
var generateRandomString = require('./lib/generate-random-string');

//var helpers = require('broccoli-kitchen-sink-helpers');

function Funnel(inputTree, options) {
  this.inputTree = inputTree;

  for (var key in options) {
    if (options.hasOwnProperty(key)) {
      this[key] = options[key];
    }
  }

  this._includeFileCache = Object.create(null);
  this._tmpDir = path.resolve(path.join(this.tmpRoot, 'funnel-dest_' + generateRandomString(6) + '.tmp'));

  this.inputTree = inputTree;
  this.setupDestPaths();

  if (!this.include) {
    this.include = null;
  } else if (!Array.isArray(this.include)) {
    throw new Error("Invalid include option, it must be an array.")
  }

  if (!this.exclude) {
    this.exclude = null;
  } else if (!Array.isArray(this.exclude)) {
    throw new Error("Invalid exclude option, it must be an array.")
  }
};

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
  return !this.include && !this.exclude;
};

Funnel.prototype.read = function(readTree) {
  var inputTree = this.inputTree;

  return RSVP.resolve()
    .then(this.cleanup.bind(this))
    .then(function() {
      return readTree(inputTree);
    })
    .then(this.handleReadTree.bind(this));
};

Funnel.prototype.handleReadTree = function(inputTreeRoot) {
  var destDir  = path.dirname(this.destPath);
  if (!fs.existsSync(destDir)) {
    mkdirp.sync(destDir);
  }

  var inputPath = inputTreeRoot;
  if (this.srcDir) {
    inputPath = path.join(inputTreeRoot, this.srcDir);
  }

  if (this.shouldLinkRoots()) {
    symlinkOrCopy.sync(inputPath, this.destPath);
  } else {

  }

  return this._tmpDir;
};

Funnel.prototype.cleanup = function() {
  // must be sync until https://github.com/broccolijs/broccoli/pull/197 lands
  if (fs.existsSync(this._tmpDir)) {
    return rimraf.sync(this._tmpDir);
  }
};

module.exports = Funnel;
