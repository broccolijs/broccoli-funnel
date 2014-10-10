'use strict';

var path = require('path');
var expect = require('expect.js');
var walkSync = require('walk-sync');
var broccoli = require('broccoli');

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

  describe('without filtering options', function() {
    it('simply returns a copy of the input tree', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var tree = new Funnel(inputPath);

      builder = new broccoli.Builder(tree);
      return builder.build()
        .then(function(results) {
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
        });
    });

    it('simply returns a copy of the input tree at a nested destination', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var tree = new Funnel(inputPath, {
        destDir: 'some-random'
      });

      builder = new broccoli.Builder(tree);
      return builder.build()
        .then(function(results) {
          var outputPath = path.join(results.directory, 'some-random');

          expect(walkSync(outputPath)).to.eql(walkSync(inputPath));
        });
    });

    it('simply returns a copy of the input tree at a nested source', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var tree = new Funnel(inputPath, {
        srcDir: 'subdir1'
      });

      builder = new broccoli.Builder(tree);
      return builder.build()
        .then(function(results) {
          var restrictedInputPath = path.join(inputPath, 'subdir1');
          var outputPath = results.directory;

          expect(walkSync(outputPath)).to.eql(walkSync(restrictedInputPath));
        });
    });
  });

  describe('with filtering options', function() {
    it('can take an include pattern', function() {
      var inputPath = path.join(fixturePath, 'dir1');
      var tree = new Funnel(inputPath, {
        include: [ /.png$/ ]
      });

      builder = new broccoli.Builder(tree);
      return builder.build()
        .then(function(results) {
          var outputPath = results.directory;

          var expected = [
            'subdir1/',
            'subdir1/subsubdir1/',
            'subdir1/subsubdir1/foo.png'
          ];

          expect(walkSync(outputPath)).to.eql(expected);
        });
    });
  });
});
