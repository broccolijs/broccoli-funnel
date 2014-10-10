'use strict';

var fs = require('fs');
var path = require('path');
var expect = require('expect.js');
var RSVP = require('rsvp');
var rimraf = require('rimraf');
var root = process.cwd();
var walkSync = require('walk-sync');
var broccoli = require('broccoli');
var helpers = require('broccoli-kitchen-sink-helpers');

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

  });
});
