'use strict';

function Entries(entries) {
  function updateEntries(updates) {
    var ul = updates.length;
    var el = entries.length;

    if (ul === el) {
      return diffUpdates(updates);
    }

    return [];
  }

  function addEntries(additions) {
    var al = additions.length;
    var el = entries.length;

    if (al > el) {
      return diffAdditions(additions);
    }

    return [];
  }

  function sortByRelativePath(a, b) {
    var _a = a.relativePath.toLowerCase();
    var _b = b.relativePath.toLowerCase();

    if(_a < _b) {
      return -1;
    } else if (_a > _b) {
      return 1;
    }

    return 0;
  }

  function diffUpdates(updates) {
    var sortedUpdates = updates.slice().sort(sortByRelativePath);
    var sortedEntries = entries.slice().sort(sortByRelativePath);

    return sortedUpdates.filter(function(entry, i) {
      var _entry = sortedEntries[i];

      if (entry.relativePath !== _entry.relativePath) {
        throw new Error('Mismatch in files');
      }

      return _entry.mtime !== entry.mtime || _entry.size !== entry.size || _entry.mode !== entry.mode;

    });
  }

  function diffAdditions(newEntries) {
    var paths = entries.map(byRelativePath);
    return newEntries.filter(function(entry) {
      return paths.indexOf(entry.relativePath) === -1;
    });
  }

  function diffRemovals(newEntries) {
    var paths = newEntries.map(byRelativePath);

    return entries.filter(function(entry) {
      return paths.indexOf(entry.relativePath) === -1;
    });
  }

  function byRelativePath(entry) {
    return entry.relativePath;
  }

  function removeEntries(removals) {
    var rl = removals.length;
    var el = entries.length;

    if (rl < el) {
      return diffRemovals(removals);
    }

    return [];
  }

  function identity() {
    return entries;
  }

  return {
    remove: removeEntries,
    add: addEntries,
    update: updateEntries,
    identity: identity
  };

}

module.exports = Entries;
