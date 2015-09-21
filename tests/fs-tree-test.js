'use strict';

var expect = require('chai').expect;
var FSTree = require('../fs-tree');
var Entries = require('../fs-tree').Entries;

var context = describe;
var fsTree;

describe('FSTree', function() {
  it('can be instantiated', function() {
    expect(new FSTree()).to.be.an.instanceOf(FSTree);
  });

  describe.only('Entries', function() {
    var entries;
    beforeEach(function() {
      entries = Entries([
        { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
        { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
      ]);
    });

    context('identity', function() {
      it('should return the initial entries', function() {
        expect(entries.identity()).to.deep.equal([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
          { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
        ]);
      });
    });

    context('add', function() {
      it('should return the added files', function() {
        var result = entries.add([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
          { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 },
          { relativePath: 'c.js', mode: '0o666', size: 1, mtime: 1 }
        ]);

        expect(result).to.deep.equal([
          { relativePath: 'c.js', mode: '0o666', size: 1, mtime: 1 }
        ]);
      });

      it('should handle directories', function() {
        var result = entries.add([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
          { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 },
          { relativePath: 'c.js', mode: '0o666', size: 1, mtime: 1 },
          { relativePath: 'f/', mode: '16384', size: 1, mtime: 1 }
        ]);

        expect(result).to.deep.equal([
          { relativePath: 'c.js', mode: '0o666', size: 1, mtime: 1 },
          { relativePath: 'f/', mode: '16384', size: 1, mtime: 1 }
        ]);
      });

      it('should throw if less files are passed', function() {
        expect(function() {
          entries.add([
            { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 }
          ]);
        }).to.throw('[Removals Encountered]: The length of removals was greater than the previous entries.');
      });

      it('should throw if the amount of files is the same', function() {
        expect(function() {
          entries.add([
            { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
            { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
          ]);
        }).to.throw('[Updates Encountered]: The length of removals was the same as the previous entries.');
      });
    });

    context('remove', function() {
      it('should find the removals', function () {
        var result = entries.remove([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 }
        ]);

        expect(result).to.deep.equal([
          { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
        ]);
      });

      it('should find directory removals', function () {
        var localEntries = Entries([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
          { relativePath: 'c/', mode: '16384', size: 1, mtime: 1 },
          { relativePath: 'c/c.js', mode: '0o666', size: 1, mtime: 1 }
        ]);

        var result = localEntries.remove([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 }
        ]);

        expect(result).to.deep.equal([
          { relativePath: 'c/', mode: '16384', size: 1, mtime: 1 },
          { relativePath: 'c/c.js', mode: '0o666', size: 1, mtime: 1 }
        ]);
      });

      it('should throw if the amount of files is the same', function() {
        expect(function() {
          entries.remove([
            { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
            { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
          ]);
        }).to.throw('[Updates Encountered]: The length of removals was the same as the previous entries.');
      });

      it('should throw if the amount of files is more', function() {
        expect(function() {
          entries.remove([
            { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
            { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 },
            { relativePath: 'c.js', mode: '0o666', size: 2, mtime: 1 }
          ]);
        }).to.throw('[Additions Encountered]: The length of removals was greater than the previous entries.');
      });

    });

    context('update', function() {

      it('should diff by size', function() {
        var result = entries.update([
          { relativePath: 'a/b.js', mode: '0o666', size: 10, mtime: 1 },
          { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
        ]);

        expect(result).to.deep.equal([
          { relativePath: 'a/b.js', mode: '0o666', size: 10, mtime: 1 }
        ]);
      });

      it('should diff by mtime', function() {
        var result = entries.update([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 10 },
          { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
        ]);

        expect(result).to.deep.equal([
          { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 10 }
        ]);
      });

      it('should diff by mode', function() {
        var result = entries.update([
          { relativePath: 'a/b.js', mode: 'foo', size: 1, mtime: 1 },
          { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 }
        ]);

        expect(result).to.deep.equal([
          { relativePath: 'a/b.js', mode: 'foo', size: 1, mtime: 1 }
        ]);
      });

      it('should throw if the amount of files is more', function() {
        expect(function() {
          entries.remove([
            { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 },
            { relativePath: 'b.js', mode: '0o666', size: 2, mtime: 1 },
            { relativePath: 'c.js', mode: '0o666', size: 2, mtime: 1 }
          ]);
        }).to.throw('[Additions Encountered]: The length of removals was greater than the previous entries.');
      });

      it('should throw if less files are passed', function() {
        expect(function() {
          entries.add([
            { relativePath: 'a/b.js', mode: '0o666', size: 1, mtime: 1 }
          ]);
        }).to.throw('[Removals Encountered]: The length of removals was greater than the previous entries.');
      });

    });

  });

  describe('.calculatePatch', function() {
    context('from an empty tree', function() {
      beforeEach( function() {
        fsTree = new FSTree();
      });

      context('to an empty tree', function() {
        it('returns 0 operations', function() {
          expect(fsTree.calculatePatch([])).to.deep.equal([]);
        });
      });

      context('to a non-empty tree', function() {
        it('returns n create operations', function() {
          expect(fsTree.calculatePatch([
            'bar/baz.js',
            'foo.js',
          ])).to.deep.equal([
            ['mkdir', 'bar'],
            ['create', 'foo.js'],
            ['create', 'bar/baz.js'],
          ]);
        });
      });
    });

    context('from a simple non-empty tree', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'bar/baz.js',
            'foo.js',
          ],
        });
      });

      context('to an empty tree', function() {
        it('returns n rm operations', function() {
          expect(fsTree.calculatePatch([])).to.deep.equal([
            ['unlink', 'bar/baz.js'],
            ['rmdir', 'bar'],
            ['unlink', 'foo.js'],
          ]);
        });
      });
    });

    context('\w updates', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'bar/baz.js',
            'foo.js',
          ],
        });
      });

      it('returns n rm operations', function() {
        expect(fsTree.calculatePatch([
          'bar/baz.js',
          'foo.js'
        ])).to.deep.equal([
          // when we work with entries, will potentially return updates
        ]);
      });
    });


    context('from a non-empty tree', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'foo/one.js',
            'foo/two.js',
            'bar/one.js',
            'bar/two.js',
          ],
        });
      });

      context('with removals', function() {
        it('reduces the rm operations', function() {
          expect(fsTree.calculatePatch([
            'bar/two.js'
          ])).to.deep.equal([
            ['unlink', 'foo/one.js'],
            ['unlink', 'foo/two.js'],
            ['unlink', 'bar/one.js'],
            ['rmdir',  'foo'],
          ]);
        });
      });

      context('with removals and additions', function() {
        it('reduces the rm operations', function() {
          expect(fsTree.calculatePatch([
            'bar/three.js'
          ])).to.deep.equal([
            ['unlink', 'foo/one.js'],
            ['unlink', 'foo/two.js'],
            ['unlink', 'bar/one.js'],
            ['unlink', 'bar/two.js'],
            ['rmdir', 'foo'],

            // TODO: we could detect this NOOP [[rmdir bar] => [mkdir bar]] , but leaving it made File ->
            // Folder & Folder -> File transitions easiest. Maybe some future
            // work can explore, but the overhead today appears to be
            // neglibable

            ['rmdir', 'bar'],
            ['mkdir', 'bar'],

            ['create', 'bar/three.js'],
          ]);
        });
      });
    });

    context('from a deep non-empty tree', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'bar/quz/baz.js',
            'foo.js',
          ],
        });
      });

      context('to an empty tree', function() {
        it('returns n rm operations', function() {
          expect(fsTree.calculatePatch([])).to.deep.equal([
            ['unlink', 'bar/quz/baz.js'],
            ['rmdir', 'bar/quz'],
            ['rmdir', 'bar'],
            ['unlink', 'foo.js'],
          ]);
        });
      });
    });

    context('from a deep non-empty tree \w intermediate entry', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'bar/quz/baz.js',
            'bar/foo.js',
          ],
        });
      });

      context('to an empty tree', function() {
        it('returns one unlink operation', function() {
          expect(fsTree.calculatePatch([
            'bar/quz/baz.js'
          ])).to.deep.equal([
            ['unlink', 'bar/foo.js']
          ]);
        });
      });
    });

    context('another nested scenario', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'subdir1/subsubdir1/foo.png',
            'subdir2/bar.css'
          ],
        });
      });

      context('to an empty tree', function() {
        it('returns one unlink operation', function() {
          expect(fsTree.calculatePatch([
            'subdir1/subsubdir1/foo.png'
          ])).to.deep.equal([
            ['unlink', 'subdir2/bar.css'],
            ['rmdir',  'subdir2']
          ]);
        });
      });
    });

    context('folder => file', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'subdir1/foo'
          ],
        });
      });

      it('it unlinks the file, and rmdir the folder and then creates the file', function() {
        expect(fsTree.calculatePatch([
          'subdir1'
        ])).to.deep.equal([
          ['unlink', 'subdir1/foo'],
          ['rmdir', 'subdir1'],
          ['create', 'subdir1']
        ]);
      });
    });

    context('file => folder', function() {
      beforeEach( function() {
        fsTree = new FSTree({
          files: [
            'subdir1'
          ],
        });
      });

      it('it unlinks the file, and makes the folder and then creates the file', function() {
        expect(fsTree.calculatePatch([
          'subdir1/foo'
        ])).to.deep.equal([
          ['unlink', 'subdir1'],
          ['mkdir', 'subdir1'],
          ['create', 'subdir1/foo']
        ]);
      });
    });

    // context('only folders', function() {
    //   beforeEach( function() {
    //     fsTree = new FSTree({
    //       files: [
    //         'dir/',
    //         'dir2/subdir1/',
    //         'dir3/subdir1/'
    //       ]
    //     });
    //   });

    //   it('it unlinks the file, and makes the folder and then creates the file', function() {
    //     expect(fsTree.calculatePatch([
    //       'dir2/subdir1/',
    //       'dir3/',
    //       'dir4/',
    //     ])).to.deep.equal([
    //       ['rmdir', 'dir1'],
    //       ['rmdir', 'dir3/subdir1'],
    //       ['mkdir', 'dir4']
    //     ]);
    //   });
    // });
  });
});
