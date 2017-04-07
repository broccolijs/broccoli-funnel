'use strict';

var fs = require('fs');
var path = require('path-posix');
var mkdirp = require('mkdirp');
var Minimatch = require('minimatch').Minimatch;
var arrayEqual = require('array-equal');
var Plugin = require('broccoli-plugin');
var debug = require('debug');
var FSTree = require('fs-tree-diff');
var rimraf = require('rimraf');
var BlankObject = require('blank-object');
var heimdall = require('heimdalljs');
var existsSync = require('exists-sync');
var symlinkOrCopy = require('symlink-or-copy');

function ApplyPatchesSchema() {
  this.mkdir = 0;
  this.rmdir = 0;
  this.unlink = 0;
  this.change = 0;
  this.create = 0;
  this.other = 0;
  this.processed = 0;
  this.linked = 0;
}

function makeDictionary() {
  var cache = new BlankObject();

  cache['_dict'] = null;
  delete cache['_dict'];
  return cache;
}
// copied mostly from node-glob cc @isaacs
function isNotAPattern(pattern) {
  var set = new Minimatch(pattern).set;
  if (set.length > 1) {
    return false;
  }

  for (var j = 0; j < set[0].length; j++) {
    if (typeof set[0][j] !== 'string') {
      return false;
    }
  }

  return true;
}

Funnel.prototype = Object.create(Plugin.prototype);
Funnel.prototype.constructor = Funnel;
function Funnel(inputNode, _options) {
  if (!(this instanceof Funnel)) { return new Funnel(inputNode, _options); }
  var options = _options || {};
  Plugin.call(this, [inputNode], {
    annotation: options.annotation,
    persistentOutput: true,
    needsCache: false,
    fsFacade: true,
  });

  this._includeFileCache = makeDictionary();
  this._destinationPathCache = makeDictionary();
  this._currentTree = new FSTree();
  this._isRebuild = false;
  // need the original include/exclude passed to create a projection of this.in[0]
  this._origInclude = options.include;
  this._origExclude = options.exclude;

  var keys = Object.keys(options || {});
  for (var i = 0, l = keys.length; i < l; i++) {
    var key = keys[i];
    this[key] = options[key];
  }

  this.destDir = this.destDir || '/';
  this.count = 0;

  if (this.files && typeof this.files === 'function') {
    // Save dynamic files func as a different variable and let the rest of the code
    // still assume that this.files is always an array.
    this._dynamicFilesFunc = this.files;
    delete this.files;
  } else if (this.files && !Array.isArray(this.files)) {
    throw new Error('Invalid files option, it must be an array or function (that returns an array).');
  }

  if ((this.files || this._dynamicFilesFunc) && (this.include || this.exclude)) {
    throw new Error('Cannot pass files option (array or function) and a include/exlude filter. You can only have one or the other');
  }

  if (this.files) {
    if (this.files.filter(isNotAPattern).length !== this.files.length) {
      console.warn('broccoli-funnel does not support `files:` option with globs, please use `include:` instead');
      this.include = this.files;
      this.files = undefined;
    }
  }

  this._setupFilter('include');
  this._setupFilter('exclude');

  this._matchedWalk = this.include && this.include.filter(function(a) {
    return a instanceof Minimatch;
  }).length === this.include.length;

  this._instantiatedStack = (new Error()).stack;
  this._buildStart = undefined;
}

Funnel.prototype._debugName = function() {
  return this.description || this._annotation || this.name || this.constructor.name;
};

Funnel.prototype._debug = function(message) {
  debug('broccoli-funnel:' + (this._debugName())).apply(null, arguments);
};

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

Funnel.prototype.__supportsFSFacade = true;

Funnel.prototype.shouldLinkRoots = function() {
  return !this.files && !this.include && !this.exclude && !this.getDestinationPath;
};

Funnel.prototype.build = function() {
  this._buildStart = new Date();
  this.destPath = path.join(this.outputPath, this.destDir);

  if (this.destPath[this.destPath.length -1] === '/') {
    this.destPath = this.destPath.slice(0, -1);
  }

  if (this.srcDir) {
    this.in[0] = this.in[0].chdir(this.srcDir, {
      allowEmpty: true
    });
  }

  let absoluteInputPath = this.in[0].resolvePath('.');

  if (this._dynamicFilesFunc) {
    this.lastFiles = this.files;
    this.files = this._dynamicFilesFunc() || [];

    // Blow away the include cache if the list of files is new
    if (this.lastFiles !== undefined && !arrayEqual(this.lastFiles, this.files)) {
      this._includeFileCache = makeDictionary();
    }
  }

  var linkedRoots = false;
  // TODO: root linking is basically a projection
  // we already support srcDir via `chdir`.  Once we have support for globbing
  // we will handle the `this.include` and `this.exclude` cases, after which we
  // will never "link roots" within funnel; root linking will merely mean
  // projecting.  This does mean that we will `this.out` to be a projection of
  // `this.in`, so we may need to be able to modify `this.out`.
  if (this.shouldLinkRoots()) {
    linkedRoots = true;

    /**
     * We want to link the roots of these directories, but there are a few
     * edge cases we must account for.
     *
     * 1. It's possible that the original input doesn't actually exist.
     * 2. It's possible that the output symlink has been broken.
     * 3. We need slightly different behavior on rebuilds.
     *
     * Behavior has been modified to always having an `else` clause so that
     * the code is forced to account for all scenarios. Not accounting for
     * all scenarios made it possible for initial builds to succeed without
     * specifying `this.allowEmpty`.
     */

    let inputPathExists = this.in[0].existsSync('.');

    // This is specifically looking for broken symlinks.
    var outputPathExists = existsSync(this.outputPath);

    // Doesn't count as a rebuild if there's not an existing outputPath.
    this._isRebuild = this._isRebuild && outputPathExists;

    if (this._isRebuild) {
      if (inputPathExists) {
        // Already works because of symlinks. Do nothing.
      } else if (!inputPathExists && this.allowEmpty) {
        // Make sure we're safely using a new outputPath since we were previously symlinked:
        rimraf.sync(this.outputPath);
        // Create a new empty folder:
        mkdirp.sync(this.destPath);
      } else { // this._isRebuild && !inputPathExists && !this.allowEmpty
        // Need to remove it on the rebuild.
        // Can blindly remove a symlink if path exists.
        rimraf.sync(this.outputPath);
      }
    } else { // Not a rebuild.
      if (inputPathExists) {
        // We don't want to use the generated-for-us folder.
        // Instead let's remove it:
        rimraf.sync(this.outputPath);
        // And then symlinkOrCopy over top of it:
        // TODO: change tracking.  In principle we could enable support for
        //  `this.out.symlinkSync(this.in[0].resolvePath('.'), '.'`)`
        //  ie symlinking the out tree's root to the in tree
        //  however it makes fstree a bit more complicated, and when we have
        //  change tracking linkRoots will just be replaced by making this.out a
        //  projection of this.in[0] (via chdir and globs)
        this._copy(absoluteInputPath, this.destPath);
      } else if (!inputPathExists && this.allowEmpty) {
        // Can't symlink nothing, so make an empty folder at `destPath`:
        mkdirp.sync(this.destPath);
      } else { // !this._isRebuild && !inputPathExists && !this.allowEmpty
        throw new Error('You specified a `"srcDir": ' + this.srcDir + '` which does not exist and did not specify `"allowEmpty": true`.');
      }
    }

    this._isRebuild = true;
  } else {
    // Creating a new projection with this.in[0] as parent to have
    // cwd/files/include and exclude set
    if (this.cwd || this.files || this._origInclude || this._origExclude) {
      const options = {
        parent: this.in[0],
        cwd: this.cwd,
        files: this.files,
        include: this._origInclude,
        exclude: this._origExclude,
        srcTree: this.in[0].srcTree,
      };

      this._projectedIn = new FSTree(options);
    }
    this.processFilters('.');
  }

  this._debug('build, %o', {
    in: new Date() - this._buildStart + 'ms',
    linkedRoots: linkedRoots,
    inputPath: absoluteInputPath,
    destPath: this.destPath
  });
};

function ensureRelative(string) {
  if (string.charAt(0) === '/') {
    return string.substring(1);
  }
  return string;
}

Funnel.prototype._processEntries = function(entries) {
  return entries.filter(function(entry) {
    // support the second set of filters walk-sync does not support
    //   * regexp
    //   * excludes
    return this.includeFile(entry.relativePath);
  }, this).map(function(entry) {

    var relativePath = entry.relativePath;

    entry.relativePath = this.lookupDestinationPath(relativePath);

    this.outputToInputMappings[entry.relativePath] = relativePath;

    return entry;
  }, this);
};

Funnel.prototype._processPatches = function(patches) {
  let dirLists = [];
  let i = 0;

  if (this.destDir !== '/' && this.destDir !== '.') {
    // add destination path to head of patches because it wont be in changes()
    let destDir = this.destDir[0] === '/' ? this.destDir.substring(1) : this.destDir;
    patches.unshift([
      'mkdirp',
      destDir,
      {
        mode: 16877,
        relativePath: destDir,
        size: 0,
        mtime: Date.now(),
        checksum: null,
      },
    ]);
    dirLists.push(destDir);
    i++;
  }

  for (i = i; i < patches.length; ++i) {
    let patch = patches[i];

    const outputRelativePath = this.lookupDestinationPath(patch[2].relativePath, patch[2].mode);
    this.outputToInputMappings[outputRelativePath] = patch[2].relativePath;
    patch[1] = this.lookupDestinationPath(patch[1], patch[2].mode);
    patch[2].relativePath = outputRelativePath;

    if (patch[0] === 'mkdir' || patch[0] === 'mkdirp') {
      dirLists.push(patch[1]);
    }

    /* Here, we are adding entries to mkdirp paths that lookupDestinationPath adds to the entry.
       eg. relativePath = a.js
           this.lookupDestinationPath(relativePath) returns c/b/a.js
           we need to mkdirp c/b
    */
    if (patch[0] === 'create') {
      const pathToFile = path.dirname(patch[1]);
      if (pathToFile !== '.' && dirLists.indexOf(pathToFile) === -1) {
        dirLists.push(`${pathToFile}/`);
        patches.splice.apply(patches, [i,0].concat([[
          'mkdirp',
          `${pathToFile}/`,
          {
            mode: 16877,
            relativePath: `${pathToFile}/`,
            size: 0,
            mtime: Date.now(),
            checksum: null,
          },
        ]]));
        i++;
      }
    }
  }

  return patches;
};

Funnel.prototype._processPaths  = function(paths) {
  return paths.
    slice(0).
    filter(this.includeFile, this).
    map(function(relativePath) {
      var output = this.lookupDestinationPath(relativePath);
      this.outputToInputMappings[output] = relativePath;
      return output;
    }, this);
};

// TODO: inputPath is always '.' now because if we have srcDir this is handled
// via this.in[0] being a projection
Funnel.prototype.processFilters = function(inputPath) {
  let nextTree;
  let patches;
  let instrumentation = heimdall.start('derivePatches - broccoli-funnel');

  this.outputToInputMappings = {}; // we allow users to rename files

  // utilize change tracking from this.in[0]
  patches = this._processPatches(this.in[0].changes());
  this._currentTree = nextTree;

  instrumentation.stats.patches = patches.length;
  instrumentation.stats.entries = this.in[0].entries.length;
  instrumentation.stats._patches = patches;
  instrumentation.stats.srcTree = this.in[0].srcTree;
  instrumentation.stats.inroot = this.in[0].root;
  instrumentation.stats.outroot = this.out.root;

  instrumentation.stop();

  instrumentation = heimdall.start('applyPatch', ApplyPatchesSchema);

  patches.forEach(function(entry) {
    this._applyPatch(entry, inputPath, instrumentation.stats);
  }, this);

  instrumentation.stop();
};

Funnel.prototype._applyPatch = function applyPatch(entry, inputPath, stats) {
  var outputToInput = this.outputToInputMappings;
  var operation = entry[0];
  var outputRelative = entry[1];

  if (!outputRelative) {
    // broccoli itself maintains the roots, we can skip any operation on them
    return;
  }

  this._debug('%s %s', operation, outputRelative);

  switch (operation) {
    case 'unlink' :
      stats.unlink++;

      this.out.unlinkSync(outputRelative);
      break;
    case 'rmdir'  :
      stats.rmdir++;
      this.out.rmdirSync(outputRelative);
      break;
    case 'mkdir'  :
      stats.mkdir++;
      this.out.mkdirSync(outputRelative);
      break;
    case 'mkdirp'  :
      stats.mkdirp++;
      this.out.mkdirpSync(outputRelative);
      break;
    case 'change':
      stats.change++;
      /* falls through */
    case 'create':
      if (operation === 'create') {
        stats.create++;
      }

      var relativePath = outputToInput[outputRelative];
      if (relativePath === undefined) {
        relativePath = outputToInput['/' + outputRelative] || outputToInput[this.destDir + '/' + outputRelative] || '';
      }
      this.processFile(inputPath + '/' + relativePath, outputRelative, relativePath);
      break;
    default: throw new Error('Unknown operation: ' + operation);
  }
};

Funnel.prototype.lookupDestinationPath = function(relativePath, mode) {
  if (this._destinationPathCache[relativePath] !== undefined) {
    return this._destinationPathCache[relativePath];
  }

  // the destDir is absolute to prevent '..' above the output dir
  if (this.getDestinationPath && mode === 33188) {
    return this._destinationPathCache[relativePath] = ensureRelative(path.join(this.destDir, this.getDestinationPath(relativePath)));
  }

  return this._destinationPathCache[relativePath] = ensureRelative(path.join(this.destDir, relativePath));
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
  let absolutePath = this.in[0].resolvePath(sourcePath);
  this.out.symlinkSync(absolutePath, destPath);
};

Funnel.prototype._copy = function(sourcePath, destPath) {
  var destDir = path.dirname(destPath);

  try {
    symlinkOrCopy.sync(sourcePath, destPath);
  } catch(e) {
    if (!existsSync(destDir)) {
      mkdirp.sync(destDir);
    }
    try {
      fs.unlinkSync(destPath);
    } catch(e) {

    }
    symlinkOrCopy.sync(sourcePath, destPath);
  }
};


module.exports = Funnel;
