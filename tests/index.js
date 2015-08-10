'use strict';

var fs = require('fs');
var path = require('path');
var RSVP = require('rsvp');
var expect = require('expect.js');
var walkSync = require('walk-sync-matcher');
var broccoli = require('broccoli');
var rimraf = RSVP.denodeify(require('rimraf'));

require('mocha-jshint')();

var Funnel = require('..');

describe('broccoli-funnel', function(){
  var fixturePath = path.join(__dirname, 'fixtures');
  var builder;

  afterEach(function() {
    if (builder) {
      return builder.cleanup();
    }
  });

  describe('processFile', function() {
    it('is not called when simply linking roots (aka no include/exclude)', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        processFile: function() {
          throw new Error('should never be called');
        }
      });

      builder = new broccoli.Builder(node);
      return builder.build()
      .then(function(results) {
        var outputPath = results.directory;

        expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
      });
    });

    it('is called for each included file', function() {
      var processFileArguments = [];

      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        include: [ /.png$/, /.js$/ ],
        destDir: 'foo',

        processFile: function(sourcePath, destPath, relativePath) {
          var relSourcePath = sourcePath.replace(this.inputPaths[0], '__input_path__');
          var relDestPath = destPath.replace(this.outputPath, '__output_path__');
          processFileArguments.push([relSourcePath, relDestPath, relativePath]);
        }
      });

      builder = new broccoli.Builder(node);
      return builder.build()
      .then(function(results) {
        var expected = [
          [ path.join('__input_path__', 'subdir1/subsubdir1/foo.png'),
            path.join('__output_path__', 'foo/subdir1/subsubdir1/foo.png'),
            'subdir1/subsubdir1/foo.png' ],
            [ path.join('__input_path__', 'subdir1/subsubdir2/some.js'),
              path.join('__output_path__', 'foo/subdir1/subsubdir2/some.js'),
              'subdir1/subsubdir2/some.js' ]
        ];

        expect(processFileArguments).to.eql(expected);
      });
    });

    it('is responsible for generating files in the destDir', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        include: [ /.png$/, /.js$/ ],
        destDir: 'foo',

        processFile: function() {
          /* do nothing */
        }
      });

      builder = new broccoli.Builder(node);
      return builder.build()
      .then(function(results) {
        var outputPath = results.directory;

        expect(walkSync(outputPath)).to.eql([]);
      });
    });

    it('works with mixed glob and RegExp includes', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        include: [ '**/*.png', /.js$/ ],
        destDir: 'foo',

        processFile: function() {
          /* do nothing */
        }
      });

      builder = new broccoli.Builder(node);
      return builder.build()
      .then(function(results) {
        var outputPath = results.directory;

        expect(walkSync(outputPath)).to.eql([]);
      });
    });


    it('correctly chooses _matchedWalk scenario', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node;
      node = new Funnel(inputPath, { include: [ '**/*.png', /.js$/ ] });

      expect(node._matchedWalk).to.eql(false);

      node = new Funnel(inputPath, { include: [ '**/*.png', '**/*.js' ] });

      expect(node._matchedWalk).to.eql(true);
    });
  });

  describe('without filtering options', function() {
    it('linking roots without srcDir/destDir, can rebuild without error', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath);

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function(results) {
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(inputPath));

          return builder.build();
        })
        .then(function(results) {
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
        });
    });

    it('simply returns a copy of the input node', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath);

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function(results) {
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
        });
    });

    it('simply returns a copy of the input node at a nested destination', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        destDir: 'some-random'
      });

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function(results) {
          var outputPath = path.join(results.directory, 'some-random');

          expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
        })
        .then(function() {
          return builder.build();
        })
        .then(function(results) {
          var outputPath = path.join(results.directory, 'some-random');

          expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
        });
    });

    it('can properly handle the output path being a broken symlink', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        srcDir: 'subdir1'
      });

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function() {
          return rimraf(node.outputPath);
        })
        .then(function() {
          fs.symlinkSync('foo/bar/baz.js', node.outputPath);
        })
        .then(function() {
          return builder.build();
        })
        .then(function(results) {
          var restrictedInputPath = path.join(inputPath, 'subdir1');
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(restrictedInputPath));
        });
    });

    it('simply returns a copy of the input node at a nested source', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        srcDir: 'subdir1'
      });

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function(results) {
          var restrictedInputPath = path.join(inputPath, 'subdir1');
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(restrictedInputPath));
        })
        .then(function() {
          return builder.build();
        })
        .then(function(results) {
          var restrictedInputPath = path.join(inputPath, 'subdir1');
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(restrictedInputPath));
        });
    });

    it('matches *.css', function() {
      var inputPath = path.join(fixturePath, 'dir1/subdir2');
      var node = new Funnel(inputPath, {
        include: ['*.css']
      });

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function(results) {
          var outputPath = results.directory;
          expect(walkSync(outputPath)).to.eql(['bar.css']);
        });
    });

    it('does not error with input node at a missing nested source', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        srcDir: 'subdir3',
        allowEmpty: true
      });

      var expected = [];

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function(results) {
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(expected);
        })
        .then(function() {
          return builder.build();
        })
        .then(function(results) {
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(expected);
        });
    });
  });

  describe('with filtering options', function() {
    function testFiltering(includes, excludes, files, expected) {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        include: includes,
        exclude: excludes,
        files: files
      });

      builder = new broccoli.Builder(node);
      return builder.build()
      .then(function(results) {
        var outputPath = results.directory;

        expect(walkSync(outputPath)).to.eql(expected);
      });
    }

    function matchPNG(relativePath) {
      var extension = path.extname(relativePath);

      return extension === '.png';
    }

    function matchPNGAndJS(relativePath) {
      var extension = path.extname(relativePath);

      return extension === '.png' || extension === '.js';
    }

    describe('filtering with `files`', function() {
      it('can take a list of files', function() {
        var inputPath = path.join(fixturePath, 'dir1');
        var node = new Funnel(inputPath, {
          files: [
            'subdir1/subsubdir1/foo.png',
            'subdir2/bar.css'
          ]
        });

        builder = new broccoli.Builder(node);
        return builder.build()
        .then(function(results) {
          var outputPath = results.directory;

          var expected = [
            'subdir1/',
            'subdir1/subsubdir1/',
            'subdir1/subsubdir1/foo.png',
            'subdir2/',
            'subdir2/bar.css'
          ];

          expect(walkSync(outputPath)).to.eql(expected);
        });
      });
    });

    describe('include filtering', function() {
      function testAllIncludeMatchers(glob, regexp, func, expected) {
        it('can take a glob string', function() {
          return testFiltering(glob, null, null, expected);
        });

        it('can take a regexp pattern', function() {
          return testFiltering(regexp, null, null, expected);
        });

        it('can take a function', function() {
          return testFiltering(func, null, null, expected);
        });
      }

      testAllIncludeMatchers([ '**/*.png' ], [ /.png$/ ], [ matchPNG ], [
        'subdir1/',
        'subdir1/subsubdir1/',
        'subdir1/subsubdir1/foo.png'
      ]);

      testAllIncludeMatchers([ '**/*.png', '**/*.js' ], [ /.png$/, /.js$/ ], [ matchPNGAndJS ], [
        'subdir1/',
        'subdir1/subsubdir1/',
        'subdir1/subsubdir1/foo.png',
        'subdir1/subsubdir2/',
        'subdir1/subsubdir2/some.js'
      ]);

      it('is not mutated', function() {
        var include = [ '**/*.unknown' ];
        testFiltering(include, null, null, []);
        expect(include[0]).to.eql('**/*.unknown');
      });
    });

    describe('exclude filtering', function() {
      function testAllExcludeMatchers(glob, regexp, func, expected) {
        it('can take a glob string', function() {
          return testFiltering(null, glob, null, expected);
        });

        it('can take a regexp pattern', function() {
          return testFiltering(null, regexp, null, expected);
        });

        it('can take a function', function() {
          return testFiltering(null, func, null, expected);
        });
      }

      testAllExcludeMatchers([ '**/*.png' ], [ /.png$/ ], [ matchPNG ], [
        'root-file.txt',
        'subdir1/',
        'subdir1/subsubdir2/',
        'subdir1/subsubdir2/some.js',
        'subdir2/',
        'subdir2/bar.css'
      ]);

      testAllExcludeMatchers([ '**/*.png', '**/*.js' ], [ /.png$/, /.js$/ ], [ matchPNGAndJS ], [
        'root-file.txt',
        'subdir2/',
        'subdir2/bar.css'
      ]);

      it('is not mutated', function() {
        var exclude = [ '**/*' ];
        testFiltering(null, exclude, null, []);
        expect(exclude[0]).to.eql('**/*');
      });
    });

    it('combined filtering', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        exclude: [ /.png$/, /.js$/ ],
        include: [ /.txt$/ ]
      });

      builder = new broccoli.Builder(node);
      return builder.build()
      .then(function(results) {
        var outputPath = results.directory;

        var expected = [
          'root-file.txt',
        ];

        expect(walkSync(outputPath)).to.eql(expected);
      });
    });

    it('creates its output directory even if no files are matched', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath, {
        exclude: [ /.*/ ]
      });

      builder = new broccoli.Builder(node);
      return builder.build()
      .then(function(results) {
        var outputPath = results.directory;

        expect(walkSync(outputPath)).to.eql([ ]);
      });
    });
  });

  describe('with customized destination paths', function() {
    it('uses custom getDestinationPath function if provided', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var node = new Funnel(inputPath);

      node.getDestinationPath = function(relativePath) {
        return path.join('foo', relativePath);
      };

      builder = new broccoli.Builder(node);
      return builder.build()
        .then(function(results) {
          var outputPath = results.directory;

          expect(walkSync(path.join(outputPath, 'foo'))).to.eql(walkSync(inputPath));
        });
    });
  });

  describe('includeFile', function() {
    var node;

    beforeEach(function() {
      var inputPath = path.join(fixturePath, 'dir1');

      node = new Funnel(inputPath);
    });

    it('returns false if the path is included in an exclude filter', function() {
      node.exclude = [ /.foo$/, /.bar$/ ];

      expect(node.includeFile('blah/blah/blah.foo')).to.not.be.ok();
      expect(node.includeFile('blah/blah/blah.bar')).to.not.be.ok();
      expect(node.includeFile('blah/blah/blah.baz')).to.be.ok();
    });

    it('returns true if the path is included in an include filter', function() {
      node.include = [ /.foo$/, /.bar$/ ];

      expect(node.includeFile('blah/blah/blah.foo')).to.be.ok();
      expect(node.includeFile('blah/blah/blah.bar')).to.be.ok();
    });

    it('returns false if the path is not included in an include filter', function() {
      node.include = [ /.foo$/, /.bar$/ ];

      expect(node.includeFile('blah/blah/blah.baz')).to.not.be.ok();
    });

    it('returns true if no patterns were used', function() {
      expect(node.includeFile('blah/blah/blah.baz')).to.be.ok();
    });

    it('uses a cache to ensure we do not recalculate the filtering on subsequent attempts', function() {
      expect(node.includeFile('blah/blah/blah.baz')).to.be.ok();

      // changing the filter mid-run should have no result on
      // previously calculated paths
      node.include = [ /.foo$/, /.bar$/ ];

      expect(node.includeFile('blah/blah/blah.baz')).to.be.ok();
    });
  });

  describe('lookupDestinationPath', function() {
    var node;

    beforeEach(function() {
      var inputPath = path.join(fixturePath, 'dir1');

      node = new Funnel(inputPath);
    });

    it('returns the input path if no getDestinationPath method is defined', function() {
      var relativePath = 'foo/bar/baz';

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(relativePath);
    });

    it('returns the output of getDestinationPath method if defined', function() {
      var relativePath = 'foo/bar/baz';
      var expected = 'blah/blah/blah';

      node.getDestinationPath = function() {
        return expected;
      };

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(expected);
    });

    it('only calls getDestinationPath once and caches result', function() {
      var relativePath = 'foo/bar/baz';
      var expected = 'blah/blah/blah';
      var getDestPathValue = expected;
      var getDestPathCalled = 0;

      node.getDestinationPath = function() {
        getDestPathCalled++;

        return expected;
      };

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(expected);
      expect(getDestPathCalled).to.be.equal(1);

      getDestPathValue = 'some/other/thing';

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(expected);
      expect(getDestPathCalled).to.be.equal(1);
    });
  });
});
