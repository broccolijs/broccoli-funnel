'use strict';

var expect = require('chai').expect;
var FSTree = require('../fs-tree');

var context = describe;


var fsTree;

describe('FSTree', function() {
  it('can be instantiated', function() {
    expect(new FSTree()).to.be.an.instanceOf(FSTree);
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
          var files = [
            'bar/baz.js',
            'foo.js',
          ];
          expect(fsTree.calculatePatch(files)).to.deep.equal([
            ['create', 'bar/baz.js'],
            ['create', 'foo.js'],
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
            ['rm', 'bar'],
            ['rm', 'foo.js'],
          ]);
        });
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
            ['rm', 'foo'],
            ['rm', 'bar/one.js'],
          ]);
        });
      });

      context('with removals and additions', function() {
        it('reduces the rm operations', function() {
          expect(fsTree.calculatePatch([
            'bar/three.js'
          ])).to.deep.equal([
            ['rm', 'foo'],
            ['rm', 'bar'],
            ['create', 'bar/three.js'],
          ]);
        });
      });
    });
  });
});
