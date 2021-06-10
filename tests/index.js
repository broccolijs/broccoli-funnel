'use strict';

const fs = require('fs-extra');
const path = require('path');
const expect = require('chai').expect;
const walkSync = require('walk-sync');
const rimraf = require('rimraf');
const { createBuilder, createTempDir } = require('broccoli-test-helper');

require('mocha-eslint')([
  'tests/index.js',
  'index.js',
], {
  timeout: 5000,
});

const Funnel = require('..');
const ROOT = process.cwd();

describe('broccoli-funnel', function() {
  let input, output, FIXTURE_INPUT;

  beforeEach(async function() {
    input = await createTempDir();
    let directory = {
      dir1: {
        subdir1: {
          subsubdir1: {
            'foo.png': '',
          },
          subsubdir2: {
            'some.js': '',
          },
        },
        subdir2: {
          'bar.css': '',
        },
        'root-file.txt': '',
      },
      lib: {
        utils: {
          'foo.js': '',
        },
        'utils.js': '',
        'main.js': '',
      },
    };
    input.write(directory);
    FIXTURE_INPUT = input.path();
  });

  afterEach(function() {
    process.chdir(ROOT);

    input.dispose();
    output && output.dispose();
  });

  describe('rebuilding', function() {
    it('correctly rebuilds', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        include: ['**/*.js'],
      });
      output = createBuilder(node);

      await output.build();
      let outputPath = output.path();

      expect(walkSync(outputPath, ['**/*.js'])).to.eql(walkSync(inputPath, ['**/*.js']));

      let mutatedFile = `${inputPath}/subdir1/subsubdir2/some.js`;
      fs.writeFileSync(mutatedFile, fs.readFileSync(mutatedFile));
      await output.build();
      outputPath = output.path();

      expect(walkSync(outputPath, ['**/*.js'])).to.eql(walkSync(inputPath, ['**/*.js']));
    });
  });

  describe('linkRoots', function() {
    it('links input to output if possible', async function() {
      let node = new Funnel(FIXTURE_INPUT);
      output = createBuilder(node);

      await output.build();
      expect(fs.lstatSync(output.path()).isSymbolicLink()).to.eql(true);
    });

    it('links input to destDir if possible', async function() {
      let node = new Funnel(FIXTURE_INPUT, {
        destDir: 'output',
      });

      output = createBuilder(node);

      await output.build();
      expect(fs.lstatSync(`${output.path()}/output`).isSymbolicLink()).to.eql(true);
      expect(fs.realpathSync(`${output.path()}/output`)).to.eql(fs.realpathSync(FIXTURE_INPUT));
    });

    it('links srcDir to output if possible', async function() {
      let node = new Funnel(FIXTURE_INPUT, {
        srcDir: 'dir1',
      });

      output = createBuilder(node);

      await output.build();
      expect(fs.lstatSync(output.path()).isSymbolicLink()).to.eql(true);
      expect(fs.realpathSync(output.path())).to.eql(fs.realpathSync(path.resolve(FIXTURE_INPUT, 'dir1')));
    });

    it('links srcDir to destDir if possible', async function() {
      let node = new Funnel(FIXTURE_INPUT, {
        srcDir: 'lib',
        destDir: 'output',
      });

      output = createBuilder(node);

      await output.build();
      expect(fs.lstatSync(`${output.path()}/output`).isSymbolicLink()).to.eql(true);
      expect(fs.realpathSync(`${output.path()}/output`)).to.eql(fs.realpathSync(path.resolve(FIXTURE_INPUT, 'lib')));
    });

    it('stable on idempotent rebuild', async function() {
      let node = new Funnel(`${FIXTURE_INPUT}/dir1`);
      let stat;

      output = createBuilder(node);
      await output.build();
      stat = fs.lstatSync(output.path());
      await output.build();
      let newStat = fs.lstatSync(output.path());

      // having deep equal assertion here causes intermittent failures on CI
      // access time varies between runs
      expect(newStat.dev).to.eql(stat.dev);
      expect(newStat.mode).to.eql(stat.mode);
      expect(newStat.nlink).to.eql(stat.nlink);
      expect(newStat.uid).to.eql(stat.uid);
      expect(newStat.gid).to.eql(stat.gid);
      expect(newStat.rdev).to.eql(stat.rdev);
      expect(newStat.blksize).to.eql(stat.blksize);
      expect(newStat.ino).to.eql(stat.ino);
      expect(newStat.size).to.eql(stat.size);
      expect(newStat.blocks).to.eql(stat.blocks);
      expect(newStat.birthtime).to.eql(stat.birthtime);
      expect(newStat.ctime).to.eql(stat.ctime);
    });

    it('properly supports relative path input node', async function() {
      let assertions = 0;

      let node = new Funnel('../broccoli-funnel', {
        destDir: 'foo',
      });

      output = createBuilder(node);
      try {
        await output.build();
      } catch (error) {
        assertions++;
      }
      expect(assertions).to.equal(0, 'Build did not throw an error, relative path traversal worked.');
    });

    it('accepts srcDir with leading slash', async function() {
      let assertions = 0;

      let node = new Funnel('.', {
        srcDir: '/node_modules',
        destDir: 'foo',
      });

      output = createBuilder(node);
      try {
        await output.build();
      } catch (error) {
        assertions++;
      }
      expect(assertions).to.equal(0, 'Build did not throw an error, relative path traversal worked.');
    });

    it("does not mistake a folder within working directory as the srcDir being present", async function() {
      input.write({
        someDir: {},
        otherDir: {},
      });
      process.chdir(input.path());

      let node = new Funnel(input.path("otherDir"), {
        allowEmpty: true,
        srcDir: "someDir",
        destDir: "my-output",
      });
      output = createBuilder(node);
      await output.build();

      expect(walkSync(output.path())).to.eql(["my-output/"]);
    });

    it("missing srcDir with allowEmpty results in empty destDir", async function() {
      let node = new Funnel(FIXTURE_INPUT, {
        allowEmpty: true,
        srcDir: "i-dont-exist",
        destDir: "my-output",
      });
      output = createBuilder(node);
      await output.build();

      expect(walkSync(output.path())).to.eql(["my-output/"]);
    });

    it('throws error on unspecified allowEmpty', async function() {
      let assertions = 0;
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        srcDir: 'subdir3',
        destDir: 'subdir3',
      });

      output = createBuilder(node);
      try {
        await output.build();
      } catch (error) {
        expect(error.stack.toString()).to.contain('You specified a `"srcDir": subdir3` which does not exist and did not specify `"allowEmpty": true`.');
        assertions++;
      }
      expect(assertions).to.equal(1, 'Build threw an error.');
    });
  });

  describe('processFile', function() {
    it('is not called when simply linking roots (aka no include/exclude)', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        processFile() {
          throw new Error('should never be called');
        },
      });

      output = createBuilder(node);
      await output.build();
      expect(walkSync(output.path())).to.eql(walkSync(inputPath));
    });

    it('is called for each included file', async function() {
      let processFileArguments = [];

      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        include: [/.png$/, /.js$/],
        destDir: 'foo',

        processFile(sourcePath, destPath, relativePath) {
          let relSourcePath = sourcePath.replace(this.inputPaths[0], '__input_path__');
          let relDestPath = destPath.replace(this.outputPath, '__output_path__');

          processFileArguments.push([
            relSourcePath,
            relDestPath,
            relativePath,
          ]);
        },
      });

      output = createBuilder(node);
      await output.build();
      let expected = [
        ['__input_path__/subdir1/subsubdir1/foo.png',
          '__output_path__/foo/subdir1/subsubdir1/foo.png',
          'subdir1/subsubdir1/foo.png',
        ],
        ['__input_path__/subdir1/subsubdir2/some.js',
          '__output_path__/foo/subdir1/subsubdir2/some.js',
          'subdir1/subsubdir2/some.js',
        ],
      ];

      expect(processFileArguments).to.eql(expected);
    });

    it('is responsible for generating files in the destDir', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;

      let node = new Funnel(inputPath, {
        include: [/.png$/, /.js$/],
        destDir: 'foo',
      });

      output = createBuilder(node);
      await output.build();

      expect(walkSync(output.path())).to.eql([
        // folders exist
        'foo/',
        'foo/subdir1/',
        'foo/subdir1/subsubdir1/',
        'foo/subdir1/subsubdir1/foo.png',
        'foo/subdir1/subsubdir2/',
        'foo/subdir1/subsubdir2/some.js',
      ]);
    });

    it('accepts destDir with leading slash', async function() {
      let inputPath = `${FIXTURE_INPUT}/lib/utils`;

      let node = new Funnel(inputPath, {
        destDir: '/foo',

        processFile() {
          /* do nothing */
        },
      });

      output = createBuilder(node);
      await output.build();

      expect(walkSync(output.path())).to.eql([
        'foo/',
        'foo/foo.js',
      ]);
    });

    it('works with mixed glob and RegExp includes', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        include: ['**/*.png', /.js$/],
        destDir: 'foo',

        processFile() {
          /* do nothing */
        },
      });

      output = createBuilder(node);
      await output.build();

      expect(walkSync(output.path())).to.eql([
        // dir exist
        'foo/',
        'foo/subdir1/',
        'foo/subdir1/subsubdir1/',
        'foo/subdir1/subsubdir2/',
      ]);
    });

    it('correctly chooses _matchedWalk scenario', function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, { include: ['**/*.png', /.js$/] });

      expect(node._matchedWalk).to.eql(false);

      node = new Funnel(inputPath, { include: ['**/*.png', '**/*.js'] });

      expect(node._matchedWalk).to.eql(true);
    });

    it('throws error on unspecified allowEmpty', async function() {
      let assertions = 0;
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        include: ['*'],
        srcDir: 'subdir3',
        destDir: 'subdir3',
      });

      output = createBuilder(node);

      try {
        await output.build();
      } catch (error) {
        expect(error.message).to.contain('You specified a `"srcDir": subdir3` which does not exist and did not specify `"allowEmpty": true`.');
        assertions++;
      }
      expect(assertions).to.equal(1, 'Build threw an error.');
    });

    it('does not error with input node at a missing nested source', async function() {
      let node = new Funnel(`${FIXTURE_INPUT}/dir1`, {
        include: ['*'],
        srcDir: 'subdir3',
        allowEmpty: true,
      });

      let expected = [];

      output = createBuilder(node);
      await output.build();
      expect(walkSync(output.path())).to.eql(expected);
      await output.build();
      expect(walkSync(output.path())).to.eql(expected);
    });

    it('creates nested output path when input node at a missing nested source', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        include: ['*'],
        srcDir: 'subdir3',
        destDir: 'some-place',
        allowEmpty: true,
      });

      let expected = ['some-place/'];

      output = createBuilder(node);
      await output.build();
      expect(walkSync(output.path())).to.eql(expected);
      await output.build();
      expect(walkSync(output.path())).to.eql(expected);
      await output.build();
      expect(walkSync(output.path())).to.eql(expected);
    });
  });

  describe('without filtering options', function() {
    it('linking roots without srcDir/destDir, can rebuild without error', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath);

      output = createBuilder(node);
      await output.build();
      let outputPath = output.path();
      expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
      await output.build();
      expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
    });

    it('simply returns a copy of the input node', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath);

      output = createBuilder(node);
      await output.build();
      let outputPath = output.path();
      expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
    });

    it('simply returns a copy of the input node at a nested destination', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        destDir: 'some-random',
      });

      output = createBuilder(node);
      await output.build();
      let outputPath = `${output.path()}/some-random`;
      expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
      await output.build();
      expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
    });

    it('can properly handle the output path being a broken symlink', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        srcDir: 'subdir1',
      });

      output = createBuilder(node);
      await output.build();
      let outputPath = output.path();
      rimraf.sync(outputPath);
      fs.symlinkSync('foo/bar/baz.js', outputPath);
      await output.build();
      let restrictedInputPath = `${inputPath}/subdir1`;
      expect(walkSync(outputPath)).to.eql(walkSync(restrictedInputPath));
    });

    it('simply returns a copy of the input node at a nested source', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        srcDir: 'subdir1',
      });

      output = createBuilder(node);
      await output.build();
      let outputPath = output.path();
      let restrictedInputPath = `${inputPath}/subdir1`;

      expect(walkSync(outputPath)).to.eql(walkSync(restrictedInputPath));
      await output.build();
      expect(walkSync(outputPath)).to.eql(walkSync(restrictedInputPath));
    });

    it('supports "srcDir", "destDir", and "exclude" together', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        srcDir: 'subdir1',
        destDir: 'myDest',
        exclude: ['whatever'],
      });

      output = createBuilder(node);
      await output.build();
      let outputPath = output.path();
      let restrictedInputPath = `${inputPath}/subdir1`;

      expect(walkSync(`${outputPath}/myDest`)).to.eql(walkSync(restrictedInputPath));
      await output.build();
      expect(walkSync(`${outputPath}/myDest`)).to.eql(walkSync(restrictedInputPath));
    });


    it('matches *.css', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1/subdir2`;
      let node = new Funnel(inputPath, {
        include: ['*.css'],
      });

      output = createBuilder(node);
      await output.build();

      expect(walkSync(output.path())).to.eql([
        'bar.css',
      ]);
    });

    it('matches the deprecated: files *.css', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1/subdir2`;
      let oldWarn = console.warn;
      let message;
      console.warn = function() {
        message = arguments[0];
      };

      let node;
      try {
        expect(message).to.equal(undefined);

        node = new Funnel(inputPath, {
          files: ['*.css'],
        });

        expect(message).to.equal('broccoli-funnel does not support `files:` option with globs, please use `include:` instead');

      } finally {
        console.warn = oldWarn;
      }

      output = createBuilder(node);
      await output.build();
      expect(walkSync(output.path())).to.eql(['bar.css']);
    });

    it('does not error with input node at a missing nested source', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        srcDir: 'subdir3',
        allowEmpty: true,
      });

      let expected = [];

      output = createBuilder(node);
      await output.build();
      let outputPath = output.path();
      expect(walkSync(outputPath)).to.eql(expected);
      await output.build();
      expect(walkSync(outputPath)).to.eql(expected);
    });
  });

  describe('with filtering options', function() {
    async function testFiltering(includes, excludes, files, expected) {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath, {
        include: includes,
        exclude: excludes,
        files,
      });

      output = createBuilder(node);
      await output.build();
      expect(walkSync(output.path())).to.eql(expected);
    }

    function matchPNG(relativePath) {
      let extension = path.extname(relativePath);

      return extension === '.png';
    }

    function matchPNGAndJS(relativePath) {
      let extension = path.extname(relativePath);

      return extension === '.png' || extension === '.js';
    }

    describe('filtering with `files`', function() {
      it('can take a list of files', async function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;
        let node = new Funnel(inputPath, {
          files: [
            'subdir1/subsubdir1/foo.png',
            'subdir2/bar.css',
          ],
        });

        output = createBuilder(node);
        await output.build();

        let expected = [
          'subdir1/',
          'subdir1/subsubdir1/',
          'subdir1/subsubdir1/foo.png',
          'subdir2/',
          'subdir2/bar.css',
        ];

        expect(walkSync(output.path())).to.eql(expected);
      });

      it('can take a list of files with destDir', async function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;
        let node = new Funnel(inputPath, {
          files: [
            'subdir1/subsubdir1/foo.png',
            'subdir2/bar.css',
          ],
          destDir: 'test/assert',
        });

        output = createBuilder(node);
        await output.build();

        let expected = [
          'test/',
          'test/assert/',
          'test/assert/subdir1/',
          'test/assert/subdir1/subsubdir1/',
          'test/assert/subdir1/subsubdir1/foo.png',
          'test/assert/subdir2/',
          'test/assert/subdir2/bar.css',
        ];

        expect(walkSync(output.path())).to.eql(expected);
      });
    });

    describe('`files` is incompatible with filters', function() {
      it('so error if `files` and `include` are set', function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;

        expect(() => {
          new Funnel(inputPath, {
            files: ['anything'],
            include: ['*.txt'],
          });
        }).to.throw('Cannot pass files option (array or function) and a include/exlude filter. You can have one or the other');
      });

      it('so error if `files` and `exclude` are set', function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;

        expect(() => {
          new Funnel(inputPath, {
            files() { return ['anything']; },
            exclude: ['*.md'],
          });
        }).to.throw('Cannot pass files option (array or function) and a include/exlude filter. You can have one or the other');
      });
    });

    describe('filtering with a `files` function', function() {
      it('can take files as a function', async function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;
        let filesByCounter = [
          // rebuild 1:
          [
            'subdir1/subsubdir1/foo.png',
            'subdir2/bar.css',
          ],

          // rebuild 2:
          ['subdir1/subsubdir1/foo.png'],

          // rebuild 3:
          [],

          // rebuild 4:
          ['subdir1/subsubdir2/some.js'],
        ];

        let tree = new Funnel(inputPath, {
          files() {
            return filesByCounter.shift();
          },
        });

        output = createBuilder(tree);
        await output.build();
        let outputPath = output.path();
        let expected = [
          'subdir1/',
          'subdir1/subsubdir1/',
          'subdir1/subsubdir1/foo.png',
          'subdir2/',
          'subdir2/bar.css',
        ];

        expect(walkSync(outputPath)).to.eql(expected);

        await output.build();
        expected = [
          'subdir1/',
          'subdir1/subsubdir1/',
          'subdir1/subsubdir1/foo.png',
        ];

        expect(walkSync(outputPath)).to.eql(expected);
        await output.build();

        expected = [];

        expect(walkSync(outputPath)).to.eql(expected);

        await output.build();
        expected = [
          'subdir1/',
          'subdir1/subsubdir2/',
          'subdir1/subsubdir2/some.js',
        ];

        expect(walkSync(outputPath)).to.eql(expected);
      });

      it('can take files as a function with exclude (includeCache needs to be cleared)', async function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;
        let filesCounter = 0;
        let filesByCounter = [
          [],
          ['subdir1/subsubdir1/foo.png'],
          [
            'subdir1/subsubdir1/foo.png',
            'subdir2/bar.css',
          ],
        ];

        let tree = new Funnel(inputPath, {
          files() {
            return filesByCounter[filesCounter++];
          },
        });

        output = createBuilder(tree);
        await output.build();
        let outputPath = output.path();

        let expected = [];

        expect(walkSync(outputPath)).to.eql(expected);

        // Build again
        await output.build();
        expected = [
          'subdir1/',
          'subdir1/subsubdir1/',
          'subdir1/subsubdir1/foo.png',
        ];

        expect(walkSync(outputPath)).to.eql(expected);

        await output.build();

        expected = [
          'subdir1/',
          'subdir1/subsubdir1/',
          'subdir1/subsubdir1/foo.png',
          'subdir2/',
          'subdir2/bar.css',
        ];

        expect(walkSync(outputPath)).to.eql(expected);
      });
    });

    describe('include filtering', function() {
      function testAllIncludeMatchers(glob, regexp, func, expected) {
        it('can take a glob string', function() { testFiltering(glob, null, null, expected); });

        it('can take a regexp pattern', function() { testFiltering(regexp, null, null, expected); });

        it('can take a function', function() { testFiltering(func, null, null, expected); });
      }

      testAllIncludeMatchers(['**/*.png'], [/.png$/], [matchPNG], [
        'subdir1/',
        'subdir1/subsubdir1/',
        'subdir1/subsubdir1/foo.png',
      ]);

      testAllIncludeMatchers(['**/*.png', '**/*.js'], [/.png$/, /.js$/], [matchPNGAndJS], [
        'subdir1/',
        'subdir1/subsubdir1/',
        'subdir1/subsubdir1/foo.png',
        'subdir1/subsubdir2/',
        'subdir1/subsubdir2/some.js',
      ]);

      it('is not mutated', function() {
        let include = ['**/*.unknown'];
        testFiltering(include, null, null, []);
        expect(include[0]).to.eql('**/*.unknown');
      });
    });

    describe('debugName', function() {
      it('falls back to the constructor name', function() {
        let node = new Funnel('inputTree');
        expect(node._debugName()).to.eql('Funnel');
      });

      it('prefers the provided  annotation', function() {
        let node = new Funnel('inputTree', {
          annotation: 'an annotation',
        });

        expect(node._debugName()).to.eql('an annotation');
      });
    });

    describe('exclude filtering', function() {
      function testAllExcludeMatchers(glob, regexp, func, expected) {
        it('can take a glob string', function() { testFiltering(null, glob, null, expected); });

        it('can take a regexp pattern', function() { testFiltering(null, regexp, null, expected); });

        it('can take a function', function() { testFiltering(null, func, null, expected); });
      }

      testAllExcludeMatchers(['**/*.png'], [/.png$/], [matchPNG], [
        'root-file.txt',
        'subdir1/',
        'subdir1/subsubdir2/',
        'subdir1/subsubdir2/some.js',
        'subdir2/',
        'subdir2/bar.css',
      ]);

      testAllExcludeMatchers(['**/*.png', '**/*.js'], [/.png$/, /.js$/], [matchPNGAndJS], [
        'root-file.txt',
        'subdir2/',
        'subdir2/bar.css',
      ]);

      it('is not mutated', function() {
        let exclude = ['**/*'];
        testFiltering(null, exclude, null, []);
        expect(exclude[0]).to.eql('**/*');
      });
    });

    describe('combined filtering', function() {
      it('(regexp)', async function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;
        let node = new Funnel(inputPath, {
          exclude: [/.png$/, /.js$/],
          include: [/.txt$/],
        });

        output = createBuilder(node);
        await output.build();
        let outputPath = output.path();
        let expected = [
          'root-file.txt',
        ];

        expect(walkSync(outputPath)).to.eql(expected);
      });

      it('(globs)', async function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;
        let node = new Funnel(inputPath, {
          exclude: ['**/*.png', '**/*.js'],
          include: ['**/*.txt'],
        });

        output = createBuilder(node);
        await output.build();
        let outputPath = output.path();
        let expected = [
          'root-file.txt',
        ];

        expect(walkSync(outputPath)).to.eql(expected);
      });
    });

    describe('no file matched', function() {
      it('creates its output directory even if no files are matched', async function() {
        let inputPath = `${FIXTURE_INPUT}/dir1`;
        let node = new Funnel(inputPath, {
          exclude: [/.*/],
        });

        output = createBuilder(node);
        await output.build();
        let outputPath = output.path();
        expect(walkSync(outputPath)).to.eql([]);
      });
    });
  });

  describe('with customized destination paths', function() {
    it('uses custom getDestinationPath function if provided', async function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;
      let node = new Funnel(inputPath);

      node.getDestinationPath = function(relativePath) {
        return `foo/${relativePath}`;
      };

      output = createBuilder(node);
      await output.build();

      expect(walkSync(`${output.path()}/foo`)).to.eql(walkSync(inputPath));
    });

    it('receives relative inputPath as argument and can escape destDir with ..', async function() {
      let inputPath = `${FIXTURE_INPUT}/lib`;
      let node = new Funnel(inputPath, {
        destDir: 'utility',
        getDestinationPath(relativePath) {
          if (relativePath === 'main.js') {
            return '../utility.js';
          }
          return relativePath;
        },
      });

      output = createBuilder(node);
      await output.build();

      expect(walkSync(output.path())).to.eql([
        'utility.js',
        'utility/',
        'utility/utils.js',
        'utility/utils/',
        'utility/utils/foo.js',
      ]);
    });
  });

  describe('canMatchWalk', function() {
    let inputPath = `${FIXTURE_INPUT}/dir1`;

    describe('include', function() {
      it('is false with no include', function() {
        let node = new Funnel(inputPath);
        expect(node.canMatchWalk()).to.eql(false);
      });

      it('is true with string include', function() {
        let node = new Funnel(inputPath, {
          include: ['foo'],
        });
        expect(node.canMatchWalk()).to.eql(true);
      });

      it('is false with regexp include', function() {
        let node = new Funnel(inputPath, {
          include: [/foo/],
        });
        expect(node.canMatchWalk()).to.eql(false);
      });

      it('is false with string + regexp include', function() {
        let node = new Funnel(inputPath, {
          include: ['foo', /foo/],
        });
        expect(node.canMatchWalk()).to.eql(false);
      });

      it('is true with string + string include', function() {
        let node = new Funnel(inputPath, {
          include: ['foo', 'bar'],
        });
        expect(node.canMatchWalk()).to.eql(true);
      });
    });

    describe('exclude', function() {
      it('is false with no exclude', function() {
        let node = new Funnel(inputPath);
        expect(node.canMatchWalk()).to.eql(false);
      });

      it('is true with string exclude', function() {
        let node = new Funnel(inputPath, {
          exclude: ['foo'],
        });
        expect(node.canMatchWalk()).to.eql(true);
      });

      it('is false with regexp exclude', function() {
        let node = new Funnel(inputPath, {
          exclude: [/foo/],
        });
        expect(node.canMatchWalk()).to.eql(false);
      });

      it('is false with string + regexp exclude', function() {
        let node = new Funnel(inputPath, {
          exclude: ['foo', /foo/],
        });
        expect(node.canMatchWalk()).to.eql(false);
      });

      it('is true with string +  string exclude', function() {
        let node = new Funnel(inputPath, {
          exclude: ['foo', 'bar'],
        });
        expect(node.canMatchWalk()).to.eql(true);
      });
    });
  });

  describe('includeFile', function() {
    let node;

    beforeEach(function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;

      node = new Funnel(inputPath);
    });

    it('returns false if the path is included in an exclude filter', function() {
      node.exclude = [/.foo$/, /.bar$/];

      expect(node.includeFile('blah/blah/blah.foo')).to.eql(false);
      expect(node.includeFile('blah/blah/blah.bar')).to.eql(false);
      expect(node.includeFile('blah/blah/blah.baz')).to.eql(true);
    });

    it('returns true if the path is included in an include filter', function() {
      node.include = [/.foo$/, /.bar$/];

      expect(node.includeFile('blah/blah/blah.foo')).to.eql(true);
      expect(node.includeFile('blah/blah/blah.bar')).to.eql(true);
    });

    it('returns false if the path is not included in an include filter', function() {
      node.include = [/.foo$/, /.bar$/];

      expect(node.includeFile('blah/blah/blah.baz')).to.not.eql(true);
    });

    it('returns true if no patterns were used', function() {
      expect(node.includeFile('blah/blah/blah.baz')).to.eql(true);
    });

    it('uses a cache to ensure we do not recalculate the filtering on subsequent attempts', function() {
      expect(node.includeFile('blah/blah/blah.baz')).to.eql(true);

      // changing the filter mid-run should have no result on
      // previously calculated paths
      node.include = [/.foo$/, /.bar$/];

      expect(node.includeFile('blah/blah/blah.baz')).to.eql(true);
    });
  });

  describe('lookupDestinationPath', function() {
    let node;

    beforeEach(function() {
      let inputPath = `${FIXTURE_INPUT}/dir1`;

      node = new Funnel(inputPath);
    });

    it('returns the input path if no getDestinationPath method is defined', function() {
      let relativePath = 'foo/bar/baz';

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(relativePath);
    });

    it('returns the output of getDestinationPath method if defined', function() {
      let relativePath = 'foo/bar/baz';
      let expected = 'blah/blah/blah';

      node.getDestinationPath = function() {
        return expected;
      };

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(expected);
    });

    it('calls getDestinationPath once and caches result', function() {
      let relativePath = 'foo/bar/baz';
      let expected = 'blah/blah/blah';
      let getDestPathCalled = 0;

      node.getDestinationPath = function() {
        getDestPathCalled++;

        return expected;
      };

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(expected);
      expect(getDestPathCalled).to.be.equal(1);

      expect(node.lookupDestinationPath(relativePath)).to.be.equal(expected);
      expect(getDestPathCalled).to.be.equal(1);
    });
  });

  describe('subclassing', function() {
    it('can be subclassed, simple destDir modification', async function() {
      class FunnelSubclass extends Funnel.Funnel {
        constructor(input, options) {
          super(input, options);

          this._hasBuilt = false;
        }

        build() {
          if (this._hasBuilt === false) {
            this.destDir = 'lol';
            this._hasBuilt = true;
          }

          return super.build();
        }
      }

      let inputPath = input.path('lib/utils');
      let node = new FunnelSubclass(inputPath, {});
      output = createBuilder(node);

      await output.build();
      let outputPath = output.path();

      expect(walkSync(outputPath)).to.eql(['lol/', 'lol/foo.js']);
    });

    it('subclasses can provide additional trees', async function() {
      class FunnelSubclass extends Funnel.Funnel {
        constructor(inputNode, options) {
          super([inputNode, input.path('dir1/subdir2')], options);

          this._hasBuilt = false;
        }

        build() {
          if (this._hasBuilt === false) {
            if (!fs.existsSync(`${this.inputPaths[1]}/bar.css`)) {
              throw new Error('Could not find file!!!');
            }
            // set custom destDir to ensure our custom build code ran
            this.destDir = 'lol';
            this._hasBuilt = true;
          }

          return super.build();
        }
      }

      let inputPath = input.path('lib/utils');
      let node = new FunnelSubclass(inputPath, {});
      output = createBuilder(node);

      await output.build();
      let outputPath = output.path();

      expect(walkSync(outputPath)).to.eql(['lol/', 'lol/foo.js']);
    });
  });
});
