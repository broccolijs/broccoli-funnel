# Broccoli Funnel

[![Build Status](https://travis-ci.org/rwjblue/broccoli-funnel.svg?branch=master)](https://travis-ci.org/rwjblue/broccoli-funnel)

Broccoli plugin that allows you to filter files selected from an input tree down based on regular expressions.

Inspired by [broccoli-static-compiler](https://github.com/joliss/broccoli-static-compiler).

## Documentation

### `Funnel(inputTree, options)`

`inputTrees` *{Single Tree}*

Can either be a single tree, or an array of trees. If an array was specified, an array of source paths will be provided when
calling `updateCache`.

#### Options

`srcDir` *{String}*

A string representing the portion of the input tree to start the funneling from. This will be the base path for filtering regexp's.

Default: root path of input tree

----

`destDir` *{String}*

A string representing the destination path.

Default: root path of input tree

----

`include` *{Array of RegExps}*

An array of regular expressions that files and directories in the input tree must pass (match at least one pattern) in order to be included in the cache hash for rebuilds. In other words, a whitelist of patterns that identify which files and/or directories can trigger a rebuild.


Default: `[]`

----

`exclude` *{Array of RegExps}*

An array of regular expressions that files and directories in the input tree cannot pass in order to be included in the cache hash for rebuilds. In other words, a blacklist of patterns that identify which files and/or directories will never trigger a rebuild.

*Note, in the case when a file or directory matches both an include and exlude pattern, the exclude pattern wins*

Default: `[]`

## ZOMG!!! TESTS?!?!!?

I know, right?

Running the tests:

```javascript
npm install
npm test
```

## License

This project is distributed under the MIT license.
