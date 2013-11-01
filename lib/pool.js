var EventEmitter = require('events').EventEmitter
  , util = require('util')
  , DoneCriteria = require('done-criteria')
  , _ = require('underscore');

function Pool(files, workers) {
  EventEmitter.call(this);

  this.files = files;
  this.workers = workers;
  this.totalFiles = this.files.length;
}

util.inherits(Pool, EventEmitter);

Pool.prototype.start = function() {
  var self = this;

  self.on('next', function() {
    self.next(function(code, output) {
      self.totalFiles--;
      if(self.totalFiles > 0) {
        self.emit('next');
      } else {
        self.emit('done');
      }
    });
  });

  _.range(this.workers).forEach(function() {
    self.emit('next');
  });
};

Pool.prototype.next = function(callback) {
  var file = this.files.shift();
  if (file) {
    this.emit('ready', file, function(code, out) {
      return callback(code, out);
    });
  }
};

module.exports = Pool;
